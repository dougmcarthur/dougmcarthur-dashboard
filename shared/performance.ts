/**
 * When you are actually on stage.
 *
 * Kept apart from the deadline machinery in `reviewParse` on purpose. A
 * deadline is often prose that a date has to be *recovered* from — 26 of 34
 * production rows hold things like "None — rolling artist roster intake" — and
 * a recovered date is a guess shown as a guess. A performance date is the
 * opposite: it is typed in by hand, from an agreement, and if it is not a real
 * date it is not a date at all. So nothing here parses prose, and nothing here
 * falls back to the clock.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isPlainDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false
  // Catches 2027-02-30, which the regex is happy with and Date is not.
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * What is wrong with this pair, in a sentence, or null if nothing is.
 *
 * Returned as prose rather than a code because both callers show it to you: the
 * API puts it in the 400 body and the edit panel puts it under the field.
 */
export function performanceDateProblem(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (start && !isPlainDate(start)) return 'Performance start must be a date like 2027-07-10.'
  if (end && !isPlainDate(end)) return 'Performance end must be a date like 2027-07-12.'
  // An end with no start is the shape of a half-finished edit, and it is the
  // one combination the calendar cannot do anything with.
  if (end && !start) return 'A performance end needs a start date as well.'
  if (start && end && end < start) return 'The performance ends before it starts.'
  return null
}

export interface ShowSpan {
  /** First day on stage. */
  start: string
  /**
   * Google's all-day `end.date` is **exclusive** — a festival running the 10th
   * to the 12th ends on the 13th as far as the API is concerned. Naming the
   * field for that is cheaper than a comment at every call site.
   */
  endExclusive: string
}

/** The span to write to the calendar, or null when there is nothing to write. */
export function showSpan(
  start: string | null | undefined,
  end: string | null | undefined,
): ShowSpan | null {
  if (!isPlainDate(start)) return null
  if (performanceDateProblem(start, end)) return null
  const last = isPlainDate(end) ? end : start
  return { start, endExclusive: addOneDay(last) }
}

function addOneDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * "10–12 July 2027", "31 July – 2 August 2027", "10 July 2027".
 *
 * The month and year are stated once when both ends share them, because a show
 * is read at a glance and "10 July 2027 – 12 July 2027" makes you do work to
 * find the one thing that differs.
 */
export function formatPerformanceSpan(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!isPlainDate(start)) return null
  const a = parts(start)
  if (!isPlainDate(end) || end === start) return `${a.day} ${a.month} ${a.year}`

  const b = parts(end)
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`
  return `${a.day}–${b.day} ${a.month} ${a.year}`
}

function parts(date: string): { day: number; month: string; year: string } {
  const [y, m, d] = date.split('-')
  return { day: Number(d), month: MONTHS[Number(m) - 1], year: y }
}
