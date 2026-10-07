/**
 * The History page: the bell, expanded.
 *
 * The bell is a window onto the newest twenty things and History is the room
 * behind it. Same kinds, same icons, same unread marks, but a timeline in place
 * of a cap, and every automation run readable instead of a wall of its prose.
 *
 * Two tables feed it, and the join between them is the part to understand:
 *
 *  - `task_runs` is the record of every run, forever, with the structured
 *    fields (task, status, items added) and the agent's whole report.
 *  - `notification_events` holds everything else that happened (digests sent,
 *    replies found, an artist joining) and is pruned at thirty days. It also
 *    holds an echo of each run, written so the bell could ring.
 *
 * A run is listed from `task_runs`, never from its echo, so it carries its real
 * fields rather than a title parsed back apart. The echo is read for one thing:
 * whether the run is still unread. A run old enough that its echo was pruned
 * has been out of the bell for a month and reads as read.
 *
 * Pure: rows in, entries out, no clock and no database. The Worker does the
 * querying (`src/lib/history.ts`) and the page does the drawing.
 */

import type { Notification, NotificationKind, StoredEvent, Tier } from './notifications'
import { isRunEventKey, runEventKey, runTier, runTitle } from './runEvents'
import { parseRunSummary, runGist, type RunReport } from './runSummary'
import { parseRunAt } from './taskCadence'

export interface HistoryRun {
  id: number
  taskId: string
  runAt: string
  status: string
  summary: string | null
  itemsAdded: number | null
}

export interface HistoryEntry {
  /** Identity for the list. `run:12` or `event:34`. */
  key: string
  /**
   * What the read endpoint takes for this entry, when a stored event stands
   * behind it. Null for a run whose bell echo has been pruned: there is
   * nothing left to mark.
   */
  readKey: string | null
  kind: NotificationKind
  tier: Tier
  title: string
  /** One short line under the title. For a run, what it filed; never its report. */
  body: string
  /** The run's report, laid out. Null for everything that is not a run with something to say. */
  report: RunReport | null
  /** A run's own status, so a failure can say so. Null for events. */
  status: string | null
  /** When it happened, as an ISO instant. */
  at: string
  href: string | null
  action: string | null
  read: boolean
}

/**
 * What the page is handed.
 *
 * `counts`, `attention` and `unread` ride only on the first page: they describe
 * the whole of History rather than a slice of it, and sending them with every
 * "show older" would make that button as costly as opening the page.
 */
export interface HistoryFeed {
  entries: HistoryEntry[]
  /** The cursor for the next page, or null when this was the last. */
  next: string | null
  /** Per type, what there is to see in total, standing items and timeline together. */
  counts?: Partial<Record<NotificationKind, number>>
  /**
   * Conditions that are true right now. Not history, and drawn apart from it:
   * a connection that is down is a fact about today, and it stops being listed
   * the moment it is fixed.
   */
  attention?: Notification[]
  /** What the bell badge says, so "Mark all read" knows whether it has work. */
  unread?: number
}

const newestFirst = (a: { atMs: number; key: string }, b: { atMs: number; key: string }) =>
  b.atMs - a.atMs || b.key.localeCompare(a.key)

/**
 * An event's link, unless the link is History itself.
 *
 * Events written before this page existed point at `#runs` as a place to send
 * you. On this page that is a button that reloads where you already are.
 */
function usefulHref(href: string | null): string | null {
  if (!href) return null
  return /^#runs(\/|$)/.test(href) ? null : href
}

export function buildHistory(input: {
  runs: HistoryRun[]
  /**
   * Every event the page needs, in one list: the ones to show, and the echoes
   * of the runs being shown. The echoes are told apart by their key.
   */
  events: StoredEvent[]
  limit: number
}): { entries: HistoryEntry[]; next: string | null } {
  const echoes = new Map<string, StoredEvent>()
  for (const e of input.events) {
    if (isRunEventKey(e.dedupeKey)) echoes.set(e.dedupeKey!, e)
  }

  const pool: Array<HistoryEntry & { atMs: number }> = []

  for (const run of input.runs) {
    const ms = parseRunAt(run.runAt)
    const echo = echoes.get(runEventKey(run.taskId, run.runAt))
    const report = parseRunSummary(run.summary)
    const hasReport = report.intro.length + report.entries.length + report.closing.length > 0

    pool.push({
      key: `run:${run.id}`,
      readKey: echo ? `event:automation:${echo.id}` : null,
      kind: 'automation',
      tier: runTier(run.status),
      title: runTitle(run.taskId, run.status, run.itemsAdded ?? 0),
      body: runGist(run.summary, run.status),
      report: hasReport ? report : null,
      status: run.status,
      at: ms === null ? run.runAt : new Date(ms).toISOString(),
      href: null,
      action: null,
      // No echo means it aged out of the bell, which is to say it was seen or
      // is too old to be news. An unread badge nobody can clear is the failure
      // the bell's own rules were written against.
      read: echo ? echo.readAt !== null : true,
      atMs: ms ?? 0,
    })
  }

  for (const e of input.events) {
    if (isRunEventKey(e.dedupeKey)) continue
    const ms = Date.parse(e.createdAt)
    const href = usefulHref(e.href)
    pool.push({
      key: `event:${e.id}`,
      readKey: `event:${e.kind}:${e.id}`,
      kind: e.kind as NotificationKind,
      tier: e.tier as Tier,
      title: e.title,
      body: e.body ?? '',
      report: null,
      status: null,
      at: e.createdAt,
      href,
      action: href ? e.actionLabel : null,
      read: e.readAt !== null,
      atMs: Number.isFinite(ms) ? ms : 0,
    })
  }

  pool.sort(newestFirst)

  // A page ends on a timestamp and the next one starts after it, so two
  // entries sharing the last timestamp must not be split across the line: the
  // second would be on neither page.
  let end = Math.min(input.limit, pool.length)
  while (end > 0 && end < pool.length && pool[end].atMs === pool[end - 1].atMs) end++

  const page = pool.slice(0, end)
  const last = page[page.length - 1]
  return {
    entries: page.map(({ atMs: _atMs, ...entry }) => entry),
    next: pool.length > end && last ? last.at : null,
  }
}

// ── Days ──────────────────────────────────────────────────────────────────────

export interface DayGroup {
  /** The reader's calendar day, `YYYY-MM-DD`. */
  day: string
  entries: HistoryEntry[]
}

/**
 * Entries under the day they happened, in the order given.
 *
 * `dayOf` is passed in because the day is the *reader's*, not the server's:
 * seven in the evening in Winnipeg is tomorrow in UTC, and a timeline that
 * files tonight's digest under tomorrow is wrong in the one way nobody can
 * work out for themselves. The same reasoning `localToday` carries.
 */
export function groupByDay(entries: HistoryEntry[], dayOf: (iso: string) => string): DayGroup[] {
  const groups: DayGroup[] = []
  for (const entry of entries) {
    const day = dayOf(entry.at)
    const open = groups[groups.length - 1]
    if (open && open.day === day) open.entries.push(entry)
    else groups.push({ day, entries: [entry] })
  }
  return groups
}
