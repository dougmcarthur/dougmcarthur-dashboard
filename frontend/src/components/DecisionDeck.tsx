import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigOpportunity, type SyncTarget, type PromoDraft } from '../api'
import type { ReviewItem } from '../../../shared/reviewQueue'
import type { DecisionIntent } from '../../../shared/decisionCopy'
import { KindTag } from './ReviewPanels'
import { SnoozeMenu } from './SnoozeMenu'

/**
 * One decision at a time, with the rest of the stack showing behind it.
 *
 * Order and copy both come from the server (`GET /api/review`), so this deck
 * and the Review screen can never disagree about what matters or how to
 * describe it. Acting on a card, or skipping it, deals the next one.
 */

/** An intent means the same thing everywhere; the status it maps to does not. */
const STATUS_BY_INTENT: Record<ReviewItem['kind'], Record<DecisionIntent, string>> = {
  gig: {
    confirm_sent: 'submitted',
    reopen: 'approved',
    approve: 'approved',
    pass: 'rejected',
    archive: 'archived',
    publish: 'submitted',
  },
  sync: {
    confirm_sent: 'pitched',
    reopen: 'draft_ready',
    approve: 'pitched',
    pass: 'declined',
    archive: 'archived',
    publish: 'pitched',
  },
  promo: {
    confirm_sent: 'published',
    reopen: 'draft',
    approve: 'approved',
    pass: 'draft',
    archive: 'draft',
    publish: 'published',
  },
}

function DeckShell({ children, head }: { children: React.ReactNode; head: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Decide these
        </h2>
        {head}
      </div>
      {children}
    </div>
  )
}

export function DecisionDeck({
  items,
  total,
  onNav,
}: {
  items: ReviewItem[]
  total: number
  onNav: (page: string) => void
}) {
  const qc = useQueryClient()
  const [index, setIndex] = useState(0)
  // Cards acted on stay out of the deck until the refetch lands, so the pile
  // never flashes the item you just dispatched back at you.
  const [settled, setSettled] = useState<Set<string>>(new Set())

  const remaining = items.filter((i) => !settled.has(i.key))
  const item = remaining[Math.min(index, Math.max(remaining.length - 1, 0))]

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['review'] })
    qc.invalidateQueries({ queryKey: ['overview'] })
    qc.invalidateQueries({ queryKey: ['gigs'] })
    qc.invalidateQueries({ queryKey: ['sync'] })
    qc.invalidateQueries({ queryKey: ['promo'] })
  }

  // Snooze goes through its own endpoint, not a status PATCH — the date and
  // the timestamp it is measured against have to be written together.
  const snooze = useMutation({
    mutationFn: ({ target, until }: { target: ReviewItem; until: string }) =>
      api.snooze({ kind: target.kind as 'gig' | 'sync', id: target.id, until }),
    onSuccess: invalidate,
  })

  const patch = useMutation({
    mutationFn: async ({ target, status }: { target: ReviewItem; status: string }): Promise<void> => {
      const body = { status }
      if (target.source.kind === 'gig') {
        await api.gigs.patch(target.id, body as Partial<GigOpportunity>)
      } else if (target.source.kind === 'sync') {
        await api.sync.patch(target.id, body as Partial<SyncTarget>)
      } else {
        await api.promo.patch(target.id, body as Partial<PromoDraft>)
      }
    },
    onSuccess: invalidate,
  })

  if (!item) {
    return (
      <DeckShell head={null}>
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-8 text-center">
          <p className="text-sm font-medium text-gray-700">Nothing needs a decision.</p>
          <p className="text-xs text-gray-500 mt-1">
            Anything still open is waiting on a date, not on you.{' '}
            <button onClick={() => onNav('review')} className="text-blue-600 hover:underline">
              Open the review queue
            </button>
          </p>
        </div>
      </DeckShell>
    )
  }

  const { decision } = item
  const severity = item.flags[0]?.severity ?? 'info'
  const stripe =
    severity === 'danger' ? 'border-t-red-500' : severity === 'warn' ? 'border-t-amber-400' : 'border-t-gray-300'

  const act = (intent: DecisionIntent) => {
    const status = STATUS_BY_INTENT[item.kind][intent]
    setSettled((prev) => new Set(prev).add(item.key))
    setIndex(0)
    patch.mutate({ target: item, status })
  }

  const defer = (until: string) => {
    setSettled((prev) => new Set(prev).add(item.key))
    setIndex(0)
    snooze.mutate({ target: item, until })
  }

  const position = items.length - remaining.length + 1

  return (
    <DeckShell
      head={
        <span className="text-xs text-gray-400 tabular-nums">
          {position} of {total} ·{' '}
          <button onClick={() => onNav('review')} className="text-blue-600 hover:underline">
            show the rest →
          </button>
        </span>
      }
    >
      <div className="relative pb-6">
        {remaining.length > 2 && (
          <div className="absolute inset-0 rounded-lg border border-gray-300 border-t-[3px] border-t-gray-300 bg-gray-100 translate-y-[20px] scale-x-[0.962]" />
        )}
        {remaining.length > 1 && (
          <div className="absolute inset-0 rounded-lg border border-gray-300 border-t-[3px] border-t-gray-300 bg-gray-50 translate-y-[10px] scale-x-[0.982]" />
        )}

        <div className={`relative rounded-lg border border-gray-200 border-t-[3px] ${stripe} bg-white p-5`}>
          <div className="flex items-center gap-2 mb-1.5">
            <KindTag kind={item.kind} />
            {item.flags[0] && (
              <span className="text-xs text-gray-400">{item.flags[0].label}</span>
            )}
            <span className="ml-auto text-xs text-gray-300 tabular-nums">
              {remaining.length} left
            </span>
          </div>

          <h3 className="text-base font-semibold text-gray-900 leading-snug">{item.title}</h3>
          <p className="mt-1.5 text-sm text-gray-600 leading-relaxed max-w-2xl">
            {decision.rationale}
          </p>

          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
            {decision.actions.map((a) => (
              <button
                key={a.intent + a.label}
                onClick={() => act(a.intent)}
                disabled={patch.isPending}
                className={`text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40 transition-colors ${
                  a.tone === 'go'
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-white border border-red-200 text-red-600 hover:bg-red-50'
                }`}
              >
                {a.label}
              </button>
            ))}
            <button
              onClick={() => onNav('review')}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Details
            </button>
            {/* Promo drafts have no snooze columns — a monthly draft defers by
                being a different month, not by a date on the row. */}
            {item.kind !== 'promo' && (
              <SnoozeMenu item={item} onPick={defer} disabled={snooze.isPending} />
            )}
            <button
              onClick={() => setIndex((i) => (i + 1) % Math.max(remaining.length, 1))}
              disabled={remaining.length < 2}
              className="ml-auto text-xs px-3 py-1.5 rounded-md text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors"
            >
              Skip →
            </button>
          </div>

          {(patch.isError || snooze.isError) && (
            <p className="mt-2 text-xs text-red-600">
              Could not save that —{' '}
              {((patch.error ?? snooze.error) as Error).message}
            </p>
          )}
        </div>
      </div>
    </DeckShell>
  )
}
