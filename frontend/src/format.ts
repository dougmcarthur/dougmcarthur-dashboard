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
