/**
 * What to call an automated task on screen.
 *
 * The bell said *"gig-festival-scan has not run in 28 days"*. That is an
 * internal identifier — the string the agent happens to POST as its
 * `task_id` — and it had reached three surfaces before anybody noticed:
 * the notification title, the run-event title, and the History page.
 *
 * **The set is not closed**, and that is the constraint that shapes this. The
 * agents live outside this repo and send whatever `task_id` they like, so a
 * lookup table alone would render the next new agent as a slug again. Known
 * ids get a written name; everything else gets humanised rather than dropped
 * or shown raw — the same treatment `shared/types.ts` gives status columns,
 * which are typed as `string` for exactly this reason.
 */

/** The three that exist today. Adding one here is a nicety, not a requirement. */
export const TASK_LABELS: Record<string, string> = {
  'gig-festival-scan': 'Gig research',
  'sync-pitch-research': 'Sync licensing research',
  'monthly-promo-checkin': 'Monthly promo check-in',
}

/**
 * A readable name for any task id.
 *
 * Sentence case rather than Title Case, because these appear mid-sentence —
 * "Gig research has not run in 28 days" reads as English where "Gig Research
 * Has Not Run" reads as a headline.
 */
export function taskLabel(taskId: string): string {
  const known = TASK_LABELS[taskId]
  if (known) return known

  const words = taskId.trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!words) return 'An automated task'
  return words.charAt(0).toUpperCase() + words.slice(1)
}
