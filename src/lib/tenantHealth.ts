/**
 * Does every row belong to somebody?
 *
 * It should. Every `tenant_id` on the fourteen carries a default, so a write
 * that omits the column cannot produce a NULL; `withTenant` returns a
 * `TenantId` and cannot pass one; and `test/tenantScope.test.ts` fails on any
 * query that goes around `withTenant`. Three mechanisms, all of which say the
 * answer is zero.
 *
 * Which is exactly why it is worth counting. Migration 0024 defers the
 * `NOT NULL` pass on those fourteen tables, and one of its three preconditions
 * is that no row has a NULL tenant — a claim currently resting on reasoning
 * rather than on anything anybody has looked at. This turns it into a number.
 *
 * **It is deliberately unscoped, and that is the whole job.** A scoped count
 * would return rows that already have a tenant, which is the opposite question.
 * `test/tenantScope.test.ts` carries the exemption with this reason written out.
 * What it reads is a count: no column named, no row returned, nothing about
 * anybody's work. Same standing as the removal preview on the oversight
 * surface, and the same limit.
 */

import { getTableName, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { DOMAIN_TABLES, type DomainTable } from '../db/scope'
import type { Env } from '../types'

export interface TenantHealth {
  /** One entry per domain table, in the order the plan lists them. */
  tables: Array<{ table: string; unscoped: number }>
  /** The number that matters. Anything but zero is a bug somewhere upstream. */
  unscoped: number
}

async function countUnscoped(env: Env, table: DomainTable): Promise<number> {
  const [row] = await getDb(env.DB)
    .select({ count: sql<number>`count(*)` })
    .from(table)
    .where(isNull(table.tenantId))
  return row?.count ?? 0
}

export async function readTenantHealth(env: Env): Promise<TenantHealth> {
  const tables = await Promise.all(
    DOMAIN_TABLES.map(async (table) => ({
      table: getTableName(table),
      unscoped: await countUnscoped(env, table),
    })),
  )
  return {
    // Every table is listed, including the ones at zero. A report that shows
    // only the problems reads as a shorter list every time and never says
    // plainly that it looked.
    tables,
    unscoped: tables.reduce((sum, row) => sum + row.unscoped, 0),
  }
}
