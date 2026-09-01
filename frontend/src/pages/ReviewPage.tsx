import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigOpportunity, type SyncTarget, type PromoDraft } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonList } from '../components/Skeleton'
import { PitchDiff } from '../components/PitchDiff'
import { SnoozeMenu } from '../components/SnoozeMenu'
import { shortDate } from '../format'
import {
  Panel, CopyButton, FlagChip, KindTag, AlertList, FieldTable, BulletList, RawNote,
} from '../components/ReviewPanels'
import type { ReviewItem, ReviewFilter } from '../../../shared/reviewQueue'
import { normaliseGigStatus } from '../../../shared/gigStatus'

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: 'needs', label: 'Needs a decision' },
  { id: 'conflict', label: 'Conflicts' },
  { id: 'blocked', label: 'Blocked on you' },
  { id: 'paid', label: 'Costs money' },
  { id: 'timing', label: 'Timing' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'all', label: 'Everything' },
]

const ACTION = 'text-xs px-3 py-1.5 rounded-md font-medium disabled:opacity-40 transition-colors'

// ── Queue rail ────────────────────────────────────────────────────────────────

function QueueRow({
  item,
  active,
  onSelect,
}: {
  item: ReviewItem
  active: boolean
  onSelect: () => void
}) {
  const top = item.flags[0]
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${
        active ? 'bg-accent/[0.04] border-accent' : 'border-transparent hover:bg-sunken'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <KindTag kind={item.kind} />
        {top && (
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              top.severity === 'danger' ? 'bg-danger-solid' : top.severity === 'warn' ? 'bg-line-strong' : 'bg-line'
            }`}
          />
        )}
        <span className="text-[11px] text-muted truncate">{item.subtitle}</span>
      </div>
      <p className={`text-sm leading-snug ${active ? 'font-semibold text-ink' : 'font-medium text-body'}`}>
        {item.title}
      </p>
      {top && <p className="text-[11px] text-muted mt-0.5 truncate">{top.label}</p>}
    </button>
  )
}

// ── Per-kind decision bar ─────────────────────────────────────────────────────

function DecisionBar({
  item,
  onGig,
  onSync,
  onPromo,
  isSaving,
}: {
  item: ReviewItem
  onGig: (body: Partial<GigOpportunity>) => void
  onSync: (body: Partial<SyncTarget>) => void
  onPromo: (body: Partial<PromoDraft>) => void
  isSaving: boolean
}) {
  const buttons: Array<{ label: string; className: string; run: () => void }> = []

  if (item.source.kind === 'gig') {
    // "Will apply", not "Approve". The old label read as a booking, and the
    // app agreed with it by putting the deadline on your calendar as a gig.
    const status = normaliseGigStatus(item.source.row.status)
    if (status !== 'shortlisted') {
      buttons.push({ label: 'Will apply', className: 'bg-accent text-accent-fg hover:bg-accent-hover', run: () => onGig({ status: 'shortlisted' }) })
    }
    if (status !== 'submitted') {
      buttons.push({ label: 'Applied', className: 'bg-surface border border-line-strong text-body hover:bg-sunken hover:text-ink', run: () => onGig({ status: 'submitted' }) })
    }
    if (status !== 'passed') {
      buttons.push({ label: 'Pass', className: 'bg-surface border border-danger-line text-danger-fg hover:bg-danger-bg', run: () => onGig({ status: 'passed' }) })
    }
    buttons.push({ label: 'Archive', className: 'bg-surface border border-line-strong text-body hover:bg-sunken', run: () => onGig({ status: 'archived' }) })
  }

  if (item.source.kind === 'sync') {
    const { status } = item.source.row
    if (status !== 'pitched') {
      buttons.push({ label: 'Mark pitched', className: 'bg-surface border border-line-strong text-body hover:bg-sunken hover:text-ink', run: () => onSync({ status: 'pitched' }) })
    }
    buttons.push({ label: 'Confirmed', className: 'bg-accent text-accent-fg hover:bg-accent-hover', run: () => onSync({ status: 'confirmed' }) })
    buttons.push({ label: 'Declined', className: 'bg-surface border border-danger-line text-danger-fg hover:bg-danger-bg', run: () => onSync({ status: 'declined' }) })
    buttons.push({ label: 'Archive', className: 'bg-surface border border-line-strong text-body hover:bg-sunken', run: () => onSync({ status: 'archived' }) })
  }

  if (item.source.kind === 'promo') {
    buttons.push({ label: 'Approve', className: 'bg-accent text-accent-fg hover:bg-accent-hover', run: () => onPromo({ status: 'approved' }) })
    buttons.push({ label: 'Mark published', className: 'bg-surface border border-line-strong text-body hover:bg-sunken hover:text-ink', run: () => onPromo({ status: 'published' }) })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <button key={b.label} onClick={b.run} disabled={isSaving} className={`${ACTION} ${b.className}`}>
          {b.label}
        </button>
      ))}
    </div>
  )
}

// ── Detail ────────────────────────────────────────────────────────────────────

function Detail({
  item,
  onGig,
  onSync,
  onPromo,
  onSnooze,
  isSaving,
}: {
  item: ReviewItem
  onGig: (body: Partial<GigOpportunity>) => void
  onSync: (body: Partial<SyncTarget>) => void
  onPromo: (body: Partial<PromoDraft>) => void
  onSnooze: (until: string | null) => void
  isSaving: boolean
}) {
  const { parsed, fee, deadline } = item
  const sync = item.source.kind === 'sync' ? item.source.row : null
  const promo = item.source.kind === 'promo' ? item.source.row : null

  const draftedFieldsText = parsed.draftedFields
    .map((f) => (f.label ? `${f.label}: ${f.value}` : f.value))
    .join('\n')

  return (
    <div className="space-y-4">
      {/* Identity + decision */}
      <div className="rounded-xl border border-line bg-surface shadow-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <KindTag kind={item.kind} />
              <StatusBadge status={item.status} />
            </div>
            <h2 className="text-lg font-semibold text-ink leading-snug">{item.title}</h2>
            <p className="text-sm text-muted mt-0.5">
              {item.subtitle}
              {parsed.location && <span> · {parsed.location}</span>}
            </p>
          </div>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs px-3 py-1.5 rounded-md border border-line-strong text-info-fg hover:bg-info-bg transition-colors"
            >
              Open source ↗
            </a>
          )}
        </div>

        {item.flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.flags.map((f) => <FlagChip key={f.id} flag={f} />)}
          </div>
        )}

        {/* A snooze is stated where the item is, with the way out beside it.
            The whole point of the Snoozed view is that deferring is visible
            and reversible rather than a quiet disappearance. */}
        {item.snooze.active && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-info-line bg-info-bg/50 px-3 py-2">
            <p className="text-xs text-info-fg">
              Snoozed until <span className="font-semibold">{shortDate(item.snooze.until!)}</span>
              {item.snooze.daysUntil !== null && (
                <span className="text-info-fg"> · {item.snooze.daysUntil}d away</span>
              )}
            </p>
            <button
              onClick={() => onSnooze(null)}
              disabled={isSaving}
              className="shrink-0 text-xs px-2.5 py-1 rounded-md border border-info-line bg-surface text-info-fg hover:bg-info-bg disabled:opacity-40 transition-colors"
            >
              Bring it back now
            </button>
          </div>
        )}

        {item.snooze.wokenByChange && (
          <p className="rounded-md border border-warn-line bg-warn-bg/60 px-3 py-2 text-xs text-warn-fg leading-relaxed">
            This was snoozed until {shortDate(item.snooze.until!)}, but it changed
            afterwards — so it came back early rather than sitting on a decision
            made about different facts.
          </p>
        )}

        <div className="pt-1 border-t border-line">
          <div className="pt-3 flex flex-wrap items-center gap-2">
            <DecisionBar item={item} onGig={onGig} onSync={onSync} onPromo={onPromo} isSaving={isSaving} />
            {item.kind !== 'promo' && !item.snooze.active && (
              <SnoozeMenu item={item} onPick={(until) => onSnooze(until)} disabled={isSaving} />
            )}
          </div>
        </div>
      </div>

      {/* Flagged issues pulled out of the note */}
      {parsed.alerts.length > 0 && (
        <Panel title="Flags & known issues" tone="danger" count={parsed.alerts.length}>
          <AlertList alerts={parsed.alerts} />
        </Panel>
      )}

      {/* Waiting on Doug */}
      {(parsed.blockers.length > 0 || parsed.draftedFields.some((f) => f.needsDoug)) && (
        <Panel title="Blocked on you" tone="warn">
          <BulletList
            tone="amber"
            items={[
              ...parsed.blockers,
              ...parsed.draftedFields
                .filter((f) => f.needsDoug)
                .map((f) => `${f.label || 'Field'} — ${f.value}`),
            ]}
          />
        </Panel>
      )}

      {/* Timing */}
      {(deadline.raw || parsed.timing.length > 0) && (
        <Panel title="Timing" tone={deadline.daysUntil !== null && deadline.daysUntil <= 14 ? 'warn' : 'neutral'}>
          {deadline.raw && (
            <div className="mb-3 rounded-md border border-line bg-surface px-3 py-2">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-medium text-muted w-20 shrink-0">Deadline</span>
                <span className="text-sm text-ink">
                  {deadline.date ?? 'no date found'}
                  {deadline.daysUntil !== null && (
                    <span
                      className={`ml-2 text-xs font-semibold ${
                        deadline.daysUntil < 0
                          ? 'text-danger-fg'
                          : deadline.daysUntil <= 7
                          ? 'text-cat-orange-fg'
                          : 'text-muted'
                      }`}
                    >
                      {deadline.daysUntil < 0
                        ? `${Math.abs(deadline.daysUntil)}d ago`
                        : deadline.daysUntil === 0
                        ? 'today'
                        : `in ${deadline.daysUntil}d`}
                    </span>
                  )}
                </span>
              </div>
              {!deadline.exact && (
                <p className="mt-1.5 text-xs text-muted leading-relaxed">
                  <span className="text-warn-fg font-medium">Stored as prose, not a date:</span>{' '}
                  “{deadline.raw}”
                </p>
              )}
            </div>
          )}
          {parsed.timing.length > 0 && <BulletList items={parsed.timing} />}
        </Panel>
      )}

      {/* Cost */}
      {(fee.raw || fee.payout) && (
        <Panel title="Cost to enter" tone={fee.required ? 'warn' : 'neutral'}>
          <p className="text-sm text-ink">
            {fee.required ? (
              <>
                <span className="font-semibold">
                  {fee.amount != null ? `${fee.currency} ${fee.amount.toLocaleString()}` : 'Paid entry'}
                </span>{' '}
                <span className="text-muted">— nothing goes out until you say so</span>
              </>
            ) : (
              <span className="text-body">No entry fee</span>
            )}
          </p>
          {fee.payout && <p className="mt-1 text-sm text-success-fg">Pays out: {fee.payout}</p>}
          {fee.raw && <p className="mt-1.5 text-xs text-muted">Raw: “{fee.raw}”</p>}
        </Panel>
      )}

      {/* How to submit */}
      {(parsed.submissionMethod || parsed.requirements.length > 0 || parsed.contactEmails.length > 0 || parsed.links.length > 0) && (
        <Panel title="How to submit" tone="info">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {parsed.submissionMethod && (
                <span className="rounded-md border border-info-line bg-surface px-2.5 py-1 text-xs text-info-fg capitalize">
                  via {parsed.submissionMethod}
                </span>
              )}
              {parsed.submissionState !== 'unknown' && (
                <span className="rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-body">
                  {parsed.submissionState === 'not_submitted' ? 'Not submitted' : 'Submitted'}
                </span>
              )}
            </div>

            {parsed.submissionNote && (
              <p className="text-sm text-body leading-relaxed">{parsed.submissionNote}</p>
            )}

            {parsed.contactEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {parsed.contactEmails.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1">
                    <a href={`mailto:${email}`} className="text-xs font-mono text-info-fg hover:underline">{email}</a>
                    <CopyButton text={email} />
                  </span>
                ))}
              </div>
            )}

            {parsed.requirements.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Requirements</p>
                <BulletList items={parsed.requirements} />
              </div>
            )}

            {parsed.links.length > 0 && (
              <div className="flex flex-col gap-1">
                {parsed.links.map((link) => (
                  <a key={link} href={link} target="_blank" rel="noreferrer" className="truncate text-xs text-info-fg hover:underline">
                    {link}
                  </a>
                ))}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Drafted application values */}
      {parsed.draftedFields.length > 0 && (
        <Panel
          title="Drafted application values"
          tone="accent"
          count={parsed.draftedFields.length}
          action={<CopyButton text={draftedFieldsText} label="Copy all" />}
        >
          <FieldTable fields={parsed.draftedFields} />
        </Panel>
      )}

      {/* Drafted outreach message */}
      {parsed.draftedMessage && (
        <Panel
          title={`Drafted message${parsed.draftedMessage.channel ? ` — ${parsed.draftedMessage.channel}` : ''}`}
          tone="accent"
          action={<CopyButton text={parsed.draftedMessage.body} />}
        >
          <p className="whitespace-pre-wrap rounded-md border border-cat-violet-line bg-surface p-3 text-sm leading-relaxed text-ink">
            {parsed.draftedMessage.body}
          </p>
        </Panel>
      )}

      {/* Sync pitch draft + what actually went out */}
      {sync?.pitchDraft && (
        <Panel title="Pitch draft" tone="accent" action={<CopyButton text={sync.pitchDraft} />}>
          <p className="whitespace-pre-wrap rounded-md border border-cat-violet-line bg-surface p-3 text-sm leading-relaxed text-ink">
            {sync.pitchDraft}
          </p>
          {sync.pitchSent && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Changes in what was actually sent</p>
              <PitchDiff draft={sync.pitchDraft} sent={sync.pitchSent} />
            </div>
          )}
        </Panel>
      )}

      {/* Promo copy */}
      {promo && (
        <Panel title="Draft copy" tone="accent" action={<CopyButton text={promo.content} />}>
          <p className="whitespace-pre-wrap rounded-md border border-cat-teal-line bg-surface p-3 text-sm leading-relaxed text-ink">
            {promo.content}
          </p>
        </Panel>
      )}

      {/* Deal terms */}
      {parsed.dealTerms.length > 0 && (
        <Panel title="Deal terms" count={parsed.dealTerms.length}>
          <BulletList items={parsed.dealTerms} />
        </Panel>
      )}

      {/* Narrative remainder */}
      {parsed.summary && (
        <Panel title={item.kind === 'gig' ? 'Why it fits' : 'Background'}>
          <p className="text-sm leading-relaxed text-body">{parsed.summary}</p>
          {parsed.tracks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {parsed.tracks.map((track) => (
                <span key={track} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-medium text-body">
                  ♪ {track}
                </span>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Where the contact came from */}
      {parsed.provenance.length > 0 && (
        <Panel title="Source & provenance" count={parsed.provenance.length}>
          <BulletList items={parsed.provenance} />
        </Panel>
      )}

      {item.note && <RawNote note={item.note} />}
    </div>
  )
}

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
          · <kbd className="font-mono">j</kbd>/<kbd className="font-mono">k</kbd> to move
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
