import {
  createEventOn,
  updateEventOn,
  deleteEventOn,
  targetFromEnv,
  calendarConfigured,
  type CalendarTarget,
} from './googleCalendar'
import { accessTokenForGrant, readGrant } from './googleGrant'
import type { TenantId } from '../db/scope'
import { normaliseGigStatus } from '../../shared/gigStatus'
import { splitDeadline } from '../../shared/reviewParse'
import { showSpan } from '../../shared/performance'
import type { Env } from '../types'

/**
 * Which calendar this artist's events go to, and what may write them.
 *
 * Two ways in, and the order is the point. A **grant** the artist made in
 * their browser wins: it carries its own token and its own calendar, and it
 * needs nothing set at a terminal. The **Worker secrets** are the older path,
 * kept because a deployment already configured that way must not break — the
 * same "read both spellings" move `normaliseGigStatus` makes for statuses.
 *
 * Null means neither is available, which is a perfectly ordinary state: it is
 * what every gig has silently hit since the calendar shipped, because the
 * secrets were never set in production.
 */
export async function calendarTarget(env: Env, tenant: TenantId | null): Promise<CalendarTarget | null> {
  if (tenant) {
    const grant = await readGrant(env, tenant, 'calendar')
    if (grant.connected && grant.calendarId && grant.canDraft) {
      try {
        return { accessToken: await accessTokenForGrant(env, tenant, 'calendar'), calendarId: grant.calendarId }
      } catch (err) {
        // A refused grant is not a reason to fall back to somebody else's
        // calendar: the artist connected one, and writing to the owner's
        // instead would be worse than writing nowhere.
        console.error('calendar grant unusable:', err)
        return null
      }
    }
  }
  return calendarConfigured(env) ? targetFromEnv(env) : null
}

/**
 * What the calendar is allowed to say about an opportunity.
 *
 * The app used to write one event on approval: `🎵 {name}`, placed on the
 * submission deadline. On a phone that is indistinguishable from a booked
 * show, which is exactly the confusion the pipeline rename exists to end.
 * Deciding to apply is not a date in your diary.
 *
 * So there are three entries, and only the last one is a gig:
 *
 *  1. `Applications open — {name}` on `opens_at`
 *  2. `Apply by — {name}` on `deadline`
 *  3. `{name}` on the performance dates — written **only** at `booked`
 *
 * The first two are chores with dates attached. The third is the only one that
 * means you will be standing on a stage, and nothing writes it until an
 * agreement exists.
 */

export interface GigRow {
  id: number
  name: string
  status: string
  organizer: string | null
  type: string | null
  url: string | null
  fitRationale: string | null
  fitNotes: string | null
  deadline: string | null
  opensAt: string | null
  performanceStart: string | null
  performanceEnd: string | null
  googleEventId: string | null
  opensEventId: string | null
  showEventId: string | null
}

/** Column updates the caller merges into its own patch. */
export type CalendarPatch = Partial<
  Pick<GigRow, 'googleEventId' | 'opensEventId' | 'showEventId'>
>

/**
 * Deadline reminders are worth having from the moment you say you will apply,
 * and not before — an undecided opportunity is not yet a chore.
 */
function wantsApplicationReminders(status: string): boolean {
  const s = normaliseGigStatus(status)
  return s === 'shortlisted' || s === 'preparing'
}

/** Only a signed agreement puts you on a stage. */
function wantsShowEvent(status: string): boolean {
  return normaliseGigStatus(status) === 'booked'
}

function describe(row: GigRow): string {
  return [
    row.organizer ? `Organiser: ${row.organizer}` : '',
    row.type ? `Type: ${row.type}` : '',
    row.fitRationale ?? row.fitNotes ?? '',
    row.url ? `Link: ${row.url}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * A date, or null.
 *
 * 26 of 34 production rows hold prose in `deadline` ("None — rolling artist
 * roster intake"), which used to be handed to Google verbatim. Recover a date
 * where the prose contains one and skip the entry where it does not.
 */
function dateOf(raw: string | null): string | null {
  return raw ? splitDeadline(raw).date : null
}

/**
 * Bring all three entries into line with the row's current state.
 *
 * Written as a reconcile rather than a set of transition handlers: the old code
 * asked "did the status just change to approved?", which meant a row that
 * arrived already approved never got its event, and a deadline edited on a
 * rejected row still updated one. Comparing wanted-vs-present has no such
 * gaps, and it is idempotent, so a retried request cannot double up.
 */
export async function syncGigCalendar(
  env: Env,
  row: GigRow,
  tenant: TenantId | null = null,
): Promise<CalendarPatch> {
  const target = await calendarTarget(env, tenant)
  if (!target) return {}

  const patch: CalendarPatch = {}
  const description = describe(row)

  // The show can run for several days; the two chores are a single date each.
  const span = wantsShowEvent(row.status)
    ? showSpan(row.performanceStart, row.performanceEnd)
    : null

  const wanted: Array<{
    field: keyof CalendarPatch
    date: string | null
    /** Google's exclusive all-day end. Null for a one-day entry. */
    endDateExclusive: string | null
    summary: string
    /** Lead time for the pop-up, in minutes. */
    reminderMinutes: number
  }> = [
    {
      field: 'opensEventId',
      date: wantsApplicationReminders(row.status) ? dateOf(row.opensAt) : null,
      endDateExclusive: null,
      summary: `Applications open — ${row.name}`,
      reminderMinutes: 0,
    },
    {
      field: 'googleEventId',
      date: wantsApplicationReminders(row.status) ? dateOf(row.deadline) : null,
      endDateExclusive: null,
      summary: `Apply by — ${row.name}`,
      // A week, not a day. A deadline you learn about the night before is a
      // deadline you miss; an application needs materials assembled.
      reminderMinutes: 7 * 24 * 60,
    },
    {
      field: 'showEventId',
      // `showSpan` returns null for a half-filled or backwards pair, so a bad
      // edit removes the entry rather than writing a nonsense one.
      date: span?.start ?? null,
      endDateExclusive: span?.endExclusive ?? null,
      // No prefix and no emoji. This one is the show.
      summary: row.name,
      reminderMinutes: 24 * 60,
    },
  ]

  for (const w of wanted) {
    const existing = row[w.field]

    try {
      if (w.date && !existing) {
        const event = await createEventOn(target, {
          summary: w.summary,
          description,
          date: w.date,
          endDateExclusive: w.endDateExclusive ?? undefined,
          reminderMinutes: w.reminderMinutes,
        })
        patch[w.field] = event.id
      } else if (w.date && existing) {
        await updateEventOn(target, existing, {
          summary: w.summary,
          date: w.date,
          endDateExclusive: w.endDateExclusive ?? undefined,
        })
      } else if (!w.date && existing) {
        await deleteEventOn(target, existing)
        patch[w.field] = null
      }
    } catch (err) {
      // Non-fatal, and deliberately per-entry: a Calendar outage must not stop
      // a status change from being saved, and one failed entry must not
      // abandon the other two.
      console.error(`calendar sync failed for ${w.field} on gig ${row.id}:`, err)
    }
  }

  return patch
}

/** Everything this gig owns, for deletion. */
export async function removeGigCalendar(
  env: Env,
  row: Partial<GigRow>,
  tenant: TenantId | null = null,
): Promise<void> {
  const target = await calendarTarget(env, tenant)
  if (!target) return
  for (const id of [row.googleEventId, row.opensEventId, row.showEventId]) {
    if (!id) continue
    try {
      await deleteEventOn(target, id)
    } catch (err) {
      console.error('calendar delete failed:', err)
    }
  }
}
