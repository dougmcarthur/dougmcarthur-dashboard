import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import {
  NO_PHOTO,
  performerName,
  performerRole,
  stageLines,
  type InputLine,
  type Performer,
  type StageArrangement,
  type StagePlot,
} from '../../../../shared/stagePlot'
import { CONNECTION_LABEL, cardRows, type CardRow, type Connection } from '../../../../shared/stagePlotCards'
import { Button } from '../../components/ui/Button'
import { Thumb } from './LibraryViews'
import {
  AmpDrawing,
  DiDrawing,
  IemDrawing,
  InstrumentDrawing,
  MicDrawing,
  PowerDrawing,
  WedgeDrawing,
} from './stagePlotIcons'

/**
 * The stage, as cards: each performer where they stand, with a photo when the
 * library has one, and a row for every input, monitor and power drop — icon,
 * name, make and model, and the connection on the right, numbered like the
 * input list.
 *
 * Two lines, upstage and downstage, read stage right to stage left, rather
 * than coordinates: a card needs room a dot did not, and "who stands next to
 * whom, front or back" is what a tech reads off a plot anyway. Arranging is
 * moving a card along or between the lines.
 */

export interface PlotViewOptions {
  /** Colour-coded connectors on screen, or the monochrome sheet that prints. */
  colour: boolean
  /** Every row, or just who plays what. */
  detail: 'expanded' | 'simple'
  /** Instrument types alone, or with the make and model named. */
  models: boolean
}

const VIEW_KEY = 'scout.stagePlot.view'
export const DEFAULT_VIEW: PlotViewOptions = { colour: true, detail: 'expanded', models: true }

export function loadPlotView(): PlotViewOptions {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as Partial<PlotViewOptions> | null
    return {
      colour: typeof v?.colour === 'boolean' ? v.colour : DEFAULT_VIEW.colour,
      detail: v?.detail === 'simple' ? 'simple' : 'expanded',
      models: typeof v?.models === 'boolean' ? v.models : DEFAULT_VIEW.models,
    }
  } catch {
    return DEFAULT_VIEW
  }
}

export function savePlotView(v: PlotViewOptions) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v))
  } catch {
    // Kept for this visit only.
  }
}

/**
 * One colour per kind of connection, from the `conn-*` tokens. Every class
 * has a `print:` twin back to ink on paper: the printed sheet is monochrome
 * whatever the screen shows, because a venue's photocopier will make it so.
 */
// Their own tokens, not the categorical ones: those are neutral on purpose
// everywhere else in the app (index.css), and here the hue is the point.
const CONNECTION_COLOUR: Record<Exclude<Connection, 'none'>, string> = {
  mic: 'bg-conn-mic-bg text-conn-mic-fg border-conn-mic-fg',
  di: 'bg-conn-di-bg text-conn-di-fg border-conn-di-fg',
  wedge: 'bg-conn-wedge-bg text-conn-wedge-fg border-conn-wedge-fg',
  iem: 'bg-conn-iem-bg text-conn-iem-fg border-conn-iem-fg',
  power: 'bg-conn-power-bg text-conn-power-fg border-conn-power-fg',
}
const MONO = 'bg-surface text-ink border-line-strong'
const PRINT_MONO = 'print:bg-surface print:text-ink print:border-ink'

export function connectionClass(c: Connection, colour: boolean): string {
  if (c === 'none') return MONO
  return `border-2 ${colour ? CONNECTION_COLOUR[c] : MONO} ${PRINT_MONO}`
}

/** The channel chip in the same colour as its connection, so a number on a card finds its row by colour too. */
export function chipClass(c: Connection, colour: boolean): string {
  if (!colour || c === 'none') return 'border-ink text-ink'
  return `${CONNECTION_COLOUR[c].replace(/bg-\S+ /, '')} print:border-ink print:text-ink`
}

function ConnectionGlyph({ c }: { c: Connection }) {
  switch (c) {
    case 'mic':
      return <MicDrawing />
    case 'di':
      return <DiDrawing />
    case 'wedge':
      return <WedgeDrawing />
    case 'iem':
      return <IemDrawing />
    case 'power':
      return <PowerDrawing />
    default:
      return null
  }
}

/** A drawing in a circle, all one size, so a column of them lines up. */
function Disc({ children, className = 'bg-sunken text-ink border-line', size = 'md', title }: {
  children: ReactNode
  className?: string
  size?: 'sm' | 'md'
  title?: string
}) {
  const box = size === 'md' ? 'h-9 w-9' : 'h-7 w-7'
  const art = size === 'md' ? 'h-6 w-6' : 'h-[18px] w-[18px]'
  return (
    <span className={`grid place-items-center shrink-0 rounded-full border ${box} ${className}`} title={title}>
      <svg viewBox="0 0 48 48" className={art} aria-hidden>
        {children}
      </svg>
    </span>
  )
}

function rowGlyph(r: CardRow): ReactNode {
  if (r.instrument) return <InstrumentDrawing id={r.instrument} />
  if (r.kind === 'vocal') return <MicDrawing />
  if (r.kind === 'monitor') return r.connection === 'iem' ? <IemDrawing /> : <WedgeDrawing />
  if (r.kind === 'power') return <PowerDrawing />
  return /\bamp\b|amplifier|combo|cab(inet)?\b|deluxe|twin|ac30|ba-\d/i.test(r.title) ? <AmpDrawing /> : <PedalDrawing />
}

/** Anything else named — a tuner, a pedal, a looper: a small box with a knob and a footswitch. */
function PedalDrawing() {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinejoin: 'round' as const, vectorEffect: 'non-scaling-stroke' as const }
  return (
    <>
      <rect {...line} x={12} y={6} width={24} height={36} rx={3} />
      <circle {...line} cx={24} cy={16} r={4} />
      <circle cx={24} cy={33} r={3.5} fill="currentColor" />
    </>
  )
}

/** The channel mark the input list's Ch column uses. */
export function ChannelChip({ ch, className = 'border-ink text-ink' }: { ch: string; className?: string }) {
  return (
    <span className={`inline-flex min-w-6 h-6 px-1.5 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${className}`}>
      {ch}
    </span>
  )
}

function Row({ r, view, dim }: { r: CardRow; view: PlotViewOptions; dim: boolean }) {
  const title = view.models && r.model ? `${r.title} — ${r.model}` : r.title
  return (
    <li className={`grid grid-cols-[2.25rem,minmax(0,1fr),auto] items-center gap-2.5 py-1.5 transition-opacity ${dim ? 'opacity-30 print:opacity-100' : ''}`}>
      <Disc>{rowGlyph(r)}</Disc>
      <div className="min-w-0">
        <p className="text-sm text-ink leading-snug">{title}</p>
        {r.spec && <p className="text-xs text-muted leading-snug">{r.spec}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        {r.channels && <ChannelChip ch={r.channels} className={chipClass(r.connection, view.colour)} />}
        {r.connection !== 'none' && (
          <Disc size="sm" className={connectionClass(r.connection, view.colour)} title={CONNECTION_LABEL[r.connection]}>
            <ConnectionGlyph c={r.connection} />
          </Disc>
        )}
      </div>
    </li>
  )
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const initial = (
    <span className="grid place-items-center h-14 w-14 shrink-0 rounded-lg bg-accent-soft text-accent text-xl font-bold print:border print:border-ink print:bg-surface print:text-ink">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
  if (!photo) return initial
  return <Thumb src={photo} alt={name} className="h-14 w-14 shrink-0 rounded-lg object-cover" fallback={initial} />
}

export interface LibraryPhoto {
  url: string
  label: string
}

/**
 * The card's picture, pressable to choose another: any photo in the library,
 * no photo, or Scout's choice. The library is the only source — a photo that
 * is not there yet is added on the Library tab, where its credit is asked for.
 */
function PhotoPicker({
  name,
  photo,
  chosen,
  photos,
  onChoose,
  busy,
}: {
  name: string
  photo: string | null
  /** What is stored: a URL, 'none', or nothing for Scout's choice. */
  chosen: string | null | undefined
  photos: LibraryPhoto[]
  onChoose: (choice: string | null) => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const pick = (choice: string | null) => {
    setOpen(false)
    onChoose(choice)
  }
  const option = (selected: boolean) =>
    `rounded-lg border p-1 text-left transition-colors ${selected ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong'}`

  return (
    <div className="relative shrink-0" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-expanded={open}
        aria-label={`Choose a photo for ${name}`}
        title="Choose a photo"
        className="group relative block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      >
        <Avatar name={name} photo={photo} />
        {/* Always shown, not revealed on hover: a phone has no hover. */}
        <span
          aria-hidden
          className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-line-strong bg-surface text-muted group-hover:text-ink print:hidden"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <path d="M2 5.5h2.5L6 3.5h4l1.5 2H14v7H2z" />
            <circle cx="8" cy="9" r="2.2" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-3 shadow-pop space-y-2 print:hidden">
          <p className="text-xs font-medium text-ink">Photo for {name}</p>
          {photos.length === 0 ? (
            <p className="text-xs text-muted leading-relaxed">
              There are no photos in your library yet. Add one on the Library tab and it will be offered here.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto">
              {photos.map((ph) => (
                <li key={ph.url}>
                  <button type="button" onClick={() => pick(ph.url)} className={`w-full ${option(chosen === ph.url)}`} title={ph.label}>
                    <Thumb
                      src={ph.url}
                      alt={ph.label}
                      className="aspect-square w-full rounded-md object-cover"
                      fallback={<span className="grid aspect-square w-full place-items-center rounded-md bg-sunken text-[10px] text-muted">Can’t load</span>}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button variant={chosen === NO_PHOTO ? 'primary' : 'neutral'} size="sm" onClick={() => pick(NO_PHOTO)}>
              No photo
            </Button>
            <Button variant={!chosen ? 'primary' : 'neutral'} size="sm" onClick={() => pick(null)}>
              Let Scout choose
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Card({
  p,
  index,
  rows,
  photo,
  view,
  focus,
  highlighted,
  onHover,
  arranging,
  move,
  onDragStart,
  photos,
  onChoosePhoto,
  choosing,
}: {
  p: Performer
  index: number
  rows: CardRow[]
  photo: string | null
  photos: LibraryPhoto[]
  onChoosePhoto: (choice: string | null) => void
  choosing: boolean
  view: PlotViewOptions
  focus: Connection | null
  highlighted: boolean
  onHover: (id: string | null) => void
  arranging: boolean
  move: ReactNode
  onDragStart: (e: DragEvent) => void
}) {
  const name = performerName(p, index)
  return (
    <article
      draggable={arranging}
      onDragStart={onDragStart}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      className={`w-full sm:w-[19rem] rounded-xl border bg-surface shadow-raised break-inside-avoid transition-shadow print:shadow-none print:border-ink ${
        highlighted ? 'border-accent ring-2 ring-accent/40' : 'border-line'
      } ${arranging ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <header className="flex items-center gap-3 p-3">
        <PhotoPicker name={name} photo={photo} chosen={p.photo} photos={photos} onChoose={onChoosePhoto} busy={choosing} />
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink leading-tight truncate">{name}</h3>
          <p className="text-xs text-muted leading-snug">{performerRole(p)}</p>
        </div>
      </header>

      {/* Simple shows who plays what at a glance; the sheet always prints every row. */}
      {view.detail === 'simple' && (
        <ul className="flex flex-wrap gap-1.5 px-3 pb-3 print:hidden" aria-label="Plays">
          {rows
            .filter((r) => r.kind === 'instrument' || r.kind === 'vocal')
            .map((r) => (
              <li key={r.key} className="flex items-center gap-1">
                <Disc size="sm" title={view.models && r.model ? `${r.title} — ${r.model}` : r.title}>
                  {rowGlyph(r)}
                </Disc>
                {r.channels && <ChannelChip ch={r.channels} className={chipClass(r.connection, view.colour)} />}
              </li>
            ))}
        </ul>
      )}
      <ul className={`border-t border-line px-3 py-1 divide-y divide-line ${view.detail === 'simple' ? 'hidden print:block' : ''}`}>
        {rows.map((r) => (
          <Row key={r.key} r={r} view={view} dim={focus !== null && r.connection !== focus} />
        ))}
      </ul>

      {arranging && <div className="flex items-center justify-center gap-1 border-t border-line p-2 print:hidden">{move}</div>}
    </article>
  )
}

type Line = keyof StageArrangement

export function StageCards({
  plot,
  lines,
  view,
  focus,
  hovered,
  onHover,
  photoFor,
  arranging,
  onSaveArrangement,
  onCancelArrangement,
  saving,
  photos,
  onChoosePhoto,
  choosingPhoto,
}: {
  photos: LibraryPhoto[]
  onChoosePhoto: (performerId: string, choice: string | null) => void
  choosingPhoto: boolean
  plot: StagePlot
  lines: InputLine[]
  view: PlotViewOptions
  focus: Connection | null
  hovered: string | null
  onHover: (id: string | null) => void
  photoFor: (p: Performer, index: number) => string | null
  arranging: boolean
  onSaveArrangement: (stage: StageArrangement | null) => void
  onCancelArrangement: () => void
  saving: boolean
}) {
  const [draft, setDraft] = useState<StageArrangement | null>(null)
  const current = arranging && draft ? draft : stageLines(plot)
  const indexOf = new Map(plot.performers.map((p, i) => [p.id, i]))
  const byId = new Map(plot.performers.map((p) => [p.id, p]))
  // Mixes numbered in line-up order, as the sound-tech summary counts them.
  const mixOf = (id: string) => (plot.monitors === 'none' ? null : (indexOf.get(id) ?? 0) + 1)

  const edit = (fn: (a: StageArrangement) => StageArrangement) =>
    setDraft((d) => fn(d ?? { upstage: [...current.upstage], downstage: [...current.downstage] }))

  const moveTo = (id: string, line: Line, at: number) =>
    edit((a) => {
      const next = { upstage: a.upstage.filter((x) => x !== id), downstage: a.downstage.filter((x) => x !== id) }
      const target = next[line]
      target.splice(Math.max(0, Math.min(at, target.length)), 0, id)
      return next
    })

  const lineOf = (id: string): Line => (current.upstage.includes(id) ? 'upstage' : 'downstage')

  const drop = (line: Line, at: number) => (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    if (byId.has(id)) moveTo(id, line, at)
  }

  const renderLine = (line: Line) => {
    const ids = current[line]
    if (ids.length === 0 && !arranging) return null
    return (
      <div
        onDragOver={arranging ? (e) => e.preventDefault() : undefined}
        onDrop={arranging ? drop(line, ids.length) : undefined}
        className={`flex flex-wrap justify-center gap-4 ${arranging ? 'min-h-24 rounded-xl border border-dashed border-line-strong p-3' : ''}`}
        aria-label={line === 'upstage' ? 'Upstage' : 'Downstage'}
      >
        {arranging && ids.length === 0 && (
          <p className="self-center text-xs text-muted">Drag somebody here, or use the arrows on a card.</p>
        )}
        {ids.map((id, k) => {
          const p = byId.get(id)!
          const i = indexOf.get(id)!
          const move = (
            <>
              <Button variant="quiet" size="sm" aria-label="Move toward stage right" disabled={k === 0} onClick={() => moveTo(id, line, k - 1)}>
                ←
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => moveTo(id, line === 'upstage' ? 'downstage' : 'upstage', k)}
              >
                {line === 'upstage' ? 'Move downstage' : 'Move upstage'}
              </Button>
              <Button variant="quiet" size="sm" aria-label="Move toward stage left" disabled={k === ids.length - 1} onClick={() => moveTo(id, line, k + 2)}>
                →
              </Button>
            </>
          )
          return (
            <div key={id} onDragOver={arranging ? (e) => e.preventDefault() : undefined} onDrop={arranging ? drop(line, k) : undefined} className="w-full sm:w-auto">
              <Card
                p={p}
                index={i}
                rows={cardRows(plot, lines, p, mixOf(id))}
                photo={photoFor(p, i)}
                photos={photos}
                onChoosePhoto={(choice) => onChoosePhoto(id, choice)}
                choosing={choosingPhoto}
                view={view}
                focus={focus}
                highlighted={hovered === id}
                onHover={onHover}
                arranging={arranging}
                move={move}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
              />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line-strong bg-sunken px-3 py-4 sm:px-5 space-y-5 print:bg-surface print:border-ink">
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Upstage</p>
        {renderLine('upstage')}
        {renderLine('downstage')}
        <div className="flex items-baseline justify-between text-[11px] text-faint">
          <span>Stage right</span>
          <span className="font-medium uppercase tracking-[0.2em] text-muted">Audience</span>
          <span>Stage left</span>
        </div>
      </div>

      {arranging && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="primary" disabled={saving} onClick={() => onSaveArrangement(draft ?? current)}>
            Save positions
          </Button>
          <Button variant="neutral" disabled={saving} onClick={() => { setDraft(null); onCancelArrangement() }}>
            Cancel
          </Button>
          <Button variant="quiet" disabled={saving} onClick={() => { setDraft(null); onSaveArrangement(null) }}>
            Let Scout arrange it
          </Button>
          <span className="text-xs text-muted">Drag a card, or use its arrows. Stage right is on the left, as the audience sees it.</span>
        </div>
      )}
    </div>
  )
}

/** The key to the colours, which doubles as a filter: press one to pick out every connection of that kind. */
export function ConnectionLegend({
  used,
  view,
  focus,
  onFocus,
}: {
  used: Connection[]
  view: PlotViewOptions
  focus: Connection | null
  onFocus: (c: Connection | null) => void
}) {
  if (used.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">Connections:</span>
      {used.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={focus === c}
          onClick={() => onFocus(focus === c ? null : c)}
          className={`flex items-center gap-1.5 rounded-full border pl-1 pr-2.5 py-0.5 transition-colors print:pointer-events-none ${
            focus === c ? 'border-accent ring-1 ring-accent text-ink' : 'border-line text-body hover:border-line-strong hover:text-ink'
          }`}
        >
          <Disc size="sm" className={connectionClass(c, view.colour)}>
            <ConnectionGlyph c={c} />
          </Disc>
          {CONNECTION_LABEL[c]}
        </button>
      ))}
      {focus && (
        <button type="button" onClick={() => onFocus(null)} className="text-info-fg hover:underline print:hidden">
          Show everything
        </button>
      )}
    </div>
  )
}

/** A two-way switch in the toolbar. */
export function Toggle({ options, value, onChange, label }: {
  options: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line p-0.5 bg-sunken">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            value === o.id ? 'bg-surface text-ink font-medium shadow-raised' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
