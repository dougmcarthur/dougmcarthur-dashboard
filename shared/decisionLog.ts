/**
 * The decision log: what an artist chose, and what the screen showed them when
 * they chose it.
 *
 * A gig's `status` says where it ended up. It does not say what the artist was
 * looking at: a gig passed on because it closed in a week and one passed on
 * because it cost $2,400 to reach are the same row afterwards, and the
 * deadline was a week away *then*. Scoring opportunities for an artist — and
 * finding out afterwards whether a score was any good — needs the second kind
 * of fact, and it cannot be reconstructed. That is why this is written before
 * anything reads it: `docs/gig-pipeline-plan.md` §8 asks for "the score at
 * decision time" to be stored, and a decision that was not stored has no
 * score to store.
 *
 * Three rules this module exists to hold.
 *
 * **The snapshot is built from the row by name, never by spread.** Every field
 * of `context` is written out below, so a column added to `gig_opportunities`
 * next year cannot find its way into a log nobody is watching. Notes, drafts,
 * the artist's own words and every contact address are absent by construction,
 * which is what lets the log be kept for as long as the account exists and
 * deleted with it.
 *
 * **It is derived with the same functions the screen used.** The flags are the
 * review queue's, the deadline is `parseDeadline`'s, the cost is
 * `estimateGigCost`'s — so "what the screen showed" is what those functions
 * say about the row, not a second opinion about it. A missing input stays
 * missing: no cost range is not a zero, and `unknowns` counts what could not
 * be counted.
 *
 * **A step is not a choice.** `via` records which door the move came through,
 * and `isChoice` says which doors an artist deciding something walks through.
 * Starting an application after having said yes follows a choice already made,
 * and a research agent PATCHing a row is not the artist at all. A learner that
 * counted either would learn the pipeline rather than the person.
 *
 * Pure: no clock, no database. `today` is an argument, like `buildReviewQueue`.
 */

import { gigOutcome, gigStage, type GigOutcome, type GigStage } from './gigStage'
import { estimateGigCost } from './gigCost'
import { buildReviewQueue, type FlagId } from './reviewQueue'
import { gigCategory, syncCategory, type CatalogCategory } from './opportunityCatalog'
import type { GigOpportunity, SyncTarget } from './types'

/** Bumped when a field changes meaning, so a reader can tell what it holds. */
export const DECISION_CONTEXT_VERSION = 1

export type DecisionEntity = 'gig' | 'sync'

/**
 * `move` is a status change. `snooze` and `wake` are deferring an item and
 * bringing it back. `remove` is deleting the row, which is the one move whose
 * subject disappears — so it is also the one whose snapshot cannot be
 * recovered later.
 */
export type DecisionAction = 'move' | 'snooze' | 'wake' | 'remove'

export type DecisionVia =
  | 'gig_patch'
  | 'gig_delete'
  | 'snooze'
  | 'application_start'
  | 'sync_patch'
  | 'sync_reconcile'

export type DecisionActor = 'user' | 'agent'

/** Longest a stored name or note may be. Listing facts are short; prose is not kept. */
const NAME_MAX = 160
const NOTE_MAX = 80

function clip(value: string | null | undefined, max: number): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, max) : null
}

export interface GigDecisionContext {
  v: typeof DECISION_CONTEXT_VERSION
  kind: 'gig'
  name: string
  type: string | null
  category: CatalogCategory
  /** The stage the row was in *before* this move. */
  stage: GigStage
  deadline: {
    /** ISO date, whether the column held one or it was recovered from prose. */
    date: string | null
    /** The column held a clean date. False means recovered, and `daysLeft` is as sure as that. */
    exact: boolean
    daysLeft: number | null
    note: string | null
  }
  opensInDays: number | null
  fee: { amount: number | null; currency: string | null; paidFlag: boolean }
  place: { location: string | null; country: string | null }
  /**
   * What the trip nets, as a range, from `estimateGigCost`. Null when no line
   * could be counted at all. `unknowns` is how many inputs it could not count,
   * and `inferred` says a band was guessed — a cost with unknowns is a floor.
   */
  cost: { low: number; high: number; unknowns: number; inferred: boolean } | null
  /** The review queue's flags for this row, as the screen derived them. */
  flags: FlagId[]
  /** The 1–5 fit the row carried, which most rows do not. Null is not "poor". */
  fit: number | null
  /** How long a sent application had gone unanswered, when it was one. */
  silenceDays: number | null
  /**
   * Reserved for the score the row had when it was decided. Always null until
   * opportunities are scored; present so the day they are, the field already
   * exists on every row that follows and its absence on older ones is
   * unambiguous.
   */
  score: number | null
}

export interface SyncDecisionContext {
  v: typeof DECISION_CONTEXT_VERSION
  kind: 'sync'
  name: string
  category: CatalogCategory
  agencyType: string | null
  status: string
  flags: FlagId[]
  /** A pitch was drafted. The draft itself is never kept. */
  hasPitch: boolean
  score: number | null
}

export type DecisionContext = GigDecisionContext | SyncDecisionContext

/** The row as the code reads it: `status` in the fourteen-value vocabulary. */
export function gigDecisionContext(row: GigOpportunity, today: string): GigDecisionContext {
  const item = buildReviewQueue({ gigs: [row], today })[0]
  const estimate = estimateGigCost(row)

  return {
    v: DECISION_CONTEXT_VERSION,
    kind: 'gig',
    name: clip(row.name, NAME_MAX) ?? 'Untitled',
    type: clip(row.type, 60),
    category: gigCategory(row.type),
    stage: gigStage(row.status),
    deadline: {
      date: item?.deadline.date ?? null,
      exact: item?.deadline.exact ?? false,
      daysLeft: item?.deadline.daysUntil ?? null,
      note: clip(row.deadlineNote ?? item?.deadline.note, NOTE_MAX),
    },
    opensInDays: item?.deadline.opensInDays ?? null,
    fee: {
      amount: typeof row.feeAmount === 'number' && Number.isFinite(row.feeAmount) ? row.feeAmount : null,
      currency: row.feeAmount ? clip(row.feeCurrency, 3) : null,
      paidFlag: row.paid === 1,
    },
    place: { location: clip(row.location, 120), country: clip(row.country, 20) },
    cost:
      estimate.lines.length > 0
        ? {
            low: estimate.net.low,
            high: estimate.net.high,
            unknowns: estimate.unknowns.length,
            inferred: estimate.anyInferred,
          }
        : null,
    flags: item?.flags.map((f) => f.id) ?? [],
    fit: row.genreFitScore ?? null,
    silenceDays: item?.silence?.days ?? null,
    score: null,
  }
}

export function syncDecisionContext(row: SyncTarget, today: string): SyncDecisionContext {
  const item = buildReviewQueue({ sync: [row], today })[0]
  return {
    v: DECISION_CONTEXT_VERSION,
    kind: 'sync',
    name: clip(row.name, NAME_MAX) ?? 'Untitled',
    category: syncCategory(row.agencyType),
    agencyType: clip(row.agencyType, 60),
    status: clip(row.status, 40) ?? 'unknown',
    flags: item?.flags.map((f) => f.id) ?? [],
    hasPitch: Boolean(row.pitchDraft && row.pitchDraft.trim()),
    score: null,
  }
}

/**
 * Read a stored context back. Null for anything this build does not
 * recognise — an unreadable or newer-version context is "we cannot say what
 * the screen showed", which is a different claim from an empty one.
 */
export function parseDecisionContext(raw: string | null | undefined): DecisionContext | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const v = value as { v?: unknown; kind?: unknown }
  if (v.v !== DECISION_CONTEXT_VERSION) return null
  if (v.kind !== 'gig' && v.kind !== 'sync') return null
  return value as DecisionContext
}

export interface DecisionInput {
  entity: DecisionEntity
  entityId: number
  /** The catalog entry the row was linked to, when it was. */
  opportunityId: number | null
  action: DecisionAction
  /** The status either side of a move, in the fourteen-value vocabulary. */
  from?: string | null
  /** For a move, the status; for a snooze, the date it comes back on. */
  to?: string | null
  via: DecisionVia
  actor: DecisionActor
  context: DecisionContext
  /** ISO datetime of the move. */
  at: string
}

/** The columns of one log row, without the tenant — `withTenant` adds that. */
export interface DecisionRowValues {
  entityType: DecisionEntity
  entityId: number
  opportunityId: number | null
  action: DecisionAction
  fromValue: string | null
  toValue: string | null
  toStage: GigStage | null
  toOutcome: GigOutcome | null
  via: DecisionVia
  actor: DecisionActor
  context: string
  decidedAt: string
}

/**
 * One input as the values of a row.
 *
 * The stage and outcome are filled for a *gig* move only. A sync target has
 * no stages, and putting one in would be a claim the data does not make.
 */
export function decisionRow(input: DecisionInput): DecisionRowValues {
  const gigMove = input.entity === 'gig' && input.action === 'move' && input.to
  return {
    entityType: input.entity,
    entityId: input.entityId,
    opportunityId: input.opportunityId,
    action: input.action,
    fromValue: input.from ?? null,
    toValue: input.to ?? null,
    toStage: gigMove ? gigStage(input.to) : null,
    toOutcome: gigMove ? gigOutcome(input.to) : null,
    via: input.via,
    actor: input.actor,
    context: JSON.stringify(input.context),
    decidedAt: input.at,
  }
}

/**
 * Whether a move is the artist *deciding something*, as opposed to a step
 * after a decision or a machine's move.
 *
 * `sync_reconcile` counts: the artist previewed what the mailbox suggested and
 * pressed apply, which is a confirmation of a fact rather than a choice about
 * an opportunity — but it is also the artist's own act, and leaving it out
 * would mean a pitch sent never appears. A reader that wants only the
 * choices-about-opportunities filters on `action` and `to_stage` as well.
 */
export function isChoice(entry: { via: DecisionVia | string; actor: DecisionActor | string }): boolean {
  return entry.actor === 'user' && entry.via !== 'application_start'
}
