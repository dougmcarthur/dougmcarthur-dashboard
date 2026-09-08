import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { getDb } from '../db'
import { artistAssets, referenceDocs } from '../db/schema'
import {
  ASSET_KINDS,
  assembleEpk,
  assetHealth,
  defaultReviewBy,
  normaliseAssetKind,
  pickForLength,
  type ArtistAsset,
  type EpkAudience,
} from '../../shared/artistAssets'
import { classifyQuestion, kindByKey, targetLength } from '../../shared/questionKinds'
import { extractAll, type AssetProposal } from '../../shared/artistSource'
import type { Env } from '../types'

const artist = new Hono<{ Bindings: Env }>()

const AUDIENCES: EpkAudience[] = ['festival', 'sync', 'press']

const AssetSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  value: z.string().nullable().optional(),
  questionKind: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  credit: z.string().nullable().optional(),
  usageRights: z.string().nullable().optional(),
  reviewBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
})
const AssetPatchSchema = AssetSchema.partial()

/**
 * `today` as a parameter, defaulted at the edge.
 *
 * Everything downstream — freshness, the default review date, the EPK's counts
 * — takes the date rather than reading the clock, so this is the one place the
 * clock is read and a caller can ask what the page will look like next March.
 */
function todayOf(c: { req: { query: (k: string) => string | undefined } }): string {
  const q = c.req.query('today')
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10)
}

/** Length is stored rather than recomputed, so a variant can be picked cheaply. */
function measure(value: string | null | undefined): number | null {
  return typeof value === 'string' ? value.length : null
}

artist.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const today = todayOf(c)
  const kind = c.req.query('kind')

  const rows = (await db
    .select()
    .from(artistAssets)
    .orderBy(asc(artistAssets.sortOrder), asc(artistAssets.label))) as ArtistAsset[]

  const filtered = kind ? rows.filter((r) => normaliseAssetKind(r.kind) === normaliseAssetKind(kind)) : rows

  return c.json({
    items: filtered.map((r) => ({ ...r, health: assetHealth(r, today) })),
    total: filtered.length,
    // The counts the page leads with. Computed over everything rather than the
    // filtered view: "3 overdue" must not change because you clicked Photos.
    needsReview: rows.filter((r) => !r.archived && assetHealth(r, today).freshness === 'overdue').length,
    unreviewed: rows.filter((r) => !r.archived && assetHealth(r, today).freshness === 'unreviewed').length,
  })
})

/**
 * The EPK: a view over the database, cut for who is reading it.
 *
 * Generated per request rather than stored, because a stored one goes stale
 * the moment a fact underneath it changes and nothing tells you.
 */
artist.get('/epk', async (c) => {
  const raw = c.req.query('audience') ?? 'festival'
  if (!AUDIENCES.includes(raw as EpkAudience)) {
    return c.json({ error: `Unknown audience "${raw}".`, allowed: AUDIENCES }, 400)
  }

  const db = getDb(c.env.DB)
  const rows = (await db.select().from(artistAssets)) as ArtistAsset[]
  return c.json(assembleEpk(rows, { audience: raw as EpkAudience, today: todayOf(c) }))
})

/**
 * What this database can offer a given form field.
 *
 * The join between the artist database and the form parser: hand it a field
 * label and it says which canonical question that is and which asset answers
 * it best at that length. Phase D's pre-fill is this, once per field.
 */
artist.get('/answer', async (c) => {
  const label = c.req.query('label')
  if (!label) return c.json({ error: 'A field label is required.' }, 400)

  const kind = classifyQuestion({
    label,
    helpText: c.req.query('help') ?? null,
    fieldType: c.req.query('type'),
  })
  if (!kind) return c.json({ questionKind: null, answer: null, alternatives: [] })

  const maxLengthRaw = c.req.query('maxLength')
  const max = maxLengthRaw ? Number(maxLengthRaw) : null
  const wanted = targetLength({
    maxLength: Number.isFinite(max) ? max : null,
    fieldType: c.req.query('type'),
  })

  const db = getDb(c.env.DB)
  const rows = (await db.select().from(artistAssets)) as ArtistAsset[]
  const candidates = rows.filter((r) => !r.archived && r.questionKind === kind.key)
  const answer = pickForLength(candidates, wanted)
  const today = todayOf(c)

  return c.json({
    questionKind: kind.key,
    label: kind.label,
    // 'adapt' answers name the event they were written for. Passed through so
    // the caller can say so rather than offering it as ready to paste.
    reuse: kind.reuse,
    targetLength: wanted,
    answer: answer ? { ...answer, health: assetHealth(answer, today) } : null,
    alternatives: candidates
      .filter((a) => a.id !== answer?.id)
      .map((a) => ({ id: a.id, label: a.label, charCount: a.charCount ?? a.value?.length ?? 0 })),
  })
})

/**
 * Filling the library from the documents that already describe him.
 *
 * `GET` proposes and `POST` writes, which is the same split the application
 * panel has: you look at what it found before any of it lands. See
 * shared/artistSource.ts for the three rules that decide what is extracted.
 */
async function propose(env: Env): Promise<{
  proposals: AssetProposal[]
  skipped: Array<{ heading: string; reason: string }>
  existing: string[]
}> {
  const db = getDb(env.DB)
  const docs = await db.select().from(referenceDocs).orderBy(asc(referenceDocs.id))
  const { proposals, skipped } = extractAll(docs)

  const rows = (await db.select().from(artistAssets)) as ArtistAsset[]
  const known = new Set(rows.map((r) => r.source).filter((s): s is string => !!s))

  return {
    proposals: proposals.filter((p) => !known.has(p.source)),
    skipped,
    // Named so the report can say "6 already on file" rather than silently
    // returning fewer proposals than the last run did.
    existing: proposals.filter((p) => known.has(p.source)).map((p) => p.source),
  }
}

artist.get('/source', async (c) => {
  const { proposals, skipped, existing } = await propose(c.env)
  return c.json({ proposals, skipped, existing, wouldAdd: proposals.length })
})

artist.post('/source', async (c) => {
  const db = getDb(c.env.DB)
  const { proposals, skipped, existing } = await propose(c.env)
  const ts = new Date().toISOString()

  for (const p of proposals) {
    await db.insert(artistAssets).values({
      kind: normaliseAssetKind(p.kind),
      label: p.label,
      value: p.value,
      questionKind: p.questionKind,
      variant: p.variant,
      charCount: measure(p.value),
      credit: null,
      usageRights: null,
      // Null, where a hand-added asset gets a date seeded from its kind. That
      // difference is the point: adding an asset yourself is a claim that it
      // is right, and a document saying so is not. Null reads as `unreviewed`
      // — "nobody ever claimed this was checked" — which is a state this
      // module already keeps apart from `overdue`.
      reviewBy: null,
      source: p.source,
      notes: p.notes,
      sortOrder: 0,
      archived: 0,
      createdAt: ts,
      updatedAt: ts,
    })
  }

  return c.json({ added: proposals.length, existing: existing.length, skipped })
})

artist.post('/', zValidator('json', AssetSchema), async (c) => {
  const db = getDb(c.env.DB)
  const b = c.req.valid('json')
  const ts = new Date().toISOString()
  const today = todayOf(c)

  if (b.questionKind && !kindByKey(b.questionKind)) {
    return c.json({ error: `"${b.questionKind}" is not a question this app knows.` }, 400)
  }

  const result = await db
    .insert(artistAssets)
    .values({
      kind: normaliseAssetKind(b.kind),
      label: b.label,
      value: b.value ?? null,
      questionKind: b.questionKind ?? null,
      variant: b.variant ?? null,
      charCount: measure(b.value),
      credit: b.credit ?? null,
      usageRights: b.usageRights ?? null,
      // Seeded from the kind when it is not given, so nothing lands here
      // without a date it will be looked at again. That is the whole point of
      // the table existing rather than a folder.
      reviewBy: b.reviewBy ?? defaultReviewBy(b.kind, today),
      source: b.source ?? null,
      notes: b.notes ?? null,
      sortOrder: b.sortOrder ?? 0,
      archived: b.archived ? 1 : 0,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning({ id: artistAssets.id })

  return c.json({ id: result[0].id }, 201)
})

artist.patch('/:id', zValidator('json', AssetPatchSchema), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const b = c.req.valid('json')

  if (b.questionKind && !kindByKey(b.questionKind)) {
    return c.json({ error: `"${b.questionKind}" is not a question this app knows.` }, 400)
  }

  const updates: Record<string, unknown> = { ...b, updatedAt: new Date().toISOString() }
  if (b.archived !== undefined) updates.archived = b.archived ? 1 : 0
  if (b.kind !== undefined) updates.kind = normaliseAssetKind(b.kind)
  // Kept in step with the text it measures, or picking by length silently uses
  // the old one.
  if (b.value !== undefined) updates.charCount = measure(b.value)

  const before = await db.select().from(artistAssets).where(eq(artistAssets.id, id)).get()
  if (!before) return c.json({ error: 'not found' }, 404)

  await db.update(artistAssets).set(updates).where(eq(artistAssets.id, id))
  const row = await db.select().from(artistAssets).where(eq(artistAssets.id, id)).get()
  return c.json(row)
})

/**
 * Marking an asset as still good, which is the common case by a distance.
 * Pushes the review date out by the kind's own interval from today.
 */
artist.post('/:id/reviewed', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const row = await db.select().from(artistAssets).where(eq(artistAssets.id, id)).get()
  if (!row) return c.json({ error: 'not found' }, 404)

  const reviewBy = defaultReviewBy(row.kind, todayOf(c))
  await db
    .update(artistAssets)
    .set({ reviewBy, updatedAt: new Date().toISOString() })
    .where(eq(artistAssets.id, id))

  return c.json({ ...row, reviewBy })
})

artist.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  await db.delete(artistAssets).where(eq(artistAssets.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

/** The vocabulary, so the UI never hard-codes a second copy of it. */
artist.get('/kinds', (c) => c.json({ kinds: ASSET_KINDS, audiences: AUDIENCES }))

export default artist
