/**
 * What dates to offer when deferring an item.
 *
 * Two rules make this worth having as a module rather than a hardcoded menu.
 *
 * First, offers are derived from the item where it has dates of its own. An
 * opportunity whose submissions open on 19 September should offer "when it
 * opens", not "in a month" — the generic interval is a guess and the derived
 * one is the answer. Where an item has no such date the option simply is not
 * offered, rather than appearing greyed out.
 *
 * Second, nothing is offered at or past a live deadline. Snoozing an item
 * beyond the date it stops being actionable is indistinguishable from
 * archiving it, except that it looks like deferral and reads as a decision
 * still to come. Better to offer fewer dates than a menu whose entries quietly
 * throw the item away.
 */

import type { ReviewItem } from './reviewQueue'
import { findDate } from './reviewParse'

export interface SnoozeOption {
  label: string
  /** ISO date. */
  date: string
  /** Came from this item's own dates rather than a generic interval. */
  derived: boolean
}

/** ISO date `n` days after `iso`, calendar-correct across month ends. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const GENERIC: Array<{ label: string; days: number }> = [
  { label: 'In a week', days: 7 },
  { label: 'In a month', days: 30 },
  { label: 'In three months', days: 90 },
]

export function snoozeOptions(
  item: Pick<ReviewItem, 'deadline' | 'parsed'>,
  today: string = new Date().toISOString().slice(0, 10),
): SnoozeOption[] {
  const { date: deadline, opensAt } = item.deadline

  // A deadline still ahead of us is a ceiling: an item deferred past it comes
  // back too late to do anything about.
  const live = deadline && deadline > today ? deadline : null
  const latest = live ? addDays(live, -1) : null

  const out: SnoozeOption[] = []

  if (opensAt && opensAt > today) {
    out.push({ label: 'When it opens', date: opensAt, derived: true })
  }

  // A week's warning before a deadline, but only when a week is actually
  // available — offering "a week before" on something due Thursday is noise.
  if (live) {
    const warn = addDays(live, -7)
    if (warn > today) out.push({ label: 'A week before the deadline', date: warn, derived: true })
  }

  // Notes routinely carry the real answer — "check back in September 2026",
  // "applications open October 1". Where one names a date, it beats any
  // interval this module could invent.
  for (const sentence of item.parsed.timing) {
    const found = findDate(sentence)
    if (found && found > today) out.push({ label: 'When the note says to check back', date: found, derived: true })
  }

  for (const g of GENERIC) {
    const date = addDays(today, g.days)
    if (!latest || date <= latest) out.push({ label: g.label, date, derived: false })
  }

  // Derived options win a collision, so a generic interval landing on the same
  // day never displaces the reason the date matters.
  const seen = new Map<string, SnoozeOption>()
  for (const o of out) if (!seen.has(o.date) || o.derived) seen.set(o.date, o)

  return [...seen.values()]
    .filter((o) => o.date > today && (!latest || o.date <= latest))
    .sort((a, b) => a.date.localeCompare(b.date))
}
