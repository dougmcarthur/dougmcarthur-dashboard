import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc, inArray, sql } from 'drizzle-orm'
import { getDb } from '../db'
import {
  gigOpportunities,
  syncTargets,
  promoDrafts,
  reminders,
  notificationMarks,
} from '../db/schema'
import { buildReviewQueue, summariseQueue } from '../../shared/reviewQueue'
import { buildNotifications, type Mark } from '../../shared/notifications'
import { calendarConfigured } from '../lib/googleCalendar'
import { gmailConfigured } from '../lib/gmail'
import { mailerConfigured } from '../lib/mailer'
import type { GigOpportunity, SyncTarget, PromoDraft } from '../../shared/types'
import type { Env } from '../types'

/**
 * The bell.
 *
 * Everything here is derived on read — see shared/notifications.ts and
 * migration 0006. The only writes are your read and dismiss marks, which is
 * what lets a condition disappear the moment it stops holding without anything
 * having to tidy up after it.
 */
const notifications = new Hono<{ Bindings: Env }>()

async function readMarks(env: Env): Promise<Mark[]> {
  const db = getDb(env.DB)
  const rows = await db.select().from(notificationMarks)
  return rows.map((r) => ({
    dedupeKey: r.dedupeKey,
    firstSeen: r.firstSeen,
    readAt: r.readAt,
    dismissedAt: r.dismissedAt,
  }))
}

notifications.get('/', async (c) => {
  const db = getDb(c.env.DB)

  const [gigs, sync, promo, [orphans], marks] = await Promise.all([
    db.select().from(gigOpportunities).orderBy(desc(gigOpportunities.discoveredAt)),
    db.select().from(syncTargets).orderBy(desc(syncTargets.discoveredAt)),
    db.select().from(promoDrafts).orderBy(desc(promoDrafts.createdAt)),
    // Same predicate the Review screen's health row uses. Deliberately not
    // filtered to pending — a dismissed reminder pointing at a deleted row is
    // rot nothing else will ever surface.
    db
      .select({ count: sql<number>`count(*)` })
      .from(reminders)
      .where(sql`
        (${reminders.entityType} = 'gig'
          AND ${reminders.entityId} NOT IN (SELECT id FROM gig_opportunities))
        OR (${reminders.entityType} = 'sync'
          AND ${reminders.entityId} NOT IN (SELECT id FROM sync_targets))`),
    readMarks(c.env),
  ])

  const items = buildReviewQueue({
    gigs: gigs as GigOpportunity[],
    sync: sync as SyncTarget[],
    promo: promo as PromoDraft[],
  })

  const built = buildNotifications({
    items,
    summary: summariseQueue(items, { orphanedReminders: orphans.count }),
    health: {
      calendarConfigured: calendarConfigured(c.env),
      gmailConfigured: gmailConfigured(c.env),
      emailConfigured: mailerConfigured(c.env),
    },
    marks,
    now: new Date().toISOString(),
  })

  // First sighting of a condition is recorded here rather than by a separate
  // job: nothing else runs often enough, and a notification with no first_seen
  // cannot say how long it has been true.
  const known = new Set(marks.map((m) => m.dedupeKey))
  const fresh = built.items.filter((n) => !known.has(n.key))
  if (fresh.length > 0) {
    const firstSeen = new Date().toISOString()
    for (const n of fresh) {
      await db
        .insert(notificationMarks)
        .values({ dedupeKey: n.key, firstSeen, readAt: null, dismissedAt: null })
        .onConflictDoNothing()
    }
  }

  return c.json(built)
})

const ReadSchema = z.object({
  keys: z.array(z.string().min(1)).optional(),
  all: z.boolean().optional(),
})

notifications.post('/read', zValidator('json', ReadSchema), async (c) => {
  const { keys, all } = c.req.valid('json')
  if (!all && (!keys || keys.length === 0)) {
    return c.json({ error: 'pass keys[] or all:true' }, 400)
  }

  const db = getDb(c.env.DB)
  const readAt = new Date().toISOString()

  if (all) {
    await db.update(notificationMarks).set({ readAt })
    return c.json({ read: 'all', readAt })
  }

  // Upsert rather than update: a condition can be marked read on the same
  // request that first surfaced it, before any row exists for it.
  for (const key of keys!) {
    await db
      .insert(notificationMarks)
      .values({ dedupeKey: key, firstSeen: readAt, readAt, dismissedAt: null })
      .onConflictDoUpdate({ target: notificationMarks.dedupeKey, set: { readAt } })
  }
  return c.json({ read: keys!.length, readAt })
})

const DismissSchema = z.object({ key: z.string().min(1) })

notifications.post('/dismiss', zValidator('json', DismissSchema), async (c) => {
  const { key } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const now = new Date().toISOString()

  // Dismissing also marks read. Putting something away without having read it
  // is still a decision about it, and leaving the badge up afterwards would be
  // the badge lying.
  await db
    .insert(notificationMarks)
    .values({ dedupeKey: key, firstSeen: now, readAt: now, dismissedAt: now })
    .onConflictDoUpdate({
      target: notificationMarks.dedupeKey,
      set: { dismissedAt: now, readAt: now },
    })

  return c.json({ dismissed: key, until: 'tomorrow' })
})

/**
 * Housekeeping: marks whose condition can never recur are dead weight.
 *
 * Not called on a schedule yet — the table is tiny and this is here so the
 * cleanup has an obvious home when phase 3 adds real events.
 */
export async function pruneMarks(env: Env, liveKeys: string[]): Promise<number> {
  if (liveKeys.length === 0) return 0
  const db = getDb(env.DB)
  const rows = await db.select().from(notificationMarks)
  const dead = rows.filter((r) => !liveKeys.includes(r.dedupeKey)).map((r) => r.dedupeKey)
  if (dead.length === 0) return 0
  await db.delete(notificationMarks).where(inArray(notificationMarks.dedupeKey, dead))
  return dead.length
}

export default notifications
