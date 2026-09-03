import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type GigOpportunity, type SyncTarget, type PromoDraft } from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { SkeletonList } from '../components/Skeleton'
import { PitchDiff } from '../components/PitchDiff'
import { SnoozeMenu } from '../components/SnoozeMenu'
import { shortDate } from '../format'
import {
  Section, FactRow, NeedsYou, CopyButton, FlagChip, KindTag, FieldTable, BulletList, RawNote,
} from '../components/ReviewPanels'
import type { ReviewItem, ReviewFilter } from '../../../shared/reviewQueue'
import { normaliseGigStatus } from '../../../shared/gigStatus'
import { depersonalise } from '../../../shared/reviewParse'
import { Button, type ButtonVariant } from '../components/ui/Button'

const FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: 'needs', label: 'Needs a decision' },
  { id: 'conflict', label: 'Conflicts' },
  { id: 'blocked', label: 'Needs you' },
  { id: 'paid', label: 'Entry fee' },
  { id: 'timing', label: 'Timing' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'all', label: 'Everything' },
]


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
  // A variant, not a class string: this list was already a variant table
  // written out longhand, and the "pass" styling had drifted from the one on
  // the Gigs table.
  const buttons: Array<{ label: string; variant: ButtonVariant; run: () => void }> = []

  if (item.source.kind === 'gig') {
    // "Will apply", not "Approve". The old label read as a booking, and the
    // app agreed with it by putting the deadline on your calendar as a gig.
    const status = normaliseGigStatus(item.source.row.status)
    if (status !== 'shortlisted') {
      buttons.push({ label: 'Will apply', variant: 'primary' as const, run: () => onGig({ status: 'shortlisted' }) })
    }
    if (status !== 'submitted') {
      buttons.push({ label: 'Applied', variant: 'neutral' as const, run: () => onGig({ status: 'submitted' }) })
    }
    if (status !== 'passed') {
      buttons.push({ label: 'Pass', variant: 'danger' as const, run: () => onGig({ status: 'passed' }) })
    }
    buttons.push({ label: 'Archive', variant: 'neutral' as const, run: () => onGig({ status: 'archived' }) })
  }

  if (item.source.kind === 'sync') {
    const { status } = item.source.row
    if (status !== 'pitched') {
      buttons.push({ label: 'Mark pitched', variant: 'neutral' as const, run: () => onSync({ status: 'pitched' }) })
    }
    buttons.push({ label: 'Confirmed', variant: 'primary' as const, run: () => onSync({ status: 'confirmed' }) })
    buttons.push({ label: 'Declined', variant: 'danger' as const, run: () => onSync({ status: 'declined' }) })
    buttons.push({ label: 'Archive', variant: 'neutral' as const, run: () => onSync({ status: 'archived' }) })
  }

  if (item.source.kind === 'promo') {
    buttons.push({ label: 'Approve', variant: 'primary' as const, run: () => onPromo({ status: 'approved' }) })
    buttons.push({ label: 'Mark published', variant: 'neutral' as const, run: () => onPromo({ status: 'published' }) })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {buttons.map((b) => (
        <Button key={b.label} variant={b.variant} onClick={b.run} disabled={isSaving}>
          {b.label}
        </Button>
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

  // Field values are *answers*, not commentary — "Contact Name: Doug McArthur"
  // is the text that goes on the festival's form, and rewriting it to
  // "Contact Name: you" would put the wrong thing on the clipboard.
  //
  // `needsDoug` is exactly the flag for the other case: a value that is a
  // placeholder saying he still has to supply something. Those are the app
  // talking, so those are the ones rewritten.
  const draftedFields = parsed.draftedFields.map((f) =>
    f.needsDoug ? { ...f, value: depersonalise(f.value) } : f,
  )

  const draftedFieldsText = draftedFields
    .map((f) => (f.label ? `${f.label}: ${f.value}` : f.value))
    .join('\n')

  // Warnings only. States ("Not submitted") describe where the item is and
  // belong beside the status; mixing them into the same row of chips made the
  // ordinary case look like a problem.
  const warnings = item.flags.filter((f) => f.kind === 'warning')
  const states = item.flags.filter((f) => f.kind === 'state')

  // Anything already rendered as its own fact at the top would be said twice
  // as a chip — and "Deadline not a real date" beside a deadline that now
  // shows the prose underneath it was saying the same thing in two voices.
  const SHOWN_AS_FACT = new Set(['overdue', 'due_soon', 'paid', 'vague_deadline', 'window'])
  const warningChips = warnings.filter((f) => !SHOWN_AS_FACT.has(f.id))
  const stateChips = states.filter((f) => !SHOWN_AS_FACT.has(f.id))

  const needsYou = [
    ...parsed.alerts.map((a) => ({ text: depersonalise(a.text), severity: a.severity })),
    ...parsed.blockers.map((b) => ({ text: depersonalise(b) })),
    ...parsed.draftedFields
      .filter((f) => f.needsDoug)
      .map((f) => ({ text: depersonalise(f.label ? `${f.label} — ${f.value}` : f.value) })),
  ]

  // The submission note is often the same sentence the blocker parser already
  // pulled out ("Application not filled — pending your review"), so showing
  // both printed it twice on the same screen.
  const submissionNote =
    parsed.submissionNote && !needsYou.some((n) => n.text === depersonalise(parsed.submissionNote!))
      ? depersonalise(parsed.submissionNote)
      : null

  const facts: Array<{
    label: string
    value: React.ReactNode
    tone?: 'plain' | 'urgent' | 'cost'
    note?: string | null
  }> = []

  if (deadline.raw || deadline.date) {
    facts.push({
      label: 'Deadline',
      tone: deadline.daysUntil !== null && deadline.daysUntil <= 14 ? 'urgent' : 'plain',
      // 26 of 34 gig rows hold prose here. Where a date was recovered from it,
      // the prose is kept underneath rather than dropped — the recovery is a
      // reading, and "Nov 20" alone claims a certainty the column does not have.
      note: deadline.exact ? deadline.note : (deadline.raw ?? deadline.note),
      value: (
        <>
          {deadline.date ? shortDate(deadline.date) : 'No date given'}
          {deadline.daysUntil !== null && (
            <span className="ml-1.5 font-normal text-muted">
              {deadline.daysUntil < 0
                ? `${Math.abs(deadline.daysUntil)}d ago`
                : deadline.daysUntil === 0
                  ? 'today'
                  : `in ${deadline.daysUntil}d`}
            </span>
          )}
        </>
      ),
    })
  }

  if (deadline.opensAt) {
    facts.push({
      label: 'Window opens',
      value: (
        <>
          {shortDate(deadline.opensAt)}
          {deadline.opensInDays !== null && deadline.opensInDays > 0 && (
            <span className="ml-1.5 font-normal text-muted">in {deadline.opensInDays}d</span>
          )}
        </>
      ),
    })
  }

  // Gated on `required` as well as `raw`: the fee can come from the `paid`
  // column with no text at all, and this used to leave a paid application with
  // nothing on the pane mentioning money once the chip was suppressed.
  if (fee.required || fee.raw || fee.payout) {
    facts.push({
      label: 'Entry fee',
      tone: fee.required ? 'cost' : 'plain',
      note: fee.raw,
      value: fee.required
        ? fee.amount != null
          ? `${fee.currency} ${fee.amount.toLocaleString()}`
          : 'Required'
        : 'Free',
    })
  }
  if (fee.payout) facts.push({ label: 'Pays', value: fee.payout })

  return (
    // One card, one background. Every section below is a heading and a rule.
    <div className="rounded-xl border border-line bg-surface shadow-card p-5 divide-y divide-transparent">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <KindTag kind={item.kind} />
            <StatusBadge status={item.status} kind={item.kind === 'gig' ? 'gig' : undefined} />
            {stateChips.map((f) => (
              <span key={f.id} className="text-xs text-muted">
                {f.label}
              </span>
            ))}
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
            Open listing ↗
          </a>
        )}
      </div>

      {/* The facts a decision turns on, before anything else. */}
      {facts.length > 0 && (
        <div className="mt-4">
          <FactRow facts={facts} />
        </div>
      )}

      {warningChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {warningChips.map((f) => <FlagChip key={f.id} flag={f} />)}
        </div>
      )}

      {item.snooze.active && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-info-line bg-info-bg/50 px-3 py-2">
          <p className="text-xs text-info-fg">
            Snoozed until <span className="font-semibold">{shortDate(item.snooze.until!)}</span>
            {item.snooze.daysUntil !== null && <span> · {item.snooze.daysUntil}d away</span>}
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
        <p className="mt-3 text-xs text-warn-fg leading-relaxed">
          Snoozed until {shortDate(item.snooze.until!)}, but it changed afterwards — so it came
          back early rather than sitting on a decision made about different facts.
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-center gap-2">
        <DecisionBar item={item} onGig={onGig} onSync={onSync} onPromo={onPromo} isSaving={isSaving} />
        {item.kind !== 'promo' && !item.snooze.active && (
          <SnoozeMenu item={item} onPick={(until) => onSnooze(until)} disabled={isSaving} />
        )}
      </div>

      {needsYou.length > 0 && (
        <Section title="Needs you" count={needsYou.length}>
          <NeedsYou items={needsYou} />
        </Section>
      )}

      {parsed.summary && (
        <Section title={item.kind === 'gig' ? 'Why it fits' : 'Background'}>
          <p className="text-sm leading-relaxed text-body">{depersonalise(parsed.summary)}</p>
          {parsed.tracks.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {parsed.tracks.map((track) => (
                <span key={track} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-medium text-body">
                  ♪ {track}
                </span>
              ))}
            </div>
          )}
        </Section>
      )}

      {(parsed.submissionMethod || parsed.requirements.length > 0 || parsed.contactEmails.length > 0 || parsed.links.length > 0 || submissionNote) && (
        <Section title="How to submit">
          <div className="space-y-3">
            {parsed.submissionMethod && (
              <p className="text-sm text-body">
                <span className="text-muted">Via</span> <span className="text-ink capitalize">{parsed.submissionMethod}</span>
              </p>
            )}
            {submissionNote && (
              <p className="text-sm text-body leading-relaxed">{submissionNote}</p>
            )}
            {parsed.contactEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {parsed.contactEmails.map((email) => (
                  <span key={email} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1">
                    <a href={`mailto:${email}`} className="text-xs text-info-fg hover:underline">{email}</a>
                    <CopyButton text={email} />
                  </span>
                ))}
              </div>
            )}
            {parsed.requirements.length > 0 && (
              <BulletList items={parsed.requirements.map(depersonalise)} />
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
        </Section>
      )}

      {parsed.timing.length > 0 && (
        <Section title="Timing notes">
          <BulletList items={parsed.timing.map(depersonalise)} />
        </Section>
      )}

      {draftedFields.length > 0 && (
        <Section
          title="Drafted application values"
          count={draftedFields.length}
          action={<CopyButton text={draftedFieldsText} label="Copy all" />}
        >
          <FieldTable fields={draftedFields} />
        </Section>
      )}

      {parsed.draftedMessage && (
        <Section
          title={`Drafted message${parsed.draftedMessage.channel ? ` — ${parsed.draftedMessage.channel}` : ''}`}
          action={<CopyButton text={parsed.draftedMessage.body} />}
        >
          <p className="whitespace-pre-wrap rounded-md bg-sunken p-3 text-sm leading-relaxed text-ink">
            {parsed.draftedMessage.body}
          </p>
        </Section>
      )}

      {sync?.pitchDraft && (
        <Section title="Pitch draft" action={<CopyButton text={sync.pitchDraft} />}>
          <p className="whitespace-pre-wrap rounded-md bg-sunken p-3 text-sm leading-relaxed text-ink">
            {sync.pitchDraft}
          </p>
          {sync.pitchSent && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted">Changes in what was actually sent</p>
              <PitchDiff draft={sync.pitchDraft} sent={sync.pitchSent} />
            </div>
          )}
        </Section>
      )}

      {promo && (
        <Section title="Draft copy" action={<CopyButton text={promo.content} />}>
          <p className="whitespace-pre-wrap rounded-md bg-sunken p-3 text-sm leading-relaxed text-ink">
            {promo.content}
          </p>
        </Section>
      )}

      {parsed.dealTerms.length > 0 && (
        <Section title="Deal terms" count={parsed.dealTerms.length}>
          <BulletList items={parsed.dealTerms.map(depersonalise)} />
        </Section>
      )}

      {parsed.provenance.length > 0 && (
        <Section title="Where this came from" count={parsed.provenance.length}>
          <BulletList items={parsed.provenance.map(depersonalise)} />
        </Section>
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
