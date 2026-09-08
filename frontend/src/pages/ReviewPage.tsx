import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigOpportunity, type SyncTarget, type PromoDraft } from '../api'
import { SkeletonList } from '../components/Skeleton'
import type { ReviewFilter } from '../../../shared/reviewQueue'
import { QueueRow } from './review/QueueRow'
import { Detail } from './review/Detail'

/**
 * The filters, and why they are worded the way they are.
 *
 * "Needs a decision" and "Needs you" sat next to each other and read as the
 * same sentence, which made the second one useless — it means the narrower
 * thing, that a fact is missing before the application can be finished. And
 * "Conflicts" read as a double-booking; it is a row whose status and note say
 * opposite things.
 *
 * `hint` is the title text. A chip has room for two words and these
 * distinctions are worth more than two words.
 */
const FILTERS: Array<{ id: ReviewFilter; label: string; hint: string }> = [
  { id: 'needs', label: 'Needs a decision', hint: 'Everything waiting on a call from you.' },
  {
    id: 'reply',
    label: 'Reply owed',
    hint: 'They invited you or asked a question. Nothing moves until you answer.',
  },
  {
    id: 'conflict',
    label: 'Contradictions',
    hint: 'The status and the note say opposite things about whether this was sent.',
  },
  {
    id: 'blocked',
    label: 'Missing details',
    hint: 'The application cannot be finished until you supply something.',
  },
  { id: 'paid', label: 'Entry fee', hint: 'Costs money to enter, so it needs your say-so.' },
  { id: 'timing', label: 'Timing', hint: 'A deadline is close or past, or a window opens soon.' },
  {
    id: 'waiting',
    label: 'Waiting on them',
    hint: 'Applied, and nothing has come back. Nothing is owed by you.',
  },
  { id: 'snoozed', label: 'Snoozed', hint: 'Deferred until a date you chose.' },
  { id: 'all', label: 'Everything', hint: 'The whole queue, minus anything snoozed.' },
]


/** What an empty queue means, which differs per filter and is worth saying. */
const EMPTY: Partial<Record<ReviewFilter, string>> = {
  snoozed: 'Nothing is snoozed. Deferred items wait here until their date, so none of them are hidden.',
  reply: 'Nobody is waiting on a reply from you.',
  waiting: 'Nothing is out with an organiser. Anything applied to has already come back.',
  conflict: 'No row contradicts itself — every status agrees with its note.',
  needs: 'Nothing needs a decision. Anything still open is waiting on a date, not on you.',
}

// ── Page ──────────────────────────────────────────────────────────────────────

const isFilter = (v: string | null): v is ReviewFilter =>
  v !== null && FILTERS.some((f) => f.id === v)

export function ReviewPage({ initialFilter }: { initialFilter?: string | null }) {
  const qc = useQueryClient()
  // The route argument is either a filter (`#review/conflict`) or one item's
  // key (`#review/gig-12`, which is what the Overview deck links to when you
  // open a card). An item arrives on "Everything" rather than on a filter that
  // might not contain it — landing on a queue that does not include the row
  // you asked for is the one outcome a deep link must not have.
  const arg = initialFilter ?? null
  const deepLinked = arg !== null && !isFilter(arg) ? arg : null
  const [filter, setFilter] = useState<ReviewFilter>(
    isFilter(arg) ? arg : deepLinked ? 'all' : 'needs',
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(deepLinked)

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

  // The PATCH route refuses a move the pipeline does not offer, and this
  // screen used to swallow the 400 whole: the button greyed, ungreyed, and
  // nothing happened. The bar no longer *renders* an illegal move, so this
  // should now only fire on a genuine failure — which is exactly when it needs
  // to be visible.
  const saveError = (patchGig.error ?? patchSync.error ?? patchPromo.error ?? snooze.error) as
    | Error
    | null

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
              title={f.hint}
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

      {saveError && (
        <div className="rounded-lg bg-danger-bg border border-danger-line px-4 py-2.5 text-sm text-danger-fg">
          That change was refused — {saveError.message}
        </div>
      )}

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface shadow-card px-4 py-12 text-center text-sm text-muted">
          {EMPTY[filter] ?? 'Nothing in this queue.'}
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
