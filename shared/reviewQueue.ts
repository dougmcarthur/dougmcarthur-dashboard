/**
 * Builds the decision queue from the three entity lists.
 *
 * This runs in the Worker (`GET /api/review`) and is imported by the frontend
 * only for its types, so the Review screen and the Overview cannot disagree
 * about what needs a decision.
 *
 *
 * The queue deliberately does NOT key off the status column alone. In
 * production not one gig carries that status, not one sync target carries
 * `draft_ready`, and not one promo draft carries `draft` — so the Overview
 * page's "Needs review" section is permanently empty even though most rows
 * are, in fact, waiting on Doug. What actually records that state is the
 * prose in the note column ("Submission status: NOT submitted", "pending
 * Doug's review", "⚠️ PAID ENTRY"), so the queue is built from the parsed
 * note and the workflow status together.
 *
 * Where the two disagree — status says `submitted`, note says NOT submitted —
 * that contradiction is itself surfaced as the highest-priority flag rather
 * than quietly resolved in favour of either side.
 */

import { normaliseGigStatus, isGigSettled, hasBeenSubmitted, awaitsYourReply } from './gigStatus'
import type { GigOpportunity, SyncTarget, PromoDraft } from './types'
import { decisionFor, type Decision } from './decisionCopy'
import { visaLead } from './gigCost'
import { withStoredColumns } from './noteColumns'
import {
  parseNote,
  parseFee,
  parseDeadline,
  daysUntil,
  type ParsedNote,
  type ParsedFee,
  type ParsedDeadline,
  type AlertSeverity,
} from './reviewParse'

export type ReviewKind = 'gig' | 'sync' | 'promo'

export type FlagId =
  | 'conflict'
  | 'visa_risk'
  | 'reply_due'
  | 'no_reply'
  | 'overdue'
  | 'due_soon'
  | 'issue'
  | 'blocked'
  | 'paid'
  | 'not_submitted'
  | 'window'
  | 'vague_deadline'

/**
 * Whether a flag describes *where the item is* or *what is wrong with it*.
 *
 * The detail pane was showing both as identical chips, so "Not submitted yet"
 * (a state, and the normal one) sat beside "Flagged issue" (a problem) looking
 * equally alarming. They are different questions and belong in different places
 * on screen.
 */
export type FlagKind = 'state' | 'warning'

export interface ReviewFlag {
  id: FlagId
  label: string
  severity: AlertSeverity
  kind: FlagKind
}

export type ReviewSource =
  | { kind: 'gig'; row: GigOpportunity }
  | { kind: 'sync'; row: SyncTarget }
  | { kind: 'promo'; row: PromoDraft }

export interface ReviewItem {
  key: string
  kind: ReviewKind
  id: number
  title: string
  subtitle: string | null
  status: string
  url: string | null
  note: string | null
  parsed: ParsedNote
  fee: ParsedFee
  deadline: ParsedDeadline
  flags: ReviewFlag[]
  score: number
  /** Deferral state. An active snooze hides the item from every filter but "snoozed". */
  snooze: SnoozeState
  /** How long a sent application has gone unanswered. Null unless it was sent. */
  silence: SubmissionSilence | null
  /** The sentence and buttons for this item — see decisionCopy.ts. */
  decision: Decision
  source: ReviewSource
}

export type ReviewFilter =
  | 'needs'
  | 'conflict'
  | 'reply'
  | 'blocked'
  | 'paid'
  | 'timing'
  | 'waiting'
  | 'snoozed'
  | 'all'

export interface SnoozeState {
  /** ISO date this was deferred to, whether or not the snooze still holds. */
  until: string | null
  /** The snooze is holding: this item is out of every queue but "Snoozed". */
  active: boolean
  /** Set when a still-future snooze was broken by the row changing under it. */
  wokenByChange: boolean
  daysUntil: number | null
}

/**
 * Whether a snooze still holds.
 *
 * Two ways to stop holding. The date arrives — the ordinary case, and the
 * point of the feature. Or the row changes underneath it: a snooze is a
 * judgement about a set of facts ("nothing here needs me until September"),
 * and once a research run gives the row a deadline or a fee, that judgement
 * was made about a different item. Waking it is more useful than honouring a
 * date chosen against information that no longer applies.
 *
 * `snoozed_at` is written with the same timestamp as `updated_at` when the
 * snooze is set, so setting one does not immediately wake it. Any later write
 * pushes `updated_at` past it. Comparison is lexicographic, which is safe
 * here: both are ISO, and production's bare-date `updated_at` values sort
 * before same-day timestamps, so a legacy row reads as unchanged rather than
 * spuriously woken.
 */
function snoozeState(
  row: { snoozedUntil: string | null; snoozedAt: string | null; updatedAt: string },
  today: string,
): SnoozeState {
  const until = row.snoozedUntil
  if (!until) return { until: null, active: false, wokenByChange: false, daysUntil: null }

  const stillFuture = until.slice(0, 10) > today
  const changed = row.snoozedAt === null || row.updatedAt > row.snoozedAt

  return {
    until,
    active: stillFuture && !changed,
    wokenByChange: stillFuture && changed,
    daysUntil: daysUntil(until.slice(0, 10)),
  }
}

/** No snooze columns to consult — promo drafts, and anything else without them. */
const NO_SNOOZE: SnoozeState = { until: null, active: false, wokenByChange: false, daysUntil: null }

/**
 * Statuses that mean the workflow believes this item is finished.
 *
 * For gigs this is now a question about *phase*, not a list of strings: an
 * application has gone out once the row is past phase 3, whatever happened to
 * it afterwards. See shared/gigStatus.ts.
 */
const gigClaimsDone = (status: string): boolean =>
  hasBeenSubmitted(status) || normaliseGigStatus(status) === 'archived'
const SYNC_DONE = new Set(['pitched', 'sent', 'confirmed', 'declined', 'archived'])

const FLAG_WEIGHT: Record<FlagId, number> = {
  conflict: 100,
  // Above every deadline, below only a row that contradicts itself. A P-2
  // takes ninety days and no amount of wanting it changes that, so a short
  // lead time is a fact about whether the opportunity is possible at all —
  // which is a different class of thing from a deadline you can still meet.
  visa_risk: 97,
  // Above every deadline. An unanswered invitation or question is the only
  // thing in the queue where somebody outside is waiting on a reply, and a
  // deadline you miss costs you one opportunity where silence here costs you
  // the one they already said yes to.
  reply_due: 95,
  overdue: 90,
  // Below a live deadline, above a fee. A silent application is real work
  // that nothing else in the app will ever raise, but a deadline you can
  // still meet is worth more than one you are chasing an answer on.
  no_reply: 75,
  due_soon: 80,
  issue: 70,
  blocked: 55,
  paid: 45,
  not_submitted: 35,
  window: 20,
  vague_deadline: 10,
}

/**
 * How long an application has been out, and how sure we are of the date.
 *
 * `submitted_at` is written on the way into the submitted phase (migration
 * 0010), but every row that got there first carries a null and was
 * deliberately not backfilled — `updated_at` would have been a guess, and a
 * bad one, since any later edit to the row moves it forward and *shortens* the
 * silence it reports.
 *
 * So the fallback is used but never disguised. `exact` is false when the date
 * came from `updated_at`, and every surface that shows it says so — the same
 * rule `deadline` follows when a date is recovered from prose: a recovered
 * value must not look as certain as a recorded one.
 *
 * Returns null for anything that has not been sent. Nothing is silent that was
 * never spoken.
 */
export interface SubmissionSilence {
  /** ISO date the clock runs from. */
  since: string
  /** True when it came from `submitted_at` rather than from `updated_at`. */
  exact: boolean
  /** Whole days from `since` to `today`. Never negative. */
  days: number
}

export function submissionSilence(
  row: { status: string; submittedAt?: string | null; updatedAt: string },
  today: string,
): SubmissionSilence | null {
  const status = normaliseGigStatus(row.status)
  if (status !== 'submitted' && status !== 'acknowledged') return null

  const recorded = row.submittedAt ?? null
  const since = (recorded ?? row.updatedAt).slice(0, 10)
  return {
    since,
    exact: recorded !== null,
    // Clamped at zero: a row edited later today would otherwise read as
    // negative days of silence, which is not a thing.
    days: Math.max(0, -daysUntil(since, today)),
  }
}

/**
 * When silence starts being worth raising, and when it stops being a nudge.
 *
 * Festival and showcase panels commonly sit on applications for two to three
 * months, so anything shorter than six weeks would fire on every row that is
 * simply working as intended — and a nudge that is usually wrong is a nudge
 * you learn to scroll past. Ninety days is where "still deciding" stops being
 * the likeliest explanation.
 */
const NO_REPLY_DAYS = 45
const NO_REPLY_STALE_DAYS = 90

function flagsFor(
  kind: ReviewKind,
  status: string,
  parsed: ParsedNote,
  fee: ParsedFee,
  deadline: ParsedDeadline,
  silence: SubmissionSilence | null,
  // The row itself, for the questions no parsed shape answers. Null for
  // everything that is not a gig.
  gig: GigOpportunity | null,
  today: string,
): ReviewFlag[] {
  const flags: ReviewFlag[] = []
  const claimsDone = kind === 'gig' ? gigClaimsDone(status) : kind === 'sync' ? SYNC_DONE.has(status) : false

  // A hard constraint rather than a cost. The plan's rule: an application
  // whose deadline sits inside ninety days of a paid US performance is
  // flagged whatever it scores, because the paperwork cannot be hurried.
  if (gig) {
    const lead = visaLead(gig, today)
    if (lead && lead.short) {
      flags.push({
        id: 'visa_risk',
        label: lead.certain
          ? `P-2 needs ${lead.requirement.leadTimeDays} days; ${lead.daysAvailable} available`
          : `US date, ${lead.daysAvailable} days out — showcase or paid?`,
        severity: lead.certain ? 'danger' : 'warn',
        kind: 'warning',
      })
    }
  }

  // Phase 4, where they moved and you have not moved back. Named for what is
  // owed rather than for the status, because the two statuses owe different
  // things: one is a question to answer, the other an offer to accept.
  if (kind === 'gig' && awaitsYourReply(status)) {
    const invited = normaliseGigStatus(status) === 'invited'
    flags.push({
      id: 'reply_due',
      label: invited ? 'They invited you — reply' : 'They asked a question',
      severity: invited ? 'warn' : 'danger',
      kind: 'warning',
    })
  }

  if (claimsDone && parsed.submissionState === 'not_submitted') {
    flags.push({
      id: 'conflict',
      label: `Status says "${status.replace(/_/g, ' ')}", note says not submitted`,
      severity: 'danger',
      kind: 'warning',
    })
  } else if (parsed.submissionState === 'not_submitted') {
    // A state, not a warning: almost everything in the queue is unsubmitted,
    // and colouring the normal case as a problem is how a queue stops meaning
    // anything.
    flags.push({ id: 'not_submitted', label: 'Not submitted', severity: 'info', kind: 'state' })
  }

  // Silence, which nothing else in the app can raise. An application sitting
  // unanswered produces no note, no deadline and no status change — it is the
  // one thing in the pipeline whose signal is the absence of a signal.
  if (silence && silence.days >= NO_REPLY_DAYS) {
    const stale = silence.days >= NO_REPLY_STALE_DAYS
    flags.push({
      id: 'no_reply',
      // "about" carries the same weight it does on a recovered deadline: this
      // count is from `updated_at` on any row submitted before migration 0010,
      // and rounding that up into a confident number would be a small lie
      // repeated on every visit.
      label: `${silence.exact ? '' : 'About '}${silence.days} days, no reply`,
      severity: stale ? 'danger' : 'warn',
      kind: 'warning',
    })
  }

  if (deadline.daysUntil !== null) {
    if (deadline.daysUntil < 0) {
      flags.push({ id: 'overdue', label: `Deadline passed ${Math.abs(deadline.daysUntil)}d ago`, severity: 'danger', kind: 'warning' })
    } else if (deadline.daysUntil <= 14) {
      flags.push({
        id: 'due_soon',
        label: deadline.daysUntil === 0 ? 'Due today' : `Due in ${deadline.daysUntil}d`,
        severity: deadline.daysUntil <= 3 ? 'danger' : 'warn',
        kind: 'warning',
      })
    }
  }
  if (deadline.raw && !deadline.exact) {
    flags.push({ id: 'vague_deadline', label: 'Deadline not a real date', severity: 'info', kind: 'state' })
  }

  if (parsed.alerts.some((a) => a.severity === 'danger')) {
    flags.push({ id: 'issue', label: 'Flagged issue', severity: 'danger', kind: 'warning' })
  }
  if (parsed.blockers.length > 0 || parsed.draftedFields.some((f) => f.needsDoug)) {
    flags.push({ id: 'blocked', label: 'Needs you', severity: 'warn', kind: 'warning' })
  }
  if (fee.required) {
    flags.push({
      id: 'paid',
      // Named for the amount where there is one. "Costs money" told you nothing
      // the fee line below it did not already say.
      label: fee.amount ? `${fee.currency} ${fee.amount.toLocaleString()} to enter` : 'Entry fee',
      severity: 'warn',
      kind: 'warning',
    })
  }
  if (parsed.timing.length > 0) {
    flags.push({ id: 'window', label: 'Window opens later', severity: 'info', kind: 'state' })
  }

  return flags
}

function score(flags: ReviewFlag[], deadline: ParsedDeadline): number {
  const base = flags.reduce((max, f) => Math.max(max, FLAG_WEIGHT[f.id]), 0)
  // Tie-break on urgency so two equally-flagged items sort by how soon they bite.
  const urgency = deadline.daysUntil === null ? 0 : Math.max(0, 9 - Math.min(9, Math.abs(deadline.daysUntil) / 30))
  return base + urgency
}

function gigItem(row: GigOpportunity, today: string): Omit<ReviewItem, 'decision'> {
  // The columns first, the prose only where they are empty. Until this the
  // screen re-derived on every render, so a `submission_state` you corrected
  // by hand changed the database and nothing you could see.
  const parsed = withStoredColumns(parseNote(row.fitRationale ?? row.fitNotes), row)
  const fee = parseFee(row.fee, row.paid)
  const deadline = parseDeadline(row.deadline, {
    note: row.deadlineNote,
    opensAt: row.opensAt,
    today,
  })
  const silence = submissionSilence(row, today)
  const flags = flagsFor('gig', row.status, parsed, fee, deadline, silence, row, today)

  return {
    key: `gig-${row.id}`,
    silence,
    kind: 'gig',
    id: row.id,
    title: row.name,
    subtitle: row.type,
    status: row.status,
    url: row.url,
    note: row.fitRationale ?? row.fitNotes,
    parsed, fee, deadline, flags,
    score: score(flags, deadline),
    snooze: snoozeState(row, today),
    source: { kind: 'gig', row },
  }
}

function syncItem(row: SyncTarget, today: string): Omit<ReviewItem, 'decision'> {
  const parsed = withStoredColumns(parseNote(row.notes), {
    submissionMethod: row.confirmationMethod,
  })
  const fee = parseFee(null, 0)
  const deadline = parseDeadline(null)
  const flags = flagsFor('sync', row.status, parsed, fee, deadline, null, null, today)

  return {
    key: `sync-${row.id}`,
    silence: null,
    kind: 'sync',
    id: row.id,
    title: row.name,
    subtitle: row.agencyType ?? row.contactEmail,
    status: row.status,
    url: null,
    note: row.notes,
    parsed, fee, deadline, flags,
    score: score(flags, deadline),
    snooze: snoozeState(row, today),
    source: { kind: 'sync', row },
  }
}

function promoItem(row: PromoDraft): Omit<ReviewItem, 'decision'> {
  const parsed = parseNote(null)
  const fee = parseFee(null, 0)
  const deadline = parseDeadline(null)

  return {
    key: `promo-${row.id}`,
    kind: 'promo',
    silence: null,
    id: row.id,
    title: row.title,
    subtitle: row.month,
    status: row.status,
    url: null,
    note: null,
    parsed, fee, deadline,
    flags: row.status === 'draft'
      ? [{ id: 'not_submitted' as const, label: 'Not published', severity: 'info' as const, kind: 'state' as const }]
      : [],
    score: row.status === 'draft' ? FLAG_WEIGHT.not_submitted : 0,
    snooze: NO_SNOOZE,
    source: { kind: 'promo', row },
  }
}

export function buildReviewQueue(input: {
  gigs?: GigOpportunity[]
  sync?: SyncTarget[]
  promo?: PromoDraft[]
  /** Today, as YYYY-MM-DD. Injectable so snooze boundaries are testable. */
  today?: string
}): ReviewItem[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10)

  // Snoozed items stay IN the queue rather than being filtered out here. A
  // queue that hides things with no way to look at them is worse than one that
  // nags, so they are carried through, excluded from every filter but
  // "snoozed", and left visible and reversible there.
  return [
    ...(input.gigs ?? []).filter((g) => g.status !== 'archived').map((g) => gigItem(g, today)),
    ...(input.sync ?? []).filter((s) => s.status !== 'archived').map((s) => syncItem(s, today)),
    ...(input.promo ?? []).map(promoItem),
  ]
    // Copy is attached here rather than in each *Item builder so there is
    // exactly one place where an item and its sentence are joined.
    .map((item) => ({ ...item, decision: decisionFor(item) }))
    // Silence breaks ties rather than feeding `score`, which is banded: the
    // bands sit ten apart and an extra nine points of urgency could jump one.
    // As a tie-break it does the one job it is for — ordering the "waiting on
    // them" list longest-silent first, where nothing else distinguishes rows.
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.silence?.days ?? 0) - (a.silence?.days ?? 0) ||
        a.title.localeCompare(b.title),
    )
}

/**
 * Statuses that mean nobody owes this item anything further. Wider than
 * `gigClaimsDone` above, which answers a different question: a passed gig is
 * settled, but a passed gig whose note says "not submitted" is not a
 * contradiction.
 *
 * `submitted` counts as settled here even though it is not terminal — the ball
 * is with the organiser, and a queue that keeps surfacing applications you are
 * waiting on is a queue you stop reading.
 */
const gigSettled = (status: string): boolean =>
  // `awaitsYourReply` first: `info_requested` and `invited` are inside the
  // follow-up phase, so `hasBeenSubmitted` would otherwise file them under
  // "waiting on the organiser" — which is exactly backwards. They are the two
  // states where the organiser is waiting on you.
  !awaitsYourReply(status) && (isGigSettled(status) || hasBeenSubmitted(status))
const SYNC_SETTLED = new Set(['pitched', 'sent', 'confirmed', 'declined', 'archived'])

/** Deadline horizon for the time-critical strip. Matches the due_soon flag. */
const DUE_SOON_DAYS = 14

/**
 * How far ahead a window opening is worth showing. Sixty days because the
 * research runs are roughly monthly: at this horizon a window cannot open
 * without having appeared here on a previous visit first.
 */
const OPENING_DAYS = 60

export type TimingBand = 'overdue' | 'due_soon' | 'opening'

export interface TimingRow {
  key: string
  kind: ReviewKind
  id: number
  title: string
  band: TimingBand
  /** The date this row turns on: the deadline, or the day the window opens. */
  date: string
  daysUntil: number
  /** Set when the date was recovered from prose rather than read from a column. */
  approximate: boolean
}

export interface Backlog {
  /** Live items carrying no date of any kind — nothing will ever force these. */
  openEnded: number
  /** Of those, how many nobody has touched since the day they were found. */
  untouched: number
  /** Oldest discovery date among them, so the row can say how long it has been. */
  oldestDiscoveredAt: string | null
}

/**
 * Block F — findings that are wrong with the data itself, not with any
 * decision. Each is something the audit found and nothing in the UI could say.
 */
export interface DataHealth {
  /** Rows whose status and note flatly contradict each other. */
  conflicts: number
  /** Live rows whose `deadline` still holds prose instead of a date. */
  proseDeadlines: number
  /** Reminders pointing at an entity that no longer exists. */
  orphanedReminders: number
  /** True when there is nothing to report — the block hides itself. */
  clean: boolean
}

export interface QueueSummary {
  timing: TimingRow[]
  backlog: Backlog
  health: DataHealth
}

export function isSettled(item: ReviewItem): boolean {
  // A snoozed item is settled for now by the only measure these blocks care
  // about: it is not something to act on today.
  if (item.snooze.active) return true
  if (item.kind === 'gig') return gigSettled(item.status)
  if (item.kind === 'sync') return SYNC_SETTLED.has(item.status)
  return item.status !== 'draft'
}

function discovery(item: ReviewItem): { discoveredAt: string; updatedAt: string } | null {
  const { source } = item
  if (source.kind === 'promo') return null
  return { discoveredAt: source.row.discoveredAt, updatedAt: source.row.updatedAt }
}

/**
 * Blocks C and D of the Overview, computed here rather than in the browser so
 * the strip and the deck cannot disagree about what is urgent.
 *
 * Both are deliberately derived from the same items the deck deals. The old
 * "Deadlines in 14 days" panel ran its own SQL BETWEEN against a TEXT column
 * that mostly holds prose, so it matched nothing and rendered nothing, for
 * months, without ever looking broken.
 */
export function summariseQueue(
  items: ReviewItem[],
  /**
   * Counts the queue cannot see for itself. Orphaned reminders live in a table
   * `buildReviewQueue()` never reads, so the caller that has the binding
   * supplies the number rather than this module growing a data dependency.
   */
  extra: { orphanedReminders?: number } = {},
): QueueSummary {
  const timing: TimingRow[] = []

  for (const item of items) {
    if (isSettled(item)) continue
    const { date, daysUntil: days, opensAt, opensInDays, exact } = item.deadline

    if (date && days !== null && days <= DUE_SOON_DAYS) {
      timing.push({
        key: item.key, kind: item.kind, id: item.id, title: item.title,
        band: days < 0 ? 'overdue' : 'due_soon',
        date, daysUntil: days, approximate: !exact,
      })
    } else if (opensAt && opensInDays !== null && opensInDays >= 0 && opensInDays <= OPENING_DAYS) {
      // Only when there is no live deadline of its own: a row with both is
      // already listed above, and the deadline is the harder constraint.
      timing.push({
        key: item.key, kind: item.kind, id: item.id, title: item.title,
        band: 'opening',
        date: opensAt, daysUntil: opensInDays, approximate: !exact,
      })
    }
  }

  const BAND_ORDER: Record<TimingBand, number> = { overdue: 0, due_soon: 1, opening: 2 }
  timing.sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band] || a.daysUntil - b.daysUntil)

  const openEnded = items.filter(
    (i) => !isSettled(i) && i.deadline.date === null && i.deadline.opensAt === null && discovery(i) !== null,
  )

  // The two findings need different populations, which is easy to get wrong.
  //
  // A conflict is BY DEFINITION a row claiming to be finished while its note
  // says otherwise, so it must be counted over everything — filtering to
  // unsettled rows first discards every conflict there is.
  //
  // A prose deadline on a rejected gig, by contrast, is not worth anyone's
  // time. That one is counted over live rows only. Snoozed rows stay in both:
  // deferring a decision does not make a contradictory status correct.
  const conflicts = items.filter((i) => i.flags.some((f) => f.id === 'conflict')).length
  const proseDeadlines = items.filter(
    (i) => (!isSettled(i) || i.snooze.active) && i.deadline.raw !== null && !i.deadline.exact,
  ).length
  const orphanedReminders = extra.orphanedReminders ?? 0

  return {
    timing,
    health: {
      conflicts,
      proseDeadlines,
      orphanedReminders,
      clean: conflicts === 0 && proseDeadlines === 0 && orphanedReminders === 0,
    },
    backlog: {
      openEnded: openEnded.length,
      // Compared by calendar day, not by string: discovered_at is a bare date
      // while updated_at is sometimes a full timestamp, so an exact match
      // would report every row as touched.
      untouched: openEnded.filter((i) => {
        const d = discovery(i)!
        return d.updatedAt.slice(0, 10) === d.discoveredAt.slice(0, 10)
      }).length,
      oldestDiscoveredAt: openEnded.reduce<string | null>((oldest, i) => {
        const at = discovery(i)!.discoveredAt.slice(0, 10)
        return oldest === null || at < oldest ? at : oldest
      }, null),
    },
  }
}

/**
 * Is this item still waiting on a decision from you?
 *
 * Exported because the weekly digest has to ask the same question. It used to
 * ask its own version, so the email could promise rows the Review screen then
 * refused to show — a link to "3 drafted but never sent" landing on a filter
 * that had already excluded all three.
 *
 * A decision already made is not a decision outstanding: a passed gig keeps
 * every flag it had, because flags are parsed from a note that does not change
 * when you say no.
 *
 * A conflict is the deliberate exception, and the reason this is not a plain
 * `!isSettled` gate: a conflict *is* the claim that the status is wrong, so
 * trusting that status to exclude the item would hide the one case where the
 * status cannot be trusted.
 */
export function awaitingDecision(item: ReviewItem): boolean {
  if (item.snooze.active) return false
  if (item.flags.some((f) => f.id === 'conflict')) return true
  // The second exception, and for the same reason as the first. `isSettled`
  // calls a sent application settled — correctly, since the ball is with the
  // organiser and a queue that nags you about every one of those is a queue
  // you stop reading. But silence past `NO_REPLY_DAYS` is the case where that
  // stops being true: nothing will arrive to change the row, so waiting for
  // the queue to raise it on its own means waiting forever.
  if (item.flags.some((f) => f.id === 'no_reply')) return true
  // The third, and the only one that is about a date in the future rather
  // than a row's history. A visa lead time is a constraint the pipeline
  // cannot satisfy later: once a submitted application's show is inside
  // ninety days, "wait and see" has already made the decision.
  if (item.flags.some((f) => f.id === 'visa_risk')) return true
  return !isSettled(item) && item.flags.some((f) => f.id !== 'vague_deadline')
}

export function matchesFilter(item: ReviewItem, filter: ReviewFilter): boolean {
  // One gate, ahead of every predicate: a snoozed item is absent from the
  // whole app except the view that exists to show it. Putting this in each
  // case is how one filter eventually forgets.
  if (filter === 'snoozed') return item.snooze.active
  if (item.snooze.active) return false

  switch (filter) {
    case 'all':
      return true
    case 'needs':
      return awaitingDecision(item)
    case 'conflict':
      return item.flags.some((f) => f.id === 'conflict')
    case 'blocked':
      return item.flags.some((f) => f.id === 'blocked')
    case 'paid':
      return item.flags.some((f) => f.id === 'paid')
    case 'timing':
      return item.flags.some(
        (f) => f.id === 'overdue' || f.id === 'due_soon' || f.id === 'window' || f.id === 'visa_risk',
      )
    case 'reply':
      return item.flags.some((f) => f.id === 'reply_due')
    case 'waiting':
      return isAwaitingThem(item)
  }
}

/**
 * Sent, and nothing has come back.
 *
 * Not a flag, because nothing is wrong with it and nothing is owed by you —
 * which is precisely why it needed a home. Clicking "Applied" used to make a
 * gig vanish from every Review filter but "Everything", so the one question
 * you cannot answer from this screen was the obvious one: what have I applied
 * to and heard nothing about?
 *
 * `invited` and `info_requested` are deliberately excluded even though they
 * are also post-submission: they are in `reply` instead, because there the
 * silence is yours.
 */
export function isAwaitingThem(item: ReviewItem): boolean {
  if (item.snooze.active) return false
  if (item.kind === 'gig') {
    // Named, not derived. `booked` is also post-submission and also unsettled,
    // and it is the one status that is emphatically not a wait — the answer
    // came back yes and the date is real.
    const s = normaliseGigStatus(item.status)
    return s === 'submitted' || s === 'acknowledged'
  }
  if (item.kind === 'sync') return item.status === 'pitched' || item.status === 'sent'
  return false
}

export function countByFilter(items: ReviewItem[], filter: ReviewFilter): number {
  return items.filter((i) => matchesFilter(i, filter)).length
}
