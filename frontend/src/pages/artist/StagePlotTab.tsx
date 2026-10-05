import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import {
  channelCount,
  inputList,
  monitorMixes,
  performerName,
  performerPhoto,
  performerRole,
  powerDrops,
  type Performer,
  type StageArrangement,
  type StagePlot,
} from '../../../../shared/stagePlot'
import { cardRows, connectionOf, connectionsUsed, type Connection } from '../../../../shared/stagePlotCards'
import {
  ConnectionLegend,
  ChannelChip,
  StageCards,
  Toggle,
  chipClass,
  connectionClass,
  loadPlotView,
  savePlotView,
  type LibraryPhoto,
  type PlotViewOptions,
} from './StageCards'
import { readClues, type ClueSource } from '../../../../shared/stagePlotClues'
import { Button } from '../../components/ui/Button'
import { Caption, Card, EmptyState } from '../../components/ui/Surface'
import { shortDate } from '../../format'
import { StagePlotFlow } from './StagePlotFlow'

/**
 * The stage plot: the drawing, the input list, and what a tech needs to know
 * about power and monitors — generated from the survey's answers every time
 * it is opened, so changing one answer changes everything that follows from it.
 *
 * Printing is the export: the browser's Save as PDF turns this into the file a
 * festival's tech-rider field asks for, with the app's chrome left off.
 */
export function StagePlotTab() {
  const qc = useQueryClient()
  const [surveying, setSurveying] = useState(false)
  const plot = useQuery({ queryKey: ['stage-plot'], queryFn: api.stagePlot.read })
  const docs = useQuery({ queryKey: ['referenceDocs'], queryFn: api.referenceDocs.list })
  const library = useQuery({ queryKey: ['artist', '', ''], queryFn: () => api.artist.list() })
  const profile = useQuery({ queryKey: ['profile'], queryFn: api.profile.read })
  const readings = useQuery({ queryKey: ['document-readings'], queryFn: api.documentReadings.list })

  const clues = useMemo(() => {
    const sources: ClueSource[] = [
      ...(docs.data ?? []).map((d) => ({ source: d.title, text: d.content })),
      ...(library.data?.items ?? [])
        .filter((a) => !a.archived && (a.kind === 'bio' || a.kind === 'fact' || a.kind === 'document'))
        .map((a) => ({ source: a.label, text: [a.kind === 'document' ? '' : a.value, a.notes].filter(Boolean).join('\n') })),
      // A stage plot or rider the document reader looked at for us — its
      // words are drawn, so nothing else can read it.
      ...(readings.data?.readings ?? []).map((r) => ({ source: r.label, text: r.text })),
    ]
    return readClues(sources)
  }, [docs.data, library.data, readings.data])
  const waiting = readings.data?.pending ?? []

  // Every usable photo in the library, offered on each card; the first one is
  // Scout's choice for the artist's own card (`performerPhoto`).
  const photos: LibraryPhoto[] = (library.data?.items ?? [])
    .filter((a) => a.kind === 'photo' && !a.archived && /^https:\/\//.test(a.value ?? ''))
    .map((a) => ({ url: a.value!, label: a.label }))
  const photoFor = (_p: Performer, i: number): string | null =>
    current
      ? performerPhoto(current, i, { photo: photos[0]?.url ?? null, ownName: profile.data?.displayName ?? null })
      : null

  const remove = useMutation({
    mutationFn: api.stagePlot.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stage-plot'] }),
  })

  const current = plot.data?.plot ?? null
  const ready = !plot.isLoading && !docs.isLoading && !library.isLoading

  return (
    <div className="space-y-4">
      {!ready ? (
        <div className="h-40 bg-sunken rounded-xl animate-pulse" />
      ) : !current ? (
        <Card pad="md" className="space-y-3">
          <h2 className="text-base font-semibold text-ink">Make a stage plot</h2>
          <p className="text-sm text-body max-w-prose">
            Answer a few questions about how you perform — who’s on stage and what they play — and Scout draws a
            stage plot and input list you can send to any venue or festival.
          </p>
          {(clues.members.length > 0 || clues.gear.length > 0 || clues.act) && (
            <p className="text-sm text-muted max-w-prose">
              Scout has already found some of the answers in your documents and will suggest them as you go.
            </p>
          )}
          <WaitingNote waiting={waiting} />
          <Button variant="primary" onClick={() => setSurveying(true)}>
            Start
          </Button>
        </Card>
      ) : (
        <PlotView
          plot={current}
          waiting={waiting}
          photoFor={photoFor}
          photos={photos}
          onEdit={() => setSurveying(true)}
          onReset={() => {
            if (confirm('Start the stage plot over? Your answers will be cleared.')) remove.mutate()
          }}
        />
      )}

      {surveying && (
        <StagePlotFlow
          initial={current}
          clues={clues}
          displayName={profile.data?.displayName ?? null}
          onClose={() => setSurveying(false)}
        />
      )}
    </div>
  )
}

/**
 * A stage plot or rider in the library that the document reader has not got
 * to yet. Said, rather than left out, so "Scout didn't read my plot" has an
 * answer on the page: it is waiting, and it is read on the next run. Not
 * "its words are drawn" — that is why a reader exists, not something known
 * about a file nobody has opened.
 */
function WaitingNote({ waiting }: { waiting: Array<{ assetId: number; label: string }> }) {
  if (waiting.length === 0) return null
  const names = waiting.map((w) => `“${w.label}”`).join(', ')
  return (
    <p className="text-sm text-muted max-w-prose print:hidden">
      {names} {waiting.length === 1 ? 'is' : 'are'} waiting for the document reader, which looks at stage plots and
      riders on its next run. What it finds is offered here as suggestions.
    </p>
  )
}

function PlotView({
  plot,
  waiting,
  photoFor,
  photos,
  onEdit,
  onReset,
}: {
  plot: StagePlot
  waiting: Array<{ assetId: number; label: string }>
  photoFor: (p: Performer, i: number) => string | null
  photos: LibraryPhoto[]
  onEdit: () => void
  onReset: () => void
}) {
  const qc = useQueryClient()
  const lines = inputList(plot)
  const mixes = monitorMixes(plot)
  const drops = powerDrops(plot)
  const monitorKind = { wedges: 'floor wedges', iem: 'in-ear monitors', both: 'wedges and in-ears', none: '' }[plot.monitors]
  const [view, setViewState] = useState<PlotViewOptions>(loadPlotView)
  const setView = (patch: Partial<PlotViewOptions>) =>
    setViewState((v) => {
      const next = { ...v, ...patch }
      savePlotView(next)
      return next
    })
  // A card and its input-list rows light up together, and a legend chip picks
  // out every connection of its kind — the two questions a tech asks of a plot.
  const [hovered, setHovered] = useState<string | null>(null)
  const [focus, setFocus] = useState<Connection | null>(null)
  const [arranging, setArranging] = useState(false)
  const used = connectionsUsed(plot.performers.flatMap((p, i) => cardRows(plot, lines, p, i + 1)))

  const choosePhoto = useMutation({
    mutationFn: ({ id, choice }: { id: string; choice: string | null }) => {
      const { updatedAt: _, ...body } = plot
      return api.stagePlot.save({
        ...body,
        performers: body.performers.map((p) => (p.id === id ? { ...p, photo: choice } : p)),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stage-plot'] }),
  })

  const arrange = useMutation({
    mutationFn: (stage: StageArrangement | null) => {
      const { updatedAt: _, ...body } = plot
      return api.stagePlot.save({ ...body, stage })
    },
    onSuccess: () => {
      setArranging(false)
      return qc.invalidateQueries({ queryKey: ['stage-plot'] })
    },
  })

  return (
    <div className="space-y-4 stage-plot-print">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted">
          {plot.updatedAt ? `Updated ${shortDate(plot.updatedAt)}` : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="neutral" onClick={onEdit}>
            Edit answers
          </Button>
          <Button variant="primary" onClick={() => window.print()}>
            Print or save as PDF
          </Button>
          <Button variant="quiet" onClick={onReset}>
            Start over
          </Button>
        </div>
      </div>

      <Card pad="md" className="space-y-4 break-inside-avoid">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">
            Stage plot — {plot.performers.length === 1 ? performerName(plot.performers[0], 0) : `${plot.performers.length}-piece`}
          </h2>
          <p className="text-sm text-muted">
            {channelCount(lines)} channels · {mixes ? `${mixes} monitor ${mixes === 1 ? 'mix' : 'mixes'}` : 'no monitors'} ·{' '}
            {drops.length} power {drops.length === 1 ? 'drop' : 'drops'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Toggle
            label="Colour"
            value={view.colour ? 'colour' : 'mono'}
            onChange={(id) => setView({ colour: id === 'colour' })}
            options={[
              { id: 'colour', label: 'Colour' },
              { id: 'mono', label: 'Print view' },
            ]}
          />
          <Toggle
            label="Detail"
            value={view.detail}
            onChange={(id) => setView({ detail: id === 'simple' ? 'simple' : 'expanded' })}
            options={[
              { id: 'expanded', label: 'Expanded' },
              { id: 'simple', label: 'Simple' },
            ]}
          />
          <Toggle
            label="Names"
            value={view.models ? 'models' : 'types'}
            onChange={(id) => setView({ models: id === 'models' })}
            options={[
              { id: 'models', label: 'Make and model' },
              { id: 'types', label: 'Type only' },
            ]}
          />
          {plot.performers.length > 1 && !arranging && (
            <Button variant="neutral" size="sm" onClick={() => setArranging(true)}>
              Rearrange
            </Button>
          )}
        </div>

        <StageCards
          plot={plot}
          lines={lines}
          view={view}
          focus={focus}
          hovered={hovered}
          onHover={setHovered}
          photoFor={photoFor}
          photos={photos}
          onChoosePhoto={(id, choice) => choosePhoto.mutate({ id, choice })}
          choosingPhoto={choosePhoto.isPending}
          arranging={arranging}
          saving={arrange.isPending}
          onSaveArrangement={(stage) => arrange.mutate(stage)}
          onCancelArrangement={() => setArranging(false)}
        />
        {choosePhoto.error && <p className="text-sm text-danger-fg">The photo didn’t save. Try again.</p>}
        {arrange.error && (
          <p className="text-sm text-danger-fg">The positions didn’t save. Try again.</p>
        )}
        <ConnectionLegend used={used} view={view} focus={focus} onFocus={setFocus} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr),minmax(0,2fr)]">
        <Card as="section" pad="none" clip className="break-inside-avoid">
          <header className="px-4 py-2.5 bg-sunken border-b border-line">
            <Caption as="h2">Input list</Caption>
          </header>
          {lines.length === 0 ? (
            <EmptyState>No inputs yet — edit the answers and choose what each person plays.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted border-b border-line">
                    <th className="px-3 py-2 font-medium">Ch</th>
                    <th className="px-3 py-2 font-medium">Input</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Stand</th>
                    <th className="px-3 py-2 font-medium">48V</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lines.map((l) => (
                    <tr
                      key={`${l.ch}-${l.label}`}
                      onMouseEnter={() => setHovered(l.performerId)}
                      onMouseLeave={() => setHovered(null)}
                      className={`transition-colors ${hovered && hovered === l.performerId ? 'bg-accent-soft print:bg-surface' : ''} ${
                        focus && focus !== connectionOf(l.source) ? 'opacity-30 print:opacity-100' : ''
                      }`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {/* The same mark the drawing puts beside the source, so the two can be matched by eye. */}
                        <ChannelChip
                          ch={l.stereo ? `${l.ch}–${l.ch + 1}` : String(l.ch)}
                          className={chipClass(connectionOf(l.source), view.colour)}
                        />
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {l.label}
                        {l.stereo && <span className="text-muted"> (L/R)</span>}
                      </td>
                      <td className="px-3 py-2 text-body">
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className={`h-2.5 w-2.5 shrink-0 rounded-full border ${connectionClass(connectionOf(l.source), view.colour)}`}
                          />
                          {l.source}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-body">{l.stand ?? '—'}</td>
                      <td className="px-3 py-2 text-body">{l.phantom ? 'Yes' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card as="section" className="space-y-3 break-inside-avoid">
            <Caption as="h2">Line-up</Caption>
            <ul className="space-y-2.5">
              {plot.performers.map((p, i) => (
                <li key={p.id}>
                  <p className="text-sm font-medium text-ink">{performerName(p, i)}</p>
                  <p className="text-xs text-muted">{performerRole(p)}</p>
                  {p.gear.length > 0 && <p className="text-xs text-body mt-0.5">Gear: {p.gear.join(', ')}</p>}
                </li>
              ))}
            </ul>
          </Card>

          <Card as="section" className="space-y-2 text-sm break-inside-avoid">
            <Caption as="h2">For the sound tech</Caption>
            <p className="text-body">
              <span className="text-muted">Monitors:</span>{' '}
              {mixes ? `${mixes} ${mixes === 1 ? 'mix' : 'separate mixes'}, ${monitorKind}` : 'none needed'}
            </p>
            <p className="text-body">
              <span className="text-muted">Power:</span>{' '}
              {drops.length ? `a drop at ${drops.join(', ')}` : 'nothing on stage needs power'}
            </p>
            {plot.playback && (
              <p className="text-body">
                <span className="text-muted">Playback:</span> backing tracks or click, stereo DI
              </p>
            )}
            {plot.notes && <p className="text-body whitespace-pre-line">{plot.notes}</p>}
          </Card>
        </div>
      </div>

      <WaitingNote waiting={waiting} />

      <p className="text-xs text-faint print:hidden">
        Inputs are the usual choice for each instrument. If your rig is different, say so in the notes or the gear
        list — both are printed on the plot.
      </p>
    </div>
  )
}
