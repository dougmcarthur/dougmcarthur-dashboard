/** Presentation-only formatting helpers shared across screens. */

/**
 * A compact run date: "Aug 12" this year, "Aug 12, 2025" once it is not.
 *
 * Dropping the year while it is the current one buys horizontal room in dense
 * rows; keeping it on older entries stops "Jul 31" from silently meaning a
 * different July. An unparseable value is passed through rather than rendered
 * as "Invalid Date".
 */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
}

/**
 * Today's date on the reader's own calendar, as YYYY-MM-DD.
 *
 * For handing to `daysUntil` and friends, which take `today` as an argument
 * rather than reading the clock. Not `toISOString().slice(0, 10)`: that is
 * the UTC date, which in Winnipeg turns into tomorrow at seven every evening
 * and counts every deadline a day short until midnight.
 */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * How long ago, in the coarsest unit that is still true.
 *
 * Notifications are read at a glance, and "2h ago" answers the only question
 * being asked — is this fresh, or has it been sitting there. Minute precision
 * past an hour is noise, and an exact timestamp makes you do the subtraction.
 * Anything older than a week falls back to a date, because "23 days ago" is
 * harder to place than "Aug 6".
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return iso

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000)
  // A clock skew between the Worker and the browser must not read "in 3s".
  if (seconds < 45) return 'Just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`

  return shortDate(iso, now)
}

/**
 * The reader's own calendar day for an instant, as YYYY-MM-DD.
 *
 * What a timeline groups by. The server's UTC day is wrong for exactly the
 * hours a person is most likely to be looking: seven in the evening in
 * Winnipeg is already tomorrow in UTC, and tonight's digest would be filed
 * under a day that has not started.
 */
export function localDay(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : localToday(d)
}

/**
 * A day as a heading: "Today", "Yesterday", then the weekday and date, with the
 * year only once it is not this one. Takes `today` rather than reading the
 * clock, like everything else here that is about which day it is.
 */
export function dayHeading(day: string, today: string): string {
  if (day === today) return 'Today'

  const [ty, tm, td] = today.split('-').map(Number)
  if (day === localToday(new Date(ty, tm - 1, td - 1))) return 'Yesterday'

  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(y === ty ? {} : { year: 'numeric' }),
  })
}

/** The time of day on the reader's clock: "7:19 AM". */
export function clockTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
}
