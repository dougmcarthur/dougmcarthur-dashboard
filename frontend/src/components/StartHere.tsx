import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { LaneId, LaneRow, StartLanes, SyncRow } from '../../../shared/startLanes'
import type { RegionId } from '../../../shared/onboarding'
import { Button } from './ui/Button'
import { Select } from './ui/Field'
import { Card } from './ui/Surface'

/**
 * What a brand-new account is shown, before it has said anything.
 *
 * The Overview of an account with no rows used to be a checklist and an empty
 * deck, and the starter set waited until the artist had answered the welcome
 * questions and then sat behind a button. The most useful thing a first screen
 * can do is show that the product already knows something, so this lists what
 * is open to nearly any Canadian artist: grants anywhere in Canada, festivals
 * and showcases in their province, and sync companies whose own sites say they
 * take submissions and ask for no exclusivity.
 *
 * It is a preview and each row is its own decision. Nothing goes on the list
 * until Add is pressed for it, and "Not now" ends the asking. The rows are
 * chosen on the Worker (`shared/startLanes.ts`), and the add routes check every
 * id against what the lanes would offer again, so this screen only displays.
 *
 * Renders nothing once they have answered, when suggestions are switched off,
 * once the account has a list of its own, and when there is nothing to show and
 * nothing to ask.
 */
export function StartHere() {
  const qc = useQueryClient()
  const preview = useQuery({ queryKey: ['matching', 'start'], queryFn: api.matching.start })
  const [notice, setNotice] = useState<string | null>(null)

  const changed = () => {
    for (const key of ['matching', 'review', 'gigs', 'sync', 'overview', 'notifications', 'onboarding'])
      qc.invalidateQueries({ queryKey: [key] })
  }

  const addGigs = useMutation({
    mutationFn: (ids: number[]) => api.matching.addToList(ids),
    onSuccess: (r) => {
      setNotice(
        r.added === 0
          ? 'That one was already on your list.'
          : `${r.names.join(', ')} ${r.added === 1 ? 'is' : 'are'} on your list now, under New.`,
      )
      changed()
    },
  })
  const addSync = useMutation({
    mutationFn: (id: number) => api.matching.addSync(id),
    onSuccess: (r) => {
      setNotice(`${r.name} is on your Sync list now. Read their terms yourself before you sign anything.`)
      changed()
    },
  })
  const decline = useMutation({ mutationFn: api.matching.decline, onSuccess: changed })

  const data = preview.data
  if (!data || data.answered || data.off || data.established || data.lanes === null) return null

  const { lanes } = data
  const shown = lanes.grants.rows.length + lanes.province.rows.length + lanes.sync.rows.length + lanes.sync.unclear.length
  // Nothing to show and nothing to ask: say nothing rather than three sentences
  // about what Scout does not have.
  if (shown === 0 && lanes.province.region !== null) return null

  const busy = addGigs.isPending || addSync.isPending || decline.isPending
  const error =
    addGigs.error instanceof Error ? addGigs.error.message
    : addSync.error instanceof Error ? addSync.error.message
    : decline.error instanceof Error ? decline.error.message
    : null

  return (
    <Card pad="md" as="section" aria-labelledby="start-here-title" className="space-y-6">
      <div className="space-y-1">
        <h2 id="start-here-title" className="text-base font-semibold text-ink">
          Here is what Scout has open right now.
        </h2>
        <p className="text-sm text-body max-w-prose">
          Scout keeps one list of open calls for every Canadian artist, and these are open to nearly anyone. Nothing goes
          on your list until you press Add.
        </p>
      </div>

      {lanes.order.map((id) => (
        <Lane key={id} id={id} lanes={lanes} busy={busy} onAddGig={(row) => addGigs.mutate([row.id])} onAddSync={(row) => addSync.mutate(row.id)} />
      ))}

      {notice && (
        <p role="status" className="text-sm text-success-fg">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button variant="quiet" disabled={busy} onClick={() => decline.mutate()}>
          Not now
        </Button>
        <p className="text-xs text-muted">Scout keeps looking and will tell you in the bell when more arrive.</p>
      </div>
    </Card>
  )
}

function Lane({
  id,
  lanes,
  busy,
  onAddGig,
  onAddSync,
}: {
  id: LaneId
  lanes: StartLanes
  busy: boolean
  onAddGig: (row: LaneRow) => void
  onAddSync: (row: SyncRow) => void
}) {
  if (id === 'grants') {
    return (
      <LaneShell id="grants" heading={lanes.grants.heading} more={lanes.grants.total - lanes.grants.rows.length}>
        <GigRows rows={lanes.grants.rows} busy={busy} onAdd={onAddGig} />
      </LaneShell>
    )
  }

  if (id === 'province') {
    const { region, rows, heading, total } = lanes.province
    return (
      <LaneShell id="province" heading={heading} more={total - rows.length}>
        {region === null ? <ProvinceChooser /> : <GigRows rows={rows} busy={busy} onAdd={onAddGig} />}
      </LaneShell>
    )
  }

  return <SyncLane lanes={lanes} busy={busy} onAdd={onAddSync} />
}

function LaneShell({
  id,
  heading,
  more,
  children,
}: {
  id: string
  heading: string
  more?: number
  children?: ReactNode
}) {
  return (
    <section aria-labelledby={`lane-${id}`} className="space-y-2">
      <h3 id={`lane-${id}`} className="text-sm font-semibold text-ink">
        {heading}
      </h3>
      {children}
      {more !== undefined && more > 0 && (
        <p className="text-xs text-muted">
          {more} more {more === 1 ? 'is' : 'are'} open. {more === 1 ? 'It appears' : 'They appear'} as you add these.
        </p>
      )}
    </section>
  )
}

function GigRows({ rows, busy, onAdd }: { rows: LaneRow[]; busy: boolean; onAdd: (row: LaneRow) => void }) {
  if (rows.length === 0) return null
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {rows.map((row) => (
        <li key={row.id} className="px-3 py-2.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm text-ink">
              <Listing name={row.name} url={row.url} />
              <span className="text-muted">
                {row.kind ? ` · ${row.kind}` : ''}
                {row.location ? ` · ${row.location}` : ''}
              </span>
            </p>
            <p className="text-xs text-body leading-relaxed">{row.reasons.join(' ')}</p>
            {row.unknowns.length > 0 && (
              <p className="text-xs text-muted leading-relaxed">{row.unknowns.join(' ')}</p>
            )}
          </div>
          <Button variant="neutral" size="sm" disabled={busy} aria-label={`Add ${row.name} to my list`} onClick={() => onAdd(row)}>
            Add to my list
          </Button>
        </li>
      ))}
    </ul>
  )
}

function Listing({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
      {name}
    </a>
  ) : (
    <span className="font-medium">{name}</span>
  )
}

/**
 * The one lane that needs an answer. With no province on file it asks, in the
 * place the question matters, instead of showing somebody else's.
 */
function ProvinceChooser() {
  const qc = useQueryClient()
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: api.onboarding.read })
  const [region, setRegion] = useState<RegionId | ''>('')
  const save = useMutation({
    mutationFn: (value: RegionId) => api.onboarding.saveProfile({ region: value }),
    onSuccess: () => {
      for (const key of ['matching', 'onboarding', 'review', 'profile']) qc.invalidateQueries({ queryKey: [key] })
    },
  })

  // "Outside Canada" is a real answer to the welcome question and names no
  // province to look in, so it is not offered here.
  const options = (onboarding.data?.options.regions ?? []).filter((r) => r.id !== 'abroad')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="start-province" className="sr-only">
        Your province or territory
      </label>
      <Select
        id="start-province"
        filter
        value={region}
        disabled={options.length === 0 || save.isPending}
        onChange={(e) => setRegion(e.target.value as RegionId | '')}
      >
        <option value="">Choose your province</option>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </Select>
      <Button variant="primary" disabled={region === '' || save.isPending} onClick={() => region && save.mutate(region)}>
        Show them
      </Button>
      {save.error instanceof Error && (
        <p role="alert" className="text-xs text-danger-fg">
          {save.error.message}
        </p>
      )}
    </div>
  )
}

function SyncLane({ lanes, busy, onAdd }: { lanes: StartLanes; busy: boolean; onAdd: (row: SyncRow) => void }) {
  const [showUnclear, setShowUnclear] = useState(false)
  const { rows, unclear, unclearTotal, exclusive, closed, heading } = lanes.sync
  const left = [
    exclusive > 0 && `${exclusive} ${exclusive === 1 ? 'company asks' : 'companies ask'} for exclusivity`,
    closed > 0 &&
      `${closed} ${closed === 1 ? 'company does' : 'companies do'} not take submissions from people they do not know`,
  ].filter((s): s is string => Boolean(s))

  return (
    <LaneShell id="sync" heading={heading}>
      {rows.length > 0 && <SyncRows rows={rows} busy={busy} onAdd={onAdd} />}

      {unclearTotal > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-body">
            {unclearTotal} more {unclearTotal === 1 ? 'takes' : 'take'} submissions, and{' '}
            {unclearTotal === 1 ? 'its' : 'their'} sites say nothing about exclusivity. Silence is not the same as asking
            for none, so ask before you sign.{' '}
            <button
              type="button"
              className="underline text-body hover:text-ink"
              aria-expanded={showUnclear}
              onClick={() => setShowUnclear((v) => !v)}
            >
              {showUnclear ? 'Hide those companies' : 'Show those companies'}
            </button>
          </p>
          {showUnclear && <SyncRows rows={unclear} busy={busy} onAdd={onAdd} />}
        </div>
      )}

      {left.length > 0 && <p className="text-xs text-muted">Left out: {left.join(', and ')}.</p>}
      {(rows.length > 0 || unclearTotal > 0) && (
        <p className="text-xs text-muted">
          This is what each company&rsquo;s own pages say, read by Scout. Read their terms yourself before you sign
          anything.
        </p>
      )}
    </LaneShell>
  )
}

function SyncRows({ rows, busy, onAdd }: { rows: SyncRow[]; busy: boolean; onAdd: (row: SyncRow) => void }) {
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {rows.map((row) => (
        <li key={row.id} className="px-3 py-2.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm text-ink">
              <Listing name={row.name} url={row.site} />
              {row.kind && <span className="text-muted"> · {row.kind}</span>}
            </p>
            <p className="text-xs text-body leading-relaxed">
              Takes submissions: &ldquo;{row.policyQuote}&rdquo;
              {row.policyUrl && (
                <>
                  {' '}
                  <a href={row.policyUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Their page
                  </a>
                </>
              )}
            </p>
            {row.exclusivityQuote ? (
              <p className="text-xs text-body leading-relaxed">
                No exclusivity: &ldquo;{row.exclusivityQuote}&rdquo;
                {row.exclusivityUrl && (
                  <>
                    {' '}
                    <a href={row.exclusivityUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      Their page
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="text-xs text-muted leading-relaxed">
                {row.exclusivityRead
                  ? 'Their site was read and says nothing about exclusivity.'
                  : 'Their site has not been read for exclusivity yet.'}
              </p>
            )}
          </div>
          <Button variant="neutral" size="sm" disabled={busy} aria-label={`Add ${row.name} to my Sync list`} onClick={() => onAdd(row)}>
            Add to my Sync list
          </Button>
        </li>
      ))}
    </ul>
  )
}
