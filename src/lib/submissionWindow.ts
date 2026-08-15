// Pure logic for submission windows: when a gig can actually be submitted,
// what status an approval should land on, and which reminders that approval
// should schedule. Kept free of D1/network so it can be unit-tested directly.

export type WindowState = 'open' | 'upcoming' | 'closed' | 'unknown'

export interface WindowInput {
  submissionOpensAt?: string | null
  submissionClosesAt?: string | null
  deadline?: string | null
}

/** Nudge this many days before a deadline if nothing has been submitted. */
export const PRE_DEADLINE_LEAD_DAYS = 7
/** Give up re-fetching a form after this many failed attempts, and say so. */
export const PREP_MAX_ATTEMPTS = 3
/** Wait a day before retrying a prep run that errored. */
export const PREP_RETRY_DAYS = 1

export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** YYYY-MM-DD arithmetic that never trips over local timezones. */
export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Where a gig sits relative to its submission window.
 * The effective close date is submissionClosesAt, falling back to the deadline.
 */
export function windowState(gig: WindowInput, todayStr: string = today()): WindowState {
  const opens = gig.submissionOpensAt?.slice(0, 10) || null
  const closes = (gig.submissionClosesAt || gig.deadline)?.slice(0, 10) || null

  if (closes && closes < todayStr) return 'closed'
  if (opens && opens > todayStr) return 'upcoming'
  if (opens || closes) return 'open'
  return 'unknown'
}

/**
 * Approving a gig whose window hasn't opened yet files it for submission later
 * instead of dropping it into the active queue.
 */
export function resolveApprovalStatus(
  gig: WindowInput,
  todayStr: string = today(),
): 'approved' | 'awaiting_window' {
  return windowState(gig, todayStr) === 'upcoming' ? 'awaiting_window' : 'approved'
}

export interface PlannedReminder {
  reminderType: 'pre_deadline'
  scheduledFor: string
}

/**
 * Reminders an approval should schedule. The window-opening email isn't one of
 * them: the form usually isn't published until submissions open, so that email
 * is raised by the prep run once there are actually answers to review (see
 * `answers_ready` in scheduled.ts). Dates already past are dropped — a reminder
 * that fires the moment it's created is noise, not a reminder.
 */
export function plannedReminders(
  gig: WindowInput,
  todayStr: string = today(),
): PlannedReminder[] {
  const planned: PlannedReminder[] = []
  const deadline = gig.deadline?.slice(0, 10) || null

  if (deadline) {
    const nudge = shiftDays(deadline, -PRE_DEADLINE_LEAD_DAYS)
    const scheduledFor = nudge > todayStr ? nudge : deadline
    if (scheduledFor >= todayStr) planned.push({ reminderType: 'pre_deadline', scheduledFor })
  }

  return planned
}

/**
 * Should the prep run pick this gig up now?
 *
 * Only once the window is actually open. Festival application forms are
 * typically published when submissions open — fetching earlier reads a
 * "check back in March" page and prepares answers to the wrong questions.
 */
export function shouldPrepareNow(
  gig: WindowInput & { loginRequired?: number | null; prepStatus?: string | null },
  todayStr: string = today(),
): boolean {
  if (gig.loginRequired) return false
  if (gig.prepStatus === 'ready' || gig.prepStatus === 'blocked') return false

  const state = windowState(gig, todayStr)
  return state === 'open' || state === 'unknown'
}

/**
 * Has prep finished for this gig, one way or another? Terminal means there's
 * something worth emailing about — answers to review, or a form that needs
 * doing by hand.
 */
export function isPrepTerminal(
  prepStatus: string | null | undefined,
  attempts: number | null | undefined,
): boolean {
  if (prepStatus === 'ready' || prepStatus === 'blocked') return true
  if (prepStatus === 'failed') return (attempts ?? 0) >= PREP_MAX_ATTEMPTS
  return false
}

/** Is a failed prep due for another attempt? */
export function isPrepRetryDue(
  gig: { prepStatus?: string | null; prepUpdatedAt?: string | null; prepAttempts?: number | null },
  todayStr: string = today(),
): boolean {
  if (gig.prepStatus !== 'failed') return false
  if ((gig.prepAttempts ?? 0) >= PREP_MAX_ATTEMPTS) return false
  if (!gig.prepUpdatedAt) return true
  return daysBetween(gig.prepUpdatedAt.slice(0, 10), todayStr) >= PREP_RETRY_DAYS
}
