import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import {
  STAGE,
  channelCount,
  inputList,
  layoutStage,
  monitorMixes,
  performerName,
  performerRole,
  powerDrops,
  type Placed,
  type StagePlot,
} from '../../../../shared/stagePlot'
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

  const clues = useMemo(() => {
    const sources: ClueSource[] = [
      ...(docs.data ?? []).map((d) => ({ source: d.title, text: d.content })),
      ...(library.data?.items ?? [])
        .filter((a) => !a.archived && (a.kind === 'bio' || a.kind === 'fact' || a.kind === 'document'))
        .map((a) => ({ source: a.label, text: [a.kind === 'document' ? '' : a.value, a.notes].filter(Boolean).join('\n') })),
    ]
    return readClues(sources)
  }, [docs.data, library.data])

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
          <Button variant="primary" onClick={() => setSurveying(true)}>
            Start
          </Button>
        </Card>
      ) : (
        <PlotView
          plot={current}
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

function PlotView({ plot, onEdit, onReset }: { plot: StagePlot; onEdit: () => void; onReset: () => void }) {
  const lines = inputList(plot)
  const placed = layoutStage(plot)
  const mixes = monitorMixes(plot)
  const drops = powerDrops(plot)
  const monitorKind = { wedges: 'floor wedges', iem: 'in-ear monitors', both: 'wedges and in-ears', none: '' }[plot.monitors]

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
        <StageDiagram placed={placed} />
        <Legend />
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
                    <tr key={`${l.ch}-${l.label}`}>
                      <td className="px-3 py-2 tabular-nums text-muted whitespace-nowrap">
                        {l.stereo ? `${l.ch}–${l.ch + 1}` : l.ch}
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {l.label}
                        {l.stereo && <span className="text-muted"> (L/R)</span>}
                      </td>
                      <td className="px-3 py-2 text-body">{l.source}</td>
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

      <p className="text-xs text-faint print:hidden">
        Inputs are the usual choice for each instrument. If your rig is different, say so in the notes or the gear
        list — both are printed on the plot.
      </p>
    </div>
  )
}

const SCALE = 10
const W = STAGE.width * SCALE
const D = STAGE.depth * SCALE

function StageDiagram({ placed }: { placed: Placed[] }) {
  let mix = 0
  return (
    <svg
      viewBox={`-20 -30 ${W + 40} ${D + 90}`}
      role="img"
      aria-label={`Stage plot showing ${placed.map((p) => p.name).join(', ')}`}
      className="w-full h-auto"
    >
      {/* The stage, back wall at the top. */}
      <rect x={0} y={0} width={W} height={D} rx={8} className="fill-sunken stroke-line-strong" strokeWidth={2} />
      <text x={W / 2} y={-10} textAnchor="middle" className="fill-muted" fontSize={16} letterSpacing={2}>
        UPSTAGE
      </text>
      <text x={10} y={D - 12} className="fill-faint" fontSize={14}>
        Stage right
      </text>
      <text x={W - 10} y={D - 12} textAnchor="end" className="fill-faint" fontSize={14}>
        Stage left
      </text>
      <text x={W / 2} y={D + 44} textAnchor="middle" className="fill-muted" fontSize={16} letterSpacing={2}>
        AUDIENCE
      </text>

      {placed.map((p) => {
        const cx = p.x * SCALE
        const cy = p.y * SCALE
        const wedgeNumber = p.wedge ? ++mix : 0
        return (
          <g key={p.performerId}>
            {p.drums && (
              // A kit: kick, snare, toms and two cymbals, around the drummer.
              <g className="fill-surface stroke-line-strong" strokeWidth={2}>
                <rect x={cx - 95} y={cy - 55} width={190} height={130} rx={10} strokeDasharray="6 6" className="fill-none stroke-line" />
                <circle cx={cx} cy={cy + 42} r={30} />
                <circle cx={cx - 45} cy={cy + 20} r={17} />
                <circle cx={cx + 45} cy={cy + 20} r={20} />
                <circle cx={cx - 22} cy={cy - 8} r={14} />
                <circle cx={cx + 22} cy={cy - 8} r={14} />
                <circle cx={cx - 75} cy={cy - 30} r={16} className="fill-raised" />
                <circle cx={cx + 75} cy={cy - 30} r={16} className="fill-raised" />
              </g>
            )}
            {p.amp && (
              <g>
                <rect x={cx - 34} y={cy - 92} width={68} height={40} rx={4} className="fill-raised stroke-line-strong" strokeWidth={2} />
                <text x={cx} y={cy - 67} textAnchor="middle" className="fill-body" fontSize={14}>
                  Amp
                </text>
              </g>
            )}
            {p.power && (
              <g>
                <rect x={cx + 40} y={cy - 48} width={40} height={24} rx={4} className="fill-warn-bg stroke-warn-line" strokeWidth={1.5} />
                <text x={cx + 60} y={cy - 31} textAnchor="middle" className="fill-warn-fg" fontSize={13} fontWeight={600}>
                  AC
                </text>
              </g>
            )}
            {p.wedge && (
              <g>
                <polygon
                  points={`${p.wedge.x * SCALE - 32},${p.wedge.y * SCALE + 14} ${p.wedge.x * SCALE + 32},${p.wedge.y * SCALE + 14} ${p.wedge.x * SCALE + 22},${p.wedge.y * SCALE - 10} ${p.wedge.x * SCALE - 22},${p.wedge.y * SCALE - 10}`}
                  className="fill-raised stroke-line-strong"
                  strokeWidth={2}
                />
                <text x={p.wedge.x * SCALE} y={p.wedge.y * SCALE + 8} textAnchor="middle" className="fill-body" fontSize={13}>
                  Mix {wedgeNumber}
                </text>
              </g>
            )}
            {!p.drums && <circle cx={cx} cy={cy} r={26} className="fill-accent-soft stroke-accent" strokeWidth={2.5} />}
            {!p.drums && (
              <text x={cx} y={cy + 7} textAnchor="middle" className="fill-ink" fontSize={20} fontWeight={700}>
                {p.name.slice(0, 1).toUpperCase()}
              </text>
            )}
            <text x={cx} y={p.drums ? cy + 100 : cy + 50} textAnchor="middle" className="fill-ink" fontSize={17} fontWeight={600}>
              {p.name}
            </text>
            <text x={cx} y={p.drums ? cy + 120 : cy + 70} textAnchor="middle" className="fill-muted" fontSize={13}>
              {p.role.length > 34 ? `${p.role.slice(0, 33)}…` : p.role}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-full border-2 border-accent bg-accent-soft" aria-hidden /> Performer
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm border border-line-strong bg-raised" aria-hidden /> Amp
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm border border-warn-line bg-warn-bg" aria-hidden /> Power drop
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 border border-line-strong bg-raised [clip-path:polygon(0_100%,100%_100%,85%_0,15%_0)]" aria-hidden /> Monitor wedge
      </li>
    </ul>
  )
}
