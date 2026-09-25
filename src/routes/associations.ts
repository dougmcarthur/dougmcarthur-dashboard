/**
 * Member profiles on the provincial music associations' sites, as sources for
 * the artist database.
 *
 * The Manitoba Music routes (`./manitobaMusic.ts`) generalised: the same two
 * steps — `POST /check` reads the address the artist pasted and writes
 * nothing, `PUT /` saves it after "Is this you?" — and the same import,
 * preview then write, everything landing never reviewed. What changed is
 * which site the address may be on (`shared/musicAssociations.ts`) and which
 * reader takes it: Manitoba Music keeps its own parser and its own connector
 * row, so a profile connected before this existed stays connected; every
 * other site goes through `shared/associationProfile.ts`.
 *
 * One row per association, kind `association:<id>`, because an artist who
 * moved provinces can be a member of two — and neither replaces the other.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, like } from 'drizzle-orm'
import { getDb } from '../db'
import { artistAssets, artistConnectors } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import type { Env } from '../types'
import { normaliseAssetKind, type ArtistAsset } from '../../shared/artistAssets'
import { profileUrl, proposalsFrom, type MmProfile } from '../../shared/manitobaMusic'
import {
  ASSOCIATIONS,
  associationById,
  associationFor,
  associationProfile,
  type Association,
} from '../../shared/musicAssociations'
import { parseAssociationProfile } from '../../shared/associationProfile'
import { readProfile as readManitoba } from './manitobaMusic'

const associations = new Hono<AppEnv>()

const USER_AGENT = 'SunDogsMusicScout/1.0 (+https://scout.sundogsmusic.ca)'

/** Manitoba Music's row predates this file and keeps its kind. */
export function kindFor(id: string): string {
  return id === 'manitoba' ? 'manitoba_music' : `association:${id}`
}

export function idForKind(kind: string): string | null {
  if (kind === 'manitoba_music') return 'manitoba'
  return kind.startsWith('association:') ? kind.slice('association:'.length) : null
}

type Read =
  | { ok: true; association: Association; url: string; key: string; profile: MmProfile }
  | { ok: false; verdict: 'rejected' | 'unreachable'; error: string }

async function get(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  })
}

/** Which site, which reader. Never throws: every failure is a sentence for the screen. */
export async function readAssociation(input: string): Promise<Read> {
  const site = associationFor(input)
  if (site?.id === 'manitoba') {
    const read = await readManitoba(input)
    if (!read.ok) return read
    return { ok: true, association: site, url: read.url, key: read.slug, profile: read.profile }
  }

  const target = associationProfile(input)
  if ('error' in target) return { ok: false, verdict: 'rejected', error: target.error }
  const { association } = target
  const blocked = association.automated === 'blocked'
    ? ` ${association.name}’s site turns away automated visits, so this may keep failing — the address is right, the door is shut.`
    : ''
  try {
    const [res, home] = await Promise.all([get(target.url), get(association.home).catch(() => null)])
    if (res.status === 404) {
      return { ok: false, verdict: 'rejected', error: `${association.name} has no profile at that address.` }
    }
    if (!res.ok) {
      return { ok: false, verdict: 'unreachable', error: `${association.name} answered ${res.status}.${blocked || ' Try again in a while.'}` }
    }
    // A site that sends an unknown profile to its directory answers 200 — the
    // address it ended on is the check.
    const landed = new URL(res.url || target.url)
    if (!association.profilePath?.test(landed.pathname)) {
      return { ok: false, verdict: 'rejected', error: `${association.name} has no profile at that address.` }
    }
    const html = await res.text()
    const chrome = home && home.ok ? await home.text() : ''
    const profile = parseAssociationProfile(html, chrome, { url: target.url, associationName: association.name })
    if (!profile) {
      const title = (html.match(/<title>([^<]{1,120})/)?.[1] ?? '').trim()
      return {
        ok: false,
        verdict: 'unreachable',
        error: `That page did not read as a ${association.name} profile${title ? ` (the site sent a page titled "${title}")` : ''}.${blocked}`,
      }
    }
    return { ok: true, association, url: target.url, key: target.key, profile }
  } catch (err) {
    return { ok: false, verdict: 'unreachable', error: `${err instanceof Error ? err.message : 'No answer.'}${blocked}` }
  }
}

type Row = typeof artistConnectors.$inferSelect

async function loadRows(env: Env, tenant: TenantId): Promise<Row[]> {
  const db = getDb(env.DB)
  const [mm, others] = await Promise.all([
    db.select().from(artistConnectors).where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, 'manitoba_music'))),
    db.select().from(artistConnectors).where(scoped(artistConnectors, tenant, like(artistConnectors.kind, 'association:%'))),
  ])
  return [...mm, ...others]
}

async function loadRow(env: Env, tenant: TenantId, id: string): Promise<Row | undefined> {
  return getDb(env.DB)
    .select()
    .from(artistConnectors)
    .where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, kindFor(id))))
    .get()
}

export interface AssociationSummary {
  id: string
  name: string
  region: string
  url: string
  /** The name read off the profile when it last worked. */
  profileName: string | null
  status: string
  statusNote: string | null
  checkedAt: string | null
}

function summarise(row: Row): AssociationSummary | null {
  const id = idForKind(row.kind)
  const a = id ? associationById(id) : null
  if (!a) return null
  const working = row.status === 'working'
  return {
    id: a.id,
    name: a.name,
    region: a.region,
    url: row.account,
    profileName: working ? row.statusNote : null,
    status: row.status,
    statusNote: working ? null : row.statusNote,
    checkedAt: row.checkedAt,
  }
}

/**
 * Profile addresses the artist already keeps in their own library, not yet
 * connected. An address they put there is one they gave, so the card can
 * offer it — behind "Is this you?", never connected on its own.
 */
export async function offeredFromLibrary(env: Env, tenant: TenantId, connected: Set<string>) {
  const links = await getDb(env.DB)
    .select({ value: artistAssets.value })
    .from(artistAssets)
    .where(scoped(artistAssets, tenant, eq(artistAssets.kind, 'link'), eq(artistAssets.archived, 0)))
  const out: Array<{ id: string; name: string; url: string }> = []
  for (const { value } of links) {
    const a = associationFor(value ?? '')
    if (!a || connected.has(a.id) || out.some((o) => o.id === a.id)) continue
    const target = a.id === 'manitoba' ? profileUrl(value ?? '') : associationProfile(value ?? '')
    if ('url' in target) out.push({ id: a.id, name: a.name, url: target.url })
  }
  return out
}

associations.get('/', async (c) => {
  const tenant = tenantOf(c)
  const rows = await loadRows(c.env, tenant)
  const connected = rows.map(summarise).filter((s): s is AssociationSummary => !!s)
  return c.json({
    connected,
    fromLibrary: await offeredFromLibrary(c.env, tenant, new Set(connected.map((s) => s.id))),
    // Every association and what Scout can do with its site, for the card's list.
    directory: ASSOCIATIONS.map((a) => ({
      id: a.id,
      name: a.name,
      region: a.region,
      profiles: Boolean(a.profilePath),
      note: a.profilePath ? (a.automated === 'blocked' ? 'Its site often turns away automated visits.' : null) : a.profileNote ?? null,
    })),
  })
})

/** What the confirmation step shows: enough to recognise yourself, nothing more. */
function identity(read: Extract<Read, { ok: true }>) {
  const p = read.profile
  return {
    association: { id: read.association.id, name: read.association.name },
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

associations.post('/check', zValidator('json', UrlSchema), async (c) => {
  const read = await readAssociation(c.req.valid('json').url)
  if (!read.ok) return c.json({ error: read.error }, read.verdict === 'rejected' ? 400 : 502)
  return c.json(identity(read))
})

associations.put('/', zValidator('json', UrlSchema), async (c) => {
  const tenant = tenantOf(c)
  const read = await readAssociation(c.req.valid('json').url)
  if (!read.ok) return c.json({ error: read.error }, read.verdict === 'rejected' ? 400 : 502)

  const kind = kindFor(read.association.id)
  const db = getDb(c.env.DB)
  const now = new Date().toISOString()
  // Delete-then-insert: no statement names the unique index as a conflict target.
  await db.delete(artistConnectors).where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, kind)))
  await db.insert(artistConnectors).values(
    withTenant(tenant, {
      kind,
      account: read.url,
      secret: null,
      status: 'working',
      statusNote: read.profile.name,
      checkedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
  )
  const row = await loadRow(c.env, tenant, read.association.id)
  return c.json({ association: row ? summarise(row) : null })
})

associations.delete('/:id', async (c) => {
  const id = c.req.param('id')
  if (!associationById(id)) return c.json({ error: 'No such association.' }, 404)
  await getDb(c.env.DB)
    .delete(artistConnectors)
    .where(scoped(artistConnectors, tenantOf(c), eq(artistConnectors.kind, kindFor(id))))
  return c.json({ ok: true })
})

/** A URL or a bio, compared loosely: case, a trailing slash and `www.` are not differences. */
function sameValue(v: string): string {
  return v.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
}

async function record(env: Env, tenant: TenantId, id: string, status: string, note: string | null) {
  const now = new Date().toISOString()
  await getDb(env.DB)
    .update(artistConnectors)
    .set({ status, statusNote: note, checkedAt: now, updatedAt: now })
    .where(scoped(artistConnectors, tenant, eq(artistConnectors.kind, kindFor(id))))
}

async function propose(env: Env, tenant: TenantId, id: string) {
  const row = await loadRow(env, tenant, id)
  if (!row) return { connected: false as const }

  const read = await readAssociation(row.account)
  if (!read.ok) {
    await record(env, tenant, id, read.verdict, read.error)
    return { connected: true as const, error: read.error }
  }
  await record(env, tenant, id, 'working', read.profile.name)

  // Manitoba Music's sources keep their original prefix, so a profile read
  // in before this route existed is not proposed a second time.
  const prefix = id === 'manitoba' ? 'manitoba-music' : `association-${id}`
  const { proposals, skipped } = proposalsFrom(read.profile, read.key, { name: read.association.name, sourcePrefix: prefix })
  const rows = (await getDb(env.DB)
    .select()
    .from(artistAssets)
    .where(scoped(artistAssets, tenant))) as ArtistAsset[]
  const sources = new Set(rows.map((r) => r.source).filter((s): s is string => !!s))
  const values = new Set(rows.map((r) => (r.value ? sameValue(r.value) : '')).filter(Boolean))

  const fresh = proposals.filter((p) => !sources.has(p.source) && !values.has(sameValue(p.value)))
  return {
    connected: true as const,
    association: { id: read.association.id, name: read.association.name },
    name: read.profile.name,
    url: read.url,
    proposals: fresh,
    skipped,
    existing: proposals.length - fresh.length,
    wouldAdd: fresh.length,
  }
}

associations.get('/:id/import', async (c) => c.json(await propose(c.env, tenantOf(c), c.req.param('id'))))

associations.post('/:id/import', async (c) => {
  const tenant = tenantOf(c)
  const plan = await propose(c.env, tenant, c.req.param('id'))
  if (!plan.connected) return c.json({ error: 'That association is not connected.' }, 404)
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
        // not the artist saying so.
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

export default associations
