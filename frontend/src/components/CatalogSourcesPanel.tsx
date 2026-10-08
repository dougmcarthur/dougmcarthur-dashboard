import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CandidateView, type CatalogCandidateItem, type CatalogSourceItem, type SourceStateId } from '../api'
import { PUBLIC_CATEGORIES } from '../../../shared/opportunityCatalog'
import { relativeTime, shortDate } from '../format'
import { Button } from './ui/Button'
import { Explainer } from './ui/Explainer'
import { Banner, Card, EmptyState } from './ui/Surface'
import { Tabs } from './ui/Tabs'

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(PUBLIC_CATEGORIES.map((c) => [c.id, c.label]))

const KIND_LABEL: Record<CatalogSourceItem['kind'], string> = { feed: 'Feed', calendar: 'Calendar', page: 'Page' }

/**
 * What each state is called on a screen, and how loudly.
 *
 * `refused` and `unreachable` are different facts and look different: a site
 * that turned the request away is something the owner can act on, and one that
 * did not answer is no verdict at all. `stale` and `empty` are the two the
 * first real reads found — sources that answer fine and hold nothing.
 */
const STATE: Record<SourceStateId, { label: string; tone: string }> = {
  working: { label: 'Working', tone: 'bg-success-bg text-success-fg' },
  never: { label: 'Not read yet', tone: 'bg-sunken text-muted' },
  off: { label: 'Off', tone: 'bg-sunken text-muted' },
  overdue: { label: 'Overdue', tone: 'bg-warn-bg text-warn-fg' },
  stale: { label: 'Gone quiet', tone: 'bg-warn-bg text-warn-fg' },
  empty: { label: 'Nothing in it', tone: 'bg-warn-bg text-warn-fg' },
  refused: { label: 'Turned us away', tone: 'bg-danger-bg text-danger-fg' },
  unreachable: { label: 'No answer', tone: 'bg-danger-bg text-danger-fg' },
}

const VIEWS: ReadonlyArray<{ id: CandidateView; label: string }> = [
  { id: 'calls', label: 'Calls' },
  { id: 'unclear', label: 'Unclear' },
  { id: 'ignored', label: 'Ignored' },
  { id: 'past', label: 'Closed or old' },
]

const VIEW_HINT: Record<CandidateView, string> = {
  calls: 'Items whose words say something is open. This is what the next step will follow to the programme’s own page.',
  unclear: 'Mentions a grant or a showcase without saying anything is open, or is for somebody other than an artist.',
  ignored: 'What it threw away. Read this one: a rule that is missing real calls only shows up from here.',
  past: 'A deadline that has gone, or an item first seen long after it was posted.',
}

/**
 * The pages Scout reads for calls by itself, and what it found there.
 *
 * Reading known pages is the part of a research sweep that does not need a
 * model, and this is where the owner sees whether it works: which sources are
 * alive, which only *look* alive, and what each verdict was based on. Nothing
 * shown as a candidate has reached the shared catalog; the next step follows
 * each one to its own page first.
 */
export function CatalogSourcesPanel() {
  const qc = useQueryClient()
  const [view, setView] = useState<CandidateView>('calls')

  const sources = useQuery({ queryKey: ['admin', 'catalog', 'sources'], queryFn: api.admin.catalogSources })
  const candidates = useQuery({
    queryKey: ['admin', 'catalog', 'candidates', view],
    queryFn: () => api.admin.catalogCandidates(view),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'catalog'] })
  const poll = useMutation({ mutationFn: api.admin.pollCatalog, onSuccess: refresh })
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => api.admin.setSourceEnabled(id, enabled),
    onSuccess: refresh,
  })

  const items = sources.data?.items ?? []
  const last = sources.data?.lastPoll ?? null

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <Explainer as="h2" title="Pages Scout reads">
          Feeds and listing pages Scout reads by itself, a few a night, with no model. What it finds waits below as a
          candidate; none of it is in the shared catalog yet.
        </Explainer>
        <div className="flex items-center gap-3">
          {last && (
            <span className="text-xs text-muted">
              Last read {relativeTime(last.at)}: {last.polled} {last.polled === 1 ? 'page' : 'pages'}, {last.added} new
            </span>
          )}
          <Button variant="neutral" size="sm" disabled={poll.isPending} onClick={() => poll.mutate()}>
            {poll.isPending ? 'Reading…' : 'Read the next pages now'}
          </Button>
        </div>
      </header>

      {poll.error && <Banner>{poll.error instanceof Error ? poll.error.message : 'Could not read them.'}</Banner>}
      {poll.data && (
        <Banner tone={poll.data.failed ? 'warn' : 'success'} size="sm">
          Read {poll.data.polled}: {poll.data.ok} understood, {poll.data.failed} not, {poll.data.added} new.
        </Banner>
      )}

      {sources.isLoading ? (
        <div className="h-24 bg-sunken rounded-xl animate-pulse" />
      ) : sources.error ? (
        <Banner>Could not load the sources — {(sources.error as Error).message}</Banner>
      ) : (
        <Card pad="none" clip>
          <ul className="divide-y divide-line">
            {items.map((s) => (
              <SourceRow key={s.id} source={s} busy={toggle.isPending} onToggle={() => toggle.mutate({ id: s.id, enabled: !s.enabled })} />
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-3">
        <Tabs label="What was found" tabs={VIEWS} active={view} onSelect={setView} />
        <p className="text-xs text-muted max-w-prose">{VIEW_HINT[view]}</p>

        {candidates.isLoading ? (
          <div className="h-16 bg-sunken rounded-xl animate-pulse" />
        ) : candidates.error ? (
          <Banner>Could not load them — {(candidates.error as Error).message}</Banner>
        ) : (candidates.data?.items.length ?? 0) === 0 ? (
          <EmptyState>
            {last ? 'Nothing here.' : 'Nothing has been read yet. Read the next pages above, or wait for tonight.'}
          </EmptyState>
        ) : (
          <Card pad="none" clip>
            <ul className="divide-y divide-line">
              {candidates.data!.items.map((c) => (
                <CandidateRow key={c.id} item={c} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </section>
  )
}

function SourceRow({ source: s, busy, onToggle }: { source: CatalogSourceItem; busy: boolean; onToggle: () => void }) {
  const state = STATE[s.state]
  return (
    <li className="px-4 py-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <p className="text-sm text-ink flex flex-wrap items-center gap-x-2 gap-y-1">
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
            {s.label}
          </a>
          <span className="text-xs text-faint">{KIND_LABEL[s.kind]}</span>
          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${state.tone}`}>{state.label}</span>
        </p>
        <p className="text-xs text-muted">{s.note}</p>
        <p className="text-xs text-faint">
          {s.lastOkAt ? `Last understood ${relativeTime(s.lastOkAt)}` : 'Never understood'}
          {s.newestItemAt ? ` · newest item ${shortDate(s.newestItemAt)}` : ''}
          {s.enabled && s.nextDueAt ? ` · next ${relativeTime(s.nextDueAt)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <p className="text-xs text-muted tabular-nums text-right">
          <span className="text-ink font-medium">{s.counts.calls}</span> calls
          <span className="text-faint"> · </span>
          {s.counts.unclear} unclear
          <span className="text-faint"> · </span>
          {s.counts.ignored} ignored
        </p>
        <Button variant="quiet" size="sm" disabled={busy} onClick={onToggle}>
          {s.enabled ? 'Switch off' : 'Switch on'}
        </Button>
      </div>
    </li>
  )
}

function CandidateRow({ item: c }: { item: CatalogCandidateItem }) {
  const category = c.category ? CATEGORY_LABEL[c.category] ?? 'Other' : null
  const closes = c.deadline ? `closes ${shortDate(c.deadline)}` : c.deadlineNote ? `deadline “${c.deadlineNote}”` : null
  return (
    <li className="px-4 py-2.5 space-y-0.5">
      <p className="text-sm text-ink">
        {c.url ? (
          <a href={c.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {c.title}
          </a>
        ) : (
          c.title
        )}
      </p>
      <p className="text-xs text-muted">
        {[c.source, category, closes, c.placeText, `found ${shortDate(c.firstSeenAt)}`].filter(Boolean).join(' · ')}
      </p>
      <p className="text-xs text-faint">{c.reason}</p>
    </li>
  )
}
