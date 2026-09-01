/**
 * Clay is reserved for things that went wrong.
 *
 * `pending_review` and `draft` used to be clay, which made every unfinished
 * piece of work look like a failure — and once everything is a warning, the
 * real ones stop registering. Waiting on you is neutral; only rejected,
 * declined and failed are clay.
 */
import { GIG_STATUS_META, normaliseGigStatus } from '../../../shared/gigStatus'

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
 * Gig statuses render through their own vocabulary.
 *
 * Two things the raw string cannot do: `shortlisted` reads as jargon where
 * "Will apply" says the thing, and a legacy `approved` row would otherwise
 * show a word the pipeline no longer uses. The tooltip carries who decided,
 * because that is the distinction the whole rename exists to protect.
 */
export function StatusBadge({ status, kind }: { status: string; kind?: 'gig' }) {
  if (kind === 'gig') {
    const key = normaliseGigStatus(status)
    const meta = GIG_STATUS_META[key]
    return (
      <span
        title={`${meta.meaning}${meta.decider === 'them' ? ' (their decision)' : ''}`}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          STATUS_COLORS[key] ?? 'bg-sunken text-body'
        }`}
      >
        {meta.label}
      </span>
    )
  }

  const color = STATUS_COLORS[status] ?? 'bg-sunken text-body'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
