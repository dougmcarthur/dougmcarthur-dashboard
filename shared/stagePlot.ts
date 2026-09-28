/**
 * A stage plot and input list, built from how the artist performs.
 *
 * What a sound tech needs from a plot is not a picture of the band. It is four
 * answers: where each person stands, what each source plugs into (a mic or a
 * DI, mono or stereo), where the power has to reach, and how many monitor
 * mixes to build. Everything here derives those from a short description of
 * the act, so the survey only asks what a musician knows offhand — who plays
 * what — and the technical rendering is this module's job.
 *
 * The inputs per instrument are the common default, not a claim about this
 * artist's rig: a bass is a DI, an electric guitar is a mic on the amp, a kit
 * is seven lines. Gear the artist names is printed beside it so a tech can
 * see the difference, and a note can override anything.
 *
 * Pure: no clock, no database, no DOM. The page draws what `layoutStage`
 * returns; the tests read the same numbers.
 */

export type Zone = 'drums' | 'back' | 'front'

export interface InputSpec {
  /** What goes on the console strip. Short. */
  label: string
  /** What plugs in: "DI", "Mic — SM57 or similar". */
  source: string
  /** Two channels, L and R. */
  stereo?: boolean
  /** Needs 48V phantom power. */
  phantom?: boolean
  /** Stand, when a mic needs one. */
  stand?: 'tall boom' | 'short boom' | 'straight'
}

export interface InstrumentSpec {
  label: string
  /** Order on the input list: drums first, vocals last, as consoles are patched. */
  group: number
  zone: Zone
  inputs: InputSpec[]
  /** Needs a power drop at the player's position. */
  power: boolean
  /** Has an amp or cabinet to draw behind the player. */
  amp?: boolean
  /**
   * Where it sits on a plot: `held` is played in the hands beside the body
   * (a guitar), `front` stands in front of the player (a keyboard, a laptop).
   */
  placement: 'held' | 'front' | 'kit'
}

export const INSTRUMENTS = {
  acoustic_guitar: {
    label: 'Acoustic guitar',
    group: 4,
    zone: 'front',
    inputs: [{ label: 'Acoustic gtr', source: 'DI', phantom: true }],
    placement: 'held',
    power: false,
  },
  electric_guitar: {
    label: 'Electric guitar',
    group: 4,
    zone: 'front',
    inputs: [{ label: 'Elec gtr amp', source: 'Mic — SM57 or similar', stand: 'short boom' }],
    placement: 'held',
    power: true,
    amp: true,
  },
  bass: {
    label: 'Bass guitar',
    group: 3,
    zone: 'back',
    inputs: [{ label: 'Bass', source: 'DI' }],
    placement: 'held',
    power: true,
    amp: true,
  },
  upright_bass: {
    label: 'Upright bass',
    group: 3,
    zone: 'back',
    inputs: [{ label: 'Upright bass', source: 'DI (pickup)', phantom: true }],
    placement: 'held',
    power: false,
  },
  drums: {
    label: 'Drum kit',
    group: 1,
    zone: 'drums',
    inputs: [
      { label: 'Kick', source: 'Mic — Beta 52 or similar', stand: 'short boom' },
      { label: 'Snare', source: 'Mic — SM57 or similar', stand: 'short boom' },
      { label: 'Hi-hat', source: 'Mic — small condenser', phantom: true, stand: 'short boom' },
      { label: 'Rack tom', source: 'Mic — clip-on or SM57', stand: 'short boom' },
      { label: 'Floor tom', source: 'Mic — clip-on or SM57', stand: 'short boom' },
      { label: 'Overheads', source: 'Mic — condenser pair', stereo: true, phantom: true, stand: 'tall boom' },
    ],
    placement: 'kit',
    power: false,
  },
  percussion: {
    label: 'Percussion',
    group: 2,
    zone: 'back',
    inputs: [{ label: 'Perc', source: 'Mic — condenser pair', stereo: true, phantom: true, stand: 'tall boom' }],
    placement: 'front',
    power: false,
  },
  keys: {
    label: 'Keyboard or digital piano',
    group: 5,
    zone: 'back',
    inputs: [{ label: 'Keys', source: 'DI', stereo: true }],
    placement: 'front',
    power: true,
  },
  synth: {
    label: 'Synth',
    group: 5,
    zone: 'back',
    inputs: [{ label: 'Synth', source: 'DI', stereo: true }],
    placement: 'front',
    power: true,
  },
  piano: {
    label: 'Acoustic piano',
    group: 5,
    zone: 'back',
    inputs: [{ label: 'Piano', source: 'Mic — condenser pair', stereo: true, phantom: true, stand: 'tall boom' }],
    placement: 'front',
    power: false,
  },
  fiddle: {
    label: 'Fiddle or violin',
    group: 6,
    zone: 'front',
    inputs: [{ label: 'Fiddle', source: 'Mic or pickup DI', phantom: true, stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  cello: {
    label: 'Cello',
    group: 6,
    zone: 'front',
    inputs: [{ label: 'Cello', source: 'Mic or pickup DI', phantom: true, stand: 'short boom' }],
    placement: 'held',
    power: false,
  },
  mandolin: {
    label: 'Mandolin',
    group: 6,
    zone: 'front',
    inputs: [{ label: 'Mandolin', source: 'Mic — small condenser', phantom: true, stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  banjo: {
    label: 'Banjo',
    group: 6,
    zone: 'front',
    inputs: [{ label: 'Banjo', source: 'Mic — small condenser', phantom: true, stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  pedal_steel: {
    label: 'Pedal steel',
    group: 6,
    zone: 'front',
    inputs: [{ label: 'Pedal steel amp', source: 'Mic — SM57 or similar', stand: 'short boom' }],
    placement: 'front',
    power: true,
    amp: true,
  },
  harmonica: {
    label: 'Harmonica',
    group: 6,
    zone: 'front',
    inputs: [{ label: 'Harmonica', source: 'Mic — SM58 or harp mic', stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  accordion: {
    label: 'Accordion',
    group: 6,
    zone: 'front',
    inputs: [{ label: 'Accordion', source: 'Mic or pickup DI', stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  trumpet: {
    label: 'Trumpet',
    group: 7,
    zone: 'front',
    inputs: [{ label: 'Trumpet', source: 'Mic — dynamic', stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  saxophone: {
    label: 'Saxophone',
    group: 7,
    zone: 'front',
    inputs: [{ label: 'Sax', source: 'Mic — dynamic or clip-on', stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  trombone: {
    label: 'Trombone',
    group: 7,
    zone: 'front',
    inputs: [{ label: 'Trombone', source: 'Mic — dynamic', stand: 'tall boom' }],
    placement: 'held',
    power: false,
  },
  laptop: {
    label: 'Laptop or backing tracks',
    group: 8,
    zone: 'back',
    inputs: [{ label: 'Playback', source: 'DI', stereo: true }],
    placement: 'front',
    power: true,
  },
} satisfies Record<string, InstrumentSpec>

export type InstrumentId = keyof typeof INSTRUMENTS
/** The same table, typed for reading: every entry as an `InstrumentSpec`. */
const SPECS: Record<InstrumentId, InstrumentSpec> = INSTRUMENTS
export const INSTRUMENT_IDS = Object.keys(INSTRUMENTS) as InstrumentId[]

export function instrumentSpec(id: string): InstrumentSpec | null {
  return (SPECS as Record<string, InstrumentSpec>)[id] ?? null
}

export type Vocals = 'lead' | 'backing' | 'none'
export type ActShape = 'solo' | 'duo' | 'band'
export type Monitors = 'wedges' | 'iem' | 'both' | 'none'

export interface Performer {
  /** Stable within a plot, for keys and for the layout. */
  id: string
  name: string
  instruments: InstrumentId[]
  vocals: Vocals
  /** Named gear, one item per entry, as the artist wrote it. */
  gear: string[]
}

export interface StagePlot {
  act: ActShape
  performers: Performer[]
  monitors: Monitors
  /** Backing tracks or a click, which adds a stereo playback line. */
  playback: boolean
  /** Anything the sound tech should know, verbatim. */
  notes: string | null
  updatedAt: string | null
}

export const MAX_PERFORMERS = 12
export const MAX_GEAR = 20
export const NOTE_MAX = 1000

const ACTS: ActShape[] = ['solo', 'duo', 'band']
const MONITORS: Monitors[] = ['wedges', 'iem', 'both', 'none']
const VOCALS: Vocals[] = ['lead', 'backing', 'none']

/** A new, empty plot for an act of this shape. */
export function emptyPlot(act: ActShape, count: number, firstName = ''): StagePlot {
  const n = act === 'solo' ? 1 : act === 'duo' ? 2 : Math.max(3, Math.min(MAX_PERFORMERS, count))
  return {
    act,
    performers: Array.from({ length: n }, (_, i) => ({
      id: `p${i + 1}`,
      name: i === 0 ? firstName : '',
      instruments: [],
      // Nobody is assumed to sing: a missing answer is never a guess.
      vocals: 'none',
      gear: [],
    })),
    monitors: 'wedges',
    playback: false,
    notes: null,
    updatedAt: null,
  }
}

/**
 * Read a stored plot back, keeping what this build understands.
 *
 * Null when nothing usable is stored. An instrument id this build does not
 * know is dropped rather than drawn as a guess — the gear list still carries
 * whatever the artist wrote.
 */
export function parseStagePlot(raw: string | null | undefined): StagePlot | null {
  if (!raw) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!ACTS.includes(o.act as ActShape) || !Array.isArray(o.performers) || o.performers.length === 0) return null
  const str = (x: unknown, max: number) => (typeof x === 'string' ? x.trim().slice(0, max) : '')
  const performers: Performer[] = o.performers.slice(0, MAX_PERFORMERS).map((p, i) => {
    const q = (p ?? {}) as Record<string, unknown>
    return {
      id: str(q.id, 20) || `p${i + 1}`,
      name: str(q.name, 80),
      instruments: Array.isArray(q.instruments)
        ? [...new Set(q.instruments.filter((x): x is InstrumentId => typeof x === 'string' && x in SPECS))]
        : [],
      vocals: VOCALS.includes(q.vocals as Vocals) ? (q.vocals as Vocals) : 'none',
      gear: Array.isArray(q.gear)
        ? q.gear.map((g) => str(g, 120)).filter(Boolean).slice(0, MAX_GEAR)
        : [],
    }
  })
  return {
    act: o.act as ActShape,
    performers,
    monitors: MONITORS.includes(o.monitors as Monitors) ? (o.monitors as Monitors) : 'wedges',
    playback: o.playback === true,
    notes: str(o.notes, NOTE_MAX) || null,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : null,
  }
}

/** "Sam" or "Performer 2", never blank on a plot a tech has to read. */
export function performerName(p: Performer, index: number): string {
  return p.name.trim() || `Performer ${index + 1}`
}

/** "Vocals, acoustic guitar" — what a performer does, in a phrase. */
export function performerRole(p: Performer): string {
  const parts = [
    p.vocals === 'lead' ? 'Lead vocals' : p.vocals === 'backing' ? 'Backing vocals' : null,
    ...p.instruments.map((i) => SPECS[i].label),
  ].filter((x): x is string => Boolean(x))
  if (parts.length === 0) return 'Nothing listed yet'
  return parts.map((s, i) => (i === 0 ? s : s[0].toLowerCase() + s.slice(1))).join(', ')
}

// ── Input list ────────────────────────────────────────────────────────────────

export interface InputLine {
  /** Console channel. A stereo source takes two, and the second is `ch + 1`. */
  ch: number
  label: string
  source: string
  stereo: boolean
  phantom: boolean
  stand: string | null
  /** Who it belongs to, by name. */
  who: string
}

const VOCAL_GROUP = 9

export function inputList(plot: StagePlot): InputLine[] {
  type Pending = { group: number; order: number; spec: InputSpec; who: string }
  const pending: Pending[] = []
  let order = 0
  plot.performers.forEach((p, i) => {
    const who = performerName(p, i)
    for (const id of p.instruments) {
      const spec = SPECS[id]
      for (const input of spec.inputs) pending.push({ group: spec.group, order: order++, spec: input, who })
    }
  })
  // Playback asked separately, unless somebody already has a laptop on the list.
  if (plot.playback && !plot.performers.some((p) => p.instruments.includes('laptop'))) {
    pending.push({ group: 8, order: order++, spec: SPECS.laptop.inputs[0], who: 'Playback' })
  }
  // Lead vocals first among the vocals, then backing in stage order.
  plot.performers.forEach((p, i) => {
    if (p.vocals === 'none') return
    const who = performerName(p, i)
    pending.push({
      group: VOCAL_GROUP,
      order: (p.vocals === 'lead' ? 0 : 1000) + order++,
      spec: {
        label: p.vocals === 'lead' ? `Lead vox — ${who}` : `BV — ${who}`,
        source: 'Mic — SM58 or similar',
        stand: 'tall boom',
      },
      who,
    })
  })

  pending.sort((a, b) => a.group - b.group || a.order - b.order)
  let ch = 1
  return pending.map(({ spec, who }) => {
    const line: InputLine = {
      ch,
      label: spec.label,
      source: spec.source,
      stereo: Boolean(spec.stereo),
      phantom: Boolean(spec.phantom),
      stand: spec.stand ?? null,
      who,
    }
    ch += spec.stereo ? 2 : 1
    return line
  })
}

/** Channels the list needs, counting a stereo pair as two. */
export function channelCount(lines: InputLine[]): number {
  return lines.reduce((n, l) => n + (l.stereo ? 2 : 1), 0)
}

// ── Monitors and power ───────────────────────────────────────────────────────

export function monitorMixes(plot: StagePlot): number {
  return plot.monitors === 'none' ? 0 : plot.performers.length
}

function needsPower(p: Performer): boolean {
  return p.instruments.some((i) => SPECS[i].power)
}

export function powerDrops(plot: StagePlot): string[] {
  const out = plot.performers.map((p, i) => (needsPower(p) ? performerName(p, i) : null)).filter((x): x is string => Boolean(x))
  if (plot.playback && !plot.performers.some((p) => p.instruments.includes('laptop'))) out.push('Playback')
  return out
}

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * Stage coordinates: x 0–100 across, y 0–72 deep, y = 0 at the back wall and
 * 72 at the lip. Deep enough that a back-line wedge clears a front-line amp:
 * each station needs an amp behind and a mic, keyboard and wedge in front. The audience is below the drawing, so the performer's left
 * (stage left) is on the right of the page, which is how plots are read.
 */
export const STAGE = { width: 100, depth: 72 } as const

export interface Placed {
  performerId: string
  name: string
  role: string
  zone: Zone
  x: number
  y: number
  amp: boolean
  power: boolean
  wedge: { x: number; y: number } | null
  drums: boolean
  /** What to draw at the station. */
  instruments: InstrumentId[]
  vocals: Vocals
  /** Any source on a DI, so the drawing can show the box. */
  di: boolean
}

function zoneOf(p: Performer): Zone {
  if (p.instruments.includes('drums')) return 'drums'
  // Whoever sings lead stands at the front, whatever else they play.
  if (p.vocals === 'lead') return 'front'
  const zones = p.instruments.map((i) => SPECS[i].zone)
  if (zones.includes('front')) return 'front'
  if (zones.includes('back')) return 'back'
  return 'front'
}

/** Evenly spread `n` points between `from` and `to`, centred when `n` is 1. */
function spread(n: number, from: number, to: number): number[] {
  if (n === 1) return [(from + to) / 2]
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1))
}

/**
 * How large each station is drawn. A solo act at band scale is a speck in an
 * empty room, so few performers draw larger — and the layout accounts for it,
 * moving the front line up so a bigger station and its wedge still fit.
 */
export function stationScale(count: number): number {
  return count <= 1 ? 1.8 : count === 2 ? 1.5 : count === 3 ? 1.25 : 1
}

export function layoutStage(plot: StagePlot): Placed[] {
  const wedges = plot.monitors === 'wedges' || plot.monitors === 'both'
  const scale = stationScale(plot.performers.length)
  const frontY = 50 - (scale - 1) * 20
  const named = plot.performers.map((p, i) => ({ p, i, zone: zoneOf(p) }))

  const drummers = named.filter((n) => n.zone === 'drums')
  const back = named.filter((n) => n.zone === 'back')
  // Lead vocal in the middle of the front line, the rest either side in the
  // order they were listed.
  const frontRaw = named.filter((n) => n.zone === 'front')
  const lead = frontRaw.find((n) => n.p.vocals === 'lead')
  const others = frontRaw.filter((n) => n !== lead)
  const front = lead ? [...others.slice(0, Math.floor(others.length / 2)), lead, ...others.slice(Math.floor(others.length / 2))] : others

  const out: Placed[] = []
  const place = (n: (typeof named)[number], x: number, y: number) => {
    const isDrums = n.zone === 'drums'
    out.push({
      performerId: n.p.id,
      name: performerName(n.p, n.i),
      role: performerRole(n.p),
      zone: n.zone,
      x,
      y,
      amp: n.p.instruments.some((i) => SPECS[i].amp),
      power: needsPower(n.p),
      drums: isDrums,
      instruments: n.p.instruments,
      vocals: n.p.vocals,
      di: n.p.instruments.some((i) => SPECS[i].inputs.some((inp) => /\bDI\b/.test(inp.source))),
      // Downstage of the player, far enough for a mic stand and a keyboard
      // to sit between them. The kit's goes beside it, on the hi-hat side.
      wedge: wedges
        ? isDrums
          ? { x: x + 16, y: y + 4 }
          : { x, y: Math.min(STAGE.depth - 4, y + (n.zone === 'front' ? 14 : 12) * scale) }
        : null,
    })
  }

  spread(drummers.length, 42, 58).forEach((x, k) => place(drummers[k], drummers.length ? x : 50, 18))
  // The back line flanks the kit when there is one, and spreads when there
  // is not.
  const backXs = drummers.length
    ? back.map((_, k) => (k % 2 === 0 ? 24 - Math.floor(k / 2) * 12 : 76 + Math.floor(k / 2) * 12))
    : spread(back.length, 25, 75)
  back.forEach((n, k) => place(n, Math.max(8, Math.min(92, backXs[k])), 25))
  if (lead) {
    // The singer at 50 whatever the count, with the rest split either side —
    // an even front line would otherwise put nobody in the middle.
    const left = front.slice(0, front.indexOf(lead))
    const right = front.slice(front.indexOf(lead) + 1)
    const leftXs = left.length === 1 ? [30] : spread(left.length, 12, 34)
    const rightXs = right.length === 1 ? [70] : spread(right.length, 66, 88)
    left.forEach((n, k) => place(n, leftXs[k], frontY))
    place(lead, 50, frontY)
    right.forEach((n, k) => place(n, rightXs[k], frontY))
  } else {
    const frontXs = front.length <= 1 ? [50] : spread(front.length, 16, 84)
    front.forEach((n, k) => place(n, frontXs[k], frontY))
  }

  return out
}
