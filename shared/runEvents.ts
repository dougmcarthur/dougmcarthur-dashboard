/**
 * A task run and the notification it leaves behind.
 *
 * Every run an agent posts is written twice: a row in `task_runs`, which is the
 * record and keeps the agent's whole report, and a row in `notification_events`,
 * which is what rings the bell and is pruned after thirty days. The two are
 * joined by one string, so the string is defined once, here, for both the
 * writer and the History page that has to find a run's event again.
 */

import type { Tier } from './notifications'
import { isOkRun } from './runSummary'
import { taskLabel } from './taskLabels'

/**
 * The prefix that marks an event as a run's echo.
 *
 * History lists runs from `task_runs`, where the structured fields live, so an
 * event carrying this prefix is never listed a second time. It is only read, to
 * learn whether the run is still unread on the bell. Nothing else writes a key
 * that starts this way: the other automation events are `form-read:`,
 * `form-blocked:`, `form-missing:` and `profile-scan:`.
 */
export const RUN_KEY_PREFIX = 'automation:'

export function runEventKey(taskId: string, runAt: string): string {
  return `${RUN_KEY_PREFIX}${taskId}:${runAt}`
}

export function isRunEventKey(key: string | null | undefined): boolean {
  return typeof key === 'string' && key.startsWith(RUN_KEY_PREFIX)
}

/**
 * What a run is worth telling you about.
 *
 * `attention` rather than `critical` for a failure, deliberately. Critical is
 * reserved for plumbing that is broken *now* and costing you something
 * silently: a disconnected Calendar drops an event you believe was created. A
 * research run that failed is retried on its next schedule and costs you
 * nothing today. Colouring both the same makes neither mean anything.
 */
export function runTier(status: string): Tier {
  return isOkRun(status) ? 'info' : 'attention'
}

/** The sentence a run is known by. Exported so the copy is testable. */
export function runTitle(taskId: string, status: string, added: number): string {
  // `taskLabel`, never the raw id. The id is what the agent POSTs, an internal
  // handle, and it had reached three screens before anybody noticed it reading
  // as developer-speak.
  const name = taskLabel(taskId)
  if (!isOkRun(status)) return `${name} ${status === 'failed' ? 'failed' : `finished ${status}`}`
  if (added > 0) return `${name} added ${added} ${added === 1 ? 'item' : 'items'}`
  return `${name} ran, nothing new`
}
