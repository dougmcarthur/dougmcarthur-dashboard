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
import type { Actor } from './lib/actor'
import type { TenantId } from './db/scope'

export type AppEnv = { Bindings: Env; Variables: { actor: Actor } }

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
