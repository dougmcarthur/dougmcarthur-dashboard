const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  awaiting_window: 'bg-indigo-100 text-indigo-800',
  rejected: 'bg-red-100 text-red-800',
  submitted: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-100 text-gray-600',
  draft_ready: 'bg-purple-100 text-purple-800',
  pitched: 'bg-indigo-100 text-indigo-800',
  confirmed: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  draft: 'bg-yellow-100 text-yellow-800',
  published: 'bg-green-100 text-green-800',
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}
