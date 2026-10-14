/**
 * Looking for a programme's next intake on its own page.
 *
 * A catalog entry keeps the first deadline it was filed with, and nothing else
 * delivers the next one: the research agents skip what is on file, and a poller's
 * candidates do not reach the catalog. This is the Worker doing, for free, the
 * one thing an agent was never going to be asked to: open the page of a
 * programme whose last date has passed and see whether it names another.
 *
 * What it will and will not do, which is the part that took measuring:
 *
 *  - **Only a closed entry.** An entry whose stored deadline has passed. Never
 *    one with no date: Canada Council's own page mixes streams that say "Any
 *    time before your departure date" with streams that list dates, so a read
 *    that turned an open-ended entry into a dated one would close a programme
 *    that is open.
 *  - **Only forward.** `advanceIntake` is the rule, and a date at or before the
 *    one already held moves nothing.
 *  - **A few a tick, one at a time, and a week between looks.** These are
 *    funders' and festivals' websites. The cron is hourly and a programme
 *    announces its next cycle once or twice a year, so a weekly look per entry
 *    is early enough and the whole catalog is a fraction of a request an hour.
 *  - **It stops looking at what has gone.** A programme closed for eighteen
 *    months and answering 404 is not coming back, and costs one request a week
 *    for ever if nothing says so.
 *  - **A read that could not read is still a look.** The date is recorded either
 *    way, so a dead page is retried in a week rather than every hour.
 *  - **It says who it is.** The same user agent as every other fetch here.
 *
 * Errors do not leave this file: a throw would take the cron's other jobs with
 * it, so each entry's failure is swallowed after being recorded as a look.
 */

import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm'
import { getDb } from '../db'
import { opportunities } from '../db/schema'
import { getPage, htmlToText, isFetchable } from './syncTerms'
import { advanceIntake } from '../../shared/intakes'
import { readNextDeadline } from '../../shared/programmeDates'
import { httpUrl } from '../../shared/startLanes'
import type { Env } from '../types'

/** Entries looked at per cron tick. */
export const PROGRAMMES_PER_TICK = 3
/** Days between looks at one entry. */
export const RECHECK_DAYS = 7
/** An entry closed longer ago than this is no longer looked at. */
export const GIVE_UP_DAYS = 540

const CATEGORIES = ['funding', 'showcase', 'festival']

const addDays = (iso: string, n: number): string => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

export interface RefreshRun {
  looked: number
  advanced: number
}

export async function refreshProgrammes(
  env: Env,
  options: { now?: string; limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<RefreshRun> {
  const now = options.now ?? new Date().toISOString()
  const today = now.slice(0, 10)
  const db = getDb(env.DB)

  const due = await db
    .select()
    .from(opportunities)
    .where(
      and(
        inArray(opportunities.category, CATEGORIES),
        eq(opportunities.public, 1),
        isNotNull(opportunities.url),
        isNotNull(opportunities.deadline),
        lt(opportunities.deadline, today),
        gte(opportunities.deadline, addDays(today, -GIVE_UP_DAYS)),
        or(isNull(opportunities.delivery), ne(opportunities.delivery, 'blocked')),
        or(isNull(opportunities.intakeCheckedAt), lt(opportunities.intakeCheckedAt, `${addDays(today, -RECHECK_DAYS)}T00:00:00.000Z`)),
      ),
    )
    // Never-looked first, then the one that has waited longest.
    .orderBy(asc(opportunities.intakeCheckedAt), asc(opportunities.id))
    .limit(options.limit ?? PROGRAMMES_PER_TICK)

  const run: RefreshRun = { looked: 0, advanced: 0 }

  for (const entry of due) {
    run.looked++
    try {
      const url = httpUrl(entry.url)
      const page = url && isFetchable(url) ? await getPage(url, options.fetchImpl) : null
      const found = page ? readNextDeadline(htmlToText(page.html), today, entry.deadline) : null
      const patch = found
        ? advanceIntake(
            { deadline: entry.deadline, deadlineNote: entry.deadlineNote, opensAt: entry.opensAt },
            {
              deadline: found.date,
              // Said where the date came from, since a programme with several
              // streams names several dates and the earliest is not necessarily
              // the stream an artist would apply to.
              deadlineNote: found.count > 1 ? 'Earliest of several dates on the programme page' : null,
              opensAt: null,
            },
            today,
          )
        : null

      await db
        .update(opportunities)
        .set(
          patch
            ? {
                deadline: patch.deadline,
                deadlineNote: patch.deadlineNote,
                opensAt: patch.opensAt,
                reopenedAt: now,
                checkedAt: now,
                intakeCheckedAt: now,
              }
            : { intakeCheckedAt: now },
        )
        .where(eq(opportunities.id, entry.id))
      if (patch) run.advanced++
    } catch (err) {
      console.error(`programme refresh failed for catalog entry ${entry.id}:`, err)
      // Still a look, or this entry would be first in line every hour.
      await db.update(opportunities).set({ intakeCheckedAt: now }).where(eq(opportunities.id, entry.id)).catch(() => {})
    }
  }
  return run
}
