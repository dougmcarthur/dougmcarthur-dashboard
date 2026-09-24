/**
 * A Manitoba Music member profile, as a source for the artist database.
 *
 * Connecting is two steps, and the first writes nothing: `POST /check` reads
 * the address the artist pasted and answers with the name and photo on it, so
 * the screen can ask "is this you?" before anything is saved. Scout never
 * searches for a profile by name — the artist gives the address — because a
 * search finds the wrong person on the day there are two, and would file a
 * stranger's bio as yours. See `shared/manitobaMusic.ts`.
 *
 * Importing is the reference documents' shape again: `GET /import` proposes,
 * `POST /import` writes, and everything written lands never reviewed. A
 * proposal is dropped when its `source` is on file *or* when its value is —
 * the Instagram link your reference docs already filed is the same link, and
 * filing it twice is a duplicate the library then asks you to review twice.
 *
 * No credential is involved, so the row's `secret` is null and nothing here
 * needs `TOKEN_ENCRYPTION_KEY`.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { artistAssets, artistConnectors } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import type { Env } from '../types'
import { normaliseAssetKind, type ArtistAsset } from '../../shared/artistAssets'
import { parseProfile, profileUrl, proposalsFrom, type MmProfile } from '../../shared/manitobaMusic'
import { summary } from './connectors'

const mm = new Hono<AppEnv>()

const KIND = 'manitoba_music'

/** Says who is asking, so Manitoba Music can tell Scout apart from a scraper. */
const USER_AGENT = 'SunDogsMusicScout/1.0 (+https://scout.sundogsmusic.ca)'

type Read =
  | { ok: true; url: string; slug: string; profile: MmProfile }
  | { ok: false; verdict: 'rejected' | 'unreachable'; error: string }

/** Fetch and parse. Never throws: every failure is a sentence for the screen. */
async function readProfile(input: string): Promise<Read> {
  const target = profileUrl(input)
  if ('error' in target) return { ok: false, verdict: 'rejected', error: target.error }
  try {
    const res = await fetch(target.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 404) {
      return { ok: false, verdict: 'rejected', error: 'Manitoba Music has no profile at that address.' }
    }
    if (!res.ok) {
      return { ok: false, verdict: 'unreachable', error: `Manitoba Music answered ${res.status}. Try again in a while.` }
    }
    const profile = parseProfile(await res.text())
    if (!profile) {
      // A redesign, a login page or an unpublished profile all land here, and
      // none of them is "your profile is empty".
      return { ok: false, verdict: 'rejected', error: 'That page did not read as a Manitoba Music profile.' }
    }
    return { ok: true, url: target.url, slug: target.slug, profile }
  } catch (err) {
    return { ok: false, verdict: 'unreachable', error: err instanceof Error ? err.message : 'No answer.' }
  }
}

type Row = typeof artistConnectors.$inferSelect

async function loadRow(env: Env, tenant: TenantId): Promise<Row | undefined> {
  return getDb(env.DB)
    .select()
    .from(artistConnectors)
    .where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, KIND)))
    .get()
}

async function record(env: Env, tenant: TenantId, status: string, note: string | null) {
  const now = new Date().toISOString()
  await getDb(env.DB)
    .update(artistConnectors)
    .set({ status, statusNote: note, checkedAt: now, updatedAt: now })
    .where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, KIND)))
}

/** What the confirmation step shows: enough to recognise yourself, nothing more. */
function identity(read: Extract<Read, { ok: true }>) {
  const p = read.profile
  return {
    url: read.url,
    name: p.name,
    photo: p.photo,
    genres: p.genres,
    counts: {
      bio: p.bio ? 1 : 0,
      links: p.links.length,
      videos: p.videos.length,
      releases: p.releases.length,
      files: p.files.length,
      photos: p.photos.length + (p.photo ? 1 : 0),
    },
  }
}

const UrlSchema = z.object({ url: z.string().trim().min(1).max(300) })

mm.post('/check', zValidator('json', UrlSchema), async (c) => {
  const read = await readProfile(c.req.valid('json').url)
  if (!read.ok) return c.json({ error: read.error }, read.verdict === 'rejected' ? 400 : 502)
  return c.json(identity(read))
})

mm.put('/', zValidator('json', UrlSchema), async (c) => {
  const tenant = tenantOf(c)
  const read = await readProfile(c.req.valid('json').url)
  if (!read.ok) return c.json({ error: read.error }, read.verdict === 'rejected' ? 400 : 502)

  const db = getDb(c.env.DB)
  const now = new Date().toISOString()
  // Delete-then-insert, like the Bandsintown row: no statement names the
  // unique index as a conflict target.
  await db.delete(artistConnectors).where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, KIND)))
  await db.insert(artistConnectors).values(
    withTenant(tenant, {
      kind: KIND,
      account: read.url,
      secret: null,
      status: 'working',
      statusNote: read.profile.name,
      checkedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  )
  return c.json({ manitobaMusic: summary(await loadRow(c.env, tenant)) })
})

mm.delete('/', async (c) => {
  await getDb(c.env.DB)
    .delete(artistConnectors)
    .where(scoped(artistConnectors, tenantOf(c), eq(artistConnectors.kind, KIND)))
  return c.json({ ok: true })
})

/** A URL or a bio, compared loosely: case, a trailing slash and `www.` are not differences. */
function sameValue(v: string): string {
  return v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
}

async function propose(env: Env, tenant: TenantId) {
  const row = await loadRow(env, tenant)
  if (!row) return { connected: false as const }

  const read = await readProfile(row.account)
  if (!read.ok) {
    await record(env, tenant, read.verdict, read.error)
    return { connected: true as const, error: read.error }
  }
  await record(env, tenant, 'working', read.profile.name)

  const { proposals, skipped } = proposalsFrom(read.profile, read.slug)
  const rows = (await getDb(env.DB)
    .select()
    .from(artistAssets)
    .where(scoped(artistAssets, tenant))) as ArtistAsset[]
  const sources = new Set(rows.map((r) => r.source).filter((s): s is string => !!s))
  const values = new Set(rows.map((r) => (r.value ? sameValue(r.value) : '')).filter(Boolean))

  const fresh = proposals.filter((p) => !sources.has(p.source) && !values.has(sameValue(p.value)))
  return {
    connected: true as const,
    name: read.profile.name,
    url: read.url,
    proposals: fresh,
    skipped,
    existing: proposals.length - fresh.length,
    wouldAdd: fresh.length,
  }
}

mm.get('/import', async (c) => c.json(await propose(c.env, tenantOf(c))))

mm.post('/import', async (c) => {
  const tenant = tenantOf(c)
  const plan = await propose(c.env, tenant)
  if (!plan.connected) return c.json({ error: 'Manitoba Music is not connected.' }, 404)
  if ('error' in plan) return c.json({ error: plan.error }, 502)

  const db = getDb(c.env.DB)
  const ts = new Date().toISOString()
  for (const p of plan.proposals) {
    await db.insert(artistAssets).values(
      withTenant(tenant, {
        kind: normaliseAssetKind(p.kind),
        label: p.label,
        value: p.value,
        questionKind: p.questionKind,
        variant: p.variant,
        charCount: p.value.length,
        credit: null,
        usageRights: null,
        // Never reviewed, like everything sourced: a public page saying so is
        // not the artist saying so. See the reference-document import.
        reviewBy: null,
        source: p.source,
        notes: p.notes,
        sortOrder: 0,
        archived: 0,
        createdAt: ts,
        updatedAt: ts,
      }),
    )
  }
  return c.json({ added: plan.proposals.length, existing: plan.existing, skipped: plan.skipped })
})

export default mm
