const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-warn-bg text-warn-fg',
  approved: 'bg-success-bg text-success-fg',
  rejected: 'bg-danger-bg text-danger-fg',
  submitted: 'bg-info-bg text-info-fg',
  archived: 'bg-sunken text-body',
  draft_ready: 'bg-cat-violet-bg text-cat-violet-fg',
  pitched: 'bg-info-bg text-info-fg',
  confirmed: 'bg-success-bg text-success-fg',
  declined: 'bg-danger-bg text-danger-fg',
  draft: 'bg-warn-bg text-warn-fg',
  published: 'bg-success-bg text-success-fg',
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-sunken text-body'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
