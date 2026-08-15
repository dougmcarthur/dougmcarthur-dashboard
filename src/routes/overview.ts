import { Hono } from 'hono'
import { eq, and, gte, lte, desc, inArray, sql } from 'drizzle-orm'
import { getDb } from '../db'
import {
  gigOpportunities,
  syncTargets,
  promoDrafts,
  taskRuns,
  reminders,
  applicationFields,
} from '../db/schema'
import { today } from '../lib/submissionWindow'
import type { Env } from '../types'

const overview = new Hono<{ Bindings: Env }>()

overview.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const todayStr = today()
  const in3Days = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)
  const in14Days = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)

  const [
    [gigsCount],
    [syncCount],
    [promoCount],
    recentRuns,
    pendingGigs,
    pendingSync,
    pendingPromo,
    upcomingDeadlines,
    dueReminders,
    activeGigs,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(gigOpportunities),
    db.select({ count: sql<number>`count(*)` }).from(syncTargets),
    db.select({ count: sql<number>`count(*)` }).from(promoDrafts),
    db.select().from(taskRuns).orderBy(desc(taskRuns.runAt)).limit(15),
    db
      .select()
      .from(gigOpportunities)
      .where(eq(gigOpportunities.status, 'pending_review'))
      .orderBy(gigOpportunities.discoveredAt),
    db
      .select()
      .from(syncTargets)
      .where(eq(syncTargets.status, 'draft_ready'))
      .orderBy(syncTargets.discoveredAt),
    db
      .select()
      .from(promoDrafts)
      .where(eq(promoDrafts.status, 'draft'))
      .orderBy(promoDrafts.createdAt),
    db
      .select()
      .from(gigOpportunities)
      .where(
        and(
          eq(gigOpportunities.status, 'approved'),
          gte(gigOpportunities.deadline, todayStr),
          lte(gigOpportunities.deadline, in14Days),
        ),
      )
      .orderBy(gigOpportunities.deadline),
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
    // Everything approved or filed for later — the source for the window and
    // application-prep sections below.
    db
      .select()
      .from(gigOpportunities)
      .where(inArray(gigOpportunities.status, ['approved', 'awaiting_window']))
      .orderBy(gigOpportunities.submissionOpensAt),
  ])

  const activeIds = activeGigs.map((g) => g.id)
  const fieldRows = activeIds.length
    ? await db
        .select({
          gigId: applicationFields.gigId,
          total: sql<number>`count(*)`,
          needsInput: sql<number>`sum(case when needs_input = 1 and (answer is null or answer = '') then 1 else 0 end)`,
          approved: sql<number>`sum(case when approved = 1 then 1 else 0 end)`,
        })
        .from(applicationFields)
        .where(inArray(applicationFields.gigId, activeIds))
        .groupBy(applicationFields.gigId)
    : []

  const prepByGig = new Map(fieldRows.map((r) => [r.gigId, r]))

  const withPrep = (g: (typeof activeGigs)[number]) => {
    const prep = prepByGig.get(g.id)
    return {
      ...g,
      prep: {
        total: Number(prep?.total ?? 0),
        needsInput: Number(prep?.needsInput ?? 0),
        approved: Number(prep?.approved ?? 0),
      },
    }
  }

  const awaitingWindow = activeGigs
    .filter((g) => g.status === 'awaiting_window')
    .map(withPrep)

  // Prepared answers waiting on a read-through, and forms that couldn't be read.
  const applicationsReady = activeGigs
    .filter((g) => g.prepStatus === 'ready')
    .map(withPrep)
    .filter((g) => g.prep.total > 0 && g.prep.approved < g.prep.total)

  const applicationsBlocked = activeGigs
    .filter((g) => g.prepStatus === 'blocked' || g.prepStatus === 'failed')
    .map(withPrep)

  return c.json({
    stats: {
      totalGigs: gigsCount.count,
      totalSync: syncCount.count,
      totalPromo: promoCount.count,
      awaitingWindow: awaitingWindow.length,
      applicationsReady: applicationsReady.length,
    },
    recentRuns,
    pendingReview: { gigs: pendingGigs, sync: pendingSync, promo: pendingPromo },
    upcomingDeadlines,
    dueReminders,
    awaitingWindow,
    applicationsReady,
    applicationsBlocked,
  })
})

export default overview
