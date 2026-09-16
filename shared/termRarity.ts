/**
 * How much a word is worth as evidence, measured against the mailbox it will
 * be searched in.
 *
 * `distinctiveWord` used to take the longest word of a gig's name, and said so
 * honestly: *"Not a frequency table, which would need a corpus this app does
 * not have."* That was true when it was written and is not true now. The
 * corpus is the artist's own mail, and Gmail will report on it — a search
 * returns `resultSizeEstimate`, so asking how many messages contain "winnipeg"
 * against how many contain "sofar" is document frequency from the only corpus
 * that matters, with no index to build and no library to add.
 *
 * Why it matters, measured: *Sofar Sounds Winnipeg* reduced to **winnipeg**,
 * which for somebody who lives in Winnipeg is most of their mail, and a pizza
 * receipt scored exactly what a real organiser's reply scored. See
 * `docs/reply-matching-precision.md`.
 *
 * Bands rather than a curve, for the reason `gigCost` uses bands: a number
 * somebody can argue with beats a formula nobody can. Each one says what it
 * means in the mailbox it came from.
 */

export type RarityBand = 'rare' | 'uncommon' | 'common' | 'everywhere' | 'unknown'

/**
 * A word's share of the mailbox, and what that share is worth.
 *
 * The factors are deliberately steep. A word in a twentieth of somebody's mail
 * is not weak evidence, it is *no* evidence, and the old scoring treated it as
 * enough on its own.
 */
const BANDS: Array<{ band: RarityBand; upTo: number; factor: number }> = [
  // Under two messages in a thousand. "voyageur", "sofar", "jimweek".
  { band: 'rare', upTo: 0.002, factor: 1 },
  // Up to one in a hundred. Still says something; cannot carry a match alone.
  { band: 'uncommon', upTo: 0.01, factor: 0.6 },
  // Up to one in twenty. "festival" in a musician's mail.
  { band: 'common', upTo: 0.05, factor: 0.25 },
  // Anything more. "winnipeg" for somebody living in Winnipeg.
  { band: 'everywhere', upTo: Infinity, factor: 0.08 },
]

/**
 * An unmeasured word keeps its full weight.
 *
 * The alternative — treating "not measured" as "probably common" — would make
 * the matcher quietly worse whenever Gmail was unreachable or a term had never
 * been looked up, which is the failure this repository keeps refusing: a
 * missing input is never a guess. Unknown means the old behaviour, exactly.
 */
const UNKNOWN_FACTOR = 1

export interface Rarity {
  band: RarityBand
  factor: number
  /** Messages containing the term, as Gmail estimated it. Null when unmeasured. */
  documentFrequency: number | null
  /** What that was measured against. */
  corpusSize: number | null
}

export function rarityOf(documentFrequency: number | null, corpusSize: number | null): Rarity {
  if (documentFrequency === null || corpusSize === null || corpusSize <= 0) {
    return { band: 'unknown', factor: UNKNOWN_FACTOR, documentFrequency, corpusSize }
  }
  const share = documentFrequency / corpusSize
  const hit = BANDS.find((b) => share <= b.upTo) ?? BANDS[BANDS.length - 1]
  return { band: hit.band, factor: hit.factor, documentFrequency, corpusSize }
}

/** What the scan measured, as the matcher receives it. Term → message count. */
export type TermCounts = Record<string, number>

export interface RarityIndex {
  counts: TermCounts
  corpusSize: number | null
}

/**
 * The lookup the matcher takes as an argument.
 *
 * An argument rather than something `matchReply` fetches, for the reason
 * `buildReviewQueue` takes `today`: a function that fetches its own inputs can
 * fetch the wrong ones silently, and this one would do it per message.
 */
export function rarityLookup(index: RarityIndex | null | undefined) {
  return (term: string): Rarity => {
    if (!index) return rarityOf(null, null)
    const df = index.counts[term.toLowerCase()]
    return rarityOf(df ?? null, index.corpusSize)
  }
}

/** Scaling a signal's points, rounded so the screen never shows a fraction. */
export function weigh(points: number, rarity: Rarity): number {
  return Math.round(points * rarity.factor)
}

/**
 * Which word of a name is worth searching for and scoring on.
 *
 * Rarest wins. Length breaks a tie and stands in entirely when nothing has
 * been measured, which is what the old behaviour was.
 */
export function rarestWord(words: string[], lookup: (term: string) => Rarity): string | null {
  if (words.length === 0) return null
  return words.reduce((best, word) => {
    const a = lookup(word)
    const b = lookup(best)
    if (a.factor !== b.factor) return a.factor > b.factor ? word : best
    return word.length > best.length ? word : best
  })
}
