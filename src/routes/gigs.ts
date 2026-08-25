import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, reminders } from '../db/schema'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  calendarConfigured,
} from '../lib/googleCalendar'
import { splitDeadline } from '../../shared/reviewParse'
import type { Env } from '../types'

const gigs = new Hono<{ Bindings: Env }>()

const GigInsertSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  organizer: z.string().optional(),
  submissionMethod: z.enum(['email', 'portal', 'form']).optional(),
  audienceSize: z.number().int().positive().optional(),
  genreFitScore: z.number().int().min(1).max(5).optional(),
  deadline: z.string().optional(),
  deadlineNote: z.string().nullable().optional(),
  opensAt: z.string().nullable().optional(),
  feeAmount: z.number().nonnegative().optional(),
  feeCurrency: z.string().optional(),
  paid: z.boolean().optional(),
  fitRationale: z.string().optional(),
  url: z.string().url().optional().or(z.literal('')),
  status: z.string().optional(),
})

const GigPatchSchema = GigInsertSchema.partial()

gigs.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const status = c.req.query('status')
  const paid = c.req.query('paid')
  const type = c.req.query('type')

  const conditions = []
  if (status) conditions.push(eq(gigOpportunities.status, status))
  if (paid !== undefined) conditions.push(eq(gigOpportunities.paid, paid === 'true' ? 1 : 0))
  if (type) conditions.push(eq(gigOpportunities.type, type))

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(gigOpportunities)
          .where(and(...conditions))
          .orderBy(desc(gigOpportunities.discoveredAt))
      : await db
          .select()
          .from(gigOpportunities)
          .orderBy(desc(gigOpportunities.discoveredAt))

  return c.json(rows)
})

gigs.post('/', zValidator('json', GigInsertSchema), async (c) => {
  const db = getDb(c.env.DB)
  const b = c.req.valid('json')
  const ts = new Date().toISOString()

  const result = await db
    .insert(gigOpportunities)
    .values({
      name: b.name,
      type: b.type,
      organizer: b.organizer ?? null,
      submissionMethod: b.submissionMethod ?? null,
      audienceSize: b.audienceSize ?? null,
      genreFitScore: b.genreFitScore ?? null,
      deadline: b.deadline ?? null,
      deadlineNote: b.deadlineNote ?? null,
      opensAt: b.opensAt ?? null,
      feeAmount: b.feeAmount ?? null,
      feeCurrency: b.feeCurrency ?? 'USD',
      paid: b.paid ? 1 : 0,
      fitRationale: b.fitRationale ?? null,
      url: b.url || null,
      status: b.status ?? 'pending_review',
      discoveredAt: ts,
      updatedAt: ts,
    })
    .returning({ id: gigOpportunities.id })

  return c.json({ id: result[0].id }, 201)
})

gigs.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const row = await db
    .select()
    .from(gigOpportunities)
    .where(eq(gigOpportunities.id, Number(c.req.param('id'))))
    .get()

  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

gigs.patch('/:id', zValidator('json', GigPatchSchema), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const b = c.req.valid('json')

  // Fetch the row before patching so we can detect status transitions
  const before = await db
    .select()
    .from(gigOpportunities)
    .where(eq(gigOpportunities.id, id))
    .get()

  if (!before) return c.json({ error: 'not found' }, 404)

  const updates: Record<string, unknown> = { ...b, updatedAt: new Date().toISOString() }
  if (b.paid !== undefined) updates.paid = b.paid ? 1 : 0

  const statusChanging = b.status !== undefined && b.status !== before.status
  const newStatus = b.status ?? before.status
  const deadline = b.deadline ?? before.deadline
  const name = b.name ?? before.name

  // Calendar events and reminders need a real date. 26 of 34 production rows
  // hold prose here ("None — rolling artist roster intake"), which used to be
  // handed to Google verbatim and to `new Date()` — the latter yielding
  // Invalid Date and a reminder scheduled for "NaN-NaN-NaN". Recover a date
  // when the prose contains one and skip both steps when it does not.
  const deadlineDate = deadline ? splitDeadline(deadline).date : null

  // --- Calendar sync ---
  if (calendarConfigured(c.env)) {
    try {
      if (statusChanging && newStatus === 'approved' && deadlineDate) {
        // Approving with a deadline → create Calendar event
        const event = await createCalendarEvent(c.env, {
          summary: `🎵 ${name}`,
          description: [
            before.organizer ? `Organiser: ${before.organizer}` : '',
            before.type ? `Type: ${before.type}` : '',
            before.fitRationale ?? before.fitNotes ?? '',
            before.url ? `Link: ${before.url}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          date: deadlineDate,
          reminderMinutes: 1440, // 24 h before
        })
        updates.googleEventId = event.id
      } else if (before.googleEventId) {
        if (statusChanging && newStatus === 'rejected') {
          // Rejecting → remove the Calendar event
          await deleteCalendarEvent(c.env, before.googleEventId)
          updates.googleEventId = null
        } else if (b.deadline || b.name) {
          // Deadline or name changed → update the existing event
          await updateCalendarEvent(c.env, before.googleEventId, {
            summary: name ? `🎵 ${name}` : undefined,
            date: deadlineDate ?? undefined,
          })
        }
      }
    } catch (err) {
      // Calendar errors are non-fatal — log and continue
      console.error('Calendar sync error:', err)
    }
  }

  await db.update(gigOpportunities).set(updates).where(eq(gigOpportunities.id, id))

  // --- Reminder creation on approval ---
  if (statusChanging && newStatus === 'approved' && deadlineDate) {
    const ts = new Date().toISOString()
    // Write a pre-deadline reminder: fire 7 days before if nothing submitted
    const reminderDate = new Date(deadlineDate)
    reminderDate.setDate(reminderDate.getDate() - 7)

    await db.insert(reminders).values({
      entityType: 'gig',
      entityId: id,
      reminderType: 'pre_deadline',
      scheduledFor: reminderDate.toISOString().slice(0, 10),
      status: 'pending',
      createdAt: ts,
    })
  }

  // Clear reminders if rejected
  if (statusChanging && newStatus === 'rejected') {
    await db
      .update(reminders)
      .set({ status: 'dismissed' })
      .where(
        and(
          eq(reminders.entityType, 'gig'),
          eq(reminders.entityId, id),
          eq(reminders.status, 'pending'),
        ),
      )
  }

  const row = await db
    .select()
    .from(gigOpportunities)
    .where(eq(gigOpportunities.id, id))
    .get()

  return c.json(row)
})

gigs.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))

  // Remove Calendar event if one exists
  const row = await db
    .select({ googleEventId: gigOpportunities.googleEventId })
    .from(gigOpportunities)
    .where(eq(gigOpportunities.id, id))
    .get()

  if (row?.googleEventId && calendarConfigured(c.env)) {
    try {
      await deleteCalendarEvent(c.env, row.googleEventId)
    } catch (err) {
      console.error('Calendar delete error:', err)
    }
  }

  // Reminders reference gigs by (entity_type, entity_id) with no foreign key,
  // so deleting the gig alone leaves them behind pointing at nothing. That is
  // how reminder 3 ended up aimed at gig 21, which has not existed for months:
  // the Overview's join then renders it as "gig #21", a follow-up on an
  // opportunity nobody can open. Delete both, in that order — an orphaned
  // reminder is worse than a missing one.
  await db
    .delete(reminders)
    .where(and(eq(reminders.entityType, 'gig'), eq(reminders.entityId, id)))
  await db.delete(gigOpportunities).where(eq(gigOpportunities.id, id))
  return c.json({ ok: true })
})

export default gigs
