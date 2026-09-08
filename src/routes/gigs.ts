import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, reminders } from '../db/schema'
import { syncGigCalendar, removeGigCalendar, type GigRow } from '../lib/gigCalendar'
import {
  normaliseGigStatus,
  isGigSettled,
  isGigTransitionAllowed,
  gigStatusMeta,
  hasBeenSubmitted,
} from '../../shared/gigStatus'
import { performanceDateProblem } from '../../shared/performance'
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
  // Where the form itself is, which is often not where the listing is. The
  // research agents know this when they find the opportunity, so it is on the
  // insert schema rather than only settable by the form reader.
  applicationUrl: z.string().url().nullable().optional(),
  status: z.string().optional(),
  // When you are actually on stage. Plain dates, never prose: unlike `deadline`
  // these are typed in from an agreement, so a value that is not a date is a
  // mistake rather than something to recover a date from.
  performanceStart: z.string().nullable().optional(),
  performanceEnd: z.string().nullable().optional(),
  // Cost inputs — migration 0013. The enums are narrow because these are the
  // values `shared/gigCost.ts` bands against; `location` and `country` are
  // free text because the research agents write prose and a code they would
  // have to be taught is a code they will get wrong. `country` is normalised
  // on read rather than here, so a row POSTed as "Canada" still costs.
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  travelBand: z.enum(['drive', 'regional', 'transcontinental', 'international']).nullable().optional(),
  lodgingTier: z.enum(['none', 'standard', 'major']).nullable().optional(),
  nights: z.number().int().min(0).nullable().optional(),
  performanceKind: z.enum(['showcase', 'paid']).nullable().optional(),
  stipendAmount: z.number().nonnegative().nullable().optional(),
  guaranteeAmount: z.number().nonnegative().nullable().optional(),
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

  const dateProblem = performanceDateProblem(b.performanceStart, b.performanceEnd)
  if (dateProblem) return c.json({ error: dateProblem }, 400)

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
      applicationUrl: b.applicationUrl ?? null,
      performanceStart: b.performanceStart ?? null,
      performanceEnd: b.performanceEnd ?? null,
      location: b.location ?? null,
      country: b.country ?? null,
      travelBand: b.travelBand ?? null,
      lodgingTier: b.lodgingTier ?? null,
      nights: b.nights ?? null,
      performanceKind: b.performanceKind ?? null,
      stipendAmount: b.stipendAmount ?? null,
      guaranteeAmount: b.guaranteeAmount ?? null,
      // Normalised on the way in: the research agents that POST here still
      // send `approved`, and a row should land in the right column rather
      // than carrying a word the pipeline no longer uses.
      status: normaliseGigStatus(b.status),
      // The research agents POST rows at whatever status they found them in.
      // One arriving already submitted has been sent, and `ts` is the closest
      // thing to a send date that will ever exist for it — better than the
      // null that would otherwise make it invisible to the no-reply nudge.
      submittedAt: hasBeenSubmitted(normaliseGigStatus(b.status)) ? ts : null,
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

  // Statuses arriving from the research agents are still the pre-rename ones
  // (`approved`, `pending_review`), so normalise on the way in rather than
  // storing a value nothing else recognises. See shared/gigStatus.ts.
  const newStatus = normaliseGigStatus(b.status ?? before.status)
  if (b.status !== undefined) updates.status = newStatus

  // The pipeline is a shape, not a free-for-all. Refused here rather than only
  // in the picker, because the research agents PATCH this route too and a row
  // arriving on `booked` without ever having been `invited` is a claim the
  // follow-up phase never made. `isGigTransitionAllowed` treats a status equal
  // to the one already stored as a no-op, so an ordinary field edit that echoes
  // the current status still goes through.
  if (!isGigTransitionAllowed(before.status, newStatus)) {
    return c.json(
      {
        error:
          `A gig that is ${gigStatusMeta(before.status).label.toLowerCase()} ` +
          `cannot move straight to ${gigStatusMeta(newStatus).label.toLowerCase()}.`,
      },
      400,
    )
  }

  // Checked against the merged row: a PATCH that sets only the end date has to
  // be read against the start already stored, or every partial edit would look
  // like an end without a start.
  const dateProblem = performanceDateProblem(
    b.performanceStart !== undefined ? b.performanceStart : before.performanceStart,
    b.performanceEnd !== undefined ? b.performanceEnd : before.performanceEnd,
  )
  if (dateProblem) return c.json({ error: dateProblem }, 400)

  // Both sides normalised, or a legacy row would look like it was changing
  // every time it was touched: `approved` -> `shortlisted` is a rename, not a
  // transition, and must not fire the reminders that a real one does.
  const statusChanging = newStatus !== normaliseGigStatus(before.status)

  // Stamped on the way into the submitted phase, and only if nothing is there
  // already: a row that goes `submitted → acknowledged → invited` was sent
  // once, and re-stamping at each step would reset the silence counter every
  // time the organiser replied — which is precisely backwards. Never cleared
  // on the way out either. It is a fact about the past, not a state.
  if (statusChanging && hasBeenSubmitted(newStatus) && !before.submittedAt) {
    updates.submittedAt = updates.updatedAt
  }

  // The calendar is reconciled against the row's resulting state rather than
  // driven by the transition. Transition handlers missed a row that arrived
  // already shortlisted, and happily updated an event on a row you had passed
  // on. See src/lib/gigCalendar.ts for what the three entries are allowed to
  // say — in particular, that deciding to apply is not a date in your diary.
  const after: GigRow = {
    ...(before as unknown as GigRow),
    ...(b as Partial<GigRow>),
    status: newStatus,
  }
  Object.assign(updates, await syncGigCalendar(c.env, after))

  await db.update(gigOpportunities).set(updates).where(eq(gigOpportunities.id, id))

  const deadlineDate = after.deadline ? splitDeadline(after.deadline).date : null

  // A nudge to actually do the thing, once you have said you will. Written on
  // entry to `shortlisted` only — `preparing` and `submitted` mean it is
  // already in hand, and a second reminder then is noise.
  if (statusChanging && newStatus === 'shortlisted' && deadlineDate) {
    const reminderDate = new Date(deadlineDate)
    reminderDate.setDate(reminderDate.getDate() - 7)

    await db.insert(reminders).values({
      entityType: 'gig',
      entityId: id,
      reminderType: 'pre_deadline',
      scheduledFor: reminderDate.toISOString().slice(0, 10),
      status: 'pending',
      createdAt: new Date().toISOString(),
    })
  }

  // Anything settled — you passed, they declined, it expired — has no pending
  // chores left. Previously only `rejected` cleared them, so a gig that closed
  // any other way kept nagging.
  if (statusChanging && isGigSettled(newStatus)) {
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

  // A gig can own three calendar entries now, not one. Deleting only the
  // deadline reminder would leave an orphaned show on the calendar for a gig
  // that no longer exists.
  const row = await db
    .select({
      googleEventId: gigOpportunities.googleEventId,
      opensEventId: gigOpportunities.opensEventId,
      showEventId: gigOpportunities.showEventId,
    })
    .from(gigOpportunities)
    .where(eq(gigOpportunities.id, id))
    .get()

  if (row) await removeGigCalendar(c.env, row)

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
