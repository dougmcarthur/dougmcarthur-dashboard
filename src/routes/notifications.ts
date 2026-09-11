import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import {
  gigOpportunities,
  syncTargets,
  promoDrafts,
  reminders,
  notificationMarks,
  taskRuns,
} from '../db/schema'
import { buildReviewQueue, summariseQueue } from '../../shared/reviewQueue'
import { buildNotifications, eventIdsFromKey, type Mark } from '../../shared/notifications'
import type { TaskHistory } from '../../shared/taskCadence'
import {
  readEvents,
  markEventsRead,
  markAllEventsRead,
  dismissEvents,
} from '../lib/notificationEvents'
import { calendarConfigured } from '../lib/googleCalendar'
import { gmailConfigured } from '../lib/gmail'
import { mailerConfigured } from '../lib/mailer'
import type { GigOpportunity, SyncTarget, PromoDraft } from '../../shared/types'
import type { Env } from '../types'

/**
 * The bell.
 *
 * Two halves, merged here and indistinguishable to the client: conditions
 * derived on read (see shared/notifications.ts and migration 0006), and events
 * read from a table (migration 0007). The only writes on the read path are
 * first-seen marks for conditions nobody has observed before.
 */
const notifications = new Hono<AppEnv>()

async function readMarks(env: Env, tenant: TenantId): Promise<Mark[]> {
  const db = getDb(env.DB)
  const rows = await db.select().from(notificationMarks).where(scoped(notificationMarks, tenant))
  return rows.map((r) => ({
    dedupeKey: r.dedupeKey,
    firstSeen: r.firstSeen,
    readAt: r.readAt,
    dismissedAt: r.dismissedAt,
  }))
}

/** Flat rows into one history per task, which is what the cadence check takes. */
function groupRuns(rows: Array<{ taskId: string; runAt: string }>): TaskHistory[] {
  const byTask = new Map<string, string[]>()
  for (const row of rows) {
    const list = byTask.get(row.taskId)
    if (list) list.push(row.runAt)
    else byTask.set(row.taskId, [row.runAt])
  }
  return [...byTask].map(([taskId, runAt]) => ({ taskId, runAt }))
}

/**
 * The whole feed, exported because the pruning job needs the same answer.
 *
 * A live key set derived any other way would drift from what the bell shows,
 * and pruning against a drifted set deletes marks that are still in use.
 */
export async function composeFeed(env: Env, tenant: TenantId, now = new Date()) {
  const db = getDb(env.DB)

  const [gigs, sync, promo, [orphans], marks, events, runs] = await Promise.all([
    db.select().from(gigOpportunities).where(scoped(gigOpportunities, tenant)).orderBy(desc(gigOpportunities.discoveredAt)),
    db.select().from(syncTargets).where(scoped(syncTargets, tenant)).orderBy(desc(syncTargets.discoveredAt)),
    db.select().from(promoDrafts).where(scoped(promoDrafts, tenant)).orderBy(desc(promoDrafts.createdAt)),
    // Same predicate the Review screen's health row uses. Deliberately not
    // filtered to pending — a dismissed reminder pointing at a deleted row is
    // rot nothing else will ever surface.
    db
      .select({ count: sql<number>`count(*)` })
      .from(reminders)
      .where(
        scoped(
          reminders,
          tenant,
          sql`(
            (${reminders.entityType} = 'gig'
              AND ${reminders.entityId} NOT IN (
                SELECT id FROM gig_opportunities WHERE tenant_id = ${tenant}))
            OR (${reminders.entityType} = 'sync'
              AND ${reminders.entityId} NOT IN (
                SELECT id FROM sync_targets WHERE tenant_id = ${tenant})))`,
        ),
      ),
    readMarks(env, tenant),
    readEvents(env, tenant, now),
    // Two columns, every row. The staleness check needs the whole history to
    // measure a cadence from, and this table is tens of rows — the ordering is
    // indexed as of migration 0018.
    db.select({ taskId: taskRuns.taskId, runAt: taskRuns.runAt }).from(taskRuns).where(scoped(taskRuns, tenant)),
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
      calendarConfigured: calendarConfigured(env),
      gmailConfigured: gmailConfigured(env),
      emailConfigured: mailerConfigured(env),
    },
    marks,
    events,
    taskRuns: groupRuns(runs),
    now: now.toISOString(),
  })

  return { built, marks }
}

notifications.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const tenant = tenantOf(c)
  const { built, marks } = await composeFeed(c.env, tenant)

  // First sighting of a condition is recorded here rather than by a separate
  // job: nothing else runs often enough, and a notification with no first_seen
  // cannot say how long it has been true. Events need none of this — they
  // carry the moment they happened.
  const known = new Set(marks.map((m) => m.dedupeKey))
  const fresh = built.items.filter((n) => n.source === 'condition' && !known.has(n.key))
  if (fresh.length > 0) {
    const firstSeen = new Date().toISOString()
    for (const n of fresh) {
      await db
        .insert(notificationMarks)
        .values(withTenant(tenant, { dedupeKey: n.key, firstSeen, readAt: null, dismissedAt: null }))
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
  const tenant = tenantOf(c)
  const readAt = new Date().toISOString()

  if (all) {
    await Promise.all([
      db.update(notificationMarks).set({ readAt }).where(scoped(notificationMarks, tenant)),
      markAllEventsRead(c.env, tenant, readAt),
    ])
    return c.json({ read: 'all', readAt })
  }

  // An event key names the rows it stands for, so a grouped row marks exactly
  // what was on screen when it was clicked.
  const eventIds = keys!.flatMap(eventIdsFromKey)
  await markEventsRead(c.env, tenant, eventIds, readAt)

  // Update then insert-if-absent, rather than an upsert naming `dedupe_key`.
  // The mark still has to be written on the request that first surfaced the
  // condition, so a bare update is not enough — but the constraint this used to
  // name as its `ON CONFLICT` target moves in this same deploy, from
  // `dedupe_key` to `(tenant_id, dedupe_key)`, because two artists can raise the
  // identical condition. Two statements that name no constraint work against
  // the schema on either side of the migration; see src/lib/googleGrant.ts,
  // which had the same problem.
  for (const key of keys!) {
    if (eventIdsFromKey(key).length > 0) continue
    await db
      .update(notificationMarks)
      .set({ readAt })
      .where(scoped(notificationMarks, tenant, eq(notificationMarks.dedupeKey, key)))
    await db
      .insert(notificationMarks)
      .values(withTenant(tenant, { dedupeKey: key, firstSeen: readAt, readAt, dismissedAt: null }))
      .onConflictDoNothing()
  }
  return c.json({ read: keys!.length, readAt })
})

const DismissSchema = z.object({ key: z.string().min(1) })

notifications.post('/dismiss', zValidator('json', DismissSchema), async (c) => {
  const { key } = c.req.valid('json')
  const db = getDb(c.env.DB)
  const tenant = tenantOf(c)
  const now = new Date().toISOString()

  // Dismissing an event is permanent — it already happened, so there is
  // nothing for it to come back and tell you. Dismissing a condition lasts for
  // the day, because the connection may still be broken tomorrow.
  const eventIds = eventIdsFromKey(key)
  if (eventIds.length > 0) {
    await dismissEvents(c.env, tenant, eventIds, now)
    return c.json({ dismissed: key, until: 'never' })
  }

  // Dismissing also marks read. Putting something away without having read it
  // is still a decision about it, and leaving the badge up afterwards would be
  // the badge lying.
  // Same two-statement shape as `/read`, for the same reason.
  await db
    .update(notificationMarks)
    .set({ dismissedAt: now, readAt: now })
    .where(scoped(notificationMarks, tenant, eq(notificationMarks.dedupeKey, key)))
  await db
    .insert(notificationMarks)
    .values(withTenant(tenant, { dedupeKey: key, firstSeen: now, readAt: now, dismissedAt: now }))
    .onConflictDoNothing()

  return c.json({ dismissed: key, until: 'tomorrow' })
})

/** Marks older than this with no live condition are dead weight. */
const MARK_RETENTION_DAYS = 30

/**
 * Housekeeping, run from the hourly cron.
 *
 * Two age guards, for the same reason. A mark is what remembers how long a
 * condition has been true and whether you have already read it, so deleting
 * one whose condition merely *flickered* — Calendar reconnecting for an hour —
 * silently resets its age and makes it unread again. Only marks that have been
 * absent from the feed for a month go, and by then a returning condition
 * genuinely is news.
 */
export async function pruneNotifications(
  env: Env,
  tenant: TenantId,
  now = new Date(),
): Promise<{ marks: number }> {
  const { built } = await composeFeed(env, tenant, now)
  const live = new Set(built.items.map((n) => n.key))

  const db = getDb(env.DB)
  const cutoff = new Date(now.getTime() - MARK_RETENTION_DAYS * 86_400_000).toISOString()

  const stale = await db
    .select()
    .from(notificationMarks)
    .where(scoped(notificationMarks, tenant, lt(notificationMarks.firstSeen, cutoff)))

  const dead = stale.filter((r) => !live.has(r.dedupeKey)).map((r) => r.dedupeKey)
  if (dead.length > 0) {
    await db
      .delete(notificationMarks)
      .where(scoped(notificationMarks, tenant, inArray(notificationMarks.dedupeKey, dead)))
  }

  // Events are *not* pruned here any more. Deciding which marks are dead needs
  // this tenant's live feed, so it is per-tenant work; deleting rows older than
  // thirty days is one platform rule, and running it once per tenant would be N
  // deletes expressing one policy. `pruneEvents` is called once, beside this.
  return { marks: dead.length }
}

export default notifications
