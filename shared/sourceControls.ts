/**
 * What the owner can set about a source, and how the list of them is laid out.
 *
 * Kept apart from `catalogSources.ts` because the screen needs these and does
 * not need that file's reader, classifier and association registry: this one
 * is a few constants and four small functions, and it is the part of the
 * source logic the browser bundles.
 *
 * Pure: no clock, no database, no network.
 */

import type { SourceState } from './catalogSources'

/**
 * How often a source may be read, as the owner chooses it.
 *
 * A closed set rather than a number box: the poller is hourly and takes a few
 * sources a tick, so "every 20 minutes" would promise something it cannot do,
 * and a typo of 0 would ask for a read on every tick. `cadence_hours` has been a
 * column since migration 0037 (24 for every row); this is the first thing that
 * lets anyone change it. A failing source still backs off from its own cadence,
 * so choosing "every 6 hours" for a dead page does not read it four times a day.
 */
export const SOURCE_CADENCES = [
  { hours: 6, label: 'every 6 hours' },
  { hours: 12, label: 'twice a day' },
  { hours: 24, label: 'daily' },
  { hours: 48, label: 'every 2 days' },
  { hours: 168, label: 'weekly' },
] as const

export const DEFAULT_CADENCE_HOURS = 24

export function isCadence(hours: number): boolean {
  return SOURCE_CADENCES.some((c) => c.hours === hours)
}

/**
 * A cadence said in words, lower case because it finishes a sentence: "Read
 * daily". A value outside the set (a row edited by hand) is still said, not hidden.
 */
export function cadenceLabel(hours: number): string {
  return SOURCE_CADENCES.find((c) => c.hours === hours)?.label ?? `every ${hours} hours`
}

/**
 * The states that are the owner's to look at. `off` is a decision, `never` is a
 * source nobody has read yet, and `working` needs nothing.
 */
export const ATTENTION_STATES: readonly SourceState[] = ['overdue', 'stale', 'empty', 'refused', 'unreachable']

export function needsAttention(state: SourceState): boolean {
  return ATTENTION_STATES.includes(state)
}

/**
 * Switched-off sources last, each group by name.
 *
 * A source that is off is not part of the day-to-day picture, so it goes to the
 * bottom of the list and out of the first page; being first alphabetically is no
 * reason to be the first thing read.
 */
export function orderSources<T extends { enabled: boolean; label: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.label.localeCompare(b.label))
}

/**
 * Reads a day the chosen cadences ask for, from sources that are on. Compared
 * with what the poller can do (`PER_TICK` an hour) it says whether the settings
 * are asking for more than will happen, which is otherwise silent: the queue
 * just runs late.
 */
export function readsPerDay(sources: ReadonlyArray<{ enabled: boolean; cadenceHours: number }>): number {
  return Math.round(sources.filter((s) => s.enabled).reduce((n, s) => n + 24 / Math.max(1, s.cadenceHours), 0))
}
