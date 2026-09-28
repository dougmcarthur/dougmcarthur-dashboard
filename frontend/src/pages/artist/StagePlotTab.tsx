import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import {
  INSTRUMENTS,
  STAGE,
  channelCount,
  inputList,
  layoutStage,
  monitorMixes,
  performerName,
  performerRole,
  powerDrops,
  stationScale,
  type Placed,
  type StagePlot,
} from '../../../../shared/stagePlot'
import { readClues, type ClueSource } from '../../../../shared/stagePlotClues'
import { Button } from '../../components/ui/Button'
import { Caption, Card, EmptyState } from '../../components/ui/Surface'
import { shortDate } from '../../format'
import { StagePlotFlow } from './StagePlotFlow'
import {
  AmpDrawing,
  DiDrawing,
  Glyph,
  IemDrawing,
  InstrumentDrawing,
  MicDrawing,
  PowerDrawing,
  WedgeDrawing,
} from './stagePlotIcons'

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
        <StageDiagram placed={placed} iem={plot.monitors === 'iem' || plot.monitors === 'both'} />
        <Legend plot={plot} placed={placed} />
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

function StageDiagram({ placed, iem }: { placed: Placed[]; iem: boolean }) {
  let mix = 0
  const k = stationScale(placed.length)
  return (
    <svg
      viewBox={`-20 -30 ${W + 40} ${D + 90}`}
      role="img"
      aria-label={`Stage plot showing ${placed.map((p) => `${p.name}, ${p.role}`).join('; ')}`}
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
        const wedgeNumber = p.wedge ? ++mix : 0
        const cx = p.x * SCALE
        const cy = p.y * SCALE
        return (
          <g key={p.performerId}>
            {p.wedge && (
              <g>
                <Glyph x={p.wedge.x * SCALE} y={p.wedge.y * SCALE} size={50 * k} className="text-body" title={`Monitor mix ${wedgeNumber}`}>
                  <WedgeDrawing />
                </Glyph>
                <text
                  x={p.wedge.x * SCALE}
                  y={p.wedge.y * SCALE + 34 * k}
                  textAnchor="middle"
                  className="fill-body"
                  fontSize={13 * k}
                  fontWeight={600}
                >
                  Mix {wedgeNumber}
                </text>
              </g>
            )}
            {/* Scaled around its own centre; the layout already made room. */}
            <g transform={`translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`}>
              <Station p={p} iem={iem} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * One performer's spot: the player, what they play and sing into, and what
 * has to reach them — the amp behind, the DI and the power drop beside.
 *
 * Held instruments (a guitar, a fiddle) sit beside the player, angled as they
 * are worn; instruments that stand in front of the player (a keyboard, a
 * laptop, hand drums) go downstage of them, with the vocal mic moved to the
 * side so the two do not stack. The kit is its own drawing, throne upstage.
 */
function Station({ p, iem }: { p: Placed; iem: boolean }) {
  const cx = p.x * SCALE
  const cy = p.y * SCALE
  const held = p.instruments.filter((i) => INSTRUMENTS[i].placement === 'held')
  const inFront = p.instruments.filter((i) => INSTRUMENTS[i].placement === 'front')
  const sings = p.vocals !== 'none'

  if (p.drums) {
    const extras = p.instruments.filter((i) => i !== 'drums')
    return (
      <g>
        <rect x={cx - 92} y={cy - 70} width={184} height={150} rx={10} strokeDasharray="6 6" className="fill-none stroke-line" strokeWidth={1.5} />
        <Glyph x={cx} y={cy + 4} size={150} title="Drum kit">
          <InstrumentDrawing id="drums" />
        </Glyph>
        {sings && (
          <Glyph x={cx + 70} y={cy - 40} size={32} className="text-body" title="Vocal mic">
            <MicDrawing />
          </Glyph>
        )}
        {extras.map((id, k) => (
          <Glyph key={id} x={cx - 118} y={cy - 20 + k * 56} size={50} title={INSTRUMENTS[id].label}>
            <InstrumentDrawing id={id} />
          </Glyph>
        ))}
        {iem && (
          <Glyph x={cx - 70} y={cy - 48} size={26} className="text-body" title="In-ear monitors">
            <IemDrawing />
          </Glyph>
        )}
        <Label x={cx} y={cy + 96} name={p.name} role={p.role} />
      </g>
    )
  }

  // Beside the player, alternating sides, angled as a guitar is worn.
  const heldAt = (k: number) => {
    const side = k % 2 === 0 ? 1 : -1
    const step = Math.floor(k / 2)
    return { x: cx + side * (44 + step * 34), y: cy + 6, rotate: side * 28 }
  }

  return (
    <g>
      {p.amp && (
        <Glyph x={cx} y={cy - 60} size={50} className="text-body" title="Amp">
          <AmpDrawing />
        </Glyph>
      )}
      {p.di && (
        <Glyph x={cx - 60} y={cy - 46} size={38} className="text-body" title="DI">
          <DiDrawing />
        </Glyph>
      )}
      {p.power && (
        <Glyph x={cx + 52} y={cy - 46} size={34} className="text-warn-fg" title="Power drop">
          <PowerDrawing />
        </Glyph>
      )}
      {iem && (
        <Glyph x={cx - 20} y={cy - 34} size={24} className="text-body" title="In-ear monitors">
          <IemDrawing />
        </Glyph>
      )}

      {held.map((id, k) => {
        const at = heldAt(k)
        return (
          <Glyph key={id} x={at.x} y={at.y} size={56} rotate={at.rotate} title={INSTRUMENTS[id].label}>
            <InstrumentDrawing id={id} />
          </Glyph>
        )
      })}

      <circle cx={cx} cy={cy} r={20} className="fill-accent-soft stroke-accent" strokeWidth={2.5} />
      <text x={cx} y={cy + 7} textAnchor="middle" className="fill-ink" fontSize={18} fontWeight={700}>
        {p.name.slice(0, 1).toUpperCase()}
      </text>

      {inFront.map((id, k) => (
        <Glyph
          key={id}
          x={cx + (k === 0 ? 0 : k % 2 ? 70 : -70)}
          y={cy + 42}
          width={id === 'keys' || id === 'synth' || id === 'pedal_steel' ? 92 : 58}
          height={58}
          title={INSTRUMENTS[id].label}
        >
          <InstrumentDrawing id={id} />
        </Glyph>
      ))}

      {sings && (
        <Glyph
          x={inFront.length ? cx + 58 : cx}
          y={inFront.length ? cy + 22 : cy + 34}
          size={34}
          className="text-body"
          title={p.vocals === 'lead' ? 'Lead vocal mic' : 'Backing vocal mic'}
        >
          <MicDrawing />
        </Glyph>
      )}

      <Label x={cx} y={cy + (inFront.length ? 86 : sings ? 68 : 48)} name={p.name} role={p.role} />
    </g>
  )
}

/**
 * The performer's name under their station. Only the name: the drawings say
 * what they play, and a role line wide enough to read collided with the next
 * station's on any front line of three. The full role is in the SVG's title
 * for a screen reader and in the line-up beside the plot.
 */
function Label({ x, y, name, role }: { x: number; y: number; name: string; role: string }) {
  return (
    <text x={x} y={y} textAnchor="middle" className="fill-ink" fontSize={17} fontWeight={600}>
      <title>{`${name} — ${role}`}</title>
      {name.length > 18 ? `${name.slice(0, 17)}…` : name}
    </text>
  )
}

/** A key to the drawing, with the same drawings at icon size, and only what the plot uses. */
function Legend({ plot, placed }: { plot: StagePlot; placed: Placed[] }) {
  const items: Array<{ label: string; draw: ReactNode; className?: string }> = []
  const ids = [...new Set(plot.performers.flatMap((p) => p.instruments))]
  for (const id of ids) items.push({ label: INSTRUMENTS[id].label, draw: <InstrumentDrawing id={id} /> })
  if (plot.performers.some((p) => p.vocals !== 'none')) items.push({ label: 'Vocal mic', draw: <MicDrawing />, className: 'text-body' })
  if (placed.some((p) => p.amp)) items.push({ label: 'Amp', draw: <AmpDrawing />, className: 'text-body' })
  if (placed.some((p) => p.di)) items.push({ label: 'DI box', draw: <DiDrawing />, className: 'text-body' })
  if (placed.some((p) => p.power)) items.push({ label: 'Power drop', draw: <PowerDrawing />, className: 'text-warn-fg' })
  if (placed.some((p) => p.wedge)) items.push({ label: 'Monitor wedge', draw: <WedgeDrawing />, className: 'text-body' })
  if (plot.monitors === 'iem' || plot.monitors === 'both') items.push({ label: 'In-ear monitors', draw: <IemDrawing />, className: 'text-body' })

  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <svg viewBox="0 0 48 48" className={`h-6 w-6 shrink-0 ${it.className ?? 'text-ink'}`} aria-hidden>
            {it.draw}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  )
}
