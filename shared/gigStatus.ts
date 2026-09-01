/**
 * Where an opportunity is in the pipeline.
 *
 * The rule the whole vocabulary is built on: **the subject of the verb is
 * never in doubt.** `shortlisted` and `passed` are your decisions;
 * `invited` and `declined` are theirs. The old `approved`/`rejected` pair
 * failed exactly this test — `rejected` meant *you* passed, while every
 * reader assumed it meant *they* turned you down.
 *
 * `approved` in particular claimed too much. Saying yes here means "I am going
 * to apply", not "this is booked", and the app used to celebrate it by putting
 * a 🎵 on your calendar. See docs/gig-pipeline-plan.md.
 */

export type GigStatus =
  // Phase 1 — research & collect
  | 'discovered'
  // Phase 2 — present & review: your decision
  | 'shortlisted'
  | 'passed'
  // Phase 3 — apply & track
  | 'preparing'
  | 'submitted'
  // Phase 4 — post-submission: their decision
  | 'acknowledged'
  | 'info_requested'
  | 'invited'
  | 'declined'
  // Phase 5 — pre-show
  | 'booked'
  // Neither yes nor no
  | 'expired'
  | 'withdrawn'
  | 'archived'

export type GigPhase = 'collect' | 'review' | 'apply' | 'follow_up' | 'show' | 'closed'

/** Who the status is a statement about. Displayed, not just documented. */
export type Decider = 'app' | 'you' | 'them' | 'nobody'

export interface GigStatusMeta {
  label: string
  phase: GigPhase
  decider: Decider
  /** Nothing further will happen on its own. */
  terminal: boolean
  /** One line, for a tooltip and for the copy that explains a transition. */
  meaning: string
}

export const GIG_STATUS_META: Record<GigStatus, GigStatusMeta> = {
  discovered: {
    label: 'Discovered',
    phase: 'collect',
    decider: 'app',
    terminal: false,
    meaning: 'Found by research. Nobody has looked at it yet.',
  },
  shortlisted: {
    label: 'Will apply',
    phase: 'review',
    decider: 'you',
    terminal: false,
    meaning: 'You decided to apply. Nothing has been sent and nothing is booked.',
  },
  passed: {
    label: 'Passed',
    phase: 'review',
    decider: 'you',
    terminal: true,
    meaning: 'You decided not to apply. They never saw it.',
  },
  preparing: {
    label: 'Preparing',
    phase: 'apply',
    decider: 'you',
    terminal: false,
    meaning: 'The application is being put together.',
  },
  submitted: {
    label: 'Submitted',
    phase: 'apply',
    decider: 'you',
    terminal: false,
    meaning: 'Application sent. Waiting to hear back.',
  },
  acknowledged: {
    label: 'Acknowledged',
    phase: 'follow_up',
    decider: 'them',
    terminal: false,
    meaning: 'They confirmed they received it.',
  },
  info_requested: {
    label: 'They need more',
    phase: 'follow_up',
    decider: 'them',
    terminal: false,
    meaning: 'They asked a question. This one stalls until you answer.',
  },
  invited: {
    label: 'Invited',
    phase: 'follow_up',
    decider: 'them',
    terminal: false,
    meaning: 'They want you. Not a booking until the agreement is signed.',
  },
  declined: {
    label: 'Declined',
    phase: 'follow_up',
    decider: 'them',
    terminal: true,
    meaning: 'They said no.',
  },
  booked: {
    label: 'Booked',
    phase: 'show',
    decider: 'you',
    terminal: false,
    meaning: 'Agreed and signed. This is the only state that is a real date.',
  },
  expired: {
    label: 'Expired',
    phase: 'closed',
    decider: 'nobody',
    terminal: true,
    meaning: 'The window closed while it sat there.',
  },
  withdrawn: {
    label: 'Withdrawn',
    phase: 'closed',
    decider: 'you',
    terminal: true,
    meaning: 'You pulled out after applying.',
  },
  archived: {
    label: 'Archived',
    phase: 'closed',
    decider: 'you',
    terminal: true,
    meaning: 'Filed away.',
  },
}

/** Pipeline order, for pickers and for grouping a board by column. */
export const GIG_STATUSES = Object.keys(GIG_STATUS_META) as GigStatus[]

export const GIG_PHASE_LABELS: Record<GigPhase, string> = {
  collect: 'Collect',
  review: 'Review',
  apply: 'Apply',
  follow_up: 'Follow-up',
  show: 'Show',
  closed: 'Closed',
}

/**
 * Values written before the rename.
 *
 * Kept as a live mapping rather than being retired after the data migration:
 * the research agents that POST rows are outside this repo and will keep
 * sending `approved` until they are updated, and a row arriving under the old
 * name should still land in the right column rather than becoming a status
 * nothing recognises.
 */
export const LEGACY_GIG_STATUS: Record<string, GigStatus> = {
  pending_review: 'discovered',
  // The rename that motivated all of this. "Approved" never meant booked.
  approved: 'shortlisted',
  // Careful: this was *your* rejection, not theirs. It is `passed`, never
  // `declined`. Getting this backwards would rewrite history.
  rejected: 'passed',
  sent: 'submitted',
}

const KNOWN = new Set<string>(GIG_STATUSES)

/**
 * Best reading of whatever is in the column.
 *
 * Unknown values fall back to `discovered` rather than throwing: a status
 * nobody recognises means the row still needs a human, which is what
 * `discovered` says.
 */
export function normaliseGigStatus(raw: string | null | undefined): GigStatus {
  if (!raw) return 'discovered'
  const v = raw.trim().toLowerCase()
  if (KNOWN.has(v)) return v as GigStatus
  return LEGACY_GIG_STATUS[v] ?? 'discovered'
}

export function gigStatusMeta(raw: string | null | undefined): GigStatusMeta {
  return GIG_STATUS_META[normaliseGigStatus(raw)]
}

/** Settled: no further movement is expected without you doing something new. */
export function isGigSettled(raw: string | null | undefined): boolean {
  return GIG_STATUS_META[normaliseGigStatus(raw)].terminal
}

/**
 * Has an application actually gone out?
 *
 * Distinct from "settled". A shortlisted gig is unsettled *and* unsent; a
 * declined one is settled and was sent. Several screens need this question and
 * were previously answering it by listing status strings inline.
 */
export function hasBeenSubmitted(raw: string | null | undefined): boolean {
  const phase = GIG_STATUS_META[normaliseGigStatus(raw)].phase
  return phase === 'follow_up' || phase === 'show' || normaliseGigStatus(raw) === 'submitted'
}
