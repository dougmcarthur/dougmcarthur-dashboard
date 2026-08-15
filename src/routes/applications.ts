import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, asc, max } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, applicationFields } from '../db/schema'
import { prepareApplication } from '../lib/applicationPrep'
import { windowState, today } from '../lib/submissionWindow'
import type { Env } from '../types'

// Mounted at /api/gigs — the per-gig view of a prepared application.
export const gigApplications = new Hono<{ Bindings: Env }>()

// Mounted at /api/application-fields — editing one prepared answer.
export const applicationFieldRoutes = new Hono<{ Bindings: Env }>()

async function loadGig(env: Env, id: number) {
  const db = getDb(env.DB)
  return db.select().from(gigOpportunities).where(eq(gigOpportunities.id, id)).get()
}

gigApplications.get('/:id/application', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const gig = await loadGig(c.env, id)
  if (!gig) return c.json({ error: 'not found' }, 404)

  const fields = await db
    .select()
    .from(applicationFields)
    .where(eq(applicationFields.gigId, id))
    .orderBy(asc(applicationFields.position), asc(applicationFields.id))

  const answered = fields.filter((f) => (f.answer ?? f.draftAnswer ?? '').trim().length > 0)

  return c.json({
    gigId: id,
    gigName: gig.name,
    formTitle: gig.formTitle,
    applicationUrl: gig.applicationUrl ?? gig.url,
    loginRequired: Boolean(gig.loginRequired),
    prepStatus: gig.prepStatus ?? 'none',
    prepError: gig.prepError,
    prepUpdatedAt: gig.prepUpdatedAt,
    windowState: windowState(gig, today()),
    submissionOpensAt: gig.submissionOpensAt,
    submissionClosesAt: gig.submissionClosesAt,
    stats: {
      total: fields.length,
      answered: answered.length,
      needsInput: fields.filter((f) => f.needsInput && !f.answer).length,
      approved: fields.filter((f) => f.approved).length,
    },
    fields,
  })
})

// Run prep on demand — used by the "Prepare now" button and for re-running
// after a form changes.
gigApplications.post('/:id/application/prepare', async (c) => {
  const id = Number(c.req.param('id'))
  const gig = await loadGig(c.env, id)
  if (!gig) return c.json({ error: 'not found' }, 404)

  try {
    const result = await prepareApplication(c.env, id)
    return c.json(result)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// Everything in one block, ready to paste into a portal that can't be read
// automatically (or filled in by hand on the day).
gigApplications.get('/:id/application/export', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const gig = await loadGig(c.env, id)
  if (!gig) return c.json({ error: 'not found' }, 404)

  const fields = await db
    .select()
    .from(applicationFields)
    .where(eq(applicationFields.gigId, id))
    .orderBy(asc(applicationFields.position), asc(applicationFields.id))

  const lines = [
    `${gig.name}${gig.organizer ? ` — ${gig.organizer}` : ''}`,
    gig.applicationUrl || gig.url || '',
    gig.deadline ? `Deadline: ${gig.deadline}` : '',
    '',
  ].filter(Boolean)

  for (const field of fields) {
    const answer = (field.answer ?? field.draftAnswer ?? '').trim()
    lines.push(`## ${field.label}${field.required ? ' *' : ''}`)
    lines.push(answer || '[ needs your input ]')
    lines.push('')
  }

  return c.json({ text: lines.join('\n') })
})

const ManualFieldSchema = z.object({
  label: z.string().min(1),
  fieldType: z.string().optional(),
  answer: z.string().optional(),
  required: z.boolean().optional(),
  helpText: z.string().optional(),
})

// A form often has one more question than the parser found (or is email-only).
gigApplications.post(
  '/:id/application/fields',
  zValidator('json', ManualFieldSchema),
  async (c) => {
    const db = getDb(c.env.DB)
    const id = Number(c.req.param('id'))
    const gig = await loadGig(c.env, id)
    if (!gig) return c.json({ error: 'not found' }, 404)

    const b = c.req.valid('json')
    const ts = new Date().toISOString()

    const [{ value: lastPosition }] = await db
      .select({ value: max(applicationFields.position) })
      .from(applicationFields)
      .where(eq(applicationFields.gigId, id))

    const slug =
      b.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'field'

    const row = await db
      .insert(applicationFields)
      .values({
        gigId: id,
        fieldKey: `manual_${slug}_${Date.now().toString(36)}`,
        label: b.label,
        fieldType: b.fieldType ?? 'textarea',
        required: b.required ? 1 : 0,
        helpText: b.helpText ?? null,
        position: (lastPosition ?? 0) + 1,
        answer: b.answer ?? null,
        answerSource: 'manual',
        needsInput: b.answer ? 0 : 1,
        approved: 0,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning()

    return c.json(row[0], 201)
  },
)

const FieldPatchSchema = z.object({
  answer: z.string().nullable().optional(),
  label: z.string().min(1).optional(),
  approved: z.boolean().optional(),
  needsInput: z.boolean().optional(),
  note: z.string().nullable().optional(),
})

applicationFieldRoutes.patch('/:id', zValidator('json', FieldPatchSchema), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const b = c.req.valid('json')

  const existing = await db
    .select()
    .from(applicationFields)
    .where(eq(applicationFields.id, id))
    .get()
  if (!existing) return c.json({ error: 'not found' }, 404)

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  if (b.label !== undefined) updates.label = b.label
  if (b.note !== undefined) updates.note = b.note
  if (b.approved !== undefined) updates.approved = b.approved ? 1 : 0
  if (b.needsInput !== undefined) updates.needsInput = b.needsInput ? 1 : 0
  if (b.answer !== undefined) {
    const answer = b.answer && b.answer.trim() ? b.answer : null
    updates.answer = answer
    updates.answerSource = answer ? 'manual' : existing.answerSource
    // An edited answer is by definition no longer waiting on input.
    if (answer && b.needsInput === undefined) updates.needsInput = 0
  }

  await db.update(applicationFields).set(updates).where(eq(applicationFields.id, id))

  const row = await db
    .select()
    .from(applicationFields)
    .where(eq(applicationFields.id, id))
    .get()
  return c.json(row)
})

applicationFieldRoutes.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  await db.delete(applicationFields).where(eq(applicationFields.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

// Bulk approve — "these all look right" in one click.
applicationFieldRoutes.post(
  '/approve-all',
  zValidator('json', z.object({ gigId: z.number().int() })),
  async (c) => {
    const db = getDb(c.env.DB)
    const { gigId } = c.req.valid('json')

    await db
      .update(applicationFields)
      .set({ approved: 1, updatedAt: new Date().toISOString() })
      .where(and(eq(applicationFields.gigId, gigId), eq(applicationFields.needsInput, 0)))

    return c.json({ ok: true })
  },
)
