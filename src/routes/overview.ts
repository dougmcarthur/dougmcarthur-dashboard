import { Hono } from 'hono'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, syncTargets, promoDrafts, taskRuns, reminders } from '../db/schema'
import type { Env } from '../types'

const overview = new Hono<{ Bindings: Env }>()

overview.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const today = new Date().toISOString().slice(0, 10)
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
          gte(gigOpportunities.deadline, today),
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
  ])

  return c.json({
    stats: {
      totalGigs: gigsCount.count,
      totalSync: syncCount.count,
      totalPromo: promoCount.count,
    },
    recentRuns,
    pendingReview: { gigs: pendingGigs, sync: pendingSync, promo: pendingPromo },
    upcomingDeadlines,
    dueReminders,
  })
})

export default overview
