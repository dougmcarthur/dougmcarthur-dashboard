/**
 * Connectors: outside services that already know something about the artist.
 *
 * Bandsintown is the first. The artist gives Scout the name Bandsintown knows
 * them by and their own API key; Scout reads their shows with it. See
 * `shared/bandsintown.ts` for why the key is per artist, and migration 0027
 * for why it is encrypted.
 *
 * Three properties the routes keep:
 *
 * - **The key is never returned.** The list says whether one is on file and
 *   what the last check said; nothing prints it back, the same as an agent
 *   token.
 * - **A refused key is not stored.** Saving probes first. Bandsintown saying
 *   no is a verdict, and storing a key it just refused would paint a
 *   connector green that has never worked. A timeout is not a verdict, so an
 *   unreachable probe still saves, and says so.
 * - **No passkey touch.** A connector reads public show listings; it changes
 *   nothing about who can get in, which is the only thing that asks.
 *
 * `today` comes from the browser, as the viewer's own date, because a show
 * tonight in Winnipeg is "upcoming" until midnight in Winnipeg — not until
 * midnight UTC, six hours earlier.
 */

import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { artistConnectors } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import type { Env } from '../types'
import { decryptToken, encryptToken } from '../lib/googleGrant'
import {
  errorNote,
  eventsUrl,
  parseEvents,
  verdictFor,
  type ProbeVerdict,
  type Show,
  type ShowWindow,
} from '../../shared/bandsintown'

const connectors = new Hono<AppEnv>()

const KIND = 'bandsintown'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function todayFrom(c: Context<AppEnv>): string {
  const q = c.req.query('today') ?? ''
  return ISO_DATE.test(q) ? q : new Date().toISOString().slice(0, 10)
}

type Row = typeof artistConnectors.$inferSelect

export async function loadRow(env: Env, tenant: TenantId, kind: string = KIND): Promise<Row | undefined> {
  return getDb(env.DB)
    .select()
    .from(artistConnectors)
    .where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, kind)))
    .get()
}

interface Fetched {
  verdict: ProbeVerdict
  note: string | null
  shows: Show[]
}

/**
 * One request to Bandsintown. Never throws: a network failure is an
 * `unreachable` verdict, which is information, not an exception.
 */
export async function fetchWindow(account: string, key: string, window: ShowWindow, today: string): Promise<Fetched> {
  try {
    const res = await fetch(eventsUrl(account, key, window, today), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    const body = await res.json().catch(() => null)
    const verdict = verdictFor(res.status)
    return {
      verdict,
      note: verdict === 'working' ? null : errorNote(body) ?? `Bandsintown answered ${res.status}.`,
      shows: verdict === 'working' ? parseEvents(body, account) : [],
    }
  } catch (err) {
    return { verdict: 'unreachable', note: err instanceof Error ? err.message : 'No answer.', shows: [] }
  }
}

export async function recordProbe(env: Env, tenant: TenantId, probe: Fetched) {
  const now = new Date().toISOString()
  await getDb(env.DB)
    .update(artistConnectors)
    .set({ status: probe.verdict, statusNote: probe.note, checkedAt: now, updatedAt: now })
    .where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, KIND)))
}

export function summary(row: Row | undefined) {
  return row
    ? {
        kind: row.kind,
        account: row.account,
        hasKey: Boolean(row.secret),
        status: row.status,
        statusNote: row.statusNote,
        checkedAt: row.checkedAt,
      }
    : null
}

connectors.get('/', async (c) => {
  const tenant = tenantOf(c)
  const [bit, mm] = await Promise.all([loadRow(c.env, tenant), loadRow(c.env, tenant, 'manitoba_music')])
  return c.json({
    // Without the encryption key nothing can be stored, and the card says so
    // rather than offering a form that would fail on save.
    canStore: Boolean(c.env.TOKEN_ENCRYPTION_KEY),
    bandsintown: summary(bit),
    manitobaMusic: summary(mm),
  })
})

const SaveSchema = z.object({
  account: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1).max(200),
})

connectors.put('/bandsintown', zValidator('json', SaveSchema), async (c) => {
  if (!c.env.TOKEN_ENCRYPTION_KEY) {
    return c.json({ error: 'This deployment has no TOKEN_ENCRYPTION_KEY, so it cannot store a key.' }, 503)
  }
  const tenant = tenantOf(c)
  const { account, apiKey } = c.req.valid('json')
  const probe = await fetchWindow(account, apiKey, 'upcoming', todayFrom(c))

  if (probe.verdict === 'rejected') {
    return c.json({ error: probe.note ?? 'Bandsintown refused that name and key.', verdict: 'rejected' }, 400)
  }

  const db = getDb(c.env.DB)
  const now = new Date().toISOString()
  // Delete-then-insert rather than an upsert, so no statement names the
  // unique index as a conflict target — the rule `storeGrant` follows.
  await db
    .delete(artistConnectors)
    .where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, KIND)))
  await db.insert(artistConnectors).values(
    withTenant(tenant, {
      kind: KIND,
      account,
      secret: await encryptToken(c.env, apiKey),
      status: probe.verdict,
      statusNote: probe.note,
      checkedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  )

  return c.json({ bandsintown: summary(await loadRow(c.env, tenant)), upcoming: probe.shows.length })
})

connectors.post('/bandsintown/check', async (c) => {
  const tenant = tenantOf(c)
  const row = await loadRow(c.env, tenant)
  if (!row?.secret) return c.json({ error: 'Bandsintown is not connected.' }, 404)
  const probe = await fetchWindow(row.account, await decryptToken(c.env, row.secret), 'upcoming', todayFrom(c))
  await recordProbe(c.env, tenant, probe)
  return c.json({ bandsintown: summary(await loadRow(c.env, tenant)) })
})

connectors.delete('/bandsintown', async (c) => {
  await getDb(c.env.DB)
    .delete(artistConnectors)
    .where(scoped(artistConnectors, tenantOf(c), eq(artistConnectors.kind, KIND)))
  return c.json({ ok: true })
})

export default connectors
