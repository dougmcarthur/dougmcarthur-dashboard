/**
 * What each performer's card on the stage plot lists: one row per thing a
 * sound tech has to plug in, power or send a mix to.
 *
 * A row is an instrument or a voice with what it connects by, a monitor, a
 * power drop, or a piece of named gear nothing else claimed. Each carries the
 * same channel numbers as the input list, and a connection kind the page can
 * colour so "every DI" is one glance.
 *
 * Named gear is matched to an instrument the artist already chose — the gear
 * the survey collected is free text, so "Taylor 114ce" is matched by maker
 * and "Fender Deluxe Reverb" by being the only thing it could belong to. What
 * cannot be placed is listed as its own row rather than guessed onto one.
 *
 * Pure: no clock, no DOM.
 */

import {
  INSTRUMENTS,
  channelsFor,
  instrumentSpec,
  monitorMixes,
  poweredPerformers,
  type InputLine,
  type InstrumentId,
  type Performer,
  type StagePlot,
} from './stagePlot'
import { gearInstrument } from './stagePlotClues'

/** How something reaches the console, or the stage. Each gets one colour. */
export type Connection = 'mic' | 'di' | 'power' | 'wedge' | 'iem' | 'none'

export const CONNECTION_LABEL: Record<Connection, string> = {
  mic: 'Mic (XLR)',
  di: 'DI box',
  power: 'Power',
  wedge: 'Wedge',
  iem: 'In-ears',
  none: '',
}

export interface CardRow {
  key: string
  kind: 'instrument' | 'vocal' | 'monitor' | 'power' | 'gear'
  /** The drawing to show, for an instrument. */
  instrument: InstrumentId | null
  /** "Acoustic guitar", "Lead vocal", "Monitor", "Power". */
  title: string
  /** Make and model when the artist named one: "Taylor 114ce". */
  model: string | null
  /** The technical line: "DI, stereo", "Mix 2", "One drop". */
  spec: string | null
  connection: Connection
  /** "3" or "3–4", as the input list prints it; null when nothing is patched. */
  channels: string | null
}

const VOCAL_MIC = /\b(?:Shure|Sennheiser|Neumann|Audix|Electro-?Voice|Beyerdynamic|AKG|Telefunken)\b|\bSM\d|\bBeta\s?\d|\be\d{3}\b/i

/** How an input-list source reaches the console. */
export function connectionOf(source: string): Connection {
  return /^DI\b/i.test(source) ? 'di' : 'mic'
}

/** Gear matched to the instrument it belongs to, and what was left over. */
export function assignGear(p: Performer): { byInstrument: Map<InstrumentId, string[]>; vocal: string[]; other: string[] } {
  const byInstrument = new Map<InstrumentId, string[]>()
  const vocal: string[] = []
  const other: string[] = []
  const amped = p.instruments.filter((i) => instrumentSpec(i)?.amp)
  for (const item of p.gear) {
    const id = gearInstrument(item)
    if (id && p.instruments.includes(id)) {
      byInstrument.set(id, [...(byInstrument.get(id) ?? []), item])
    } else if (p.vocals !== 'none' && VOCAL_MIC.test(item)) {
      vocal.push(item)
    } else if (!id && amped.length === 1 && /\bamp|deluxe|twin|reverb|combo|cab\b/i.test(item)) {
      byInstrument.set(amped[0], [...(byInstrument.get(amped[0]) ?? []), item])
    } else {
      other.push(item)
    }
  }
  return { byInstrument, vocal, other }
}

export function cardRows(plot: StagePlot, lines: InputLine[], p: Performer, mixNumber: number | null): CardRow[] {
  const rows: CardRow[] = []
  const gear = assignGear(p)

  for (const id of p.instruments) {
    const spec = instrumentSpec(id)!
    const first = spec.inputs[0]
    const stereo = spec.inputs.some((i) => i.stereo)
    const channels = channelsFor(lines, p.id, id)
    const span = channels?.match(/^(\d+)–(\d+)$/)
    const count = span ? Number(span[2]) - Number(span[1]) + 1 : 1
    const parts = [
      spec.inputs.length > 1 ? `${count} channels` : first.source.replace(/^Mic — /, ''),
      stereo && spec.inputs.length === 1 ? 'stereo' : null,
      spec.inputs.some((i) => i.phantom) ? '48V' : null,
    ].filter(Boolean)
    rows.push({
      key: `i:${id}`,
      kind: 'instrument',
      instrument: id,
      title: spec.label,
      model: gear.byInstrument.get(id)?.join(' · ') ?? null,
      spec: parts.join(', ') || null,
      connection: connectionOf(first.source),
      channels,
    })
  }

  if (p.vocals !== 'none') {
    rows.push({
      key: 'vocal',
      kind: 'vocal',
      instrument: null,
      title: p.vocals === 'lead' ? 'Lead vocal' : 'Backing vocal',
      model: gear.vocal.join(' · ') || null,
      spec: 'SM58 or similar, tall boom',
      connection: 'mic',
      channels: channelsFor(lines, p.id, 'vocal'),
    })
  }

  for (const item of gear.other) {
    rows.push({ key: `g:${item}`, kind: 'gear', instrument: null, title: item, model: null, spec: null, connection: 'none', channels: null })
  }

  if (monitorMixes(plot) > 0) {
    const kind = plot.monitors === 'iem' ? 'iem' : 'wedge'
    rows.push({
      key: 'monitor',
      kind: 'monitor',
      instrument: null,
      title: 'Monitor',
      model: null,
      spec: [mixNumber ? `Mix ${mixNumber}` : null, plot.monitors === 'both' ? 'wedge and in-ears' : kind === 'iem' ? 'in-ears' : 'wedge']
        .filter(Boolean)
        .join(', '),
      connection: kind,
      channels: null,
    })
  }

  if (poweredPerformers(plot).has(p.id)) {
    const why = p.instruments.filter((i) => INSTRUMENTS[i].power).map((i) => INSTRUMENTS[i].label.toLowerCase())
    rows.push({
      key: 'power',
      kind: 'power',
      instrument: null,
      title: 'Power',
      model: null,
      spec: why.length ? `One drop, for ${why.join(' and ')}` : 'One drop, for pedals or a tuner',
      connection: 'power',
      channels: null,
    })
  }

  return rows
}

/** The connection kinds a plot uses, in a fixed order, for its legend. */
export function connectionsUsed(rows: CardRow[]): Connection[] {
  const order: Connection[] = ['mic', 'di', 'wedge', 'iem', 'power']
  return order.filter((c) => rows.some((r) => r.connection === c))
}
