/**
 * When the digest is due.
 *
 * Pure, and takes `now` as an argument, so every rule below is testable without
 * waiting for a Monday.
 *
 * The schedule lives in `app_settings` rather than in wrangler.toml, which
 * means the cron can no longer *be* the schedule — it fires hourly and this
 * decides whether the hour that just started is the one. That indirection buys
 * two things worth having: changing the day does not need a deploy, and the
 * send survives a missed tick.
 */

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

export interface Schedule {
  day: Weekday
  /** 0–23, in `timezone`. */
  hour: number
  /** IANA zone. The whole point of storing one is that "Monday 8am" means
   *  Monday 8am where you are, not 8am UTC, and keeps meaning that across a
   *  daylight-saving change without anyone editing a cron. */
  timezone: string
}

/** What the local clock reads in a given zone. */
export function localParts(now: Date, timezone: string): { day: Weekday; hour: number; date: string } {
  // `en-CA` gives YYYY-MM-DD, which sorts and compares as a plain string.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
  const day = String(parts.weekday ?? '').slice(0, 3).toLowerCase() as Weekday

  return {
    day: WEEKDAYS.includes(day) ? day : 'mon',
    // "24" appears at midnight in some ICU builds; it means hour zero.
    hour: Number(parts.hour) % 24,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

export interface DueInput {
  now: Date
  schedule: Schedule
  /** ISO timestamp of the last successful send, or null if it has never sent. */
  lastSentAt: string | null
}

export interface DueResult {
  due: boolean
  /** Why not, for the Settings screen and for a log line that explains itself. */
  reason: 'due' | 'wrong-day' | 'too-early' | 'already-sent-today'
  /** The local date the decision was made against. */
  localDate: string
}

/**
 * Due on the configured day, at or after the configured hour, once per day.
 *
 * Deliberately `>=` rather than `===` on the hour. An exact match means a
 * single missed tick — a deploy landing on the hour, a cold start, Cloudflare
 * running the trigger a minute late — silently costs a whole week. With `>=`
 * the next hourly tick that day still sends, and the once-per-day guard is
 * what stops it then sending every hour until midnight.
 *
 * That guard compares *local dates*, not elapsed time. "Have I already sent
 * today" is the actual question, and it survives the clocks going back an hour
 * without sending twice.
 */
export function isDigestDue(input: DueInput): DueResult {
  const { day, hour, date } = localParts(input.now, input.schedule.timezone)

  if (day !== input.schedule.day) return { due: false, reason: 'wrong-day', localDate: date }
  if (hour < input.schedule.hour) return { due: false, reason: 'too-early', localDate: date }

  if (input.lastSentAt) {
    const sent = localParts(new Date(input.lastSentAt), input.schedule.timezone)
    if (sent.date === date) return { due: false, reason: 'already-sent-today', localDate: date }
  }

  return { due: true, reason: 'due', localDate: date }
}

/** "Mondays at 08:00" — one line for the Settings screen. */
export function describeSchedule(s: Schedule): string {
  const hour = String(s.hour).padStart(2, '0')
  return `${WEEKDAY_LABELS[s.day]}s at ${hour}:00`
}

/**
 * The next time it will fire, for the Settings screen.
 *
 * Walks forward an hour at a time rather than doing calendar arithmetic: at
 * most 8 days of hours, and it cannot get a daylight-saving boundary wrong
 * because every step is re-read through the zone.
 */
export function nextRun(now: Date, schedule: Schedule, lastSentAt: string | null): Date | null {
  for (let i = 0; i <= 24 * 8; i++) {
    const at = new Date(now.getTime() + i * 3_600_000)
    if (isDigestDue({ now: at, schedule, lastSentAt }).due) return at
  }
  return null
}
