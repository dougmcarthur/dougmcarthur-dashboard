/**
 * Builds the decision queue from the three entity lists.
 *
 * This runs in the Worker (`GET /api/review`) and is imported by the frontend
 * only for its types, so the Review screen and the Overview cannot disagree
 * about what needs a decision.
 *
 *
 * The queue deliberately does NOT key off `status = 'pending_review'`. In
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

import type { GigOpportunity, SyncTarget, PromoDraft } from './types'
import {
  parseNote,
  parseFee,
  parseDeadline,
  type ParsedNote,
  type ParsedFee,
  type ParsedDeadline,
  type AlertSeverity,
} from './reviewParse'

export type ReviewKind = 'gig' | 'sync' | 'promo'

export type FlagId =
  | 'conflict'
  | 'overdue'
  | 'due_soon'
  | 'issue'
  | 'blocked'
  | 'paid'
  | 'not_submitted'
  | 'window'
  | 'vague_deadline'

export interface ReviewFlag {
  id: FlagId
  label: string
  severity: AlertSeverity
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
  source: ReviewSource
}

export type ReviewFilter = 'needs' | 'conflict' | 'blocked' | 'paid' | 'timing' | 'all'

/** Statuses that mean the workflow believes this item is finished. */
const GIG_DONE = new Set(['submitted', 'archived'])
const SYNC_DONE = new Set(['pitched', 'sent', 'confirmed', 'declined', 'archived'])

const FLAG_WEIGHT: Record<FlagId, number> = {
  conflict: 100,
  overdue: 90,
  due_soon: 80,
  issue: 70,
  blocked: 55,
  paid: 45,
  not_submitted: 35,
  window: 20,
  vague_deadline: 10,
}

function flagsFor(
  kind: ReviewKind,
  status: string,
  parsed: ParsedNote,
  fee: ParsedFee,
  deadline: ParsedDeadline,
): ReviewFlag[] {
  const flags: ReviewFlag[] = []
  const claimsDone = kind === 'gig' ? GIG_DONE.has(status) : kind === 'sync' ? SYNC_DONE.has(status) : false

  if (claimsDone && parsed.submissionState === 'not_submitted') {
    flags.push({
      id: 'conflict',
      label: `Status says "${status.replace(/_/g, ' ')}", note says not submitted`,
      severity: 'danger',
    })
  } else if (parsed.submissionState === 'not_submitted') {
    flags.push({ id: 'not_submitted', label: 'Not submitted yet', severity: 'warn' })
  }

  if (deadline.daysUntil !== null) {
    if (deadline.daysUntil < 0) {
      flags.push({ id: 'overdue', label: `Deadline passed ${Math.abs(deadline.daysUntil)}d ago`, severity: 'danger' })
    } else if (deadline.daysUntil <= 14) {
      flags.push({
        id: 'due_soon',
        label: deadline.daysUntil === 0 ? 'Due today' : `Due in ${deadline.daysUntil}d`,
        severity: deadline.daysUntil <= 3 ? 'danger' : 'warn',
      })
    }
  }
  if (deadline.raw && !deadline.exact) {
    flags.push({ id: 'vague_deadline', label: 'Deadline not a real date', severity: 'info' })
  }

  if (parsed.alerts.some((a) => a.severity === 'danger')) {
    flags.push({ id: 'issue', label: 'Flagged issue', severity: 'danger' })
  }
  if (parsed.blockers.length > 0 || parsed.draftedFields.some((f) => f.needsDoug)) {
    flags.push({ id: 'blocked', label: 'Blocked on you', severity: 'warn' })
  }
  if (fee.required) {
    flags.push({
      id: 'paid',
      label: fee.amount ? `Costs ${fee.currency} ${fee.amount.toLocaleString()}` : 'Costs money',
      severity: 'warn',
    })
  }
  if (parsed.timing.length > 0) {
    flags.push({ id: 'window', label: 'Window opens later', severity: 'info' })
  }

  return flags
}

function score(flags: ReviewFlag[], deadline: ParsedDeadline): number {
  const base = flags.reduce((max, f) => Math.max(max, FLAG_WEIGHT[f.id]), 0)
  // Tie-break on urgency so two equally-flagged items sort by how soon they bite.
  const urgency = deadline.daysUntil === null ? 0 : Math.max(0, 9 - Math.min(9, Math.abs(deadline.daysUntil) / 30))
  return base + urgency
}

function gigItem(row: GigOpportunity): ReviewItem {
  const parsed = parseNote(row.fitRationale ?? row.fitNotes)
  const fee = parseFee(row.fee, row.paid)
  const deadline = parseDeadline(row.deadline)
  const flags = flagsFor('gig', row.status, parsed, fee, deadline)

  return {
    key: `gig-${row.id}`,
    kind: 'gig',
    id: row.id,
    title: row.name,
    subtitle: row.type,
    status: row.status,
    url: row.url,
    note: row.fitRationale ?? row.fitNotes,
    parsed, fee, deadline, flags,
    score: score(flags, deadline),
    source: { kind: 'gig', row },
  }
}

function syncItem(row: SyncTarget): ReviewItem {
  const parsed = parseNote(row.notes)
  const fee = parseFee(null, 0)
  const deadline = parseDeadline(null)
  const flags = flagsFor('sync', row.status, parsed, fee, deadline)

  return {
    key: `sync-${row.id}`,
    kind: 'sync',
    id: row.id,
    title: row.name,
    subtitle: row.agencyType ?? row.contactEmail,
    status: row.status,
    url: null,
    note: row.notes,
    parsed, fee, deadline, flags,
    score: score(flags, deadline),
    source: { kind: 'sync', row },
  }
}

function promoItem(row: PromoDraft): ReviewItem {
  const parsed = parseNote(null)
  const fee = parseFee(null, 0)
  const deadline = parseDeadline(null)

  return {
    key: `promo-${row.id}`,
    kind: 'promo',
    id: row.id,
    title: row.title,
    subtitle: row.month,
    status: row.status,
    url: null,
    note: null,
    parsed, fee, deadline,
    flags: row.status === 'draft' ? [{ id: 'not_submitted', label: 'Unapproved draft', severity: 'warn' }] : [],
    score: row.status === 'draft' ? FLAG_WEIGHT.not_submitted : 0,
    source: { kind: 'promo', row },
  }
}

export function buildReviewQueue(input: {
  gigs?: GigOpportunity[]
  sync?: SyncTarget[]
  promo?: PromoDraft[]
}): ReviewItem[] {
  return [
    ...(input.gigs ?? []).filter((g) => g.status !== 'archived').map(gigItem),
    ...(input.sync ?? []).filter((s) => s.status !== 'archived').map(syncItem),
    ...(input.promo ?? []).map(promoItem),
  ].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
}

export function matchesFilter(item: ReviewItem, filter: ReviewFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'needs':
      return item.flags.some((f) => f.id !== 'vague_deadline')
    case 'conflict':
      return item.flags.some((f) => f.id === 'conflict')
    case 'blocked':
      return item.flags.some((f) => f.id === 'blocked')
    case 'paid':
      return item.flags.some((f) => f.id === 'paid')
    case 'timing':
      return item.flags.some((f) => f.id === 'overdue' || f.id === 'due_soon' || f.id === 'window')
  }
}

export function countByFilter(items: ReviewItem[], filter: ReviewFilter): number {
  return items.filter((i) => matchesFilter(i, filter)).length
}
