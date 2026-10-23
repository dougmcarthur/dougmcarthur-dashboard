/**
 * What the window-open column says about a note written before the window did.
 *
 * An agent files a gig while its window is shut and writes the note then: "Not
 * submitted; needs your review once the window opens." The sentence was true
 * that day. It is stored verbatim and re-read on every render, so on the day
 * after the window opened it was still being read out as *Waiting on you: … once
 * the window opens*, three weeks after the column beside it said October 1.
 *
 * The structured date is the authority and the prose is a snapshot, the same
 * rule `withStoredColumns` holds for every other column. This is the one place
 * the two are put side by side: `gigItem` joins them here, so the flags, the
 * decision sentence and the Review pane all read the settled note and none of
 * them has to remember to.
 *
 * Only an **open** window changes anything. A shut one leaves the prose alone,
 * because "needs your review once the window opens" is still true of it.
 * Nothing is guessed: with no opening date there is nothing to compare, and the
 * note stands as it was written.
 */

import type { ParsedDeadline, ParsedNote } from './reviewParse'

export type WindowState = 'unknown' | 'shut' | 'open'

/**
 * Unknown when the row has no opening date, which is not the same as open. The
 * day the window opens counts as open, since that is when the work is due.
 */
export function windowState(deadline: Pick<ParsedDeadline, 'opensAt' | 'opensInDays'>): WindowState {
  if (deadline.opensAt === null || deadline.opensInDays === null) return 'unknown'
  return deadline.opensInDays > 0 ? 'shut' : 'open'
}

const OPENING_NOUN = String.raw`(?:window|portal|form|call|intake|submissions?|applications?)`
const OPENS = String.raw`(?:re-?opens?|opens?|goes\s+live|is\s+open|are\s+open)`

/**
 * "once the window opens", "when the submission window opens", "as soon as
 * applications open": work put off until the opening. Deliberately not "until"
 * or "before", which are holds rather than deferrals: "do not submit until the
 * window opens" says nothing is left of it once it has, where "needs your
 * review once the window opens" says the review is now due. Taking the clause
 * off the first leaves what the sentence was asking for, and off the second
 * would reverse it.
 */
const AFTER_OPENING = String.raw`(?:once|when|as\s+soon\s+as|after)\s+(?:the\s+|their\s+|its\s+)?(?:[\w-]+\s+){0,2}?${OPENING_NOUN}\s+${OPENS}\b`

const SEPARATORS = String.raw`[\s,;:–—-]`
const TRAILING = new RegExp(String.raw`${SEPARATORS}*${AFTER_OPENING}\s*([.!]?)\s*$`, 'i')
const LEADING = new RegExp(String.raw`^\s*${AFTER_OPENING}\s*${SEPARATORS}+`, 'i')

/**
 * Timing notes that say the window has not opened, which an opened one makes
 * untrue. "Not open to US artists" is about who may apply and is left alone.
 */
const CLAIMS_NOT_OPEN =
  /\b(?:(?:isn'?t|is not|hasn'?t|has not|not)\s+(?:yet\s+)?open(?:ed)?(?!\s+(?:to|for)\b)|waiting (?:on|for) the (?:\w+\s+)?window to open|check back)\b/i

const hasWords = (text: string) => /[a-z]/i.test(text)

/**
 * The sentence with its deferral taken off, or null when nothing else was in it.
 * A clause in the middle of a sentence is left where it is: cutting there would
 * make up a sentence nobody wrote.
 */
function withoutDeferral(text: string): string | null {
  const trailing = text.match(TRAILING)
  if (trailing && trailing.index !== undefined) {
    const kept = text.slice(0, trailing.index).trimEnd()
    return hasWords(kept) ? `${kept}${trailing[1] ?? ''}` : null
  }

  const leading = text.match(LEADING)
  if (leading) {
    const rest = text.slice(leading[0].length).trim()
    return hasWords(rest) ? rest.charAt(0).toUpperCase() + rest.slice(1) : null
  }

  return text
}

/**
 * The note with what an opened window has settled taken out of it. A blocker
 * that was waiting on the opening is now just the blocker it was waiting to
 * become, and a timing note saying the window is not open is dropped. The
 * stored note is untouched, so "Show original note" still says what was written.
 */
export function settleWindowProse(
  parsed: ParsedNote,
  deadline: Pick<ParsedDeadline, 'opensAt' | 'opensInDays'>,
): ParsedNote {
  if (windowState(deadline) !== 'open') return parsed

  const settle = (list: string[]) =>
    list.flatMap((sentence) => {
      const settled = withoutDeferral(sentence)
      return settled === null ? [] : [settled]
    })

  return {
    ...parsed,
    blockers: settle(parsed.blockers),
    // Settled the same way, or the Review pane would print it once as a
    // blocker and once as the submission note, with the two no longer equal.
    submissionNote: parsed.submissionNote === null ? null : withoutDeferral(parsed.submissionNote),
    timing: parsed.timing.filter((sentence) => !CLAIMS_NOT_OPEN.test(sentence)),
  }
}
