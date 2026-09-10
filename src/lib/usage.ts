/**
 * What each artist's account costs, sampled once a day.
 *
 * A rollup rather than a meter, for the reason the bell poll was slowed to five
 * minutes: metering every request is a write per request to answer a question
 * nobody asks per request. The owner's question is "is this artist costing me
 * anything unusual", and it wants answering once a day.
 *
 * **This is the one place code reads a domain table on the owner's behalf**, and
 * the shape is what keeps that honest: it runs *as the tenant* — every count
 * below goes through `scoped` like any other read — and it emits a **number**.
 * The oversight surface reads the number and never the rows. That is the whole
 * arrangement the promise to an invited artist rests on.
 *
 * ### Four counters are measured and three are not
 *
 * `usage_daily` was given seven columns in migration 0021, and the honest
 * position today is that only four of them have a writer:
 *
 *  - `domain_rows`, `gig_rows`, `promo_rows` — a size, sampled daily. Counted
 *    here, cheaply, because these tables are measured in tens of rows.
 *  - `agent_runs` — activity, from `task_runs` on the day.
 *
 * `api_requests`, `gmail_drafts` and `ai_calls` have no writer and are left at
 * zero. That is a gap rather than a measurement, and the API says so rather
 * than reporting a zero the screen would render as "none": `measured` names
 * which fields mean something. A request counter in particular is the thing the
 * plan explicitly declined to build — it is a write per request, which is the
 * shape being avoided — so it needs somewhere outside D1 to live before it can
 * be honest.
 *
 * ### Retention
 *
 * Ninety days, the way `notification_events` keeps thirty. One row per tenant
 * per day is small, but "small" is not a retention policy and this is the
 * table with a row arriving on a timer.
 */

import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, promoDrafts, taskRuns, usageDaily } from '../db/schema'
import { DOMAIN_TABLES, scoped, type DomainTable, type TenantId } from '../db/scope'
import type { Env } from '../types'

/** Rows older than this are pruned. */
export const USAGE_RETENTION_DAYS = 90

/** Which columns of a `usage_daily` row are a measurement rather than a gap. */
export const MEASURED_FIELDS = ['domainRows', 'gigRows', 'promoRows', 'agentRuns'] as const

export async function countRows(env: Env, table: DomainTable, tenant: TenantId): Promise<number> {
  const [row] = await getDb(env.DB)
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(scoped(table, tenant))
  return row?.count ?? 0
}

/**
 * Write today's row for one tenant.
 *
 * Idempotent: the same day written twice replaces the earlier sample rather
 * than adding a second, because a day has one answer and the later one is
 * better. Delete-then-insert rather than an upsert, for the reason
 * `storeGrant` is — the primary key here is `(tenant_id, day)`, and naming a
 * constraint in an `ON CONFLICT` is the thing this repo learned to stop doing
 * while a schema is still moving.
 */
export async function recordUsage(env: Env, tenant: TenantId, day: string): Promise<void> {
  const db = getDb(env.DB)

  const domainRows = (
    await Promise.all(DOMAIN_TABLES.map((table) => countRows(env, table, tenant)))
  ).reduce((sum, n) => sum + n, 0)

  // The two the owner actually looks at, counted by name rather than by
  // position in the list above — a reordering there must not silently start
  // reporting sync targets as gigs.
  const [gigs, promos] = await Promise.all([
    countRows(env, gigOpportunities, tenant),
    countRows(env, promoDrafts, tenant),
  ])

  // `run_at` is an ISO stamp, so the day is a prefix range rather than a
  // `date()` call — which would be a function on the column and therefore
  // unindexable. Half-open, so a run at midnight lands in exactly one day.
  const [runs] = await db
    .select({ count: sql<number>`count(*)` })
    .from(taskRuns)
    .where(scoped(taskRuns, tenant, gte(taskRuns.runAt, day), lt(taskRuns.runAt, nextDay(day))))

  await db.delete(usageDaily).where(and(eq(usageDaily.tenantId, tenant), eq(usageDaily.day, day)))
  await db.insert(usageDaily).values({
    tenantId: tenant,
    day,
    domainRows,
    gigRows: gigs,
    promoRows: promos,
    agentRuns: runs?.count ?? 0,
    // No writer. Left at the column default and reported as unmeasured — see
    // the note at the top of this file.
    apiRequests: 0,
    gmailDrafts: 0,
    aiCalls: 0,
    writtenAt: new Date().toISOString(),
  })
}

/** Housekeeping. Returns how many rows went. */
export async function pruneUsage(env: Env, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - USAGE_RETENTION_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const gone = await getDb(env.DB)
    .delete(usageDaily)
    .where(lt(usageDaily.day, cutoff))
    .returning({ day: usageDaily.day })
  return gone.length
}

/**
 * `2026-09-10` → `2026-09-11`, in UTC and nowhere else.
 *
 * The day boundary is deliberately the runner's, not the artist's: `run_at` is
 * written by a GitHub runner in UTC, so counting runs against a local midnight
 * would put a 6pm Winnipeg run in tomorrow's row. A daily sample does not need
 * to agree with anybody's calendar, only with itself.
 */
function nextDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10)
}
