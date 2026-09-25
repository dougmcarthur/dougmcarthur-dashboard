/**
 * The one boundary a gig's status crosses between D1 and the code.
 *
 * Since migration 0030 a row stores its stage in `status` with `outcome` and
 * `flag` beside it; before, `status` held one of fourteen values. Everything
 * above this file — the queue, the pipeline, the reply matcher, the nudges,
 * the API the screens and the research agents read — still speaks the
 * fourteen, so a row is translated on the way out of a query and on the way
 * into a write, and nowhere else.
 *
 * That makes a skipped translation the thing to fear: a raw `closed` read as a
 * status string is a gig nobody has looked at. `test/gigRows.test.ts` fails
 * when a file selects from `gig_opportunities` without passing through here,
 * the way `test/tenantScope.test.ts` fails on a query without `scoped`.
 */

import { gigStatusFromStored, storedGigState, type StoredGigState } from '../../shared/gigStage'

/** A row as the code expects it: `status` in the fourteen-value vocabulary. */
export function readGig<T extends StoredGigState>(row: T): T & { status: string }
export function readGig<T extends StoredGigState>(row: T | undefined): (T & { status: string }) | undefined
export function readGig<T extends StoredGigState>(row: T | undefined) {
  return row ? { ...row, status: gigStatusFromStored(row) } : undefined
}

export function readGigs<T extends StoredGigState>(rows: T[]): Array<T & { status: string }> {
  return rows.map((row) => readGig(row))
}

/** The three columns a status is written as. Spread into `.set()` or `.values()`. */
export function gigStatusColumns(status: string | null | undefined) {
  return storedGigState(status)
}
