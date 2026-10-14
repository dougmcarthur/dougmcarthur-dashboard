/**
 * The next closing date a programme's own page states.
 *
 * Nothing delivers a recurring programme's next date to the catalog: the
 * research agents skip what is on file, a poller's candidates do not reach it,
 * and an entry keeps the first deadline it was filed with for good. This is the
 * reader a Worker can run over the programme's own page to find out that it has
 * opened again.
 *
 * It is deliberately narrow, and the shapes it accepts are the ones real pages
 * were found to use (Canada Council's Arts Across Canada and Abroad, measured
 * 2026-10-14: ten funding opportunities on one page, each with a line reading
 * `Next deadline : January 14, 2026 | April 22, 2026 | September 2, 2026`, and
 * the rolling ones reading `Next deadline: Any time before your departure date`).
 *
 *  - **A date is taken only from a line that says deadline, closes or due.**
 *    A sentence with a date in it is prose, and a festival's own dates, a news
 *    item's date and an annual report's year are not closing dates. This is the
 *    rule `listingParse.ts` holds for the same reason.
 *  - **A year is required.** A year-less "November 20" stays the words it was
 *    and is never a date: guessing which November is how a closed call comes
 *    back as open.
 *  - **The earliest date still ahead.** A programme with several streams lists
 *    several dates, and the next time anything on the page closes is the
 *    earliest one that has not passed. The count is returned so the screen can
 *    say the page lists more than one.
 *  - **Rolling is not a date.** "Any time before your departure date" gives
 *    nothing, and nothing is the answer: this never turns an open-ended
 *    programme into a dated one.
 *
 * Pure: no clock, no network. `today` is an argument.
 */

import { OPENS_CUE, PAST_CUE, findDates } from './reviewParse'

export interface NextDeadline {
  /** The earliest closing date on the page that is still ahead, ISO. */
  date: string
  /** The line it was read from, as the page worded it. */
  quote: string
  /** How many distinct upcoming dates the page lists. More than one means streams. */
  count: number
}

/** A line that opens with the cue: "Deadline:", "Next deadlines -", "Application closes". */
const LEAD =
  /^(?:the\s+)?(?:next\s+|upcoming\s+|current\s+|final\s+)?(?:application\s+|submission\s+|entry\s+|funding\s+|intake\s+)?(?:deadlines?|closing\s+dates?|closes?|due\s+dates?)\b/i

/** "Applications close on ...", "submissions are due by ...", "must be received by ...". */
const SENTENCE =
  /\b(?:applications?|submissions?|entries)\s+(?:close|closes|are\s+due|is\s+due|must\s+be\s+(?:received|submitted|postmarked))\s+(?:on\s+|by\s+)?/i

/** A line this long is a paragraph, and a paragraph is prose. */
const LINE_MAX = 400
const QUOTE_MAX = 200

function candidates(text: string): Array<{ iso: string; line: string }> {
  const out: Array<{ iso: string; line: string }> = []

  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (line.length < 8 || line.length > LINE_MAX) continue

    let tail: string | null = null
    const lead = LEAD.exec(line)
    if (lead) {
      tail = line.slice(lead[0].length).replace(/^\s*[:\-–—]?\s*/, '')
    } else {
      const sentence = SENTENCE.exec(line)
      // "Previous applications closed on ..." is history, not a date to act on.
      if (sentence && !/\b(?:previous|past|prior|last|former|earlier)\b/i.test(line.slice(0, sentence.index))) {
        tail = line.slice(sentence.index + sentence[0].length)
      }
    }
    if (tail === null) continue

    for (const found of findDates(tail)) {
      // The words nearest the date decide what it is: in "opens September 1,
      // 2026; closes November 30, 2026" the second date is a closing, and
      // reading back across "closes" to the opening would drop it.
      const near = tail.slice(0, found.start).split(/;|\b(?:closes?|closing|due|deadline)\b/i).pop() ?? ''
      // History and openings are not closings: "was October 17, 2025".
      if (PAST_CUE.test(near) || OPENS_CUE.test(near)) continue
      out.push({ iso: found.iso, line })
    }
  }
  return out
}

/**
 * The earliest closing date that is today or later, and later than `after`, or
 * null when the page states none. `after` is the date the entry already holds,
 * so a page that still lists last cycle's date alone finds nothing.
 */
export function readNextDeadline(text: string | null | undefined, today: string, after: string | null): NextDeadline | null {
  if (!text) return null

  const ahead = candidates(text).filter((c) => c.iso >= today && (after === null || c.iso > after))
  if (ahead.length === 0) return null

  const distinct = [...new Set(ahead.map((c) => c.iso))].sort()
  const first = ahead.find((c) => c.iso === distinct[0])!
  const quote = first.line.length > QUOTE_MAX ? first.line.slice(0, QUOTE_MAX).replace(/\s+\S*$/, '') + '…' : first.line
  return { date: distinct[0], quote, count: distinct.length }
}
