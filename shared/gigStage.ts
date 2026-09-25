/**
 * The four stages a gig is shown in, over the fourteen statuses it is stored in.
 *
 * Fourteen statuses was too many to read, and most of them described
 * something that happened *inside* a phase rather than a change of phase.
 * The work has three phases and an end:
 *
 *  - **New** — Scout found it. The only question is whether to apply.
 *  - **In progress** — you said yes. Scout's job is deadlines, the form and
 *    the answers. Nothing in here changes the stage except confirming the
 *    application went out.
 *  - **Applied** — waiting on them. Only a settled answer ends it.
 *  - **Closed** — with an outcome: accepted, not selected, passed, missed or
 *    withdrawn.
 *
 * What used to be a status and is now something smaller:
 *
 *  - `preparing` is In progress with a draft started, which the application
 *    panel already shows.
 *  - `acknowledged` is Applied with a receipt — history, not a state.
 *  - `info_requested` is Applied with a **flag**: they asked something and it
 *    stalls until you answer.
 *  - `invited` is Applied with a flag too: an offer is exciting and is not a
 *    booking. Festivals and showcases are settled by a signed contract, which
 *    is the only thing that makes it Accepted.
 *
 * **This is a view, and storage has not moved.** Renaming a stored value is
 * two deploys (CLAUDE.md, "Migrations must be additive"): the research agents
 * POST the old vocabulary from outside this repo and the queue, the reply
 * matcher and the nudges all read it. So every screen reads the stage from
 * here and writes the stored status `gigMoves` names, and the data can be
 * migrated later without any screen noticing.
 */

import {
  type GigStatus,
  GIG_STATUS_META,
  LEGACY_GIG_STATUS,
  isGigTransitionAllowed,
  nextGigStatuses,
  normaliseGigStatus,
} from './gigStatus'

export type GigStage = 'new' | 'in_progress' | 'applied' | 'closed'
export type GigOutcome = 'accepted' | 'not_selected' | 'passed' | 'missed' | 'withdrawn'
export type GigFlag = 'reply_owed' | 'offer_pending'

export const GIG_STAGES: GigStage[] = ['new', 'in_progress', 'applied', 'closed']

export const GIG_STAGE_META: Record<GigStage, { label: string; meaning: string }> = {
  new: { label: 'New', meaning: 'Found by Scout. Decide whether to apply.' },
  in_progress: {
    label: 'In progress',
    meaning: 'You are applying. Scout tracks the deadline and prepares the answers.',
  },
  applied: { label: 'Applied', meaning: 'Sent. Waiting on their answer.' },
  closed: { label: 'Closed', meaning: 'Finished, one way or the other.' },
}

export const GIG_OUTCOME_META: Record<GigOutcome, { label: string; meaning: string }> = {
  accepted: { label: 'Accepted', meaning: 'Terms settled: the contract is signed or the award confirmed.' },
  not_selected: { label: 'Not selected', meaning: 'They said no, or the offer fell through on their side.' },
  passed: { label: 'Passed', meaning: 'You decided not to apply. They never saw it.' },
  missed: { label: 'Missed', meaning: 'The window closed, or the answer never came.' },
  withdrawn: { label: 'Withdrawn', meaning: 'You pulled out after applying.' },
}

const STAGE_OF: Record<GigStatus, GigStage> = {
  discovered: 'new',
  shortlisted: 'in_progress',
  preparing: 'in_progress',
  submitted: 'applied',
  acknowledged: 'applied',
  info_requested: 'applied',
  invited: 'applied',
  booked: 'closed',
  declined: 'closed',
  passed: 'closed',
  expired: 'closed',
  withdrawn: 'closed',
  archived: 'closed',
}

const OUTCOME_OF: Partial<Record<GigStatus, GigOutcome>> = {
  booked: 'accepted',
  declined: 'not_selected',
  passed: 'passed',
  expired: 'missed',
  withdrawn: 'withdrawn',
  // `archived` has none. It was a filing move from any of the others and did
  // not keep which — eleven production rows say only that they are done.
}

export function gigStage(status: string | null | undefined): GigStage {
  return STAGE_OF[normaliseGigStatus(status)]
}

/** Null until the gig is closed, and for an archived row that never said why. */
export function gigOutcome(status: string | null | undefined): GigOutcome | null {
  return OUTCOME_OF[normaliseGigStatus(status)] ?? null
}

export function gigFlag(status: string | null | undefined): GigFlag | null {
  const s = normaliseGigStatus(status)
  return s === 'info_requested' ? 'reply_owed' : s === 'invited' ? 'offer_pending' : null
}

/**
 * Every spelling a stored row in this stage might carry, for a filter that
 * still queries storage — legacy ones included, since `approved` in the column
 * is In progress on screen and the filter should agree with the badge.
 */
export function statusesInStage(stage: GigStage): string[] {
  const spellings = [...Object.keys(STAGE_OF), ...Object.keys(LEGACY_GIG_STATUS)]
  return spellings.filter((s) => gigStage(s) === stage)
}

export function isGigStage(value: string | null | undefined): value is GigStage {
  return (GIG_STAGES as string[]).includes(value ?? '')
}

/**
 * Grants and awards are settled by a confirmation, not a contract.
 *
 * Read off the free-text `type`, so a type nobody anticipated gets the
 * contract wording — the one festivals and showcases, which are most of the
 * list, actually need.
 */
export function settledByAward(type: string | null | undefined): boolean {
  return /\b(grant|award|prize|fund|funding|residency|bursary|fellowship)\b/i.test(type ?? '')
}

export function flagLabel(flag: GigFlag, type?: string | null): string {
  if (flag === 'reply_owed') return 'They need more'
  return settledByAward(type) ? 'Offer — awaiting confirmation' : 'Offer — contract pending'
}

/** What the badge says: the stage, or for a closed gig its outcome. */
export function gigStageLabel(status: string | null | undefined): { label: string; meaning: string } {
  const stage = gigStage(status)
  if (stage !== 'closed') return GIG_STAGE_META[stage]
  const outcome = gigOutcome(status)
  return outcome ? GIG_OUTCOME_META[outcome] : GIG_STAGE_META.closed
}

export interface GigMove {
  /** The stored status this writes. */
  to: GigStatus
  /** What the button says: the thing you are about to do. */
  label: string
  meaning: string
  /** `go` moves forward, `no` ends it, `record` notes something they did. */
  tone: 'go' | 'no' | 'record'
}

/**
 * The moves a gig offers, named for the stage language.
 *
 * Derived from `nextGigStatuses` and never wider than it, so the PATCH route
 * accepts every one. Three stored targets are never offered as such:
 * `preparing` is written by the prep route, `acknowledged` only as "Answered"
 * to clear a question, and `archived` is a filing move a Closed stage makes
 * redundant. The labels depend on where the row is — `declined`
 * is "Not selected" after an application and "Offer fell through" after an
 * offer, because those are different sentences about the same outcome.
 */
export function gigMoves(status: string | null | undefined, type?: string | null): GigMove[] {
  const from = normaliseGigStatus(status)
  const offered = new Set(nextGigStatuses(from))
  const award = settledByAward(type)

  const label = (to: GigStatus): Omit<GigMove, 'to'> | null => {
    switch (to) {
      case 'shortlisted':
        return { label: 'Apply', meaning: 'You will apply. Scout starts on the deadline and the form.', tone: 'go' }
      case 'submitted':
        return { label: 'Mark as submitted', meaning: 'The application went out.', tone: 'go' }
      case 'info_requested':
        return { label: 'They need more', meaning: 'They asked for something. Flags it until you answer.', tone: 'record' }
      case 'acknowledged':
        // Offered only to clear "they need more". From anywhere else it is a
        // receipt, which is history rather than something you record.
        return from === 'info_requested'
          ? { label: 'Answered', meaning: 'You sent what they asked for. Back to waiting.', tone: 'record' }
          : null
      case 'invited':
        return { label: 'Offer received', meaning: 'They want you. Not accepted until the terms are settled.', tone: 'record' }
      case 'booked':
        return award
          ? { label: 'Award confirmed', meaning: GIG_OUTCOME_META.accepted.meaning, tone: 'go' }
          : { label: 'Contract signed', meaning: GIG_OUTCOME_META.accepted.meaning, tone: 'go' }
      case 'declined':
        return from === 'invited'
          ? { label: 'Offer fell through', meaning: 'They withdrew the offer or the terms could not be agreed.', tone: 'no' }
          : { label: 'Not selected', meaning: 'They said no.', tone: 'no' }
      case 'passed':
        return { label: 'Pass', meaning: GIG_OUTCOME_META.passed.meaning, tone: 'no' }
      case 'expired':
        return STAGE_OF[from] === 'applied'
          ? { label: 'Never heard back', meaning: 'The answer is not coming.', tone: 'no' }
          : { label: 'Missed the deadline', meaning: 'The window closed before it went out.', tone: 'no' }
      case 'withdrawn':
        return { label: 'Withdraw', meaning: GIG_OUTCOME_META.withdrawn.meaning, tone: 'no' }
      default:
        return null
    }
  }

  const ORDER: GigStatus[] = [
    'shortlisted', 'submitted', 'booked', 'acknowledged', 'invited', 'info_requested',
    'declined', 'passed', 'withdrawn', 'expired',
  ]
  return ORDER.filter((to) => offered.has(to) && to !== from && isGigTransitionAllowed(from, to)).flatMap((to) => {
    const named = label(to)
    return named ? [{ to, ...named }] : []
  })
}

/**
 * Where a new gig can start. Closed is not a place to start from, and In
 * progress stores as `shortlisted`, Applied as `submitted`.
 */
export const GIG_START_STATUS: Record<Exclude<GigStage, 'closed'>, GigStatus> = {
  new: 'discovered',
  in_progress: 'shortlisted',
  applied: 'submitted',
}

// Every stored status has a stage — checked here as well as by the type, so a
// status added to `GIG_STATUS_META` without one fails the moment it loads.
for (const s of Object.keys(GIG_STATUS_META) as GigStatus[]) {
  if (!STAGE_OF[s]) throw new Error(`gig status ${s} has no stage`)
}

/**
 * The stored shape since migration 0030: the stage in `status`, with the
 * outcome and the flag beside it. Rows written before it carry one of the
 * fourteen statuses in `status` and nothing in the other two.
 */
export interface StoredGigState {
  status: string | null
  outcome?: string | null
  flag?: string | null
}

const FROM_OUTCOME: Record<GigOutcome, GigStatus> = {
  accepted: 'booked',
  not_selected: 'declined',
  passed: 'passed',
  missed: 'expired',
  withdrawn: 'withdrawn',
}

/**
 * The in-memory status a stored row means, whichever vocabulary it was
 * written in.
 *
 * The queue, the reply matcher, the nudges and the pipeline all reason over
 * the fourteen statuses, and that reasoning did not need to change — so rather
 * than rewrite them, storage is translated at the one boundary rows cross
 * (src/db/gigRows.ts). `preparing` and `acknowledged` do not survive a round
 * trip: they are In progress and Applied, which is what they always meant.
 */
export function gigStatusFromStored(row: StoredGigState): GigStatus {
  const status = row.status?.trim().toLowerCase() ?? ''
  if (!isGigStage(status)) return normaliseGigStatus(row.status)
  switch (status) {
    case 'new':
      return 'discovered'
    case 'in_progress':
      return 'shortlisted'
    case 'applied':
      return row.flag === 'reply_owed' ? 'info_requested' : row.flag === 'offer_pending' ? 'invited' : 'submitted'
    case 'closed':
      return FROM_OUTCOME[row.outcome as GigOutcome] ?? 'archived'
  }
}

/** What to write for a status: the stage, and the outcome and flag beside it. */
export function storedGigState(status: string | null | undefined): {
  status: GigStage
  outcome: GigOutcome | null
  flag: GigFlag | null
} {
  const s = normaliseGigStatus(status)
  return { status: gigStage(s), outcome: gigOutcome(s), flag: gigFlag(s) }
}
