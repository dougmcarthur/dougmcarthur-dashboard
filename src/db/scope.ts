/**
 * Tenant scoping: the one way a domain table is allowed to be reached.
 *
 * Step 2 of docs/multi-tenant-plan.md. Fourteen tables hold rows that belong
 * to one artist, and every read and write against them has to say which. The
 * argument for putting that here rather than trusting each route is the same
 * one that put authentication in a single middleware: a router added next
 * month is scoped by doing nothing, or it is a hole.
 *
 * Three properties this file exists to hold.
 *
 * **A tenant is a type, not a string.** `TenantId` is branded, so a user id, a
 * label or an empty string cannot be passed where a tenant belongs — and
 * `asTenantId` is the only constructor, which makes the places that decide
 * what tenant a request is for countable. Admin mode resolves to `null` rather
 * than to a wildcard, and `null` is not a `TenantId`, so an admin-mode request
 * that reached for `gig_opportunities` fails to compile rather than returning
 * a stranger's rows.
 *
 * **Scope is passed, never fetched.** `scoped()` takes the tenant as an
 * argument for the reason `buildReviewQueue` takes `today` instead of reading
 * the clock: a function that fetches its own scope is a function that can
 * fetch the wrong one silently, and nothing about the call site would show it.
 *
 * **A missing filter is a test failure, not a leak.** `test/tenantScope.test.ts`
 * reads this source tree and fails when a domain table is named in a query
 * that does not go through `scoped` or `withTenant`. That check is the reason
 * these helpers are narrow and ugly rather than convenient — they are meant to
 * be greppable.
 */

import { and, eq, type SQL } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

declare const TENANT_BRAND: unique symbol

/** An artist's id. Only `asTenantId` makes one. */
export type TenantId = string & { readonly [TENANT_BRAND]: true }

/**
 * The one constructor, so every place that decides which artist a request is
 * for is one grep away.
 *
 * Empty is refused rather than accepted as "no tenant": an empty scope would
 * match no rows on a read, which looks like an empty account, and would write
 * an unreachable row on an insert. Both are worse than an error.
 */
export function asTenantId(raw: string): TenantId {
  const value = raw.trim()
  if (!value) throw new Error('asTenantId: empty tenant id')
  return value as TenantId
}

/** Anything carrying the column. Every one of the fourteen does. */
interface Scopable {
  tenantId: AnySQLiteColumn
}

/**
 * The `WHERE` clause for a scoped query: the tenant, plus whatever else the
 * caller was going to filter on.
 *
 * Undefined conditions are dropped, so a caller can pass an optional filter
 * without assembling the array itself — the shape `and()` already allows, kept
 * here so that adding a condition never means removing the tenant.
 */
export function scoped(
  table: Scopable,
  tenant: TenantId,
  ...rest: Array<SQL | undefined>
): SQL {
  // `and` returns undefined only when handed nothing; the tenant is always
  // there, so the non-null assertion is a fact rather than a hope.
  return and(eq(table.tenantId, tenant), ...rest)!
}

/**
 * The values for a scoped insert.
 *
 * Spread last so a caller cannot overwrite the tenant by passing one in a
 * literal — the argument this takes has no `tenantId` in its type, and the
 * assignment below is the last word regardless.
 */
export function withTenant<T extends object>(tenant: TenantId, values: T): T & { tenantId: TenantId } {
  return { ...values, tenantId: tenant }
}

/**
 * The fourteen, by their `src/db/schema.ts` export name.
 *
 * Here rather than in the test so that adding a tenant-scoped table means
 * adding it in the place the scoping lives, and the test that enforces the
 * rule reads the same list the rule is written against.
 *
 * `appSettings` is absent because it is platform state, and the auth tables
 * because they key off a user, which is a level above a tenant.
 */
export const SCOPED_TABLES = [
  'gigOpportunities',
  'syncTargets',
  'promoDrafts',
  'referenceDocs',
  'artistAssets',
  'applicationFields',
  'gigReplies',
  'gigCorrespondents',
  'taskRuns',
  'reminders',
  'digestReports',
  'notificationMarks',
  'notificationEvents',
  'googleGrants',
] as const

export type ScopedTableName = (typeof SCOPED_TABLES)[number]
