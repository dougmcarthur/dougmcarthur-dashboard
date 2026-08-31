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
