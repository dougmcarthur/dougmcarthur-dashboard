import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { answerLibrary, applicationFields, referenceDocs, gigOpportunities } from '../db/schema'
import { buildProfile } from '../lib/answerEngine'
import { seedEntriesFromProfile, harvestCandidate } from '../lib/answerLibrary'
import { findVariant, insertEntry } from '../lib/libraryStore'
import { QUESTION_KINDS, kindByKey } from '../lib/questionKinds'
import type { Env } from '../types'

const library = new Hono<{ Bindings: Env }>()

library.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const category = c.req.query('category')

  const rows = category
    ? await db
        .select()
        .from(answerLibrary)
        .where(eq(answerLibrary.category, category))
        .orderBy(answerLibrary.questionKey, answerLibrary.maxLength)
    : await db
        .select()
        .from(answerLibrary)
        .orderBy(answerLibrary.category, answerLibrary.questionKey, answerLibrary.maxLength)

  // Which forms each entry is currently filling, so an edit shows its blast radius.
  const usage = await db
    .select({
      libraryId: applicationFields.libraryId,
      gigId: applicationFields.gigId,
      gigName: gigOpportunities.name,
    })
    .from(applicationFields)
    .leftJoin(gigOpportunities, eq(applicationFields.gigId, gigOpportunities.id))
    .where(sql`${applicationFields.libraryId} is not null`)

  const usedBy = new Map<number, Array<{ gigId: number; gigName: string | null }>>()
  for (const u of usage) {
    if (u.libraryId == null) continue
    const list = usedBy.get(u.libraryId) ?? []
    if (!list.some((g) => g.gigId === u.gigId)) list.push({ gigId: u.gigId, gigName: u.gigName })
    usedBy.set(u.libraryId, list)
  }

  return c.json({
    entries: rows.map((r) => ({ ...r, usedBy: usedBy.get(r.id) ?? [] })),
    // The vocabulary the classifier recognises — drives the "add entry" picker.
    kinds: QUESTION_KINDS.map((k) => ({
      key: k.key,
      label: k.label,
      category: k.category,
      lengthSensitive: k.lengthSensitive,
    })),
  })
})

const EntrySchema = z.object({
  questionKey: z.string().min(1),
  label: z.string().min(1).optional(),
  category: z.string().optional(),
  content: z.string().min(1),
  maxLength: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
})

library.post('/', zValidator('json', EntrySchema), async (c) => {
  const db = getDb(c.env.DB)
  const b = c.req.valid('json')
  const kind = kindByKey(b.questionKey)

  const existing = await findVariant(db, b.questionKey, b.maxLength ?? null)
  if (existing) {
    return c.json({ error: 'An entry already exists for that question and length', id: existing.id }, 409)
  }

  const row = await insertEntry(db, {
    questionKey: b.questionKey,
    label: b.label ?? kind?.label ?? b.questionKey,
    category: b.category ?? kind?.category ?? 'story',
    content: b.content,
    maxLength: b.maxLength ?? null,
    notes: b.notes ?? undefined,
  })

  return c.json(row, 201)
})

const PatchSchema = z.object({
  content: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  notes: z.string().nullish(),
  maxLength: z.number().int().positive().nullish(),
  pinned: z.boolean().optional(),
})

library.patch('/:id', zValidator('json', PatchSchema), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const b = c.req.valid('json')

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (b.content !== undefined) updates.content = b.content
  if (b.label !== undefined) updates.label = b.label
  if (b.notes !== undefined) updates.notes = b.notes
  if (b.maxLength !== undefined) updates.maxLength = b.maxLength
  if (b.pinned !== undefined) updates.pinned = b.pinned ? 1 : 0

  await db.update(answerLibrary).set(updates).where(eq(answerLibrary.id, id))

  const row = await db.select().from(answerLibrary).where(eq(answerLibrary.id, id)).get()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

library.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  // Prepared fields keep their text; they just stop pointing at a missing entry.
  await db
    .update(applicationFields)
    .set({ libraryId: null })
    .where(eq(applicationFields.libraryId, id))
  await db.delete(answerLibrary).where(eq(answerLibrary.id, id))
  return c.json({ ok: true })
})

// Bootstrap from the reference docs so the first application has something to reuse.
library.post('/seed', async (c) => {
  const db = getDb(c.env.DB)
  const docs = await db.select().from(referenceDocs)
  if (docs.length === 0) {
    return c.json({ error: 'No reference docs to seed from', created: 0 }, 400)
  }

  const profile = buildProfile(docs)
  const candidates = seedEntriesFromProfile(profile.facts)

  let created = 0
  const skipped: string[] = []
  for (const entry of candidates) {
    const existing = await findVariant(db, entry.questionKey, entry.maxLength ?? null)
    if (existing) {
      skipped.push(entry.questionKey)
      continue
    }
    await insertEntry(db, entry)
    created += 1
  }

  return c.json({ created, skipped })
})

// Promote a reviewed answer into the library (or update the entry it came from).
library.post(
  '/from-field',
  zValidator(
    'json',
    z.object({
      fieldId: z.number().int(),
      questionKey: z.string().min(1).optional(),
      overwrite: z.boolean().optional(),
    }),
  ),
  async (c) => {
    const db = getDb(c.env.DB)
    const { fieldId, questionKey, overwrite } = c.req.valid('json')

    const field = await db
      .select()
      .from(applicationFields)
      .where(eq(applicationFields.id, fieldId))
      .get()
    if (!field) return c.json({ error: 'field not found' }, 404)

    const answer = field.answer ?? field.draftAnswer ?? ''
    const candidate = harvestCandidate(
      {
        label: field.label,
        fieldKey: field.fieldKey,
        fieldType: field.fieldType,
        maxLength: field.maxLength,
        helpText: field.helpText,
        questionKind: questionKey ?? field.questionKind,
      },
      answer,
    )

    if (!candidate) {
      return c.json(
        { error: 'That answer isn’t a reusable question — pick a question kind to file it under.' },
        400,
      )
    }

    const existing = await findVariant(db, candidate.questionKey, candidate.maxLength)

    if (existing && !overwrite) {
      if (existing.content.trim() === candidate.content.trim()) {
        return c.json({ entry: existing, action: 'unchanged' })
      }
      return c.json(
        {
          error: 'An entry already exists for that question and length',
          entry: existing,
          action: 'conflict',
        },
        409,
      )
    }

    const ts = new Date().toISOString()
    if (existing) {
      await db
        .update(answerLibrary)
        .set({ content: candidate.content, updatedAt: ts })
        .where(eq(answerLibrary.id, existing.id))
      await db
        .update(applicationFields)
        .set({ libraryId: existing.id, questionKind: candidate.questionKey, updatedAt: ts })
        .where(eq(applicationFields.id, fieldId))
      const row = await db.select().from(answerLibrary).where(eq(answerLibrary.id, existing.id)).get()
      return c.json({ entry: row, action: 'updated' })
    }

    const row = await insertEntry(db, candidate, field.gigId)
    await db
      .update(applicationFields)
      .set({ libraryId: row.id, questionKind: candidate.questionKey, updatedAt: ts })
      .where(eq(applicationFields.id, fieldId))

    return c.json({ entry: row, action: 'created' }, 201)
  },
)

// Recently added entries, for the overview's "library grew" signal.
library.get('/recent', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db
    .select()
    .from(answerLibrary)
    .orderBy(desc(answerLibrary.updatedAt))
    .limit(5)
  return c.json(rows)
})

export default library
