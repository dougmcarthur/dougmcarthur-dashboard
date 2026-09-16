/**
 * What Scout puts in your Google account, and which of the two places it goes.
 *
 * The app used to have one answer — the calendar — and it was the wrong shape
 * for most of what it wrote. A calendar is a record of where your body has to
 * be. An application deadline is not that: nothing happens at 9am on the
 * deadline except that a form closes, and putting it in a diary beside a
 * festival you are playing makes the two look alike. That confusion is the
 * same one the status rename exists to end.
 *
 * So the split is by **who the entry is a claim about**:
 *
 * - **A calendar entry means you show up.** Confirmed gigs and showcases —
 *   things with a stage, a load-in and a drive. Only `booked` produces one.
 * - **A task means you do some work.** Filling a form, chasing a reply,
 *   remembering that a window opened. It has a due date, it can be ticked
 *   off, and it does not pretend to be an appointment.
 *
 * Four kinds of nudge, and the *available* destinations differ per kind
 * rather than every kind offering every option. A show is never a task —
 * ticking off a festival you played is not a thing anybody wants — and a
 * follow-up is never a calendar entry, because there is no hour at which it
 * happens. Typing that constraint here is what stops a settings screen
 * offering a combination the writer refuses.
 *
 * Nothing in this file reads the clock or touches Google. It takes the row
 * and the preferences and says what should exist; `src/lib/gigNudges.ts`
 * reconciles that against what does. Same separation `buildReviewQueue` keeps,
 * and for the same reason: this is the part worth testing.
 */

import { awaitsYourReply, normaliseGigStatus } from './gigStatus'

/* --------------------------------------------------------------------- */
/* The four kinds                                                         */
/* --------------------------------------------------------------------- */

export type NudgeKind = 'opens' | 'deadline' | 'reply' | 'show'

export type Destination = 'tasks' | 'calendar' | 'both' | 'off'

export interface NudgeKindSpec {
  id: NudgeKind
  /** What it is called on screen. */
  label: string
  /** One line saying what produces it. */
  describes: string
  /**
   * What the artist may choose for this kind, in the order a screen shows
   * them. The first entry is the default, and the set is deliberately not the
   * same for every kind — see the note at the top of this file.
   */
  choices: Destination[]
}

export const NUDGE_KINDS: NudgeKindSpec[] = [
  {
    id: 'show',
    label: 'Confirmed shows',
    describes: 'The performance dates on a gig you have been booked for.',
    // No `tasks`. A show is not work you tick off, it is where you have to be,
    // and it is the one thing a calendar is unambiguously for.
    choices: ['calendar', 'off'],
  },
  {
    id: 'deadline',
    label: 'Application deadlines',
    describes: 'The closing date on something you have decided to apply for.',
    choices: ['tasks', 'calendar', 'both', 'off'],
  },
  {
    id: 'opens',
    label: 'Submission windows opening',
    describes: 'The day a form starts accepting applications.',
    choices: ['tasks', 'calendar', 'both', 'off'],
  },
  {
    id: 'reply',
    label: 'Replies you owe',
    describes: 'An organiser asked you something, or an application has gone quiet.',
    // No `calendar`. There is no date this happens on — it is a state the row
    // is in — and a calendar entry for "at some point, chase this" is a lie
    // about a time. A task with a due date is the honest version.
    choices: ['tasks', 'off'],
  },
]

export function nudgeKindSpec(id: NudgeKind): NudgeKindSpec {
  const found = NUDGE_KINDS.find((k) => k.id === id)
  if (!found) throw new Error(`No nudge kind ${id}`)
  return found
}

export const DESTINATION_LABELS: Record<Destination, string> = {
  tasks: 'Google Tasks',
  calendar: 'Calendar',
  both: 'Both',
  off: 'Neither',
}

/* --------------------------------------------------------------------- */
/* Preferences                                                            */
/* --------------------------------------------------------------------- */

/**
 * How long after a window opens the task is due.
 *
 * Not zero, and the reason is a real one rather than a rounding. A form that
 * was not accepting applications yesterday usually has no fields to read
 * until it is — so on the morning a window opens, the agent has not yet
 * scraped it and `ApplicationPanel` has nothing staged. A task due that same
 * morning sends you to an empty panel. A day later the overnight run has been
 * and the prep is there to work from.
 *
 * It is a preference rather than a constant because the agents' cadence is
 * outside this repo: a deployment running them hourly wants zero, and one
 * running them weekly wants more.
 */
export const DEFAULT_OPENING_LEAD_DAYS = 1

/** A day is the ceiling anybody sensibly wants, and a week is the floor of silly. */
export const MAX_OPENING_LEAD_DAYS = 14

export interface NudgePreferences {
  show: Destination
  deadline: Destination
  opens: Destination
  reply: Destination
  /** Days after `opens_at` that the "window is open" task falls due. */
  openingLeadDays: number
}

/**
 * The shape an artist gets before touching anything.
 *
 * Shows on the calendar, work in Tasks — the split this file argues for, as
 * the out-of-the-box answer rather than something to be assembled. Every kind
 * is on: a nudge nobody asked to be silenced is better than a screen full of
 * switches you have to find before the app does anything.
 */
export const NUDGE_DEFAULTS: NudgePreferences = {
  show: 'calendar',
  deadline: 'tasks',
  opens: 'tasks',
  reply: 'tasks',
  openingLeadDays: DEFAULT_OPENING_LEAD_DAYS,
}

/**
 * A stored value read back, refusing anything the kind does not offer.
 *
 * A preference that named a destination the writer will not honour is worse
 * than the default: the screen would say "Calendar" and nothing would appear
 * there. So an unknown or unavailable value falls back rather than being
 * carried, the same treatment `readDigestSettings` gives an hour that is not
 * a number.
 */
export function normaliseDestination(kind: NudgeKind, raw: string | null | undefined): Destination {
  const spec = nudgeKindSpec(kind)
  const value = (raw ?? '').trim() as Destination
  return spec.choices.includes(value) ? value : spec.choices[0]
}

export function normaliseLeadDays(raw: string | number | null | undefined): number {
  // Absent before numeric, and that order is the whole of this function's
  // difficulty: `Number('')` and `Number(null)` are both 0, which is a valid
  // lead time. Without this line a blank row means "due the morning it opens"
  // — a real preference somebody never expressed, and the one value this
  // setting exists to avoid.
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return DEFAULT_OPENING_LEAD_DAYS
  }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > MAX_OPENING_LEAD_DAYS) return DEFAULT_OPENING_LEAD_DAYS
  return n
}

/** Whether a kind reaches a given surface under these preferences. */
export function goesTo(pref: Destination, surface: 'tasks' | 'calendar'): boolean {
  return pref === surface || pref === 'both'
}

/* --------------------------------------------------------------------- */
/* What a row wants                                                       */
/* --------------------------------------------------------------------- */

/** Everything the routing needs, and nothing else. Dates are already dates. */
export interface NudgeRow {
  name: string
  status: string
  /** A real date, or null. Prose has already been through `splitDeadline`. */
  opensAt: string | null
  deadline: string | null
  /** The show's span, already validated by `showSpan`. */
  showStart: string | null
  showEndExclusive: string | null
  /**
   * The date a reply is owed by, if one is. Null when nothing is owed —
   * computed by the caller, because it depends on the reply state and on
   * `today`, and this file does not read the clock.
   */
  replyDueOn: string | null
}

export interface PlannedNudge {
  kind: NudgeKind
  /** Where it goes. Never `both` — this is one entry on one surface. */
  surface: 'tasks' | 'calendar'
  /** What it is called in Google. */
  title: string
  /** The date it sits on, or is due. */
  date: string
  /** Google's exclusive all-day end. Only a multi-day show has one. */
  endDateExclusive: string | null
  /** Lead time for a calendar pop-up, in minutes. Ignored by Tasks. */
  reminderMinutes: number
}

/**
 * Deadline reminders are worth having from the moment you say you will apply,
 * and not before — an undecided opportunity is not yet a chore.
 */
function wantsApplicationWork(status: string): boolean {
  const s = normaliseGigStatus(status)
  return s === 'shortlisted' || s === 'preparing'
}

/** Only a signed agreement puts you on a stage. */
function wantsShow(status: string): boolean {
  return normaliseGigStatus(status) === 'booked'
}

/** `2026-09-16` plus n days, staying in UTC so it cannot drift by a zone. */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(ms)) return date
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Everything this row should have, on every surface, under these preferences.
 *
 * Written as "what should exist" rather than "what changed", exactly like
 * `syncGigCalendar` before it: the transition-handler version meant a row
 * that arrived already booked never got its event, and comparing
 * wanted-against-present has no such gap.
 */
export function planNudges(row: NudgeRow, prefs: NudgePreferences): PlannedNudge[] {
  const out: PlannedNudge[] = []
  const applying = wantsApplicationWork(row.status)

  const add = (
    kind: NudgeKind,
    date: string | null,
    title: string,
    reminderMinutes: number,
    endDateExclusive: string | null = null,
  ) => {
    if (!date) return
    const pref = prefs[kind]
    for (const surface of ['tasks', 'calendar'] as const) {
      if (goesTo(pref, surface)) {
        out.push({ kind, surface, title, date, endDateExclusive, reminderMinutes })
      }
    }
  }

  // The window opening, pushed out so the prep exists by the time you look.
  add(
    'opens',
    applying && row.opensAt ? addDays(row.opensAt, prefs.openingLeadDays) : null,
    `Start the application — ${row.name}`,
    0,
  )

  // A week, not a day. A deadline you learn about the night before is a
  // deadline you miss; an application needs materials assembled.
  add(
    'deadline',
    applying ? row.deadline : null,
    `Apply by — ${row.name}`,
    7 * 24 * 60,
  )

  add('reply', row.replyDueOn, `Reply — ${row.name}`, 0)

  // No prefix. This one is the show, and it is the only entry that is not a
  // chore with a date attached.
  add(
    'show',
    wantsShow(row.status) ? row.showStart : null,
    row.name,
    24 * 60,
    row.showEndExclusive,
  )

  return out
}

/**
 * Whether this row owes a reply, as a yes/no the caller turns into a date.
 *
 * Split out so the rule lives beside the others rather than inside a route.
 * `info_requested` and `invited` are the two states where the ball is back
 * with you — see `awaitsYourReply` — and they are the states most likely to
 * stall silently, because nothing about them looks like a deadline.
 */
export function owesReply(status: string): boolean {
  return awaitsYourReply(status)
}
