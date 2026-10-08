import { desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'
import { getDb } from '../db'
import { notificationEvents, taskRuns } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { buildHistory, type HistoryEntry } from '../../shared/history'
import { RUN_KEY_PREFIX, runEventKey } from '../../shared/runEvents'
import type { NotificationKind } from '../../shared/notifications'
import { EVENT_RETENTION_DAYS, toStoredEvent } from './notificationEvents'
import type { Env } from '../types'

/**
 * Reading the two tables the History page is made of.
 *
 * See `shared/history.ts` for why there are two and how a run finds its echo.
 * This file is only the queries, and every one of them is scoped: the run log
 * and the event table are both one artist's.
 */

/**
 * Events that are not a run's echo. The echo is read separately, by exact key,
 * because the runs far outnumber everything else and would fill a page of
 * "newest events" on their own.
 */
const NOT_AN_ECHO = sql`(${notificationEvents.dedupeKey} IS NULL
  OR ${notificationEvents.dedupeKey} NOT LIKE ${`${RUN_KEY_PREFIX}%`})`

const cutoff = (now: Date) =>
  new Date(now.getTime() - EVENT_RETENTION_DAYS * 86_400_000).toISOString()

/**
 * One page of the timeline, newest first.
 *
 * Both sources are read for `limit + 1` rows below the cursor, which is what
 * lets `buildHistory` merge them: the newest `limit` of the combined list are
 * always among the newest `limit` of one source or the other, and the extra
 * row is how it learns there is a next page.
 *
 * A dismissed event is listed. Dismissing puts something away from the bell;
 * it does not unhappen, and History is where what happened lives.
 */
export async function readHistoryPage(
  env: Env,
  tenant: TenantId,
  opts: { kind: NotificationKind | null; before: string | null; limit: number; now: Date },
): Promise<{ entries: HistoryEntry[]; next: string | null }> {
  const db = getDb(env.DB)
  const { kind, before, limit } = opts
  const wantRuns = kind === null || kind === 'automation'

  const runFilter: Array<SQL | undefined> = [before ? lt(taskRuns.runAt, before) : undefined]
  const eventFilter: Array<SQL | undefined> = [
    gte(notificationEvents.createdAt, cutoff(opts.now)),
    NOT_AN_ECHO,
    kind ? eq(notificationEvents.kind, kind) : undefined,
    before ? lt(notificationEvents.createdAt, before) : undefined,
  ]

  const [runRows, eventRows] = await Promise.all([
    wantRuns
      ? db
          .select()
          .from(taskRuns)
          .where(scoped(taskRuns, tenant, ...runFilter))
          .orderBy(desc(taskRuns.runAt))
          .limit(limit + 1)
      : Promise.resolve([]),
    db
      .select()
      .from(notificationEvents)
      .where(scoped(notificationEvents, tenant, ...eventFilter))
      .orderBy(desc(notificationEvents.createdAt))
      .limit(limit + 1),
  ])

  // Whether each run is still unread on the bell. By exact key, a few dozen at
  // most, which stays well inside D1's limit on bound parameters.
  const echoKeys = runRows.map((r) => runEventKey(r.taskId, r.runAt))
  const echoRows =
    echoKeys.length > 0
      ? await db
          .select()
          .from(notificationEvents)
          .where(scoped(notificationEvents, tenant, inArray(notificationEvents.dedupeKey, echoKeys)))
      : []

  return buildHistory({
    runs: runRows,
    events: [...eventRows, ...echoRows].map(toStoredEvent),
    limit,
  })
}

/**
 * How much there is to see per type, for the filter chips.
 *
 * Counted over what the timeline can actually reach: events inside the
 * retention window and every run. A chip whose number the list cannot honour
 * is worse than no chip.
 */
export async function countHistory(
  env: Env,
  tenant: TenantId,
  now: Date,
): Promise<Partial<Record<NotificationKind, number>>> {
  const db = getDb(env.DB)

  const [byKind, [runs]] = await Promise.all([
    db
      .select({ kind: notificationEvents.kind, n: sql<number>`count(*)` })
      .from(notificationEvents)
      .where(scoped(notificationEvents, tenant, gte(notificationEvents.createdAt, cutoff(now)), NOT_AN_ECHO))
      .groupBy(notificationEvents.kind),
    db.select({ n: sql<number>`count(*)` }).from(taskRuns).where(scoped(taskRuns, tenant)),
  ])

  const counts: Partial<Record<NotificationKind, number>> = {}
  for (const row of byKind) counts[row.kind as NotificationKind] = row.n
  if (runs.n > 0) counts.automation = (counts.automation ?? 0) + runs.n
  return counts
}
