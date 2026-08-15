// Pure logic for submission windows: when a gig can actually be submitted,
// what status an approval should land on, and which reminders that approval
// should schedule. Kept free of D1/network so it can be unit-tested directly.

export type WindowState = 'open' | 'upcoming' | 'closed' | 'unknown'

export interface WindowInput {
  submissionOpensAt?: string | null
  submissionClosesAt?: string | null
  deadline?: string | null
}

/** Days the prep run tries to get ahead of the window opening. */
export const PREP_LEAD_DAYS = 21
/** Heads-up email this many days before the window opens. */
export const WINDOW_SOON_LEAD_DAYS = 7
/** Nudge this many days before a deadline if nothing has been submitted. */
export const PRE_DEADLINE_LEAD_DAYS = 7

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
  reminderType: 'window_soon' | 'window_opens' | 'pre_deadline'
  scheduledFor: string
}

/**
 * Reminders an approval should schedule. Dates already in the past are dropped —
 * a reminder that fires the moment it's created is noise, not a reminder.
 */
export function plannedReminders(
  gig: WindowInput,
  todayStr: string = today(),
): PlannedReminder[] {
  const planned: PlannedReminder[] = []
  const opens = gig.submissionOpensAt?.slice(0, 10) || null
  const deadline = gig.deadline?.slice(0, 10) || null

  if (opens && opens > todayStr) {
    const soon = shiftDays(opens, -WINDOW_SOON_LEAD_DAYS)
    if (soon > todayStr) planned.push({ reminderType: 'window_soon', scheduledFor: soon })
    planned.push({ reminderType: 'window_opens', scheduledFor: opens })
  }

  if (deadline) {
    const nudge = shiftDays(deadline, -PRE_DEADLINE_LEAD_DAYS)
    const scheduledFor = nudge > todayStr ? nudge : deadline
    if (scheduledFor >= todayStr) planned.push({ reminderType: 'pre_deadline', scheduledFor })
  }

  return planned
}

/**
 * Should the prep run pick this gig up now? Prep runs ahead of the window so the
 * answers are ready to review before the reminder lands — but not so far ahead
 * that we burn a form fetch on something a year out.
 */
export function shouldPrepareNow(
  gig: WindowInput & { loginRequired?: number | null; prepStatus?: string | null },
  todayStr: string = today(),
): boolean {
  if (gig.loginRequired) return false
  if (gig.prepStatus === 'ready' || gig.prepStatus === 'blocked') return false

  const state = windowState(gig, todayStr)
  if (state === 'closed') return false
  if (state === 'open' || state === 'unknown') return true

  const opens = gig.submissionOpensAt!.slice(0, 10)
  return daysBetween(todayStr, opens) <= PREP_LEAD_DAYS
}
