/**
 * Whether a sync organisation asks an artist for exclusivity, from its own words.
 *
 * "Takes submissions" answers whether you may pitch. It does not answer what
 * you give up if they say yes, and for sync that is the question with money in
 * it: an exclusive deal stops you placing the same song anywhere else for the
 * length of the term, and a library that asks for it is a different bet from
 * one that does not. A first-time artist should be shown the second kind first.
 *
 * Three rules, and they are the ones `syncTerms.ts` already keeps:
 *
 *  - **Only a stated term is a finding.** A page that says nothing about
 *    exclusivity has not said it asks for none. `null` is never "no clause":
 *    the screens say "their site does not say", and nothing is offered on it.
 *  - **Caution beats reassurance.** Every sentence on every page is read
 *    before any reassurance is allowed to stand, so a page that says
 *    "non-exclusive" in one place and "exclusive representation" in another
 *    reads as exclusive. The error this can make is the safe one.
 *  - **Whose exclusivity it is.** Nearly every music library describes its
 *    licence to its *customers* as non-exclusive, and many sell an exclusive
 *    one at a higher price. Neither sentence is about the artist's deal. A
 *    sentence counts only when it is about the contributor and is not about the
 *    people who buy: "Customers receive a non-exclusive, royalty-free licence"
 *    is the commonest sentence on these sites and says nothing about you.
 *
 * Pure: no clock, no network. `src/lib/syncTerms.ts` hands it the text of the
 * pages it already reads for the submission policy.
 */

import { UNCERTAIN, sentencesOf, QUOTE_MAX } from './syncTerms'

export type Exclusivity = 'non_exclusive' | 'exclusive'

export interface ExclusivityReading {
  kind: Exclusivity
  /** The sentence that says so, as it was worded. */
  quote: string
}

/**
 * Words that put a sentence on the buyer's side of the library. Any one of
 * them and the sentence is about what a customer gets, whatever else it says.
 */
const CUSTOMER_SIDE =
  /\b(?:customers?|clients?|licensees?|buyers?|purchasers?|subscribers?|subscriptions?|end[- ]users?|royalty[- ]free|per[- ]project|licen[cs]e fees?|usage rights|purchas\w+|your (?:project|projects|video|videos|film|films|production|productions|campaign|campaigns|podcast|show|ads?|business|brand|website|channel)|(?:in|for|on) your (?:own )?(?:content|projects?|videos?|productions?|films?|campaigns?))\b/

/** Words that put a sentence on the contributor's side: whose music it is. */
const ARTIST_SIDE =
  /\b(?:artists?|writers?|composers?|songwriters?|musicians?|bands?|producers?|rights ?holders?|roster|representation|represent(?:s|ed|ing)?|your (?:music|songs?|tracks?|catalog(?:ue)?|compositions?|works?|rights|masters?|recordings?|publishing|material)|(?:the|an) agreement|(?:the|a|our) contract|placements?|submit(?:ted|ting)?|submissions?|signed|signing|sign (?:you|with)|publishing (?:deal|agreement)|licen[cs]ing (?:deal|agreement))\b/

/**
 * A statement that no exclusivity is asked for. Each form names the word, so
 * "non-exclusive" in a sentence about something else does not slip through on
 * a bare hyphen.
 */
const NON_EXCLUSIVE: RegExp[] = [
  /\bnon[- ]?exclusive\b/,
  /\bnot\s+(?:be\s+)?exclusive\b/,
  /\bno\s+exclusiv(?:e|ity)\b/,
  /\bexclusivity\s+(?:is\s+|are\s+)?(?:not|never)\s+(?:required|needed|necessary|a requirement|expected|asked for)\b/,
  /\b(?:do not|don't|does not|doesn't|never|will not|won't|would not|wouldn't)\s+(?:require|ask for|ask|need|demand|impose|seek|want|take|hold|claim|request)\b[^.;]{0,30}\bexclusiv(?:e|ity)\b/,
  /\bwithout\s+(?:any\s+)?(?:requiring\s+)?exclusiv(?:e|ity)\b/,
]

/**
 * A statement that exclusivity is asked for, or held. Specific on purpose:
 * "exclusive access" and "exclusive offers" are marketing and are not here.
 */
const EXCLUSIVE: RegExp[] = [
  /\bexclusive\s+(?:representation|rights?|sync|sync rights|licen[cs]es?|licen[cs]ing|agreement|contract|basis|deal|publishing|administration|arrangement|relationship|term|period|catalog(?:ue)?|placement|management|booking)\b/,
  /\bon\s+an\s+exclusive\s+basis\b/,
  /\bexclusive\s+to\s+(?:us|the\s+(?:company|label|library|publisher))\b/,
  /\bexclusively\s+(?:represent\w*|with\s+us|through\s+us|for\s+us|licen[cs]e\w*)\b/,
  /\bsole\s+and\s+exclusive\b/,
  /\bexclusivity\s+(?:period|term|clause|requirement|agreement|provision)\b/,
  /\b(?:require|requires|required|ask for|asks for|need|needs|demand|demands)\s+(?:an?\s+|some\s+)?(?:\w+\s+)?exclusiv(?:e|ity)\b/,
  /\bexclusive\b[^.;]{0,25}\b(?:for|of)\s+(?:\w+\s+){0,2}(?:years?|months?|terms?)\b/,
]

/** A sentence is read only if it is a statement, is not a doubt, and is short enough to be a clause. */
const SENTENCE_MAX = 420

interface Folded {
  s: string
  f: string
}

const fold = (s: string): string => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[‐‑–—]/g, '-')

function trim(sentence: string): string {
  if (sentence.length <= QUOTE_MAX) return sentence
  return sentence.slice(0, QUOTE_MAX).replace(/\s+\S*$/, '') + '…'
}

/**
 * Whether a sentence is about the artist's deal and not the buyer's licence.
 *
 * A sentence with no signal either way is **not** counted. The previous
 * sentence is allowed to supply the subject, because "How it works for
 * artists. We work on a non-exclusive basis." is the shape of the page and the
 * second sentence names nobody.
 */
function aboutTheArtist(current: Folded, previous: Folded | null): boolean {
  if (CUSTOMER_SIDE.test(current.f)) return false
  if (ARTIST_SIDE.test(current.f)) return true
  return previous !== null && ARTIST_SIDE.test(previous.f) && !CUSTOMER_SIDE.test(previous.f)
}

/**
 * The strongest finding in `text`: exclusive first, then non-exclusive.
 *
 * A first reading wins within its kind, since the order a page is read in is
 * the order a person would read it, and the sentence quoted should be the one
 * they would meet first.
 */
export function readExclusivity(text: string | null | undefined): ExclusivityReading | null {
  if (!text) return null

  const sentences: Folded[] = sentencesOf(text)
    .filter((s) => !s.endsWith('?') && s.length <= SENTENCE_MAX && !UNCERTAIN.test(s))
    .map((s) => ({ s, f: fold(s) }))

  let nonExclusive: ExclusivityReading | null = null

  for (let i = 0; i < sentences.length; i++) {
    const current = sentences[i]
    const negated = NON_EXCLUSIVE.some((re) => re.test(current.f))
    // "We do not require exclusive rights" names the word and means the
    // opposite, so the negated words are taken out before the sentence is
    // asked whether it makes an ask. What is left can still be one: "non-
    // exclusive agreements, though exclusive representation is available" is
    // reassurance and an ask in one sentence, and the ask wins.
    const asks = EXCLUSIVE.some((re) => re.test(withoutNegations(current.f)))
    if (!negated && !asks) continue

    // A caution needs only that the sentence is not about what a customer
    // buys. A reassurance needs more: it has to be about the artist, since it
    // is the one that gets somebody shown to a stranger as a good bet.
    if (asks) {
      if (CUSTOMER_SIDE.test(current.f)) continue
      return { kind: 'exclusive', quote: trim(current.s) }
    }
    if (!aboutTheArtist(current, i > 0 ? sentences[i - 1] : null)) continue
    nonExclusive ??= { kind: 'non_exclusive', quote: trim(current.s) }
  }

  return nonExclusive
}

const NEGATIONS_GLOBAL = NON_EXCLUSIVE.map((re) => new RegExp(re.source, 'g'))

/** The sentence with every statement of "no exclusivity" cut out of it. */
function withoutNegations(folded: string): string {
  return NEGATIONS_GLOBAL.reduce((text, re) => text.replace(re, ' '), folded)
}

/* --------------------------------------------------------------------- */
/* Writing it down                                                        */
/* --------------------------------------------------------------------- */

/** The columns the finding lives in, on the catalog entry. */
export interface ExclusivityColumns {
  exclusivity: string | null
  exclusivityEvidence: string | null
  exclusivityUrl: string | null
  termsReadAt: string | null
}

export const EMPTY_EXCLUSIVITY: ExclusivityColumns = {
  exclusivity: null,
  exclusivityEvidence: null,
  exclusivityUrl: null,
  termsReadAt: null,
}

/**
 * Fold a finding into what an entry already holds.
 *
 * Toward caution and never away from it, as `foldFinding` is for the policy:
 * an exclusive reading replaces anything, a non-exclusive one fills only an
 * empty column, and a read that found nothing changes nothing but the date it
 * looked. That last is what lets "never looked" and "looked, and found
 * nothing" be told apart.
 */
export function foldExclusivity(
  current: ExclusivityColumns,
  finding: (ExclusivityReading & { url: string | null }) | null,
  now: string,
): ExclusivityColumns {
  const next: ExclusivityColumns = { ...current, termsReadAt: now }
  if (!finding) return next

  if (finding.kind === 'exclusive') {
    if (current.exclusivity !== 'exclusive' || !current.exclusivityEvidence) {
      next.exclusivity = 'exclusive'
      next.exclusivityEvidence = finding.quote
      next.exclusivityUrl = finding.url
    }
    return next
  }

  if (current.exclusivity === null) {
    next.exclusivity = 'non_exclusive'
    next.exclusivityEvidence = finding.quote
    next.exclusivityUrl = finding.url
  }
  return next
}
