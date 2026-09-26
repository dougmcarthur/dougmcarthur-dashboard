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
import {
  beginConsent,
  bundlePurposes,
  checkCallback,
  consentAvailable,
  isBundle,
  settingsRedirect,
} from '../lib/googleOAuth'
import { completeBundle, completeGrant } from '../lib/googleConnect'
import type { Env } from '../types'

const gmail = new Hono<AppEnv>()

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
  if (!consentAvailable(c.env)) {
    return c.json({ error: 'Google client credentials or TOKEN_ENCRYPTION_KEY are not configured' }, 503)
  }
  return beginConsent(c, 'gmail.compose')
})

/**
 * Google sends the browser back here, for every purpose.
 *
 * The path is registered in the Google console, so it stays what it is and
 * `state` says which grant is being completed — see `googleOAuth.ts`. Adding a
 * purpose therefore costs nothing anybody has to go and configure.
 */
gmail.get('/callback', async (c) => {
  const check = checkCallback(c)
  if (!check.ok) return c.redirect(settingsRedirect(c.env, check.purpose, check.reason), 302)

  if (isBundle(check.purpose)) {
    const done = await completeBundle(c.env, tenantOf(c), check.code, bundlePurposes(check.purpose))
    return c.redirect(
      settingsRedirect(c.env, check.purpose, done.outcome, {
        declined: done.declined,
        failed: done.failed,
        kept: done.kept,
        skipped: done.skipped,
      }),
      302,
    )
  }
  const outcome = await completeGrant(c.env, tenantOf(c), check.purpose, check.code)
  return c.redirect(settingsRedirect(c.env, check.purpose, outcome), 302)
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
