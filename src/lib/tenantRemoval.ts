/**
 * Removing an artist, which is the one operation that crosses the line.
 *
 * The promise the oversight surface is built on is that the owner can see an
 * artist is *there* without being able to read what they are doing — so admin
 * mode has no tenant on it and cannot construct a scoped read by accident.
 * This is the exception, and it is worth being exact about what kind:
 *
 * **It is a write.** An artist who leaves must be able to have their data
 * deleted, and nobody else can do it for them. "Never reads a domain table"
 * survives that intact; never *touches* one was not the promise and could not
 * be.
 *
 * **The preview counts, and a count is not a read of content.** It names no
 * column and returns no row — "41 gigs, 7 replies" tells the owner the size of
 * what they are about to destroy and nothing about any of it. A bulk write you
 * cannot look at first is one you find out about afterwards, which is the rule
 * every other bulk write in this app already follows, and it applies most to
 * the irreversible one.
 *
 * **The tenant is named, never inherited.** Admin mode resolves to no tenant;
 * this takes one as an argument, from a path the owner typed or clicked, and
 * the caller checks it against `tenants` first. That is the difference between
 * an explicit destructive act and an ambient scope.
 *
 * There is deliberately no "archive" and no soft delete. A row that still
 * exists is a row somebody has to keep reasoning about, and the person asking
 * for deletion is asking for the rows to be gone.
 */

import { eq, getTableName } from 'drizzle-orm'
import { getDb } from '../db'
import { agentTokens, authSessions, passkeyCredentials, tenants, usageDaily, users } from '../db/schema'
import { DOMAIN_TABLES, scoped, type TenantId } from '../db/scope'
import { countRows } from './usage'
import type { Env } from '../types'

/** How many rows a removal would destroy, per table. */
export interface RemovalPreview {
  tenantId: string
  rows: Array<{ table: string; count: number }>
  total: number
  /** Accounts that would go with it. Named, because they are people's logins. */
  users: number
}

export async function previewRemoval(env: Env, tenant: TenantId): Promise<RemovalPreview> {
  const counts = await Promise.all(
    DOMAIN_TABLES.map(async (table) => ({
      // The SQL name — what the migrations and the plan both call it. The
      // screen renders a written name from it; a slug on a confirmation
      // screen reads as a leak.
      table: getTableName(table),
      count: await countRows(env, table, tenant),
    })),
  )
  const accounts = await getDb(env.DB).select().from(users).where(eq(users.tenantId, tenant))

  return {
    tenantId: tenant,
    // Empty tables are kept in the list rather than filtered out. "No replies"
    // is a fact about what is being deleted, and a preview that only shows the
    // non-empty rows reads as a shorter list every time.
    rows: counts,
    total: counts.reduce((sum, row) => sum + row.count, 0),
    users: accounts.length,
  }
}

export interface RemovalResult {
  tenantId: string
  rowsDeleted: number
  usersDeleted: number
}

/**
 * Delete everything belonging to one tenant.
 *
 * Not a transaction, because D1 has no interactive one and a batch would not
 * survive the fourteen statements plus the account rows anyway. A run that
 * dies halfway leaves fewer rows than it started with and can be run again —
 * which is the right failure mode for a delete, and the reason the tenant row
 * itself goes **last**: while it exists, the removal is resumable and the
 * artist is still listed as present.
 */
export async function removeTenant(env: Env, tenant: TenantId): Promise<RemovalResult> {
  const db = getDb(env.DB)
  let rowsDeleted = 0

  for (const table of DOMAIN_TABLES) {
    const gone = await db.delete(table).where(scoped(table, tenant)).returning({ tenantId: table.tenantId })
    rowsDeleted += gone.length
  }

  // The credential tables key off a user rather than a tenant, so they are
  // reached through the accounts rather than filtered directly. A passkey left
  // behind would be a credential for an account that no longer exists.
  const accounts = await db.select().from(users).where(eq(users.tenantId, tenant))
  for (const account of accounts) {
    await db.delete(passkeyCredentials).where(eq(passkeyCredentials.userId, account.id))
    await db.delete(authSessions).where(eq(authSessions.userId, account.id))
  }

  await db.delete(agentTokens).where(eq(agentTokens.tenantId, tenant))
  await db.delete(usageDaily).where(eq(usageDaily.tenantId, tenant))
  await db.delete(users).where(eq(users.tenantId, tenant))
  await db.delete(tenants).where(eq(tenants.id, tenant))

  return { tenantId: tenant, rowsDeleted, usersDeleted: accounts.length }
}
