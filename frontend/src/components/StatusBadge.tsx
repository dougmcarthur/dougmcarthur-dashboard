/**
 * Clay is reserved for things that went wrong.
 *
 * `pending_review` and `draft` used to be clay, which made every unfinished
 * piece of work look like a failure — and once everything is a warning, the
 * real ones stop registering. Waiting on you is neutral; only rejected,
 * declined and failed are clay.
 */
import { flagLabel, gigFlag, gigOutcome, gigStage, gigStageLabel } from '../../../shared/gigStage'

const STATUS_COLORS: Record<string, string> = {
  // Gig pipeline. Green is reserved for the two states that are genuinely
  // good news — they invited you, and it is booked. Saying you will apply is
  // not an achievement, so `shortlisted` is neutral.
  discovered: 'bg-raised text-ink border border-line-strong',
  shortlisted: 'bg-raised text-ink border border-line-strong',
  passed: 'bg-sunken text-muted',
  preparing: 'bg-raised text-ink border border-line-strong',
  acknowledged: 'bg-info-bg text-info-fg',
  info_requested: 'bg-danger-bg text-danger-fg',
  invited: 'bg-success-bg text-success-fg',
  booked: 'bg-success-bg text-success-fg',
  expired: 'bg-sunken text-muted',
  withdrawn: 'bg-sunken text-muted',

  pending_review: 'bg-raised text-ink border border-line-strong',
  approved: 'bg-success-bg text-success-fg',
  submitted: 'bg-info-bg text-info-fg',
  archived: 'bg-sunken text-body',
  draft_ready: 'bg-cat-violet-bg text-cat-violet-fg',
  pitched: 'bg-info-bg text-info-fg',
  confirmed: 'bg-success-bg text-success-fg',
  // A no is an outcome, not an error. Clay here would make every festival
  // that passed on you look like something broke.
  declined: 'bg-sunken text-muted',
  rejected: 'bg-sunken text-muted',
  draft: 'bg-raised text-ink border border-line-strong',
  published: 'bg-success-bg text-success-fg',

  // Task-run outcomes. Without these the History page fell through to the
  // neutral default, which in dark mode is a badge you cannot see at all.
  success: 'bg-success-bg text-success-fg',
  ok: 'bg-success-bg text-success-fg',
  partial: 'bg-raised text-ink border border-line-strong',
  failed: 'bg-danger-bg text-danger-fg',
  error: 'bg-danger-bg text-danger-fg',
}

/**
 * A gig renders as its stage, never its stored status.
 *
 * Four stages, not fourteen statuses — see shared/gigStage.ts. A closed gig
 * shows its outcome instead of the word "Closed", because "Closed" alone makes
 * you open the row to learn whether it was good news. Green is kept for the
 * one outcome that is: accepted. An offer is shown as a flag beside Applied,
 * in green too but as a flag — it is exciting and it is not a booking.
 */
const STAGE_COLORS = {
  new: 'bg-raised text-ink border border-line-strong',
  in_progress: 'bg-raised text-ink border border-line-strong',
  applied: 'bg-info-bg text-info-fg',
  closed: 'bg-sunken text-muted',
  accepted: 'bg-success-bg text-success-fg',
}

const FLAG_COLORS = {
  reply_owed: 'bg-danger-bg text-danger-fg',
  offer_pending: 'bg-success-bg text-success-fg',
}

const PILL = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'

export function StatusBadge({ status, kind, gigType }: { status: string; kind?: 'gig'; gigType?: string | null }) {
  if (kind === 'gig') {
    const stage = gigStage(status)
    const shown = gigStageLabel(status)
    const flag = gigFlag(status)
    const color = gigOutcome(status) === 'accepted' ? STAGE_COLORS.accepted : STAGE_COLORS[stage]
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span title={shown.meaning} className={`${PILL} ${color}`}>
          {shown.label}
        </span>
        {flag && <span className={`${PILL} ${FLAG_COLORS[flag]}`}>{flagLabel(flag, gigType)}</span>}
      </span>
    )
  }

  const color = STATUS_COLORS[status] ?? 'bg-sunken text-body'
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
