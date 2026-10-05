/**
 * Going back to a form that was not there the first time.
 *
 * A research agent files an opportunity when it finds one, which is often
 * before its window opens: Canmore's note says "submissions not open as of July
 * 2026 — check back in September". Nothing then went back. The form existed
 * from the first of the month, the listing page linked to it, and the gig sat
 * in the app with no questions staged until somebody pressed a button.
 *
 * This is the rule for when to look again. It is pure, like the rest of
 * `shared/`: `today` is an argument, and it reads no database — the cron in
 * `src/lib/formRevisit.ts` fetches the rows and does the looking.
 *
 * **The trigger is the date the window opens, and where that is not known the
 * answer is slow rather than never.** A gig with an `opens_at` is left alone
 * until that day, then looked at every day for two weeks — a form that was
 * closed yesterday is usually up within a day or two, and the page is cheap —
 * then weekly. A gig with no date has nothing to trigger on, which is most of
 * them: agents file `opens_at` only when a page states a day, and "check back
 * in September" is a month. Those are looked at weekly, for as long as the gig
 * is yours and its deadline has not passed.
 *
 * **Only gigs you said yes to.** A `new` gig is not yours to apply to yet, and
 * staging answers against every opportunity an agent files would fill the
 * database with drafts for things nobody decided on. In progress is the stage
 * whose own description says "Scout … prepares the answers".
 */

import { prepStateOf, type PrepStatus } from './application'
import { gigStage } from './gigStage'
import { daysUntil, parseDeadline } from './reviewParse'

/** After a window opens, look every day for this long. */
export const DAILY_FOR_DAYS = 14
/** After that, and for a window with no date at all, look this often. */
export const WEEKLY_EVERY_DAYS = 7
/** A dated window that still shows no form this many days on is worth saying. */
export const MISSING_AFTER_DAYS = 7
/** …and not for ever: past this it is a gig somebody has stopped chasing. */
export const MISSING_UNTIL_DAYS = 30

export interface RevisitGig {
  /** In the fourteen-value vocabulary — what `readGig` returns. */
  status: string | null
  url: string | null
  applicationUrl: string | null
  opensAt: string | null
  deadline: string | null
  prepStatus: string | null
  prepNote: string | null
  prepCheckedAt: string | null
}

export type RevisitSkip =
  | 'not_in_progress' // not yours yet, or already sent
  | 'form_on_file' // read, and nothing about a read form is worth redoing nightly
  | 'needs_you' // found, behind a login or drawn by script — retrying changes nothing
  | 'no_address' // nothing to open
  | 'closed' // the deadline has passed
  | 'not_open_yet' // dated, and the date is ahead
  | 'checked_recently'

export type RevisitVerdict =
  | { due: true; why: 'first_look' | 'window_open' | 'undated' | 'retry' }
  | { due: false; why: RevisitSkip }

/** A date column holds an ISO day, but a legacy row may hold more. */
function isoDay(value: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec((value ?? '').trim())
  return m ? m[1] : null
}

export function formRevisit(gig: RevisitGig, today: string): RevisitVerdict {
  if (gigStage(gig.status) !== 'in_progress') return { due: false, why: 'not_in_progress' }

  const state = prepStateOf(gig.prepStatus, gig.prepNote)
  if (state === 'ready') return { due: false, why: 'form_on_file' }
  if (state === 'blocked') return { due: false, why: 'needs_you' }

  if (!(gig.applicationUrl || gig.url)) return { due: false, why: 'no_address' }

  const toDeadline = parseDeadline(gig.deadline, { today }).daysUntil
  if (toDeadline !== null && toDeadline < 0) return { due: false, why: 'closed' }

  const opens = isoDay(gig.opensAt)
  const sinceOpen = opens ? daysUntil(today, opens) : null
  if (sinceOpen !== null && sinceOpen < 0) return { due: false, why: 'not_open_yet' }

  const last = isoDay(gig.prepCheckedAt)
  if (!last) return { due: true, why: 'first_look' }

  // A page that could not be reached says nothing about the form, so it is the
  // one outcome that is tried again tomorrow whatever the window is doing.
  const every =
    state === 'failed' ? 1 : sinceOpen !== null && sinceOpen <= DAILY_FOR_DAYS ? 1 : WEEKLY_EVERY_DAYS
  if (daysUntil(today, last) < every) return { due: false, why: 'checked_recently' }

  return { due: true, why: state === 'failed' ? 'retry' : sinceOpen !== null ? 'window_open' : 'undated' }
}

// ── What the artist is told ───────────────────────────────────────────────────

export interface RevisitNotice {
  tier: 'info' | 'attention'
  title: string
  body: string
  /** Once per gig per outcome, so a retried tick cannot say it twice. */
  dedupeKey: string
}

/** "October 1": the artist's way of saying a date, in no one's time zone. */
function monthDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * What a look at the form is worth saying out loud, or null when nothing is.
 *
 * Three outcomes get a sentence, because "went back" is only a promise the
 * artist can rely on if they can see it happen — the agents stopped for a month
 * in August and nobody knew:
 *
 * - **Found and read.** The one they were waiting for.
 * - **Found, but a person has to fill it in** — behind a login, or drawn by
 *   script. The address is saved either way; what changes is that nothing more
 *   will be read for them, and they would otherwise never learn it.
 * - **A dated window with no form after a week.** Said once, inside a month of
 *   the opening: an organiser who has not posted the form is worth knowing
 *   about, and a gig nobody has chased for a month is not worth raising twice.
 *
 * Silence is right for everything else: no news from an undated window is the
 * expected answer, and a page that did not load says nothing about the form.
 */
export function revisitNotice(input: {
  gig: { id: number; name: string; opensAt: string | null }
  before: PrepStatus
  after: { status: PrepStatus; fields: number; note: string | null }
  today: string
}): RevisitNotice | null {
  const { gig, before, after, today } = input

  if (after.status === 'ready' && before !== 'ready') {
    return {
      tier: 'info',
      title: `${gig.name}: the application form is open — ${after.fields} fields read`,
      body: 'Answers are staged from your artist database. Read each one before you copy it out; nothing is sent.',
      dedupeKey: `form-read:${gig.id}`,
    }
  }

  if (after.status === 'blocked') {
    return {
      tier: 'info',
      title: `${gig.name}: the form is open, but it has to be filled in by hand`,
      body: `${after.note ?? 'Scout cannot read it.'} The address is saved on the gig.`,
      dedupeKey: `form-blocked:${gig.id}`,
    }
  }

  const opens = isoDay(gig.opensAt)
  if (after.status === 'not_found' && opens) {
    const since = daysUntil(today, opens)
    if (since >= MISSING_AFTER_DAYS && since < MISSING_UNTIL_DAYS) {
      return {
        tier: 'attention',
        title: `${gig.name}: applications opened ${monthDay(opens)}, and Scout still cannot find the form`,
        body: `${after.note ?? ''} If you have the form’s address, paste it into the gig’s application panel — otherwise Scout keeps looking.`.trim(),
        dedupeKey: `form-missing:${gig.id}`,
      }
    }
  }

  return null
}
