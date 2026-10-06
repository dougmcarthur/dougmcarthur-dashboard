/**
 * How the results page writes a number. One place, so a chart, its tooltip and
 * its table twin cannot disagree about whether it is "+43" or "43 points".
 */

const MINUS = '−'

/** 0.264 as "26%". */
export const pct = (share: number) => `${Math.round(share * 100)}%`

/** A best-minus-worst score as signed percentage points: 0.43 is "+43". */
export function points(score: number): string {
  const v = Math.round(score * 100)
  return v === 0 ? '0' : `${v > 0 ? '+' : MINUS}${Math.abs(v)}`
}

/** Dollars of pay, to the nearest ten: a survey of this size does not know the units. */
export function dollars(v: number): string {
  const r = Math.round(Math.abs(v) / 10) * 10
  return `${v < 0 && r > 0 ? MINUS : ''}$${r.toLocaleString('en-CA')}`
}

/** A tick on a dollar axis, short enough that two of them fit side by side on a phone: $500, $1.5k, −$1k. */
export function axisDollars(v: number): string {
  const a = Math.abs(v)
  return `${v < 0 ? MINUS : ''}$${a >= 1000 ? `${a / 1000}k` : a}`
}

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-CA', { timeZone: 'UTC', ...opts })

/**
 * "Oct 5, 2026", "Oct 5 to 20, 2026", "Oct 5 to Nov 2, 2026" or across years.
 *
 * Built from the parts rather than asking the locale for a day and a year with
 * no month, which it answers with "2026 (day: 26)".
 */
export function dateSpan(from: string, to: string, long = false): string {
  const a = day(from)
  const b = day(to)
  const month = (d: Date) => fmt(d, { month: long ? 'long' : 'short' })
  const left = `${month(a)} ${a.getUTCDate()}`
  const right = `${month(b)} ${b.getUTCDate()}`
  const years = [a.getUTCFullYear(), b.getUTCFullYear()]
  if (from === to) return `${left}, ${years[0]}`
  if (years[0] === years[1] && a.getUTCMonth() === b.getUTCMonth()) return `${left} to ${b.getUTCDate()}, ${years[1]}`
  if (years[0] === years[1]) return `${left} to ${right}, ${years[1]}`
  return `${left}, ${years[0]} to ${right}, ${years[1]}`
}

export const publishedOn = (iso: string) => fmt(new Date(iso), { month: 'long', day: 'numeric', year: 'numeric' })

/** The first of `steps` that is at least `raw`, or the last. */
export function niceStep(raw: number, steps: number[]): number {
  return steps.find((s) => s >= raw) ?? steps[steps.length - 1]
}

/** Evenly spaced values from `min` to `max` inclusive, `step` apart. */
export function ticksBetween(min: number, max: number, step: number): number[] {
  const out: number[] = []
  for (let v = min; v <= max + step / 1e6; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}
