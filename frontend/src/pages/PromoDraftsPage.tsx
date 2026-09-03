import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type PromoDraft } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { Chevron } from '../components/Chevron'
import { SkeletonList } from '../components/Skeleton'
import { FILTER } from '../components/ui/Field'
import { Button } from '../components/ui/Button'

/** "2026-09" is a key, not a label. */
function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  if (!y || !mo) return m
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}


export function PromoDraftsPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [statusFilter, setStatusFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')

  const { data = [], isLoading, error } = useQuery({
    queryKey: ['promo'],
    queryFn: api.promo.list,
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<PromoDraft> }) =>
      api.promo.patch(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promo'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.promo.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promo'] }),
  })

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Every draft is already on the client — this list is not paginated — so
  // filtering here costs nothing and responds instantly. Facets come from the
  // data rather than a hardcoded list, so no option is ever a dead click.
  const statuses = useMemo(
    () => [...new Set(data.map((d) => d.status))].sort(),
    [data],
  )
  const months = useMemo(
    () => [...new Set(data.map((d) => d.month).filter(Boolean))].sort().reverse(),
    [data],
  )

  const visible = data.filter(
    (d) =>
      (statusFilter === '' || d.status === statusFilter) &&
      (monthFilter === '' || d.month === monthFilter),
  )
  const filtered = statusFilter !== '' || monthFilter !== ''

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg border border-danger-line px-4 py-3 text-sm text-danger-fg">
        Failed to load promo drafts — {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold text-ink">Promo Drafts</h1>
        <div className="flex items-center gap-2">
          {statuses.length > 1 && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className={FILTER}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          )}
          {months.length > 1 && (
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              aria-label="Filter by month"
              className={FILTER}
            >
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          )}
          {filtered && (
            <Button variant="neutral"
              onClick={() => { setStatusFilter(''); setMonthFilter('') }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="bg-surface border border-line rounded-xl shadow-card divide-y divide-line">
          {visible.map((draft) => {
            const isOpen = expanded.has(draft.id)
            return (
              <div key={draft.id}>
                <div
                  onClick={() => toggleExpand(draft.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    isOpen ? 'bg-sunken' : 'hover:bg-sunken'
                  }`}
                >
                  <Chevron open={isOpen} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{draft.title}</p>
                    <p className="text-xs text-muted mt-0.5">{monthLabel(draft.month)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={draft.status} />
                    {draft.status === 'draft' && (
                      <Button variant="good" size="sm"
                        disabled={patchMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          patchMutation.mutate({ id: draft.id, body: { status: 'published' } })
                        }}
                      >
                        Publish
                      </Button>
                    )}
                    <button
                      disabled={deleteMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete "${draft.title}"?`)) deleteMutation.mutate(draft.id)
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-faint hover:text-danger-fg hover:bg-danger-bg disabled:opacity-40 transition-colors"
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="px-6 pb-5 pt-3 bg-sunken border-t border-line">
                    <p className="text-sm text-body leading-relaxed whitespace-pre-wrap">
                      {draft.content}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
          {visible.length === 0 && (
            <p className="px-4 py-12 text-center text-muted text-sm">
              {filtered ? 'No drafts match these filters.' : 'No promo drafts.'}
            </p>
          )}
        </div>
      )}

      {!isLoading && (
        <p className="text-xs text-muted tabular-nums">
          {filtered ? `${visible.length} of ${data.length} drafts` : `${data.length} drafts`}
        </p>
      )}
    </div>
  )
}
