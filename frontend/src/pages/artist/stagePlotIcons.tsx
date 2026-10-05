import type { ReactNode } from 'react'
import type { InstrumentId } from '../../../../shared/stagePlot'

/**
 * Line drawings for the stage plot: every instrument the survey offers, and
 * the gear a tech places around it — amp, wedge, vocal mic, DI, power.
 *
 * Drawn here rather than loaded, so the plot costs no request, prints as
 * vectors, and follows the theme: every stroke is `currentColor` or a colour
 * token, so the same drawing works in dark mode, light mode and on paper.
 *
 * Each glyph is drawn in a 48×48 box and placed with `Glyph`, which centres and
 * scales it; `vector-effect` keeps the line weight the same at any size, so a
 * keyboard drawn wide and a harmonica drawn small read as one set. Shapes are
 * deliberately plain — the silhouette a tech recognises across a dark stage,
 * not an illustration.
 */

const LINE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  vectorEffect: 'non-scaling-stroke' as const,
}

/** A solid body the lines sit on, so an instrument reads over the stage floor. */
const BODY = 'fill-surface'

export function Glyph({
  x,
  y,
  size = 48,
  width,
  height,
  rotate = 0,
  className = 'text-ink',
  children,
  title,
}: {
  /** Centre, in the plot's coordinates. */
  x: number
  y: number
  size?: number
  /** Overrides for a glyph that is not square, like a keyboard. */
  width?: number
  height?: number
  rotate?: number
  className?: string
  children: ReactNode
  title?: string
}) {
  const w = width ?? size
  const h = height ?? size
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) translate(${-w / 2} ${-h / 2}) scale(${w / 48} ${h / 48})`} className={className}>
      {title && <title>{title}</title>}
      {children}
    </g>
  )
}

// ── Instruments ─────────────────────────────────────────────────────────────

/** A figure-eight body: an acoustic guitar, drawn upright, head at the top. */
function AcousticGuitar() {
  return (
    <>
      <path {...LINE} className={BODY} d="M17.8 28.2 A7.5 7.5 0 1 1 30.2 28.2 A10 10 0 1 1 17.8 28.2 Z" />
      <circle {...LINE} cx={24} cy={31} r={2.6} />
      <path {...LINE} d="M22.6 21 V6 H25.4 V21" />
      <rect {...LINE} className={BODY} x={21.4} y={1.5} width={5.2} height={5} rx={1} />
      <path {...LINE} d="M21 40 H27" />
    </>
  )
}

/** A solid body with a cutaway and two pickups. */
function ElectricGuitar({ long = false }: { long?: boolean }) {
  return (
    <>
      <path
        {...LINE}
        className={BODY}
        d="M17 28 Q16 22 20.5 23.5 L26.5 23.5 Q33 19 32.5 26 Q34.5 31 32.5 37 Q30 45 24 45 Q16.5 45 15.5 37 Q14.5 32 17 28 Z"
      />
      <rect {...LINE} x={20} y={29} width={8} height={2.4} rx={0.6} />
      <rect {...LINE} x={20} y={34.5} width={8} height={2.4} rx={0.6} />
      <path {...LINE} d={long ? 'M22.8 23.5 V3 H25.2 V23.5' : 'M22.8 23.5 V7 H25.2 V23.5'} />
      <rect {...LINE} className={BODY} x={21.6} y={long ? 0.5 : 3} width={4.8} height={4.5} rx={1} />
      <path {...LINE} d="M21.5 41 H26.5" />
    </>
  )
}

/** A violin-family body with f-holes; `tall` gives it an endpin. */
function Bowed({ tall = false }: { tall?: boolean }) {
  return (
    <>
      <path
        {...LINE}
        className={BODY}
        d="M24 13 Q31 13 31 19 Q31 23 28.5 25 Q32.5 27 32.5 33 Q32.5 41 24 41 Q15.5 41 15.5 33 Q15.5 27 19.5 25 Q17 23 17 19 Q17 13 24 13 Z"
      />
      <path {...LINE} d="M20.5 27 Q19.5 30 20.5 33 M27.5 27 Q28.5 30 27.5 33" />
      <path {...LINE} d="M22.9 13 V5 H25.1 V13" />
      <circle {...LINE} className={BODY} cx={24} cy={3.5} r={2} />
      {tall && <path {...LINE} d="M24 41 V47" />}
    </>
  )
}

function UprightBass() {
  return (
    <>
      <path
        {...LINE}
        className={BODY}
        d="M24 12 Q32 12 32 19 Q32 23.5 29.5 25.5 Q34.5 28 34.5 35 Q34.5 44 24 44 Q13.5 44 13.5 35 Q13.5 28 18.5 25.5 Q16 23.5 16 19 Q16 12 24 12 Z"
      />
      <path {...LINE} d="M20 28 Q19 31.5 20 35 M28 28 Q29 31.5 28 35" />
      <path {...LINE} d="M22.8 12 V3 H25.2 V12" />
      <path {...LINE} d="M24 44 V47.5" />
    </>
  )
}

function Mandolin() {
  return (
    <>
      <path {...LINE} className={BODY} d="M24 20 Q34 22 33 33 Q31.5 44 24 44 Q16.5 44 15 33 Q14 22 24 20 Z" />
      <circle {...LINE} cx={24} cy={30} r={2.4} />
      <path {...LINE} d="M22.9 20 V6 H25.1 V20" />
      <rect {...LINE} className={BODY} x={21.5} y={2} width={5} height={4.5} rx={1} />
    </>
  )
}

function Banjo() {
  return (
    <>
      <circle {...LINE} className={BODY} cx={24} cy={33} r={12} />
      <circle {...LINE} cx={24} cy={33} r={9} />
      <path {...LINE} d="M22.9 21 V5 H25.1 V21" />
      <rect {...LINE} className={BODY} x={21.5} y={1.5} width={5} height={4} rx={1} />
      <circle cx={20} cy={14} r={1} fill="currentColor" />
    </>
  )
}

/** A kit from above: kick, snare, toms, hi-hat, cymbals and the throne. */
function DrumKit() {
  return (
    <>
      {/* Kick, seen from above: a drum on its side. */}
      <rect {...LINE} className={BODY} x={18} y={22} width={12} height={16} rx={3} />
      <path {...LINE} d="M20 38 V40 M28 38 V40" />
      {/* Toms on the kick, snare to the left, floor tom to the right. */}
      <circle {...LINE} className={BODY} cx={19.5} cy={20} r={4} />
      <circle {...LINE} className={BODY} cx={28.5} cy={20} r={4.5} />
      <circle {...LINE} className={BODY} cx={13} cy={31} r={5} />
      <circle {...LINE} className={BODY} cx={36} cy={32} r={6} />
      {/* Hi-hat and two cymbals, with their bells. */}
      <circle {...LINE} className={BODY} cx={7} cy={24} r={4.5} />
      <circle cx={7} cy={24} r={1} fill="currentColor" />
      <circle {...LINE} className={BODY} cx={12} cy={11} r={6} />
      <circle cx={12} cy={11} r={1} fill="currentColor" />
      <circle {...LINE} className={BODY} cx={37} cy={12} r={7} />
      <circle cx={37} cy={12} r={1} fill="currentColor" />
      {/* The throne, where the drummer sits, towards the back. */}
      <circle {...LINE} className={BODY} cx={24} cy={9} r={3} />
    </>
  )
}

/** A pair of hand drums and a shaker, from above. */
function Percussion() {
  return (
    <>
      <circle {...LINE} className={BODY} cx={16} cy={26} r={9} />
      <circle {...LINE} cx={16} cy={26} r={6.5} />
      <circle {...LINE} className={BODY} cx={33} cy={24} r={7.5} />
      <circle {...LINE} cx={33} cy={24} r={5} />
      <ellipse {...LINE} className={BODY} cx={34} cy={39} rx={5} ry={2.6} />
    </>
  )
}

/** A keyboard, from above: the case and its keys. Drawn wide. */
function Keyboard({ knobs = false }: { knobs?: boolean }) {
  const whites = Array.from({ length: 13 }, (_, i) => 5 + i * 3)
  const blacks = [0, 1, 3, 4, 5, 7, 8, 10, 11].map((k) => 6.9 + k * 3)
  return (
    <>
      <rect {...LINE} className={BODY} x={2} y={knobs ? 10 : 16} width={44} height={knobs ? 28 : 18} rx={2} />
      {knobs &&
        [9, 16, 23, 30, 37].map((x) => <circle key={x} {...LINE} cx={x} cy={16} r={2} />)}
      <path {...LINE} d={`M4 ${knobs ? 22 : 20} H44`} />
      {whites.map((x) => (
        <path key={x} {...LINE} d={`M${x} ${knobs ? 22 : 20} V${knobs ? 36 : 32}`} />
      ))}
      {blacks.map((x) => (
        <rect key={x} x={x} y={knobs ? 22 : 20} width={1.6} height={knobs ? 8 : 7} fill="currentColor" />
      ))}
    </>
  )
}

/** A grand piano, from above, keyboard towards the player. */
function GrandPiano() {
  return (
    <>
      <path {...LINE} className={BODY} d="M6 38 V12 Q6 4 14 4 Q22 4 24 12 Q26 20 34 22 Q42 24 42 32 V38 Z" />
      <rect {...LINE} className={BODY} x={6} y={38} width={36} height={6} />
      {[10, 14, 18, 22, 26, 30, 34, 38].map((x) => (
        <path key={x} {...LINE} d={`M${x} 38 V44`} />
      ))}
      <path {...LINE} d="M11 12 L36 30" />
    </>
  )
}

function PedalSteel() {
  return (
    <>
      <rect {...LINE} className={BODY} x={4} y={16} width={40} height={14} rx={2} />
      {[19.5, 22, 24.5, 27].map((y) => (
        <path key={y} {...LINE} d={`M8 ${y} H40`} />
      ))}
      <path {...LINE} d="M8 30 V38 M40 30 V38 M16 36 H32" />
      <path {...LINE} d="M18 36 V40 M24 36 V40 M30 36 V40" />
    </>
  )
}

function Harmonica() {
  return (
    <>
      <rect {...LINE} className={BODY} x={6} y={18} width={36} height={12} rx={2} />
      <path {...LINE} d="M6 23 H42" />
      {[10, 14, 18, 22, 26, 30, 34, 38].map((x) => (
        <rect key={x} x={x - 1} y={25} width={2} height={2.5} fill="currentColor" />
      ))}
    </>
  )
}

function Accordion() {
  return (
    <>
      <rect {...LINE} className={BODY} x={4} y={12} width={10} height={24} rx={1.5} />
      <rect {...LINE} className={BODY} x={34} y={12} width={10} height={24} rx={1.5} />
      <path {...LINE} d="M14 12 L18 36 L22 12 L26 36 L30 12 L34 36" />
      <path {...LINE} d="M14 12 H34 M14 36 H34" />
    </>
  )
}

function Trumpet() {
  return (
    <>
      <path {...LINE} className={BODY} d="M30 18 L44 11 V37 L30 30 Z" />
      <path {...LINE} d="M4 22 H30 M4 26 H30 M8 22 Q4 22 4 24 Q4 26 8 26" />
      <path {...LINE} d="M14 22 V16 M18 22 V16 M22 22 V16" />
      <path {...LINE} d="M12 30 H26 Q28 30 28 27" />
    </>
  )
}

function Saxophone() {
  return (
    <>
      <path {...LINE} className={BODY} d="M18 4 L20 8 L20 34 Q20 42 26 42 Q32 42 32 36 L32 30 L38 26 L38 34 Q38 46 26 46 Q14 46 14 34 L14 8 Z" />
      {[14, 19, 24, 29].map((y) => (
        <circle key={y} {...LINE} cx={17} cy={y} r={1.4} />
      ))}
    </>
  )
}

function Trombone() {
  return (
    <>
      <path {...LINE} className={BODY} d="M32 10 L44 4 V22 L32 16 Z" />
      <path {...LINE} d="M4 12 H32 M4 15 H32 M10 30 H40 M10 33 H40 M40 30 Q44 30 44 31.5 Q44 33 40 33" />
      <path {...LINE} d="M10 15 V30 M12 15 V30" />
    </>
  )
}

function Laptop() {
  return (
    <>
      <rect {...LINE} className={BODY} x={10} y={8} width={28} height={20} rx={1.5} />
      <path {...LINE} className={BODY} d="M6 34 L10 28 H38 L42 34 Z" />
      <path {...LINE} d="M20 31 H28" />
    </>
  )
}

const INSTRUMENT_GLYPHS: Record<InstrumentId, () => ReactNode> = {
  acoustic_guitar: () => <AcousticGuitar />,
  electric_guitar: () => <ElectricGuitar />,
  bass: () => <ElectricGuitar long />,
  upright_bass: () => <UprightBass />,
  drums: () => <DrumKit />,
  percussion: () => <Percussion />,
  keys: () => <Keyboard />,
  synth: () => <Keyboard knobs />,
  piano: () => <GrandPiano />,
  fiddle: () => <Bowed />,
  cello: () => <Bowed tall />,
  mandolin: () => <Mandolin />,
  banjo: () => <Banjo />,
  pedal_steel: () => <PedalSteel />,
  harmonica: () => <Harmonica />,
  accordion: () => <Accordion />,
  trumpet: () => <Trumpet />,
  saxophone: () => <Saxophone />,
  trombone: () => <Trombone />,
  laptop: () => <Laptop />,
}

export function InstrumentDrawing({ id }: { id: InstrumentId }) {
  return <>{INSTRUMENT_GLYPHS[id]()}</>
}

// ── Gear ────────────────────────────────────────────────────────────────────

/** A combo amp or cabinet, from the front: grille, speaker, control strip. */
export function AmpDrawing() {
  return (
    <>
      <rect {...LINE} className="fill-raised" x={4} y={8} width={40} height={32} rx={3} />
      <path {...LINE} d="M4 15 H44" />
      {[10, 16, 22, 28, 34].map((x) => (
        <circle key={x} cx={x + 2} cy={11.5} r={1.1} fill="currentColor" />
      ))}
      <circle {...LINE} cx={24} cy={28} r={9} />
      <circle {...LINE} cx={24} cy={28} r={3} />
    </>
  )
}

/** A floor wedge, side on, angled up at the player. */
export function WedgeDrawing() {
  return (
    <>
      <path {...LINE} className="fill-raised" d="M6 38 H42 L36 14 H14 Z" />
      <path {...LINE} d="M17 20 H31 M15.5 26 H32.5 M14 32 H34" />
    </>
  )
}

/** A vocal mic on a boom, seen from above: stand base, boom arm, capsule. */
export function MicDrawing() {
  return (
    <>
      <circle {...LINE} className={BODY} cx={16} cy={32} r={7} />
      <path {...LINE} d="M16 32 L34 14" />
      <circle {...LINE} className={BODY} cx={36} cy={12} r={4.5} />
      <path {...LINE} d="M33 9 L39 15" />
    </>
  )
}

/** A DI box: a small steel box, jack at each end. */
export function DiDrawing() {
  return (
    <>
      <rect {...LINE} className="fill-raised" x={4} y={12} width={40} height={24} rx={3} />
      <circle {...LINE} cx={10} cy={24} r={2.4} />
      <circle {...LINE} cx={38} cy={24} r={2.4} />
      <text x={24} y={28.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="currentColor">
        DI
      </text>
    </>
  )
}

/** A power drop: a box with a lightning bolt. */
export function PowerDrawing() {
  return (
    <>
      <rect {...LINE} className="fill-warn-bg" x={6} y={8} width={36} height={32} rx={4} />
      <path d="M27 11 L16 27 H23 L20 37 L32 21 H25 Z" fill="currentColor" />
    </>
  )
}

/** In-ear monitors: a bodypack and its lead. */
export function IemDrawing() {
  return (
    <>
      <rect {...LINE} className={BODY} x={18} y={22} width={14} height={20} rx={2.5} />
      <path {...LINE} d="M25 22 V16 Q25 8 17 8 M25 16 Q25 8 33 8" />
      <circle {...LINE} className={BODY} cx={14} cy={8} r={3} />
      <circle {...LINE} className={BODY} cx={36} cy={8} r={3} />
    </>
  )
}
