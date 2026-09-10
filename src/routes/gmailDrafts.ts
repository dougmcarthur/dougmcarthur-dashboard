/**
 * Connecting Gmail, and putting pitch drafts into it in bulk.
 *
 * This is deliberately **not** something the research agent does. The agent
 * runs headless in CI and cannot hold a consent dialog; more to the point,
 * writing to somebody's mailbox is a thing they should be looking at when it
 * happens. So the agent writes pitches into the database and this route,
 * clicked by a person, moves them into their account.
 *
 * Two rules it keeps:
 *
 * **It previews before it writes.** Same shape as the reference-doc sourcing
 * and the notes backfill — `Disclosure` in `components/ui/` exists because a
 * bulk write you cannot look at first is one you find out about afterwards.
 * Here the preview also carries the skip reasons, because "drafted four of
 * seven" without saying which three is a worse answer than not drafting.
 *
 * **It writes no status.** Creating a draft is not sending one, so nothing
 * here moves a target to `pitched` — that is still the artist's click after
 * they actually send. The reply router makes the same separation for the same
 * reason: two things that can be wrong independently should be two actions.
 */

import { Hono } from 'hono'
import { getDb } from '../db'
import { syncTargets } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import {
  GMAIL_COMPOSE_SCOPE,
  REQUESTED_SCOPES,
  accessTokenForGrant,
  accountEmail,
  createDraft,
  exchangeCode,
  forgetGrant,
  grantConfigured,
  markGrantUsed,
  readGrant,
  redirectUri,
  storeGrant,
} from '../lib/googleGrant'
import { encodeDraft, planDrafts } from '../../shared/gmailDraft'
import { randomToken } from '../lib/auth'
import type { Env } from '../types'

const gmail = new Hono<AppEnv>()

/** Ten minutes is longer than a consent screen takes and shorter than a day. */
const STATE_COOKIE = '__Host-mhq_oauth_state'
const STATE_TTL_SECONDS = 600

function stateCookie(value: string, maxAge: number): string {
  return `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

function readStateCookie(header: string | null | undefined): string | null {
  for (const part of (header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === STATE_COOKIE) return rest.join('=') || null
  }
  return null
}

gmail.get('/status', async (c) => c.json(await readGrant(c.env, tenantOf(c))))

/**
 * Send the browser to Google.
 *
 * `prompt=consent` and `access_type=offline` together are what produce a
 * refresh token. Google returns one only on a fresh consent, so a flow that
 * omits them appears to work and then stops an hour later — the failure being
 * a silent one is exactly why they are not left to default.
 */
gmail.get('/connect', async (c) => {
  if (!grantConfigured(c.env)) {
    return c.json({ error: 'Google client credentials or TOKEN_ENCRYPTION_KEY are not configured' }, 503)
  }
  const state = randomToken(16)
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID ?? '')
  url.searchParams.set('redirect_uri', redirectUri(c.env))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', REQUESTED_SCOPES)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('state', state)

  c.header('Set-Cookie', stateCookie(state, STATE_TTL_SECONDS))
  return c.redirect(url.toString(), 302)
})

/**
 * Google sends the browser back here.
 *
 * The `state` check is the CSRF guard: without it, a link somebody else
 * crafted could complete a consent flow into this account. It is compared
 * against a cookie this Worker set, so nothing an attacker can write matches.
 */
gmail.get('/callback', async (c) => {
  const url = new URL(c.req.url)
  const back = `${(c.env.DASHBOARD_URL ?? '').replace(/\/$/, '')}/#settings`

  const error = url.searchParams.get('error')
  if (error) return c.redirect(`${back}?gmail=${encodeURIComponent(error)}`, 302)

  const state = url.searchParams.get('state')
  const expected = readStateCookie(c.req.header('Cookie'))
  c.header('Set-Cookie', stateCookie('', 0))
  if (!state || !expected || state !== expected) {
    return c.redirect(`${back}?gmail=state_mismatch`, 302)
  }

  const code = url.searchParams.get('code')
  if (!code) return c.redirect(`${back}?gmail=no_code`, 302)

  try {
    const { refreshToken, accessToken, scopes } = await exchangeCode(c.env, code)
    await storeGrant(c.env, tenantOf(c), {
      refreshToken,
      accountEmail: await accountEmail(accessToken),
      scopes,
    })
    // Reported rather than assumed: Google may hand back less than was asked
    // for, and finding that out here beats finding it out mid-write.
    const ok = scopes.includes(GMAIL_COMPOSE_SCOPE) ? 'connected' : 'missing_scope'
    return c.redirect(`${back}?gmail=${ok}`, 302)
  } catch (err) {
    console.error('gmail connect failed:', err)
    return c.redirect(`${back}?gmail=failed`, 302)
  }
})

gmail.post('/disconnect', async (c) => {
  await forgetGrant(c.env, tenantOf(c))
  return c.json({ ok: true })
})

/* --------------------------------------------------------------------- */
/* The bulk write, behind its preview                                     */
/* --------------------------------------------------------------------- */

async function currentPlan(env: Env, tenant: TenantId) {
  const rows = await getDb(env.DB).select().from(syncTargets).where(scoped(syncTargets, tenant))
  return planDrafts(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactEmail: r.contactEmail,
      pitchDraft: r.pitchDraft,
      status: r.status,
    })),
  )
}

/** What would happen, including what would not and why. */
gmail.get('/drafts', async (c) => {
  const tenant = tenantOf(c)
  const [plan, grant] = await Promise.all([currentPlan(c.env, tenant), readGrant(c.env, tenant)])
  return c.json({ ...plan, grant })
})

gmail.post('/drafts', async (c) => {
  const tenant = tenantOf(c)
  const grant = await readGrant(c.env, tenant)
  if (!grant.connected) return c.json({ error: 'Gmail is not connected' }, 409)
  if (!grant.canDraft) return c.json({ error: 'The Gmail grant does not include drafting' }, 409)

  const body = await c.req.json<{ ids?: number[] }>().catch(() => ({ ids: undefined }))
  const plan = await currentPlan(c.env, tenant)
  // Re-planned server-side rather than trusting the ids alone: the preview
  // may be minutes old, and a target pitched in the meantime must not be
  // drafted because a stale screen still lists it.
  const chosen = body.ids?.length ? plan.ready.filter((r) => body.ids!.includes(r.id)) : plan.ready
  if (chosen.length === 0) return c.json({ created: [], failed: [], skipped: plan.skipped })

  const token = await accessTokenForGrant(c.env, tenant)
  const from = grant.accountEmail

  const created: Array<{ id: number; name: string; draftId: string }> = []
  const failed: Array<{ id: number; name: string; error: string }> = []

  // Sequential on purpose. Gmail rate-limits per user, and a burst of
  // parallel writes that half-succeeds is harder to reason about afterwards
  // than a slower run that stops where it stopped.
  for (const target of chosen) {
    try {
      const draft = await createDraft(
        token,
        encodeDraft({ to: target.to, from, subject: target.subject, body: target.body }),
      )
      created.push({ id: target.id, name: target.name, draftId: draft.id })
    } catch (err) {
      failed.push({ id: target.id, name: target.name, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (created.length > 0) await markGrantUsed(c.env, tenant)

  // Deliberately no status write. A draft is not a send, and moving these to
  // `pitched` here would tell you a pitch went out that is still sitting in
  // your drafts folder.
  return c.json({ created, failed, skipped: plan.skipped })
})

export default gmail
