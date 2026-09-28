/**
 * What the artist's own writing already says about how they perform.
 *
 * Bios, tech riders and library facts mention the line-up ("a four-piece"),
 * who plays what ("Jen Moss on fiddle") and named gear ("a '65 Fender Deluxe
 * Reverb"). The stage-plot survey offers these as suggestions, each with the
 * sentence it came from, so the artist confirms rather than retypes.
 *
 * Three rules, the ones `artistSource.ts` keeps:
 *  - **Nothing is guessed from a sentence it does not quote.** Every clue
 *    carries its source and the text it matched.
 *  - **A suggestion is not an answer.** Nothing here writes to the plot; the
 *    survey pre-selects, and the artist moves on or changes it.
 *  - **Closed vocabularies.** Instruments match a fixed list of words and
 *    gear matches a fixed list of makers, so "bass" in "based in Winnipeg"
 *    is not a bass and a capitalised town is not an amp.
 *
 * Photos and videos are not read here: that needs a model looking at the
 * picture, which is a separate decision with a cost attached.
 */

import type { ActShape, InstrumentId } from './stagePlot'

export interface ClueSource {
  /** Where it came from, as the artist would name it: a document title or a library label. */
  source: string
  text: string
}

export interface Quoted {
  source: string
  /** The sentence it was found in, trimmed. */
  quote: string
}

export interface MemberClue extends Quoted {
  name: string
  instruments: InstrumentId[]
  vocals: boolean
}

export interface GearClue extends Quoted {
  item: string
  /** The instrument this gear most likely belongs to, when the maker says so. */
  instrument: InstrumentId | null
}

export interface InstrumentClue extends Quoted {
  instrument: InstrumentId
}

export interface StagePlotClues {
  act: (Quoted & { act: ActShape; size: number }) | null
  members: MemberClue[]
  instruments: InstrumentClue[]
  gear: GearClue[]
}

/** Words that name an instrument, longest first so "bass guitar" beats "bass". */
const INSTRUMENT_WORDS: Array<[RegExp, InstrumentId]> = [
  [/\b(?:upright|double|stand-?up|acoustic) bass\b/i, 'upright_bass'],
  [/\bbass(?: guitar)?\b(?!ed\b)|\bbassist\b/i, 'bass'],
  [/\bacoustic guitars?\b/i, 'acoustic_guitar'],
  [/\belectric guitars?\b|\blead guitar\b|\btelecaster\b|\bstratocaster\b|\bles paul\b/i, 'electric_guitar'],
  [/\bdrums\b|\bdrummer\b|\bdrum kit\b/i, 'drums'],
  [/\bpercussion(?:ist)?\b/i, 'percussion'],
  [/\bkeys\b|\bkeyboards?\b|\bkeyboardist\b|\brhodes\b|\bwurlitzer\b/i, 'keys'],
  [/\bsynths?\b|\bsynthesizers?\b|\bmoog\b/i, 'synth'],
  [/\bpiano\b|\bpianist\b/i, 'piano'],
  [/\bfiddle\b|\bviolin\b|\bviolinist\b/i, 'fiddle'],
  [/\bcello\b|\bcellist\b/i, 'cello'],
  [/\bmandolin\b/i, 'mandolin'],
  [/\bbanjo\b/i, 'banjo'],
  [/\bpedal steel\b|\blap steel\b/i, 'pedal_steel'],
  [/\bharmonica\b/i, 'harmonica'],
  [/\baccordion\b/i, 'accordion'],
  [/\btrumpet\b/i, 'trumpet'],
  [/\bsax(?:ophone)?\b/i, 'saxophone'],
  [/\btrombone\b/i, 'trombone'],
  [/\bbacking tracks\b|\blaptop\b|\bplayback\b/i, 'laptop'],
]

/** Makers worth recognising, and the instrument their name usually implies. */
const MAKERS: Array<[string, InstrumentId | null]> = [
  ['Fender', null], ['Gibson', 'electric_guitar'], ['Gretsch', null], ['Rickenbacker', 'electric_guitar'],
  ['Martin', 'acoustic_guitar'], ['Taylor', 'acoustic_guitar'], ['Guild', 'acoustic_guitar'], ['Collings', 'acoustic_guitar'],
  ['Eastman', null], ['Larrivée', 'acoustic_guitar'], ['Larrivee', 'acoustic_guitar'], ['Godin', null],
  ['Vox', 'electric_guitar'], ['Marshall', 'electric_guitar'], ['Orange', 'electric_guitar'], ['Mesa', 'electric_guitar'],
  ['Kemper', 'electric_guitar'], ['Line 6', 'electric_guitar'], ['Boss', null],
  ['Ampeg', 'bass'], ['Aguilar', 'bass'], ['Hartke', 'bass'], ['Markbass', 'bass'],
  ['Nord', 'keys'], ['Rhodes', 'keys'], ['Yamaha', null], ['Roland', null], ['Korg', null], ['Moog', 'synth'], ['Kawai', 'keys'],
  ['Ludwig', 'drums'], ['Pearl', 'drums'], ['Tama', 'drums'], ['Zildjian', 'drums'], ['Sabian', 'drums'],
  ['Deering', 'banjo'], ['Gold Tone', 'banjo'],
  ['LR Baggs', null], ['Fishman', null], ['Radial', null], ['Shure', null], ['Sennheiser', null], ['Neumann', null],
  ['Ableton', 'laptop'],
]

const ACT_WORDS: Array<[RegExp, ActShape, number]> = [
  [/\bsolo (?:artist|act|performer|set|show)\b|\bperforms solo\b|\bone-(?:man|woman|person) band\b/i, 'solo', 1],
  [/\bduo\b|\btwo-piece\b|\b2-piece\b/i, 'duo', 2],
  [/\btrio\b|\bthree-piece\b|\b3-piece\b/i, 'band', 3],
  [/\bquartet\b|\bfour-piece\b|\b4-piece\b/i, 'band', 4],
  [/\bquintet\b|\bfive-piece\b|\b5-piece\b/i, 'band', 5],
  [/\bsextet\b|\bsix-piece\b|\b6-piece\b/i, 'band', 6],
  [/\bseven-piece\b|\b7-piece\b/i, 'band', 7],
  [/\beight-piece\b|\b8-piece\b/i, 'band', 8],
]

const VOCAL_WORDS = /\bvocals?\b|\bvox\b|\bsings?\b|\bsinger\b|\bvocalist\b/i

function sentences(text: string): string[] {
  return text
    .replace(/[#*_>`]+/g, ' ')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 2)
}

function trimQuote(s: string): string {
  return s.length > 180 ? `${s.slice(0, 177)}…` : s
}

function instrumentsIn(text: string): InstrumentId[] {
  const found: InstrumentId[] = []
  let rest = text
  for (const [re, id] of INSTRUMENT_WORDS) {
    const m = rest.match(re)
    if (m) {
      found.push(id)
      // Take the words out, so "upright bass" does not also count as "bass".
      rest = rest.replace(new RegExp(re.source, 'gi'), ' ')
    }
  }
  return found
}

/**
 * A person and what they play, from the shapes line-ups are written in:
 * "Jen Moss on fiddle", "Jen Moss (fiddle, vocals)", "Jen Moss – fiddle".
 */
const MEMBER =
  /\b([A-Z][a-zà-ÿ'’-]+(?: [A-Z][a-zà-ÿ'’-]+){1,2})\s*(?:\(([^)]{3,60})\)|\s(?:on|plays|playing)\s([a-z ,&/-]{3,60})|\s[–—-]\s([a-z ,&/-]{3,60}))/g

export function readClues(sources: ClueSource[]): StagePlotClues {
  const clues: StagePlotClues = { act: null, members: [], instruments: [], gear: [] }
  const seenMember = new Set<string>()
  const seenGear = new Set<string>()
  const seenInstrument = new Set<InstrumentId>()

  for (const { source, text } of sources) {
    for (const sentence of sentences(text)) {
      const quote = trimQuote(sentence)

      if (!clues.act) {
        for (const [re, act, size] of ACT_WORDS) {
          if (re.test(sentence)) {
            clues.act = { act, size, source, quote }
            break
          }
        }
      }

      for (const m of sentence.matchAll(MEMBER)) {
        const name = m[1]
        const role = (m[2] ?? m[3] ?? m[4] ?? '').toLowerCase()
        const instruments = instrumentsIn(role)
        const vocals = VOCAL_WORDS.test(role)
        if (instruments.length === 0 && !vocals) continue
        const key = name.toLowerCase()
        if (seenMember.has(key)) continue
        seenMember.add(key)
        clues.members.push({ name, instruments, vocals, source, quote })
      }

      for (const id of instrumentsIn(sentence)) {
        if (seenInstrument.has(id)) continue
        seenInstrument.add(id)
        clues.instruments.push({ instrument: id, source, quote })
      }

      for (const [maker, instrument] of MAKERS) {
        const re = new RegExp(
          `\\b(?:'?\\d{2}s?\\s)?${maker.replace(/ /g, '\\s')}(?:\\s(?:[A-Z0-9][\\w'’.-]*|de|of))*`,
          'g',
        )
        for (const m of sentence.matchAll(re)) {
          const item = m[0].trim().replace(/[.,;:]+$/, '')
          // A maker named alone ("Fender") says too little to put on a plot.
          if (item.split(/\s+/).length < 2) continue
          const key = item.toLowerCase()
          if (seenGear.has(key)) continue
          seenGear.add(key)
          clues.gear.push({ item, instrument: instrument ?? instrumentsIn(sentence)[0] ?? null, source, quote })
        }
      }
    }
  }
  return clues
}

/** How many separate things were found, for "Scout found 5 things". */
export function clueCount(c: StagePlotClues): number {
  return (c.act ? 1 : 0) + c.members.length + c.instruments.length + c.gear.length
}
