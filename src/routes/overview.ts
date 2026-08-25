import { Hono } from 'hono'
import { eq, and, lte, desc, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, syncTargets, promoDrafts, taskRuns, reminders } from '../db/schema'
import type { Env } from '../types'

/**
 * GET /api/overview — totals, the automation log, and dated reminders.
 *
 * This used to also return `pendingReview` (gigs at `pending_review`, sync at
 * `draft_ready`, promo at `draft`) and `upcomingDeadlines` (approved gigs with
 * `deadline BETWEEN today AND +14d`). Both are gone. No production row carries
 * any of those statuses, and `deadline` is TEXT holding prose on 26 of 34
 * rows, so a string BETWEEN could never match one — four queries returning
 * empty arrays that two Overview sections faithfully rendered as nothing.
 *
 * What needs a decision now comes from `GET /api/review`, which derives it
 * from the notes rather than from statuses nothing sets. See
 * docs/notes-field-audit.md.
 */
const overview = new Hono<{ Bindings: Env }>()

overview.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const in3Days = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)

  const [
    [gigsCount],
    [syncCount],
    [promoCount],
    recentRuns,
    dueReminders,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(gigOpportunities),
    db.select({ count: sql<number>`count(*)` }).from(syncTargets),
    db.select({ count: sql<number>`count(*)` }).from(promoDrafts),
    db.select().from(taskRuns).orderBy(desc(taskRuns.runAt)).limit(15),
    // Pending reminders due within 3 days, joined with gig name/deadline
    db
      .select({
        id: reminders.id,
        reminderType: reminders.reminderType,
        scheduledFor: reminders.scheduledFor,
        entityId: reminders.entityId,
        entityType: reminders.entityType,
        gigName: gigOpportunities.name,
        gigDeadline: gigOpportunities.deadline,
        gigStatus: gigOpportunities.status,
      })
      .from(reminders)
      .leftJoin(
        gigOpportunities,
        and(
          eq(reminders.entityType, 'gig'),
          eq(reminders.entityId, gigOpportunities.id),
        ),
      )
      .where(
        and(
          eq(reminders.status, 'pending'),
          lte(reminders.scheduledFor, in3Days),
        ),
      )
      .orderBy(reminders.scheduledFor)
      .limit(10),
  ])

  return c.json({
    stats: {
      totalGigs: gigsCount.count,
      totalSync: syncCount.count,
      totalPromo: promoCount.count,
    },
    recentRuns,
    dueReminders,
  })
})

export default overview
