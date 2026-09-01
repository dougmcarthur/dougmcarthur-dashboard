import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigOpportunity, type SyncTarget, type PromoDraft } from '../api'
import type { ReviewItem } from '../../../shared/reviewQueue'
import type { DecisionIntent } from '../../../shared/decisionCopy'
import { KindTag } from './ReviewPanels'
import { SnoozeMenu } from './SnoozeMenu'
import { shortDate } from '../format'

/**
 * The action icons.
 *
 * The check always approves and the cross always passes, whatever the item
 * happens to be — the button no longer reads "Approve the spend" on one card
 * and "Approve email" on the next. A label that changes per item has to be
 * read every time; a fixed icon in a fixed position becomes muscle memory.
 * The words survive as the accessible name and the tooltip.
 */
function ActionIcon({ name }: { name: 'check' | 'x' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      {name === 'check' ? <path d="M3 8.4 6.4 12 13 4.8" /> : <path d="M4.5 4.5l7 7m0-7l-7 7" />}
    </svg>
  )
}

/**
 * One decision at a time, with the rest of the stack showing behind it.
 *
 * Order and copy both come from the server (`GET /api/review`), so this deck
 * and the Review screen can never disagree about what matters or how to
 * describe it. Acting on a card, or skipping it, deals the next one.
 */

/** An intent means the same thing everywhere; the status it maps to does not. */
const STATUS_BY_INTENT: Record<ReviewItem['kind'], Record<DecisionIntent, string>> = {
  // `approve` on a gig means "I will apply" and nothing more — see
  // shared/gigStatus.ts. `pass` is *your* no, which is why it maps to
  // `passed` and never to `declined`.
  gig: {
    confirm_sent: 'submitted',
    reopen: 'shortlisted',
    approve: 'shortlisted',
    pass: 'passed',
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

/**
 * No section heading. A card carrying a title, three facts and an approve
 * button does not need a label above it saying it is a decision, and the
 * counter reads better inside the card than as a caption over it.
 */
/**
 * The two or three numbers a decision actually turns on, in a fixed grid.
 *
 * They were already in the rationale sentence, which meant reading a sentence
 * to find a number. Rendered only when there is something to put in them — an
 * empty grid of dashes is worse than no grid.
 */
function Facts({ item }: { item: ReviewItem }) {
  const facts: Array<{ label: string; value: string }> = []

  if (item.fee.required) {
    facts.push({
      label: 'Entry fee',
      value: item.fee.amount ? `${item.fee.currency} ${item.fee.amount.toLocaleString()}` : 'Yes',
    })
  }
  if (item.deadline.date) {
    facts.push({
      label: item.deadline.exact ? 'Deadline' : 'Deadline (approx)',
      value: shortDate(item.deadline.date),
    })
  }
  if (item.deadline.opensAt) {
    facts.push({ label: 'Opens', value: shortDate(item.deadline.opensAt) })
  }
  const fit = item.source.kind === 'gig' ? item.source.row.genreFitScore : null
  if (fit) facts.push({ label: 'Fit', value: `${fit}/5` })

  if (facts.length === 0) return null

  return (
    <dl
      className="mt-4 grid gap-px rounded-lg border border-line-strong bg-line-strong overflow-hidden"
      style={{ gridTemplateColumns: `repeat(${Math.min(facts.length, 4)}, minmax(0, 1fr))` }}
    >
      {facts.slice(0, 4).map((f) => (
        <div key={f.label} className="bg-surface px-3 py-2">
          <dt className="text-xs text-muted">{f.label}</dt>
          <dd className="text-base font-bold text-ink mt-0.5 tabular-nums">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function DeckShell({ children, head }: { children: React.ReactNode; head: React.ReactNode }) {
  return (
    <div>
      {head && <div className="flex items-baseline justify-end mb-2">{head}</div>}
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
          <div aria-hidden className="absolute inset-0 rounded-xl border border-line bg-surface translate-y-[10px] scale-x-[0.965] opacity-55" />
        )}
        {remaining.length > 1 && (
          <div aria-hidden className="absolute inset-0 rounded-xl border border-line bg-surface translate-y-[5px] scale-x-[0.984] opacity-80" />
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

          <h3 className="display text-xl font-bold text-ink leading-tight">{item.title}</h3>
          <p className="mt-1.5 text-sm text-body leading-relaxed max-w-2xl">
            {decision.rationale}
          </p>

          <Facts item={item} />

          <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center gap-2">
            {decision.actions.map((a) => (
              <button
                key={a.intent + a.label}
                onClick={() => act(a.intent)}
                disabled={patch.isPending}
                title={a.label}
                aria-label={a.label}
                className={`grid place-items-center h-9 w-9 rounded-lg border disabled:opacity-40 transition-colors ${
                  a.tone === 'go'
                    ? 'bg-accent border-transparent text-accent-fg hover:bg-accent-hover'
                    : 'bg-transparent border-danger-line text-danger-fg hover:bg-danger-bg'
                }`}
              >
                <ActionIcon name={a.tone === 'go' ? 'check' : 'x'} />
              </button>
            ))}
            <button
              onClick={() => onNav('review')}
              title="Details"
              aria-label="Details"
              className="grid place-items-center h-9 w-9 rounded-lg border border-line text-body hover:bg-sunken hover:text-ink transition-colors"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                   strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M6.5 3.5H3.2v9.3h9.3V9.5" />
                <path d="M9.4 3.2h3.4v3.4M12.6 3.4 7.6 8.4" />
              </svg>
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
