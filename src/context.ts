/**
 * What a request carries once the middleware has run.
 *
 * The actor — who is asking and whose rows they get — is resolved once, in
 * `src/index.ts`, and every router reads it from here. That is the only place
 * scope is *fetched*; from a route inward it is passed as an argument, because
 * a function that fetches its own scope is a function that can fetch the wrong
 * one silently. See `src/db/scope.ts`.
 */

import type { Context } from 'hono'
import type { Env } from './types'
import type { Actor, AdminActor } from './lib/actor'
import type { TenantId } from './db/scope'

/**
 * Two surfaces, two context types, and they do not overlap.
 *
 * A tenant-scoped router is `AppEnv` and can only reach `actor`; the oversight
 * router is `AdminEnv` and can only reach `admin`. Neither can read the
 * other's variable, so "admin mode cannot touch a domain table" is a type
 * error rather than a rule to remember — `tenantOf` below takes an `AppEnv`
 * context and there is no way to hand it an admin one.
 *
 * `RootEnv` exists only because `src/index.ts` sets both, being the one place
 * that decides which surface a request is on.
 */
type Vars = { actor: Actor; admin: AdminActor }

export type AppEnv = { Bindings: Env; Variables: Pick<Vars, 'actor'> }
export type AdminEnv = { Bindings: Env; Variables: Pick<Vars, 'admin'> }
export type RootEnv = { Bindings: Env; Variables: Vars }

/**
 * The tenant this request is for.
 *
 * Non-nullable, and that is load-bearing: admin mode (step 3) resolves to no
 * tenant at all rather than to a wildcard, so the surface that has one and the
 * surface that does not are different types rather than the same type with a
 * different value.
 */
export function tenantOf(c: Context<AppEnv>): TenantId {
  return c.get('actor').tenant
}

/** The owner behind an oversight request. Carries no tenant, on purpose. */
export function adminOf(c: Context<AdminEnv>): AdminActor {
  return c.get('admin')
}
