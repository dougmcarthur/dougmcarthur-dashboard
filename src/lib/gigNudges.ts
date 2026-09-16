/**
 * Putting a gig's dates where the artist asked for them.
 *
 * This is `gigCalendar.ts` grown a second destination. The reconcile shape is
 * unchanged and is still the point — compare wanted-against-present rather
 * than handling transitions, so a row that arrives already booked gets its
 * entry and an edit on a passed row removes one. What changed is that
 * "wanted" now comes from `shared/nudgeRouting.ts` and can land on either
 * Google Calendar or Google Tasks, because a deadline and a show are not the
 * same kind of fact and a calendar could only ever say they were.
 *
 * Three things worth knowing before editing it:
 *
 * - **Every write is non-fatal, per entry.** A Google outage must not stop a
 *   status change from being saved, and one failed entry must not abandon the
 *   other four. The column is left as it was, so the next reconcile retries.
 * - **A task the artist ticked off is left ticked.** `readTaskOn` is what
 *   makes that possible: a completed task still exists, so "I cannot find it"
 *   and "it is done" are different answers, and re-creating a task somebody
 *   just finished is the most annoying bug this could have.
 * - **The two surfaces are independent.** Tasks not connected does not stop
 *   the calendar writing, and a refused calendar grant does not stop tasks.
 *   Either being absent is an ordinary state, not an error.
 */

import {
  createEventOn,
  updateEventOn,
  deleteEventOn,
  targetFromEnv,
  calendarConfigured,
  type CalendarTarget,
} from './googleCalendar'
import {
  createTaskOn,
  updateTaskOn,
  readTaskOn,
  deleteTaskOn,
  type TasksTarget,
} from './googleTasks'
import { accessTokenForGrant, readGrant } from './googleGrant'
import type { TenantId } from '../db/scope'
import { splitDeadline } from '../../shared/reviewParse'
import { showSpan } from '../../shared/performance'
import { submissionSilence, NO_REPLY_DAYS } from '../../shared/reviewQueue'
import {
  planNudges,
  owesReply,
  addDays,
  type NudgeKind,
  type NudgePreferences,
  type PlannedNudge,
} from '../../shared/nudgeRouting'
import type { Env } from '../types'

/* --------------------------------------------------------------------- */
/* Where things go                                                        */
/* --------------------------------------------------------------------- */

/**
 * Which calendar this artist's events go to, and what may write them.
 *
 * Three ways in, in order. A **primary-calendar grant** wins where one exists,
 * because choosing it is an explicit act and the artist meant it. Then the
 * **Scout calendar grant**, which is the default and the safe one. Then the
 * **Worker secrets**, the original path, kept because a deployment already
 * configured that way must not break — the same "read both spellings" move
 * `normaliseGigStatus` makes.
 *
 * Null means none of the three, which is a perfectly ordinary state.
 */
export async function calendarTarget(env: Env, tenant: TenantId | null): Promise<CalendarTarget | null> {
  if (tenant) {
    // `primary` is the literal calendar id Google accepts for "the one this
    // account signs in as". It is not configuration and never has been.
    const owned = await readGrant(env, tenant, 'calendar.primary')
    if (owned.connected && owned.canDraft) {
      try {
        return {
          accessToken: await accessTokenForGrant(env, tenant, 'calendar.primary'),
          calendarId: 'primary',
        }
      } catch (err) {
        console.error('primary calendar grant unusable:', err)
        return null
      }
    }

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

/** The one list Scout made. There is no secrets path here and never was. */
export async function tasksTarget(env: Env, tenant: TenantId | null): Promise<TasksTarget | null> {
  if (!tenant) return null
  const grant = await readGrant(env, tenant, 'tasks')
  if (!grant.connected || !grant.tasksListId || !grant.canDraft) return null
  try {
    return {
      accessToken: await accessTokenForGrant(env, tenant, 'tasks'),
      taskListId: grant.tasksListId,
    }
  } catch (err) {
    console.error('tasks grant unusable:', err)
    return null
  }
}

/* --------------------------------------------------------------------- */
/* The row                                                                */
/* --------------------------------------------------------------------- */

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
  submittedAt: string | null
  updatedAt: string
  googleEventId: string | null
  opensEventId: string | null
  showEventId: string | null
  opensTaskId: string | null
  deadlineTaskId: string | null
  replyTaskId: string | null
}

/** Column updates the caller merges into its own patch. */
export type NudgePatch = Partial<
  Pick<
    GigRow,
    | 'googleEventId'
    | 'opensEventId'
    | 'showEventId'
    | 'opensTaskId'
    | 'deadlineTaskId'
    | 'replyTaskId'
  >
>

/**
 * Which column holds the id for a given kind on a given surface.
 *
 * A table rather than a naming convention, because two of the six cells do
 * not exist: a reply has no calendar column (there is no date it happens on)
 * and a show has no task column (a festival you played is not a chore). A
 * convention would invent both.
 */
const COLUMN: Record<NudgeKind, { calendar: keyof NudgePatch | null; tasks: keyof NudgePatch | null }> = {
  opens: { calendar: 'opensEventId', tasks: 'opensTaskId' },
  deadline: { calendar: 'googleEventId', tasks: 'deadlineTaskId' },
  reply: { calendar: null, tasks: 'replyTaskId' },
  show: { calendar: 'showEventId', tasks: null },
}

/**
 * Every column any nudge could occupy, and the order the reconcile visits
 * them: a window opening, then its deadline, then the show. Chronological, and
 * the same on both surfaces — which is not automatic, because the calendar
 * columns were added in the order the features arrived rather than the order
 * the dates happen. A row moving between surfaces should not reshuffle.
 */
export const NUDGE_COLUMNS = {
  calendar: ['opensEventId', 'googleEventId', 'showEventId'] as const,
  tasks: ['opensTaskId', 'deadlineTaskId', 'replyTaskId'] as const,
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
 * When a reply is owed by, or null.
 *
 * Two sources, and they are the two `shared/gigStatus.ts` and
 * `shared/reviewQueue.ts` already distinguish. `awaitsYourReply` is a *state*:
 * an organiser asked something and the ball is with you, so the task is due
 * today — that is the state that exists because it stalls if nobody notices.
 * Silence is an *absence*: nothing has happened for `NO_REPLY_DAYS`, so the
 * task is due on the day that threshold is crossed, which is in the past by
 * the time this runs and is exactly right — an overdue task is the signal.
 *
 * `today` is an argument for the reason `buildReviewQueue` takes one: a
 * function that reads the clock cannot be tested twice and get the same
 * answer.
 */
function replyDueOn(row: GigRow, today: string): string | null {
  if (owesReply(row.status)) return today
  const silence = submissionSilence(
    { status: row.status, submittedAt: row.submittedAt, updatedAt: row.updatedAt },
    today,
  )
  if (silence && silence.days >= NO_REPLY_DAYS) return addDays(silence.since, NO_REPLY_DAYS)
  return null
}

/* --------------------------------------------------------------------- */
/* The reconcile                                                          */
/* --------------------------------------------------------------------- */

/**
 * What the reconcile needs to know that is not on the row.
 *
 * All three are **passed, never fetched**, which is the rule `scoped()` and
 * `buildReviewQueue` already hold and for the same reason: a function that
 * fetches its own scope, its own preferences or its own clock can fetch the
 * wrong one silently, and nothing at the call site would show it. It is also
 * what makes this testable without a database.
 */
export interface NudgeContext {
  tenant: TenantId | null
  prefs: NudgePreferences
  /** `YYYY-MM-DD`. Decides when a reply is owed by. */
  today: string
}

export async function syncGigNudges(env: Env, row: GigRow, ctx: NudgeContext): Promise<NudgePatch> {
  const { tenant, prefs, today } = ctx

  const span = showSpan(row.performanceStart, row.performanceEnd)
  const wanted = planNudges(
    {
      name: row.name,
      status: row.status,
      opensAt: dateOf(row.opensAt),
      deadline: dateOf(row.deadline),
      // `showSpan` returns null for a half-filled or backwards pair, so a bad
      // edit removes the entry rather than writing a nonsense one.
      showStart: span?.start ?? null,
      showEndExclusive: span?.endExclusive ?? null,
      replyDueOn: replyDueOn(row, today),
    },
    prefs,
  )

  // Fetched once each, and only where something actually wants that surface.
  // A deployment with neither connected does no work and makes no requests.
  const needs = (surface: 'tasks' | 'calendar') =>
    wanted.some((w) => w.surface === surface) ||
    NUDGE_COLUMNS[surface].some((col) => row[col] !== null)

  const [calendar, tasks] = await Promise.all([
    needs('calendar') ? calendarTarget(env, tenant) : Promise.resolve(null),
    needs('tasks') ? tasksTarget(env, tenant) : Promise.resolve(null),
  ])

  const patch: NudgePatch = {}
  const description = describe(row)
  const byCell = new Map<keyof NudgePatch, PlannedNudge>()
  for (const w of wanted) {
    const column = COLUMN[w.kind][w.surface]
    if (column) byCell.set(column, w)
  }

  for (const surface of ['calendar', 'tasks'] as const) {
    const target = surface === 'calendar' ? calendar : tasks
    // Not connected: leave every id where it is rather than clearing it. A
    // disconnect must not make the app forget what it already wrote, or
    // reconnecting would duplicate every entry.
    if (!target) continue

    for (const column of NUDGE_COLUMNS[surface]) {
      const want = byCell.get(column) ?? null
      const existing = row[column]
      try {
        if (want && !existing) {
          patch[column] =
            surface === 'calendar'
              ? (
                  await createEventOn(target as CalendarTarget, {
                    summary: want.title,
                    description,
                    date: want.date,
                    endDateExclusive: want.endDateExclusive ?? undefined,
                    reminderMinutes: want.reminderMinutes,
                  })
                ).id
              : (
                  await createTaskOn(target as TasksTarget, {
                    title: want.title,
                    notes: description,
                    due: want.date,
                  })
                ).id
        } else if (want && existing) {
          if (surface === 'calendar') {
            await updateEventOn(target as CalendarTarget, existing, {
              summary: want.title,
              date: want.date,
              endDateExclusive: want.endDateExclusive ?? undefined,
            })
          } else {
            // A task you already ticked off is left alone. Re-dating a
            // finished chore is how an app starts nagging about work that is
            // done, and `readTaskOn` is the only way to tell that apart from
            // a task somebody deleted.
            const current = await readTaskOn(target as TasksTarget, existing)
            if (current === null) {
              patch[column] = null
            } else if (current.status !== 'completed') {
              await updateTaskOn(target as TasksTarget, existing, {
                title: want.title,
                due: want.date,
              })
            }
          }
        } else if (!want && existing) {
          if (surface === 'calendar') await deleteEventOn(target as CalendarTarget, existing)
          else await deleteTaskOn(target as TasksTarget, existing)
          patch[column] = null
        }
      } catch (err) {
        // Non-fatal and deliberately per-entry. The column is untouched, so
        // the next reconcile tries again.
        console.error(`nudge sync failed for ${column} on gig ${row.id}:`, err)
      }
    }
  }

  return patch
}

/** Everything this gig owns, on both surfaces, for deletion. */
export async function removeGigNudges(
  env: Env,
  row: Partial<GigRow>,
  tenant: TenantId | null,
): Promise<void> {
  const [calendar, tasks] = await Promise.all([
    calendarTarget(env, tenant),
    tasksTarget(env, tenant),
  ])

  for (const column of NUDGE_COLUMNS.calendar) {
    const id = row[column]
    if (!id || !calendar) continue
    try {
      await deleteEventOn(calendar, id)
    } catch (err) {
      console.error('calendar delete failed:', err)
    }
  }
  for (const column of NUDGE_COLUMNS.tasks) {
    const id = row[column]
    if (!id || !tasks) continue
    try {
      await deleteTaskOn(tasks, id)
    } catch (err) {
      console.error('task delete failed:', err)
    }
  }
}

/**
 * Reconcile every gig this artist has, not just the one somebody edited.
 *
 * The gap this closes is specific and would otherwise be permanent. Four of
 * the five nudges follow from a column somebody changes — a status, a date —
 * so reconciling on PATCH catches them. The reply nudge does not: an
 * application crosses `NO_REPLY_DAYS` because **time passed**, and nothing
 * writes to the row on the day it does. Waiting for an edit to notice silence
 * means waiting for exactly the thing silence is the absence of.
 *
 * It also catches the other two ways the plan can go stale with no edit:
 * connecting Tasks for the first time, which should populate the list rather
 * than wait for the next status change, and changing a routing preference,
 * which should move existing entries rather than only future ones.
 *
 * On the daily tick beside housekeeping, and per tenant — the plan is derived
 * from that artist's own rows and preferences, so there is nothing platform-
 * level to share. Cheap where nothing has changed: the reconcile compares
 * wanted-against-present and a row in the right state makes at most one
 * update call per entry it owns.
 */
export async function reconcileAllGigs(
  env: Env,
  db: {
    gigs: () => Promise<GigRow[]>
    save: (id: number, patch: NudgePatch) => Promise<void>
  },
  ctx: NudgeContext,
): Promise<{ changed: number }> {
  let changed = 0
  for (const row of await db.gigs()) {
    try {
      const patch = await syncGigNudges(env, row, ctx)
      if (Object.keys(patch).length === 0) continue
      await db.save(row.id, patch)
      changed++
    } catch (err) {
      // Per row, for the same reason the writes inside are per entry: one gig
      // Google refuses must not stop the other thirty-three being reconciled.
      console.error(`nudge reconcile failed for gig ${row.id}:`, err)
    }
  }
  return { changed }
}
