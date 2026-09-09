/**
 * The facts a note carries, as column values.
 *
 * `shared/reviewParse.ts` has re-derived these out of prose on every read
 * since migration 0001's columns were added and never filled. This is the
 * other half of that: the same parse, expressed as the handful of values
 * worth *storing*, so it can happen once when a row is written instead of
 * every time one is looked at.
 *
 * ## What this does not claim
 *
 * The audit's plan ends "once backfilled, the parser is deleted". It cannot,
 * and the reason is not in the plan: the research agents that write these
 * notes live outside this repo and will keep writing prose. A backfill alone
 * leaves every *future* row with a filled note and empty columns — which is
 * the same bug in the opposite direction. So extraction has to keep
 * happening; what changes is *when*. On write, once, instead of on read,
 * forever. The parser stays, and stops being something a screen depends on.
 *
 * ## What is worth a column, and what is not
 *
 * Only facts you would query, or that another feature reads. `requirements`,
 * `dealTerms`, `provenance` and the drafted field values are rendered and
 * nothing else, and storing a JSON copy of them would be a cache of the
 * parser wearing a schema's clothes — with a staleness bug the read-time
 * version cannot have. They stay derived.
 *
 * Four of 0001's nine columns are not here either, because the parser cannot
 * fill them: `organizer` the audit itself calls too ambiguous to do safely,
 * and `audience_size`, `genre_fit_score` and `agency_type` are simply not in
 * any note in a form anything could read. Backfilling those means entering
 * them, not extracting them.
 *
 * Pure, like everything in shared/.
 */

import { parseNote, parseFee, type SubmissionState, type SubmissionMethod } from './reviewParse'

export interface GigNoteColumns {
  /** not_submitted | submitted | unknown — the fact `status` keeps getting wrong. */
  submissionState: SubmissionState
  /** email | form | portal | dm, or null when the note does not say. */
  submissionMethod: SubmissionMethod
  /** Where it is, when the note says. Feeds the travel band in `gigCost`. */
  location: string | null
  /** Things waiting on you, as a JSON array. Null when there are none. */
  blockedOn: string | null
  /** The cost to enter, off the legacy prose `fee` column. */
  feeAmount: number | null
  feeCurrency: string | null
}

export interface SyncNoteColumns {
  confirmationMethod: SubmissionMethod
}

/**
 * `unknown` is written as null.
 *
 * The three states are not equally real. `not_submitted` and `submitted` are
 * claims the note makes; `unknown` is the absence of one, and a column
 * holding the string "unknown" reads as a finding rather than as silence.
 */
function storedState(state: SubmissionState): string | null {
  return state === 'unknown' ? null : state
}

export function gigNoteColumns(row: {
  fitRationale?: string | null
  fitNotes?: string | null
  fee?: string | null
  paid?: number | null
}): GigNoteColumns & { submissionState: SubmissionState; storedSubmissionState: string | null } {
  const parsed = parseNote(row.fitRationale ?? row.fitNotes)
  const fee = parseFee(row.fee ?? null, row.paid ?? 0)

  return {
    submissionState: parsed.submissionState,
    storedSubmissionState: storedState(parsed.submissionState),
    // `dm` is dropped rather than stored. The parser knows it — one gig is
    // booked through a Facebook page — but `submission_method` has three
    // values and the pickers offer three, so writing a fourth would put a
    // value in the column that the wire type says cannot be there. The note
    // still says it, and the Review screen still reads it from the note.
    submissionMethod: parsed.submissionMethod === 'dm' ? null : parsed.submissionMethod,
    location: parsed.location,
    blockedOn: parsed.blockers.length > 0 ? JSON.stringify(parsed.blockers) : null,
    // Only a cost. `parseFee` keeps money paid *to* you in `payout`, and
    // writing that into `fee_amount` would invert the sign of the one number
    // on this row that means "this costs you".
    feeAmount: fee.required ? fee.amount : null,
    feeCurrency: fee.required && fee.amount !== null ? fee.currency : null,
  }
}

export function syncNoteColumns(row: { notes?: string | null }): SyncNoteColumns {
  const method = parseNote(row.notes ?? null).submissionMethod
  return { confirmationMethod: method === 'dm' ? null : method }
}

/** A column that is already set is never overwritten — see `changesFor`. */
export interface ColumnChange {
  column: string
  from: string | number | null
  to: string | number | null
}

/**
 * What a backfill would change on one row, and nothing it would not.
 *
 * A value already in the column stays, whatever the note now says. That is
 * the same rule the application panel follows about your writing: an edit you
 * made by hand is a decision, and a re-run of an extractor is not allowed to
 * quietly undo one. It also makes the backfill safe to run twice.
 */
export function changesFor(
  current: Record<string, unknown>,
  proposed: Record<string, string | number | null>,
): ColumnChange[] {
  const out: ColumnChange[] = []
  for (const [column, to] of Object.entries(proposed)) {
    const from = current[column]
    if (from !== null && from !== undefined && from !== '') continue
    if (to === null || to === undefined || to === '') continue
    out.push({ column, from: (from ?? null) as string | number | null, to })
  }
  return out
}
