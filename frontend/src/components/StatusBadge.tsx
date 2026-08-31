/**
 * Clay is reserved for things that went wrong.
 *
 * `pending_review` and `draft` used to be clay, which made every unfinished
 * piece of work look like a failure — and once everything is a warning, the
 * real ones stop registering. Waiting on you is neutral; only rejected,
 * declined and failed are clay.
 */
const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-raised text-ink border border-line-strong',
  approved: 'bg-success-bg text-success-fg',
  rejected: 'bg-danger-bg text-danger-fg',
  submitted: 'bg-info-bg text-info-fg',
  archived: 'bg-sunken text-body',
  draft_ready: 'bg-cat-violet-bg text-cat-violet-fg',
  pitched: 'bg-info-bg text-info-fg',
  confirmed: 'bg-success-bg text-success-fg',
  declined: 'bg-danger-bg text-danger-fg',
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

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-sunken text-body'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
