import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type CatalogSourceItem, type SourceStateId } from '../api'
import { SOURCE_CADENCES, cadenceLabel, needsAttention, orderSources, readsPerDay } from '../../../shared/sourceControls'
import { relativeTime, shortDate } from '../format'
import { Button } from './ui/Button'
import { useNote } from './ui/Explainer'
import { Select } from './ui/Field'
import { PagedList } from './ui/Pager'
import { Banner, Card, EmptyState } from './ui/Surface'
import { Tabs } from './ui/Tabs'
import { Toggle } from './ui/Toggle'
import { SectionHeader } from './ui/SectionHeader'

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

type Filter = 'all' | 'attention' | 'off'

const EMPTY: Record<Exclude<Filter, 'all'>, string> = {
  attention: 'Nothing needs attention. Every source that is on is answering.',
  off: 'No source is switched off.',
}

/**
 * The feeds and listing pages Scout reads for calls by itself, and the two
 * decisions the owner has about each: whether it is read at all, and how often.
 *
 * Reading known pages is the part of a research sweep that does not need a
 * model, and this is where the owner sees whether it works: which sources are
 * alive, which only *look* alive, and what each verdict was based on. Nothing
 * found here has reached the shared catalog; the next step follows each
 * candidate to its own page first (see Source findings).
 *
 * **A source that is off goes to the bottom and is drawn quietly.** It is a
 * decision already taken, so it is not what the page is for, and it should not
 * be the first thing read because its name starts with an A. Its frequency is
 * disabled with it: choosing how often to read something that is not read is a
 * setting that does nothing.
 *
 * **The switch is the control and the pill is the report.** The pill says what
 * the last read found; the switch says what the owner wants. They only agree on
 * "Off", and they are separate so a source can be on and failing.
 */
export function ExternalSourcesPanel() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Filter>('all')
  const load = useNote('how many reads a day')

  const sources = useQuery({ queryKey: ['admin', 'catalog', 'sources'], queryFn: api.admin.catalogSources })

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'catalog'] })
  const poll = useMutation({ mutationFn: api.admin.pollCatalog, onSuccess: refresh })
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { enabled?: boolean; cadenceHours?: number } }) =>
      api.admin.updateSource(id, patch),
    onSuccess: refresh,
  })

  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set())
  const togglePicked = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const bulk = useMutation({
    mutationFn: async (enabled: boolean) => {
      // One request each, because each is its own write and its own line in the
      // change log. A failure does not stop the rest, and is said afterwards:
      // stopping at the first would leave some sources changed and the owner not
      // knowing which, and stopping silently was how a half-done change looked
      // like a whole one.
      let failed = 0
      for (const id of picked) {
        try {
          await api.admin.updateSource(id, { enabled })
        } catch {
          failed++
        }
      }
      if (failed) throw new Error(`${failed} of ${picked.size} could not be changed. The others were.`)
    },
    onSuccess: () => setPicked(new Set()),
    // Partly done is still done: what changed shows, and the selection stays so the rest can be tried again.
    onSettled: refresh,
  })
  const readOne = useMutation({ mutationFn: (id: number) => api.admin.readSource(id), onSuccess: refresh })

  const all = sources.data?.items ?? []
  const failing = all.filter((s) => s.enabled && needsAttention(s.state))
  const switchedOff = all.filter((s) => !s.enabled)
  const shown = orderSources(filter === 'attention' ? failing : filter === 'off' ? switchedOff : all)

  // A selection survives a change of tab or page, so say when some of it is out of sight.
  const outOfView = [...picked].filter((id) => !shown.some((s) => s.id === id)).length

  const last = sources.data?.lastPoll ?? null
  const asked = readsPerDay(all)
  const capacity = sources.data?.capacityPerDay ?? 0

  return (
    <section className="space-y-4">
      <SectionHeader
        title="External data sources"
        actions={
          <>
            {last && (
              <span className="text-xs text-muted">
                Last read {relativeTime(last.at)}: {last.polled} {last.polled === 1 ? 'source' : 'sources'}, {last.added} new
              </span>
            )}
            <Button variant="neutral" size="sm" disabled={poll.isPending} onClick={() => poll.mutate()}>
              {poll.isPending ? 'Reading…' : 'Read the next sources now'}
            </Button>
          </>
        }
      >
        Feeds and listing pages outside this app that Scout reads by itself, a few an hour, with no model. Choose how
        often each one is read, or switch it off to stop. What Scout finds waits on the Source findings page as a
        candidate; none of it is in the shared catalog yet.
      </SectionHeader>

      {poll.error && <Banner>{poll.error instanceof Error ? poll.error.message : 'Could not read them.'}</Banner>}
      {poll.data && (
        <Banner tone={poll.data.failed ? 'warn' : 'success'} size="sm">
          Read {poll.data.polled}: {poll.data.ok} understood, {poll.data.failed} not, {poll.data.added} new.
        </Banner>
      )}
      {update.error && (
        <Banner>{update.error instanceof Error ? update.error.message : 'Could not change that source.'}</Banner>
      )}
      {bulk.error && <Banner>{bulk.error instanceof Error ? bulk.error.message : 'Could not change them.'}</Banner>}

      {sources.isLoading ? (
        <div className="h-24 bg-sunken rounded-xl animate-pulse" />
      ) : sources.error ? (
        <Banner>Could not load the sources: {(sources.error as Error).message}</Banner>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Tabs
                label="Show sources"
                active={filter}
                onSelect={setFilter}
                tabs={[
                  { id: 'all', label: `All (${all.length})` },
                  { id: 'attention', label: `Needs attention (${failing.length})` },
                  { id: 'off', label: `Switched off (${switchedOff.length})` },
                ]}
              />
            </div>
            {capacity > 0 && asked <= capacity && load.button}
          </div>
          {capacity > 0 &&
            asked <= capacity &&
            load.note(
              `At these settings Scout reads about ${asked} ${asked === 1 ? 'source' : 'sources'} a day, of the ${capacity} it can.`,
            )}

          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 text-xs text-muted">
              {picked.size} selected
              {outOfView > 0 && `, ${outOfView} not in this view`}
              <Button size="sm" variant="neutral" disabled={bulk.isPending} onClick={() => bulk.mutate(true)}>
                Turn on
              </Button>
              <Button size="sm" variant="neutral" disabled={bulk.isPending} onClick={() => bulk.mutate(false)}>
                Turn off
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setPicked(new Set())}>
                Clear
              </Button>
            </div>
          )}
          {readOne.data && (
            <Banner tone={readOne.data.ok ? 'success' : 'warn'} size="sm">
              {readOne.data.source}: {readOne.data.note} {readOne.data.added > 0 ? `${readOne.data.added} new.` : ''}
            </Banner>
          )}

          {shown.length === 0 ? (
            <EmptyState>{filter === 'all' ? 'No sources yet. They appear after the first read.' : EMPTY[filter]}</EmptyState>
          ) : (
            <PagedList items={shown} noun="sources" resetKey={filter}>
              {(rows) => (
                <Card pad="none" clip>
                  <ul className="divide-y divide-line">
                    {rows.map((s) => (
                      <SourceRow
                        key={s.id}
                        source={s}
                        busy={update.isPending && update.variables?.id === s.id}
                        picked={picked.has(s.id)}
                        onPick={() => togglePicked(s.id)}
                        reading={readOne.isPending && readOne.variables === s.id}
                        onRead={() => readOne.mutate(s.id)}
                        onToggle={(enabled) => update.mutate({ id: s.id, patch: { enabled } })}
                        onCadence={(cadenceHours) => update.mutate({ id: s.id, patch: { cadenceHours } })}
                      />
                    ))}
                  </ul>
                </Card>
              )}
            </PagedList>
          )}

          {capacity > 0 && asked > capacity && (
            <Banner tone="warn" size="sm">
              These frequencies ask for about {asked} reads a day, and Scout reads at most {capacity} ({capacity / 24} an
              hour). The oldest are read first, so some sources will be read later than chosen. Make some less frequent,
              or switch off the ones that no longer answer.
            </Banner>
          )}
        </div>
      )}
    </section>
  )
}

function SourceRow({
  source: s,
  busy,
  picked,
  onPick,
  reading,
  onRead,
  onToggle,
  onCadence,
}: {
  source: CatalogSourceItem
  picked: boolean
  onPick: () => void
  reading: boolean
  onRead: () => void
  busy: boolean
  onToggle: (enabled: boolean) => void
  onCadence: (hours: number) => void
}) {
  const state = STATE[s.state]
  const off = !s.enabled
  // A value the owner did not choose from the list (a row edited by hand) is
  // still shown as what it is, so the select never claims a frequency it isn't.
  const offered = SOURCE_CADENCES.some((c) => c.hours === s.cadenceHours)

  return (
    <li className={`px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 ${off ? 'bg-sunken/60' : ''}`}>
      <input
        type="checkbox"
        checked={picked}
        onChange={onPick}
        aria-label={`Select ${s.label}`}
        className="h-4 w-4 shrink-0 accent-accent"
      />
      <div className="min-w-0 flex-1 basis-72 space-y-0.5">
        <p className="text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`font-medium hover:underline ${off ? 'text-muted' : 'text-ink'}`}
          >
            {s.label}
          </a>
          <span className="text-xs text-muted">{KIND_LABEL[s.kind]}</span>
          <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${state.tone}`}>{state.label}</span>
        </p>
        <p className="text-xs text-muted tabular-nums">
          {s.note}
          <span aria-hidden> · </span>
          <span className={off ? 'font-medium' : 'text-ink font-medium'}>{s.counts.calls}</span> calls
          <span aria-hidden> · </span>
          {s.counts.unclear} unclear
          <span aria-hidden> · </span>
          {s.counts.ignored} ignored
        </p>
        <p className="text-xs text-muted">
          {s.lastOkAt ? `Last understood ${relativeTime(s.lastOkAt)}` : 'Never understood'}
          {s.newestItemAt ? ` · newest item ${shortDate(s.newestItemAt)}` : ''}
          {s.enabled && s.nextDueAt ? ` · next read ${relativeTime(s.nextDueAt)}` : ''}
        </p>
        <ReadHistory source={s} />
      </div>

      <div className="flex items-center gap-x-5 shrink-0">
        <Button variant="quiet" size="sm" disabled={reading} onClick={onRead}>
          {reading ? 'Reading…' : 'Read now'}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Read
          <Select
            filter
            value={s.cadenceHours}
            disabled={off || busy}
            aria-label={`How often to read ${s.label}`}
            onChange={(e) => onCadence(Number(e.target.value))}
            className="!py-1 !text-xs"
          >
            {!offered && <option value={s.cadenceHours}>{cadenceLabel(s.cadenceHours)}</option>}
            {SOURCE_CADENCES.map((c) => (
              <option key={c.hours} value={c.hours}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>
        <Toggle
          checked={s.enabled}
          disabled={busy}
          label={`Read ${s.label}`}
          stateText={{ on: 'On', off: 'Off' }}
          onChange={onToggle}
        />
      </div>
    </li>
  )
}

/** The last reads of one source, fetched only when opened. A run of failures shows when the page went quiet. */
function ReadHistory({ source }: { source: CatalogSourceItem }) {
  const [open, setOpen] = useState(false)
  const reads = useQuery({
    queryKey: ['admin', 'catalog', 'reads', source.id, source.lastFetchedAt],
    queryFn: () => api.admin.sourceReads(source.id),
    enabled: open,
  })
  return (
    <details className="text-xs" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-muted">Read history</summary>
      {reads.isLoading ? (
        <p className="mt-1 text-muted">Loading…</p>
      ) : (reads.data?.items.length ?? 0) === 0 ? (
        <p className="mt-1 text-muted">No reads recorded yet.</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {reads.data!.items.map((r, i) => (
            <li key={i} className={r.ok ? 'text-muted' : 'text-warn-fg'}>
              {relativeTime(r.at)} · {r.ok ? 'understood' : 'not understood'} · {r.items} items
              {r.added > 0 ? `, ${r.added} new` : ''}
              {r.note ? ` · ${r.note}` : ''}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
