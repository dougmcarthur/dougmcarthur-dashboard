/**
 * Writing the decision log. The shape of an entry is `shared/decisionLog.ts`;
 * this is the database half.
 *
 * Two properties, and the second is the one that matters.
 *
 *  - **Append-only.** There is no update and no delete here, and
 *    `test/decisionLog.test.ts` fails if one appears. A record of a past
 *    decision that can be edited is a record of whatever it was last edited to.
 *    Removing a tenant is the only thing that deletes rows, and it does so
 *    through `DOMAIN_TABLES` like every other scoped table.
 *  - **A failed write never costs the artist the move.** The status has
 *    already changed by the time this runs, and refusing a "pass" because a
 *    log row would not insert is the log hurting the thing it observes. The
 *    failure is logged and swallowed, the way `linkGig` handles the catalog.
 *    The cost is a hole in the record rather than a hole in the app, and the
 *    hole is visible in the Worker's logs.
 *
 * Every caller reads the row *before* it changes and hands that in, because
 * what is being recorded is what the artist was looking at.
 */

import { getDb } from '../db'
import { decisionLog, gigOpportunities, syncTargets } from '../db/schema'
import { withTenant, type TenantId } from '../db/scope'
import {
  decisionRow,
  gigDecisionContext,
  syncDecisionContext,
  type DecisionActor,
  type DecisionAction,
  type DecisionInput,
  type DecisionVia,
} from '../../shared/decisionLog'
import type { GigOpportunity, SyncTarget } from '../../shared/types'
import type { Actor } from './actor'
import type { Env } from '../types'

/** A gig as `readGig` returns it: the table's columns, with `status` in the fourteen-value vocabulary. */
export type GigRowForLog = typeof gigOpportunities.$inferSelect & { status: string }
export type SyncRowForLog = typeof syncTargets.$inferSelect

/** A research agent's move is not the artist deciding; everything else is. */
export function decisionActor(actor: Actor): DecisionActor {
  return actor.kind === 'agent' ? 'agent' : 'user'
}

export interface Move {
  action: DecisionAction
  from?: string | null
  to?: string | null
  via: DecisionVia
  actor: DecisionActor
  /** ISO datetime. The same stamp the row's `updated_at` got, when there is one. */
  at: string
}

export async function recordDecision(env: Env, tenant: TenantId, input: DecisionInput): Promise<boolean> {
  try {
    await getDb(env.DB).insert(decisionLog).values(withTenant(tenant, decisionRow(input)))
    return true
  } catch (err) {
    console.error('decision log write failed:', err)
    return false
  }
}

/** Log a move on a gig, from the row as it was before the move. */
export function recordGigDecision(env: Env, tenant: TenantId, before: GigRowForLog, move: Move): Promise<boolean> {
  // One cast, here. The table's column types are wider than the wire type
  // (`submission_method` is text, the wire type a union), and the snapshot
  // reads only fields both agree on.
  const row = before as unknown as GigOpportunity
  return recordDecision(env, tenant, {
    ...move,
    entity: 'gig',
    entityId: before.id,
    opportunityId: before.opportunityId ?? null,
    context: gigDecisionContext(row, move.at.slice(0, 10)),
  })
}

/** Log a move on a sync target, from the row as it was before the move. */
export function recordSyncDecision(env: Env, tenant: TenantId, before: SyncRowForLog, move: Move): Promise<boolean> {
  const row = before as unknown as SyncTarget
  return recordDecision(env, tenant, {
    ...move,
    entity: 'sync',
    entityId: before.id,
    opportunityId: before.opportunityId ?? null,
    context: syncDecisionContext(row, move.at.slice(0, 10)),
  })
}
