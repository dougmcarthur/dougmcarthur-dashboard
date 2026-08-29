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
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
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
        <div className="rounded-xl border border-line bg-surface shadow-card px-5 py-8 text-center">
          <p className="text-sm font-medium text-body">Nothing needs a decision.</p>
          <p className="text-xs text-muted mt-1">
            Anything still open is waiting on a date, not on you.{' '}
            <button onClick={() => onNav('review')} className="text-info-fg hover:underline">
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
    severity === 'danger' ? 'border-t-danger-solid' : severity === 'warn' ? 'border-t-warn-fg' : 'border-t-line-strong'

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
        <span className="text-xs text-muted tabular-nums">
          {position} of {total} ·{' '}
          <button onClick={() => onNav('review')} className="text-info-fg hover:underline">
            show the rest →
          </button>
        </span>
      }
    >
      <div className="relative pb-6">
        {remaining.length > 2 && (
          <div aria-hidden className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card translate-y-[14px] scale-x-[0.955] opacity-60" />
        )}
        {remaining.length > 1 && (
          <div aria-hidden className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card translate-y-[7px] scale-x-[0.978] opacity-80" />
        )}

        <div className={`relative rounded-xl border border-line border-t-[3px] ${stripe} bg-surface shadow-raised p-5 lg:p-6`}>
          <div className="flex items-center gap-2 mb-1.5">
            <KindTag kind={item.kind} />
            {item.flags[0] && (
              <span className="text-xs text-muted">{item.flags[0].label}</span>
            )}
            <span className="ml-auto text-xs text-faint tabular-nums">
              {remaining.length} left
            </span>
          </div>

          <h3 className="text-base font-semibold text-ink leading-snug">{item.title}</h3>
          <p className="mt-1.5 text-sm text-body leading-relaxed max-w-2xl">
            {decision.rationale}
          </p>

          <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center gap-2">
            {decision.actions.map((a) => (
              <button
                key={a.intent + a.label}
                onClick={() => act(a.intent)}
                disabled={patch.isPending}
                className={`text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40 transition-colors ${
                  a.tone === 'go'
                    ? 'bg-success-solid text-accent-fg hover:brightness-110'
                    : 'bg-surface border border-danger-line text-danger-fg hover:bg-danger-bg'
                }`}
              >
                {a.label}
              </button>
            ))}
            <button
              onClick={() => onNav('review')}
              className="text-xs px-3 py-1.5 rounded-md border border-line-strong text-body hover:bg-sunken transition-colors"
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
              className="ml-auto text-xs px-3 py-1.5 rounded-md text-muted hover:bg-sunken disabled:opacity-30 transition-colors"
            >
              Skip →
            </button>
          </div>

          {(patch.isError || snooze.isError) && (
            <p className="mt-2 text-xs text-danger-fg">
              Could not save that —{' '}
              {((patch.error ?? snooze.error) as Error).message}
            </p>
          )}
        </div>
      </div>
    </DeckShell>
  )
}
