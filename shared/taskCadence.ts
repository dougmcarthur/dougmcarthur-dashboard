/**
 * Noticing that a scheduled agent has stopped.
 *
 * The three research agents ran on a cadence from June, stopped within a week
 * of each other in early August, and nothing said so for a month. Every part
 * needed to notice was already here — `task_runs` logs every run, the bell has
 * a feed, housekeeping runs daily — and none of them was looking. A missing
 * gig is invisible in a way a wrong one is not: there is no row to be wrong.
 *
 * **This is a condition, not an event.** It is derivable from current state at
 * any moment and it self-heals the instant a run posts, which is exactly the
 * line `docs/notifications-plan.md` draws. Recording an event when a task went
 * quiet would leave a permanent row about a situation that is no longer true.
 *
 * The cadence is measured rather than configured. Nothing declares that
 * `gig-festival-scan` is weekly — the schedule lives outside this repo, and a
 * settings row saying "weekly" would be a second place for the truth to drift
 * from. What the runs themselves show is the only claim available, and it
 * updates itself when a schedule changes.
 *
 * Like everything in the queue: this never reads the clock. `today` is handed in.
 */

/** Below this many runs there are fewer than two gaps, which is not a cadence. */
export const MIN_RUNS_FOR_CADENCE = 3

/**
 * How many times its own interval a task may go quiet before it is stalled.
 *
 * A weekly task that misses one cycle is late; one that has missed two and a
 * half has stopped. Set low enough to catch a dead schedule inside a fortnight
 * and high enough that a skipped week is not an alarm — an alarm you learn to
 * dismiss is worse than none.
 */
export const OVERDUE_MULTIPLE = 2.5

/** A task that ran twice an hour apart should not alarm three hours later. */
export const MIN_SILENCE_DAYS = 3

/**
 * The ceiling, which exists for the monthly task.
 *
 * Three runs give two gaps, so a monthly cadence is measured with very little
 * evidence and `OVERDUE_MULTIPLE` would put its threshold near eighty days.
 * Six weeks of silence is worth raising whatever the measured interval says.
 */
export const MAX_SILENCE_DAYS = 45

const DAY_MS = 86_400_000

export interface TaskHistory {
  taskId: string
  /** Every recorded `run_at` for this task, in any order. */
  runAt: string[]
}

export interface StalledTask {
  taskId: string
  /** Whole days since the newest run. */
  daysSince: number
  /** The measured interval, rounded — what the task's own history claims. */
  everyDays: number
  /** Days past the threshold. Sorted on, so the worst offender leads. */
  overdueBy: number
}

/**
 * `run_at` as an instant, tolerating what production actually holds.
 *
 * Most rows are ISO with a `Z`. Two are `2026-07-17 19:24:50` — a space
 * instead of a `T` and no zone at all, which `Date.parse` is entitled to read
 * as *local* time. That would make this module answer differently depending on
 * the machine, and the suite runs a second time under `TZ=Pacific/Auckland`
 * precisely to catch that. A stored timestamp with no zone came from a UTC
 * runner, so it is read as UTC rather than as wherever the reader happens to be.
 */
export function parseRunAt(value: string): number | null {
  const trimmed = value.trim()
  const normalised = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(trimmed)
    ? trimmed.replace(' ', 'T') + 'Z'
    : trimmed
  const ms = Date.parse(normalised)
  return Number.isFinite(ms) ? ms : null
}

/** The middle gap, or the mean of the two middle ones. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * The interval a task's own runs imply, in days, or null when they imply none.
 *
 * Median rather than mean because one long gap — a holiday, a rewrite — should
 * not double the threshold and blind the check for a month. Gaps of zero are
 * dropped: two runs sharing a timestamp is a retried POST, not evidence that
 * the task runs continuously.
 */
export function measuredCadence(runAt: string[]): number | null {
  const times = runAt.map(parseRunAt).filter((t): t is number => t !== null).sort((a, b) => a - b)
  if (times.length < MIN_RUNS_FOR_CADENCE) return null

  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) {
    const gap = (times[i] - times[i - 1]) / DAY_MS
    if (gap > 0) gaps.push(gap)
  }
  if (gaps.length < 2) return null
  return median(gaps)
}

/**
 * Which tasks have gone quiet for longer than their own history says they should.
 *
 * A task with too little history is skipped rather than guessed at — the same
 * rule the cost module and the deadline parser hold to. So is a task that has
 * never run: there is no row for something that never happened, and nothing
 * here can miss what it cannot see. That gap is real and is the reason the
 * check is a floor rather than a guarantee.
 */
export function stalledTasks(input: { histories: TaskHistory[]; today: string }): StalledTask[] {
  const now = parseRunAt(input.today)
  if (now === null) return []

  const out: StalledTask[] = []
  for (const history of input.histories) {
    const cadence = measuredCadence(history.runAt)
    if (cadence === null) continue

    const times = history.runAt
      .map(parseRunAt)
      .filter((t): t is number => t !== null)
    if (times.length === 0) continue
    const last = Math.max(...times)

    const threshold = Math.min(
      Math.max(cadence * OVERDUE_MULTIPLE, MIN_SILENCE_DAYS),
      MAX_SILENCE_DAYS,
    )
    const daysSince = (now - last) / DAY_MS
    if (daysSince <= threshold) continue

    out.push({
      taskId: history.taskId,
      daysSince: Math.floor(daysSince),
      everyDays: Math.round(cadence),
      overdueBy: Math.floor(daysSince - threshold),
    })
  }

  // Worst first, then by name so the order is stable between reads.
  return out.sort((a, b) => b.overdueBy - a.overdueBy || a.taskId.localeCompare(b.taskId))
}
