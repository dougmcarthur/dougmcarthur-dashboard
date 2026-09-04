import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigOpportunity, type SyncTarget, type PromoDraft } from '../api'
import { SkeletonList } from '../components/Skeleton'
import type { ReviewFilter } from '../../../shared/reviewQueue'
import { QueueRow } from './review/QueueRow'
import { Detail } from './review/Detail'

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: 'needs', label: 'Needs a decision' },
  { id: 'conflict', label: 'Conflicts' },
  { id: 'blocked', label: 'Needs you' },
  { id: 'paid', label: 'Entry fee' },
  { id: 'timing', label: 'Timing' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'all', label: 'Everything' },
]


// ── Page ──────────────────────────────────────────────────────────────────────

const isFilter = (v: string | null): v is ReviewFilter =>
  v !== null && FILTERS.some((f) => f.id === v)

export function ReviewPage({ initialFilter }: { initialFilter?: string | null }) {
  const qc = useQueryClient()
  // `#review/conflict` opens on that filter; an unknown segment falls back
  // rather than showing an empty queue for a filter that does not exist.
  const [filter, setFilter] = useState<ReviewFilter>(
    isFilter(initialFilter ?? null) ? (initialFilter as ReviewFilter) : 'needs',
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // The queue is built by the Worker (GET /api/review) so this screen and the
  // Overview share one definition of what needs a decision. Filtering happens
  // server-side too; `counts` always covers the whole queue.
  const { data, isLoading, error } = useQuery({
    queryKey: ['review', filter],
    queryFn: () => api.review({ filter }),
  })

  const visible = data?.items ?? []
  const counts = data?.counts

  const selected = visible.find((i) => i.key === selectedKey) ?? visible[0] ?? null

  // Keep a valid selection as the filter narrows the queue.
  useEffect(() => {
    if (selected && selected.key !== selectedKey) setSelectedKey(selected.key)
  }, [selected, selectedKey])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['review'] })
    qc.invalidateQueries({ queryKey: ['gigs'] })
    qc.invalidateQueries({ queryKey: ['sync'] })
    qc.invalidateQueries({ queryKey: ['promo'] })
    qc.invalidateQueries({ queryKey: ['overview'] })
  }

  const patchGig = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<GigOpportunity> }) => api.gigs.patch(id, body),
    onSuccess: invalidate,
  })
  const patchSync = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<SyncTarget> }) => api.sync.patch(id, body),
    onSuccess: invalidate,
  })
  const patchPromo = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<PromoDraft> }) => api.promo.patch(id, body),
    onSuccess: invalidate,
  })
  const snooze = useMutation({
    mutationFn: ({ kind, id, until }: { kind: 'gig' | 'sync'; id: number; until: string | null }) =>
      api.snooze({ kind, id, until }),
    onSuccess: invalidate,
  })
  const isSaving =
    patchGig.isPending || patchSync.isPending || patchPromo.isPending || snooze.isPending

  // j / k step through the queue without leaving the keyboard.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.key !== 'j' && e.key !== 'k') return

      const index = visible.findIndex((i) => i.key === selected?.key)
      const next = e.key === 'j' ? index + 1 : index - 1
      if (next >= 0 && next < visible.length) setSelectedKey(visible[next].key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, selected])

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg border border-danger-line px-4 py-3 text-sm text-danger-fg">
        Failed to load the review queue — {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold text-ink">Review</h1>
        <p className="text-xs text-muted">
          {/* Snoozed items are excluded from `all`, so "n of all" would count
              the shown item against a total it is not part of. */}
          {filter === 'snoozed'
            ? `${visible.length} snoozed`
            : `${visible.length} of ${counts?.all ?? 0} items`}{' '}
          · <kbd className="font-semibold">j</kbd>/<kbd className="font-semibold">k</kbd> to move
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = counts?.[f.id] ?? 0
          const active = filter === f.id
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'bg-accent text-accent-fg' : 'bg-surface border border-line text-body hover:bg-sunken'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 text-xs ${active ? 'text-faint' : 'text-muted'}`}>{count}</span>
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface shadow-card px-4 py-12 text-center text-sm text-muted">
          {filter === 'snoozed'
            ? 'Nothing is snoozed. Deferred items wait here until their date, so none of them are hidden.'
            : 'Nothing in this queue.'}
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-line bg-surface shadow-card divide-y divide-line">
            {visible.map((item) => (
              <QueueRow
                key={item.key}
                item={item}
                active={item.key === selected?.key}
                onSelect={() => setSelectedKey(item.key)}
              />
            ))}
          </div>

          {selected && (
            <Detail
              key={selected.key}
              item={selected}
              isSaving={isSaving}
              onGig={(body) => patchGig.mutate({ id: selected.id, body })}
              onSync={(body) => patchSync.mutate({ id: selected.id, body })}
              onPromo={(body) => patchPromo.mutate({ id: selected.id, body })}
              onSnooze={(until) =>
                snooze.mutate({ kind: selected.kind as 'gig' | 'sync', id: selected.id, until })
              }
            />
          )}
        </div>
      )}
    </div>
  )
}
