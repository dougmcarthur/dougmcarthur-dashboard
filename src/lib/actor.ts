/**
 * Who is asking, and whose rows they get.
 *
 * Authentication answers the first half and used to be the whole question:
 * with one artist, a request that got past the middleware was entitled to
 * every row in the database. Step 2 of docs/multi-tenant-plan.md splits the
 * second half out — a request now resolves to a **tenant**, and every domain
 * read and write takes that tenant as an argument.
 *
 * The resolution happens here, once, for the same reason authentication does:
 * a router added next month is scoped by doing nothing, or it is a hole.
 *
 * Two callers, two credentials, one answer:
 *
 *  - A browser sends the session cookie. The session names a user, the user
 *    names a tenant.
 *  - The research agents send a bearer token. It names a tenant directly,
 *    because they are not people and have no account to belong to.
 */

import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { agentTokens, tenants, users } from '../db/schema'
import { asTenantId, type TenantId } from '../db/scope'
import { sha256Hex, timingSafeEqual, type ActiveSession } from './auth'
import type { Env } from '../types'

export type Role = 'owner' | 'artist'

export interface UserActor {
  kind: 'user'
  userId: string
  role: Role
  tenant: TenantId
  session: ActiveSession
}

export interface AgentActor {
  kind: 'agent'
  tenant: TenantId
  /** The `agent_tokens` row, or null when the legacy `API_TOKEN` was used. */
  tokenId: string | null
}

/**
 * The owner, on the oversight surface.
 *
 * Note what is missing: there is no `tenant` on this type at all. That is the
 * whole mechanism behind "admin mode resolves to null, not to a wildcard" —
 * `scoped()` takes a `TenantId`, an admin route is handed one of these, and
 * there is nothing to pass. An admin route that reached for
 * `gig_opportunities` does not return a stranger's rows; it fails to compile.
 *
 * It is deliberately not `UserActor` with a nullable tenant, because that
 * shape only refuses at the call sites somebody remembered to null-check.
 */
export interface AdminActor {
  kind: 'admin'
  userId: string
  session: ActiveSession
}

/** What a tenant-scoped route sees. Admin mode is not in this union. */
export type Actor = UserActor | AgentActor

/**
 * The tenant behind a signed-in session.
 *
 * Null when the session names no user, or names one with no tenant. Neither
 * should happen — migration 0021 defaulted every existing session and
 * credential to the bootstrap owner — but the answer to "I cannot tell whose
 * rows these are" has to be *no rows*, never *all rows*. A 401 is a bad
 * afternoon; the alternative is a leak.
 */
export interface Account {
  userId: string
  role: Role
  tenantId: string | null
}

/**
 * The account behind a session, whichever surface it is on.
 *
 * Separate from `actorForSession` because two callers want different things:
 * a route wants the surface, and the mode switch wants the *role*, which is a
 * fact about the account rather than about the session. Asking the actor would
 * mean asking the answer the switch is about to change.
 */
export async function accountForSession(env: Env, session: ActiveSession): Promise<Account | null> {
  if (!session.userId) return null
  const row = await getDb(env.DB).select().from(users).where(eq(users.id, session.userId)).get()
  if (!row) return null
  return {
    userId: row.id,
    role: row.role === 'owner' ? 'owner' : 'artist',
    tenantId: row.tenantId,
  }
}

export async function actorForSession(
  env: Env,
  session: ActiveSession,
): Promise<UserActor | AdminActor | null> {
  const row = await accountForSession(env, session)
  if (!row) return null
  const { role } = row

  // Admin mode is a fact about the session *and* the account. A session can
  // only enter it as an owner, so a non-owner sitting in admin mode should not
  // be possible — and if it somehow is, the safe reading is the artist surface,
  // which is scoped, rather than the oversight one, which is not.
  if (session.mode === 'admin' && role === 'owner') {
    return { kind: 'admin', userId: row.userId, session }
  }

  if (!row.tenantId) return null
  return {
    kind: 'user',
    userId: row.userId,
    role,
    tenant: asTenantId(row.tenantId),
    session,
  }
}

/**
 * The tenant behind a bearer token, or null when the token is not one.
 *
 * Two spellings are accepted on purpose, which is the pattern this repo
 * already uses for a value being renamed: `normaliseGigStatus` reads both
 * `approved` and `shortlisted` so that agents outside this repository keep
 * working across the change.
 *
 *  - An `agent_tokens` row, hashed, scoped to one tenant. What the agents
 *    should hold.
 *  - `API_TOKEN`, the platform secret they hold today, resolved to the owner's
 *    tenant. Correct while there is one artist and removed before there are
 *    two — but removing it in the same deploy that introduces the table would
 *    mean every agent 401s until three GitHub secrets are rotated, which is a
 *    coordination this does not need.
 *
 * Unset `API_TOKEN` still means no legacy path at all, so an empty deployment
 * cannot be opened by guessing the empty string.
 */
export async function actorForBearer(env: Env, header: string | null | undefined): Promise<AgentActor | null> {
  const offered = /^Bearer\s+(.+)$/i.exec(header ?? '')?.[1]
  if (!offered) return null

  // The platform secret first, because it is a string compare and the table is
  // a read — the same ordering the middleware keeps between the bearer and the
  // session, and for the same reason. It is also what every agent still sends.
  const expected = env.API_TOKEN
  if (expected && timingSafeEqual(offered, expected)) {
    const tenant = await ownerTenant(env)
    return tenant ? { kind: 'agent', tenant, tokenId: null } : null
  }

  // Looked up by the hash of what was offered, so a wrong token finds no row
  // rather than being compared against a right one — which is why there is no
  // `timingSafeEqual` here and why the column stores a hash.
  const db = getDb(env.DB)
  const row = await db
    .select()
    .from(agentTokens)
    .where(eq(agentTokens.tokenHash, await sha256Hex(offered)))
    .get()
  if (!row || row.revokedAt) return null

  // A write per request, which this repo is otherwise against — the bell poll
  // was slowed for exactly that shape. The difference is the rate: the bell was
  // a full feed every minute of every open tab, and this is one UPDATE on a
  // handful of rows a few dozen times a day. Without it the Settings screen
  // shows a "last used" that is always empty, which is a lie rather than a gap.
  await db
    .update(agentTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(agentTokens.id, row.id))

  return { kind: 'agent', tenant: asTenantId(row.tenantId), tokenId: row.id }
}

/**
 * The owner's tenant, which is the one the legacy platform token resolves to.
 *
 * Ordered by `created_at` so that the answer is stable rather than whatever
 * D1 returns first — there is one owner today, and a second one appearing
 * should not silently move where the agents write.
 */
export async function ownerTenant(env: Env): Promise<TenantId | null> {
  const row = await ownerUser(env)
  return row?.tenantId ? asTenantId(row.tenantId) : null
}

/**
 * One account by id, with the label a passkey prompt should show.
 *
 * The label is the recovery address when there is one, then the display name,
 * then nothing — an operating system prompt saying which account it is about
 * is the difference between two entries in a keychain and two entries that
 * look identical.
 */
export async function accountById(
  env: Env,
  userId: string,
): Promise<{ userId: string; role: Role; label: string | null } | null> {
  const row = await getDb(env.DB).select().from(users).where(eq(users.id, userId)).get()
  if (!row) return null
  return {
    userId: row.id,
    role: row.role === 'owner' ? 'owner' : 'artist',
    label: row.email ?? row.displayName ?? null,
  }
}

/** The owner's account id, for the one code path with nobody signed in to ask. */
export async function ownerUserId(env: Env): Promise<string | null> {
  return (await ownerUser(env))?.id ?? null
}

async function ownerUser(env: Env) {
  return getDb(env.DB)
    .select()
    .from(users)
    .where(eq(users.role, 'owner'))
    .orderBy(asc(users.createdAt))
    .get()
}

/**
 * Every tenant, for the work that has no request behind it.
 *
 * The cron is the only caller. It cannot read a scope off a session, so it
 * takes the list and loops — which is the honest shape: housekeeping is one
 * artist's rows at a time, and there is no such thing as running it "for
 * everybody" in one query without the wildcard scope this design refuses to
 * have.
 */
export async function listTenants(env: Env): Promise<TenantId[]> {
  const rows = await getDb(env.DB).select().from(tenants).orderBy(asc(tenants.createdAt))
  return rows.map((r) => asTenantId(r.id))
}
