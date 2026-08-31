import { and, desc, gte, inArray, lt, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { notificationEvents } from '../db/schema'
import type { StoredEvent, Tier } from '../../shared/notifications'
import type { Env } from '../types'

/**
 * Writing down the things that will not be there tomorrow.
 *
 * Conditions need none of this — they are recomputed from the database on
 * every read. Events are the opposite: nothing about the database next week
 * tells you a research run added three rows this morning, so if it is not
 * written when it happens it is gone.
 *
 * Every writer here is on a path that must not fail because of a notification.
 * A digest that sends and then throws while recording that it sent is worse
 * than a digest nobody was told about, so `recordEvent` swallows its own
 * errors and logs them.
 */

export type EventKind = 'automation' | 'digest' | 'reconcile'

/** Events older than this are pruned. Anything further back is History's job. */
export const EVENT_RETENTION_DAYS = 30

export interface EventInput {
  kind: EventKind
  tier: Tier
  title: string
  body?: string | null
  href?: string | null
  action?: string | null
  /**
   * Set where the writer might fire twice for the same happening — a retried
   * cron, a double-clicked send. Unique when present, so the second insert is
   * a no-op rather than a duplicate row.
   */
  dedupeKey?: string | null
  /** Overridable so a backfill can record when a thing actually happened. */
  createdAt?: string
}

export async function recordEvent(env: Env, input: EventInput): Promise<void> {
  try {
    const db = getDb(env.DB)
    await db
      .insert(notificationEvents)
      .values({
        kind: input.kind,
        tier: input.tier,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        actionLabel: input.action ?? null,
        dedupeKey: input.dedupeKey ?? null,
        createdAt: input.createdAt ?? new Date().toISOString(),
        readAt: null,
        dismissedAt: null,
      })
      .onConflictDoNothing()
  } catch (err) {
    console.error('notification event not recorded:', err)
  }
}

/** Undismissed events inside the retention window, newest first. */
export async function readEvents(env: Env, now = new Date()): Promise<StoredEvent[]> {
  const db = getDb(env.DB)
  const since = new Date(now.getTime() - EVENT_RETENTION_DAYS * 86_400_000).toISOString()

  const rows = await db
    .select()
    .from(notificationEvents)
    .where(and(gte(notificationEvents.createdAt, since), sql`${notificationEvents.dismissedAt} IS NULL`))
    .orderBy(desc(notificationEvents.createdAt))
    .limit(200)

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    tier: r.tier,
    title: r.title,
    body: r.body,
    href: r.href,
    actionLabel: r.actionLabel,
    createdAt: r.createdAt,
    readAt: r.readAt,
    dismissedAt: r.dismissedAt,
  }))
}

export async function markEventsRead(env: Env, ids: number[], readAt: string): Promise<void> {
  if (ids.length === 0) return
  const db = getDb(env.DB)
  await db.update(notificationEvents).set({ readAt }).where(inArray(notificationEvents.id, ids))
}

export async function markAllEventsRead(env: Env, readAt: string): Promise<void> {
  const db = getDb(env.DB)
  await db
    .update(notificationEvents)
    .set({ readAt })
    .where(sql`${notificationEvents.readAt} IS NULL`)
}

/**
 * Dismissing an event is permanent, unlike dismissing a condition.
 *
 * The condition can come back because it might still be true tomorrow. An
 * event cannot: it already happened, and there is nothing for it to return and
 * tell you. Dismissing also marks read — putting something away without
 * reading it is still a decision about it, and leaving the badge up afterwards
 * would be the badge lying.
 */
export async function dismissEvents(env: Env, ids: number[], at: string): Promise<void> {
  if (ids.length === 0) return
  const db = getDb(env.DB)
  await db
    .update(notificationEvents)
    .set({ dismissedAt: at, readAt: at })
    .where(inArray(notificationEvents.id, ids))
}

/** Housekeeping. Returns how many rows went. */
export async function pruneEvents(env: Env, now = new Date()): Promise<number> {
  const db = getDb(env.DB)
  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * 86_400_000).toISOString()
  const gone = await db
    .delete(notificationEvents)
    .where(lt(notificationEvents.createdAt, cutoff))
    .returning({ id: notificationEvents.id })
  return gone.length
}
