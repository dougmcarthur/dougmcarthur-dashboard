import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, reminders, applicationFields } from '../db/schema'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  calendarConfigured,
} from '../lib/googleCalendar'
import {
  resolveApprovalStatus,
  plannedReminders,
  shouldPrepareNow,
  windowState,
  today,
} from '../lib/submissionWindow'
import type { Env } from '../types'

const gigs = new Hono<{ Bindings: Env }>()

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

// `nullish` throughout: the edit panel clears a field by sending null, and
// sends booleans as 0/1, so both shapes are accepted and normalised below.
const BOOLISH = z.union([z.boolean(), z.number().int().min(0).max(1)])

const GigInsertSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  organizer: z.string().nullish(),
  submissionMethod: z.enum(['email', 'portal', 'form']).nullish().or(z.literal('')),
  audienceSize: z.number().int().positive().nullish(),
  genreFitScore: z.number().int().min(1).max(5).nullish(),
  deadline: DATE.nullish().or(z.literal('')),
  feeAmount: z.number().nonnegative().nullish(),
  feeCurrency: z.string().nullish(),
  paid: BOOLISH.nullish(),
  fitRationale: z.string().nullish(),
  url: z.string().url().nullish().or(z.literal('')),
  status: z.string().optional(),
  // Submission window
  submissionOpensAt: DATE.nullish().or(z.literal('')),
  submissionClosesAt: DATE.nullish().or(z.literal('')),
  windowNote: z.string().nullish(),
  applicationUrl: z.string().url().nullish().or(z.literal('')),
  loginRequired: BOOLISH.nullish(),
})

const GigPatchSchema = GigInsertSchema.partial()

/** Empty strings from the UI mean "clear this", not "keep it". */
const CLEARABLE = [
  'organizer',
  'deadline',
  'url',
  'fitRationale',
  'submissionMethod',
  'submissionOpensAt',
  'submissionClosesAt',
  'applicationUrl',
  'windowNote',
] as const

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
      organizer: b.organizer || null,
      submissionMethod: b.submissionMethod || null,
      audienceSize: b.audienceSize ?? null,
      genreFitScore: b.genreFitScore ?? null,
      deadline: b.deadline || null,
      feeAmount: b.feeAmount ?? null,
      feeCurrency: b.feeCurrency || 'USD',
      paid: b.paid ? 1 : 0,
      fitRationale: b.fitRationale || null,
      url: b.url || null,
      status: b.status ?? 'pending_review',
      submissionOpensAt: b.submissionOpensAt || null,
      submissionClosesAt: b.submissionClosesAt || null,
      windowNote: b.windowNote || null,
      applicationUrl: b.applicationUrl || null,
      loginRequired: b.loginRequired ? 1 : 0,
      prepStatus: 'none',
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
  if (b.paid != null) updates.paid = b.paid ? 1 : 0
  if (b.loginRequired != null) updates.loginRequired = b.loginRequired ? 1 : 0
  for (const key of CLEARABLE) {
    if (key in b) updates[key] = (b[key] as string | null | undefined) || null
  }

  const todayStr = today()
  const merged = {
    submissionOpensAt: (updates.submissionOpensAt as string | null) ?? before.submissionOpensAt,
    submissionClosesAt: (updates.submissionClosesAt as string | null) ?? before.submissionClosesAt,
    deadline: (b.deadline ?? before.deadline) || null,
  }

  const requestedStatus = b.status
  const statusChanging = requestedStatus !== undefined && requestedStatus !== before.status

  // Approving a gig whose window hasn't opened files it for submission later.
  if (statusChanging && requestedStatus === 'approved') {
    updates.status = resolveApprovalStatus(merged, todayStr)
  }

  const newStatus = (updates.status as string | undefined) ?? before.status
  const nowActive = newStatus === 'approved' || newStatus === 'awaiting_window'
  const wasActive = before.status === 'approved' || before.status === 'awaiting_window'
  const name = b.name ?? before.name
  const calendarDate = merged.deadline ?? merged.submissionOpensAt

  // --- Calendar sync ---
  if (calendarConfigured(c.env)) {
    try {
      if (statusChanging && nowActive && !wasActive && calendarDate) {
        const event = await createCalendarEvent(c.env, {
          summary: `🎵 ${name}`,
          description: [
            before.organizer ? `Organiser: ${before.organizer}` : '',
            before.type ? `Type: ${before.type}` : '',
            merged.submissionOpensAt ? `Submissions open: ${merged.submissionOpensAt}` : '',
            before.fitRationale ?? before.fitNotes ?? '',
            before.url ? `Link: ${before.url}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
          date: calendarDate,
          reminderMinutes: 1440, // 24 h before
        })
        updates.googleEventId = event.id
      } else if (before.googleEventId) {
        if (statusChanging && newStatus === 'rejected') {
          await deleteCalendarEvent(c.env, before.googleEventId)
          updates.googleEventId = null
        } else if (b.deadline || b.name || b.submissionOpensAt) {
          await updateCalendarEvent(c.env, before.googleEventId, {
            summary: name ? `🎵 ${name}` : undefined,
            date: calendarDate ?? undefined,
          })
        }
      }
    } catch (err) {
      // Calendar errors are non-fatal — log and continue
      console.error('Calendar sync error:', err)
    }
  }

  // Newly active gigs get their answers queued — but only if the window is
  // actually open. A festival that opens in March publishes its form in March;
  // reading the page today would just parse a "check back later" notice, so
  // prep waits and the cron picks it up the day the window opens.
  if (statusChanging && nowActive && !wasActive) {
    const canPrep = shouldPrepareNow(
      {
        ...merged,
        loginRequired: (updates.loginRequired as number | undefined) ?? before.loginRequired,
        prepStatus: before.prepStatus,
      },
      todayStr,
    )
    const hasUrl = (updates.applicationUrl as string | null) ?? before.applicationUrl ?? before.url
    if (canPrep && hasUrl) {
      updates.prepStatus = 'queued'
      updates.prepAttempts = 0
      updates.answersNotifiedAt = null
    }
  }

  await db.update(gigOpportunities).set(updates).where(eq(gigOpportunities.id, id))

  // --- Reminders ---
  if (statusChanging && nowActive && !wasActive) {
    const ts = new Date().toISOString()
    const planned = plannedReminders(merged, todayStr)
    for (const reminder of planned) {
      await db.insert(reminders).values({
        entityType: 'gig',
        entityId: id,
        reminderType: reminder.reminderType,
        scheduledFor: reminder.scheduledFor,
        status: 'pending',
        channel: 'email',
        createdAt: ts,
      })
    }
  }

  // Rejected, submitted, or archived — nothing left to chase.
  if (statusChanging && ['rejected', 'submitted', 'archived'].includes(newStatus ?? '')) {
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

  return c.json({ ...row, windowState: windowState(row!, todayStr) })
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

  await db.delete(applicationFields).where(eq(applicationFields.gigId, id))
  await db
    .delete(reminders)
    .where(and(eq(reminders.entityType, 'gig'), eq(reminders.entityId, id)))
  await db.delete(gigOpportunities).where(eq(gigOpportunities.id, id))
  return c.json({ ok: true })
})

export default gigs
