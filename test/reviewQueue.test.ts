import { describe, it, expect } from 'vitest'
import {
  buildReviewQueue,
  matchesFilter,
  summariseQueue,
  isSettled,
  awaitingDecision,
} from '../shared/reviewQueue'
import type { GigOpportunity, SyncTarget } from '../shared/types'

// Minimal rows in the shape the API returns. Notes are trimmed from real
// production values so the flags under test are the ones the data produces.

function gig(o: Partial<GigOpportunity> & { id: number; name: string }): GigOpportunity {
  return {
    type: 'festival', organizer: null, submissionMethod: null, audienceSize: null,
    genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null,
    feeAmount: null, feeCurrency: 'USD', fee: null,
    paid: 0, fitNotes: null, fitRationale: null, url: null, status: 'approved',
    googleEventId: null, snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-07-01', updatedAt: '2026-08-01', ...o,
  }
}

function sync(o: Partial<SyncTarget> & { id: number; name: string }): SyncTarget {
  return {
    agencyType: null, contactEmail: null, contactRole: null, confirmationMethod: null,
    notes: null, pitchDraft: null, pitchSent: null, status: 'pitched',
    snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-06-21', updatedAt: '2026-06-29', reconciledAt: null, ...o,
  }
}

describe('buildReviewQueue — status/note conflicts', () => {
  it('flags a gig marked submitted whose note says it was not', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({
        id: 1, name: 'Home Routes', status: 'submitted',
        fitNotes: 'Submission status: NOT submitted. Single-page intake form at the URL.',
      })],
    })

    const conflict = item.flags.find((f) => f.id === 'conflict')
    expect(conflict).toBeDefined()
    expect(conflict?.severity).toBe('danger')
    expect(item.flags.find((f) => f.id === 'not_submitted')).toBeUndefined()
  })

  it('flags a sync target marked sent whose note says submission must go via a portal', () => {
    const [item] = buildReviewQueue({
      sync: [sync({
        id: 18, name: 'Crucial Music', status: 'sent',
        notes: 'Submission status: NOT submitted. Actual submission must go through their portal.',
      })],
    })
    expect(item.flags.some((f) => f.id === 'conflict')).toBe(true)
  })

  it('does not manufacture a conflict when the workflow agrees with the note', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({
        id: 2, name: 'Open Application', status: 'approved',
        fitNotes: 'Submission status: NOT submitted. Waiting on the window to open.',
      })],
    })
    expect(item.flags.some((f) => f.id === 'conflict')).toBe(false)
    expect(item.flags.some((f) => f.id === 'not_submitted')).toBe(true)
  })
})

describe('buildReviewQueue — flags from the note and columns', () => {
  it('reads a paid entry off the fee column', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({ id: 3, name: 'CFMA 2027', paid: 1, fee: '$85 CAD first entry' })],
    })
    const paid = item.flags.find((f) => f.id === 'paid')
    // Named for the amount. "Costs money" repeated what the fee line said.
    expect(paid?.label).toBe('CAD 85 to enter')
  })

  it('marks a prose deadline as not a real date', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({ id: 4, name: 'Rolling intake', deadline: 'None — rolling artist roster intake' })],
    })
    expect(item.flags.some((f) => f.id === 'vague_deadline')).toBe(true)
    expect(item.deadline.date).toBeNull()
  })

  it('surfaces a blocker waiting on a person', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({ id: 5, name: 'Sofar', fitNotes: 'Doug should pick the video and submit himself when ready.' })],
    })
    expect(item.flags.some((f) => f.id === 'blocked')).toBe(true)
  })
})

describe('buildReviewQueue — ordering and scope', () => {
  it('sorts the most severe item first', () => {
    const items = buildReviewQueue({
      gigs: [
        gig({ id: 10, name: 'Quiet one' }),
        gig({ id: 11, name: 'Conflicted', status: 'submitted', fitNotes: 'Submission status: NOT submitted.' }),
      ],
    })
    expect(items[0].title).toBe('Conflicted')
  })

  it('leaves archived rows out of the queue entirely', () => {
    const items = buildReviewQueue({
      gigs: [gig({ id: 12, name: 'Done with it', status: 'archived' })],
      sync: [sync({ id: 13, name: 'Also done', status: 'archived' })],
    })
    expect(items).toHaveLength(0)
  })

  it('keys items by kind and id so the two entity tables cannot collide', () => {
    const items = buildReviewQueue({
      gigs: [gig({ id: 1, name: 'A gig' })],
      sync: [sync({ id: 1, name: 'A sync target' })],
    })
    expect(new Set(items.map((i) => i.key)).size).toBe(2)
  })
})

describe('matchesFilter', () => {
  const [conflicted] = buildReviewQueue({
    gigs: [gig({
      id: 20, name: 'Conflicted', status: 'submitted',
      fitNotes: 'Submission status: NOT submitted.',
    })],
  })

  it('includes a conflict under both "needs" and "conflict"', () => {
    expect(matchesFilter(conflicted, 'needs')).toBe(true)
    expect(matchesFilter(conflicted, 'conflict')).toBe(true)
  })

  it('excludes it from unrelated filters', () => {
    expect(matchesFilter(conflicted, 'paid')).toBe(false)
  })

  it('"all" takes everything, including an item with no flags at all', () => {
    const [quiet] = buildReviewQueue({ gigs: [gig({ id: 21, name: 'Quiet' })] })
    expect(quiet.flags).toHaveLength(0)
    expect(matchesFilter(quiet, 'all')).toBe(true)
    expect(matchesFilter(quiet, 'needs')).toBe(false)
  })
})


// --- summariseQueue: blocks C and D of the Overview ---------------------------

/**
 * The date this block is written against. Fixed, not the clock.
 *
 * `offset` used to count from `new Date()` with the hours zeroed — local
 * midnight — and then serialise it as UTC, while `buildReviewQueue` with no
 * `today` reads UTC directly. In Winnipeg the two agree; a day ahead under
 * `TZ=Pacific/Auckland` local midnight is noon the previous day in UTC, so
 * every date here landed one off and "9 days ago" asserted against 10. It
 * cost a deploy, and it is the second time this file has taught the same
 * lesson: same inputs must mean the same thing on every run, in every zone.
 */
const STRIP_TODAY = '2026-08-25'

/** An ISO date `n` days from `STRIP_TODAY`. Arithmetic in UTC throughout. */
function offset(n: number): string {
  return new Date(Date.parse(`${STRIP_TODAY}T00:00:00Z`) + n * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

const summarise = (input: Parameters<typeof buildReviewQueue>[0]) =>
  // `summariseQueue` takes no date of its own and needs none: every band it
  // reads was already computed against the queue's `today`.
  summariseQueue(buildReviewQueue({ ...input, today: STRIP_TODAY }))

describe('summariseQueue — the time-critical strip', () => {
  it('bands a passed deadline as overdue and a near one as due soon', () => {
    const { timing } = summarise({
      gigs: [
        gig({ id: 1, name: 'Passed', deadline: offset(-9) }),
        gig({ id: 2, name: 'Close', deadline: offset(4) }),
      ],
    })
    expect(timing.map((t) => [t.title, t.band, t.daysUntil])).toEqual([
      ['Passed', 'overdue', -9],
      ['Close', 'due_soon', 4],
    ])
  })

  it('leaves out a deadline further away than the horizon', () => {
    const { timing } = summarise({ gigs: [gig({ id: 3, name: 'Distant', deadline: offset(90) })] })
    expect(timing).toEqual([])
  })

  it('shows a window that is about to open', () => {
    const { timing } = summarise({
      gigs: [gig({ id: 4, name: 'Reopening', deadline: `Applications open ${offset(20)}` })],
    })
    expect(timing).toHaveLength(1)
    expect(timing[0]).toMatchObject({ band: 'opening', daysUntil: 20, approximate: true })
  })

  it('lists a row once, under its deadline, when it has both dates', () => {
    const { timing } = summarise({
      gigs: [gig({ id: 5, name: 'Both', deadline: `${offset(6)} (portal opens ${offset(2)})` })],
    })
    expect(timing).toHaveLength(1)
    expect(timing[0].band).toBe('due_soon')
  })

  it('marks a date read straight from the column as not approximate', () => {
    const { timing } = summarise({ gigs: [gig({ id: 6, name: 'Clean', deadline: offset(3) })] })
    expect(timing[0].approximate).toBe(false)
  })

  it('ignores items nobody owes anything on', () => {
    const { timing } = summarise({
      gigs: [
        gig({ id: 7, name: 'Sent', status: 'submitted', deadline: offset(2) }),
        gig({ id: 8, name: 'Passed on', status: 'rejected', deadline: offset(2) }),
      ],
    })
    expect(timing).toEqual([])
  })

  it('orders overdue, then due soon, then opening — soonest first in each', () => {
    const { timing } = summarise({
      gigs: [
        gig({ id: 9, name: 'Opens later', deadline: `Submissions open ${offset(30)}` }),
        gig({ id: 10, name: 'Due in 10', deadline: offset(10) }),
        gig({ id: 11, name: 'Overdue 2', deadline: offset(-2) }),
        gig({ id: 12, name: 'Overdue 30', deadline: offset(-30) }),
        gig({ id: 13, name: 'Due in 1', deadline: offset(1) }),
      ],
    })
    expect(timing.map((t) => t.title)).toEqual([
      'Overdue 30', 'Overdue 2', 'Due in 1', 'Due in 10', 'Opens later',
    ])
  })
})

describe('summariseQueue — the open-ended backlog', () => {
  it('counts live items with no date of any kind', () => {
    const { backlog } = summarise({
      gigs: [
        gig({ id: 20, name: 'Rolling', deadline: 'None — rolling artist roster intake' }),
        gig({ id: 21, name: 'Ongoing', deadline: 'ongoing' }),
        gig({ id: 22, name: 'Dated', deadline: offset(40) }),
      ],
    })
    expect(backlog.openEnded).toBe(2)
  })

  it('does not count a window that has an opening date', () => {
    const { backlog } = summarise({
      gigs: [gig({ id: 23, name: 'Opens', deadline: `Rolling; opens ${offset(200)}` })],
    })
    expect(backlog.openEnded).toBe(0)
  })

  it('does not count items that are already settled', () => {
    const { backlog } = summarise({
      gigs: [
        gig({ id: 24, name: 'Sent', status: 'submitted', deadline: 'rolling' }),
        gig({ id: 25, name: 'Live', status: 'approved', deadline: 'rolling' }),
      ],
    })
    expect(backlog.openEnded).toBe(1)
  })

  it('separates the ones nobody has touched since they were found', () => {
    const { backlog } = summarise({
      gigs: [
        // updated_at is sometimes a full timestamp and discovered_at a bare
        // date, so this has to compare by day or every row looks touched.
        gig({ id: 26, name: 'Untouched', deadline: 'rolling', discoveredAt: '2026-07-01', updatedAt: '2026-07-01T09:12:03.114Z' }),
        gig({ id: 27, name: 'Worked on', deadline: 'rolling', discoveredAt: '2026-07-01', updatedAt: '2026-08-15' }),
      ],
    })
    expect(backlog).toMatchObject({ openEnded: 2, untouched: 1, oldestDiscoveredAt: '2026-07-01' })
  })

  it('reports the oldest discovery date among them, not across everything', () => {
    const { backlog } = summarise({
      gigs: [
        gig({ id: 28, name: 'Old but dated', deadline: offset(40), discoveredAt: '2025-01-01' }),
        gig({ id: 29, name: 'Open-ended', deadline: 'rolling', discoveredAt: '2026-03-09' }),
      ],
    })
    expect(backlog.oldestDiscoveredAt).toBe('2026-03-09')
  })

  it('is all zeroes on an empty queue', () => {
    expect(summarise({}).backlog).toEqual({ openEnded: 0, untouched: 0, oldestDiscoveredAt: null })
  })
})


// --- snooze -----------------------------------------------------------------

const TODAY = '2026-08-25'

/** The queue as of TODAY, so snooze boundaries are exact rather than "roughly now". */
const on = (input: Omit<Parameters<typeof buildReviewQueue>[0], 'today'>) =>
  buildReviewQueue({ ...input, today: TODAY })

describe('snooze — whether the deferral still holds', () => {
  it('holds while the date is in the future', () => {
    const [item] = on({
      gigs: [gig({ id: 1, name: 'Later', snoozedUntil: '2026-09-15', snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z' })],
    })
    expect(item.snooze).toMatchObject({ active: true, wokenByChange: false, until: '2026-09-15' })
  })

  it('lapses on the day it comes due, not the day after', () => {
    const [item] = on({
      gigs: [gig({ id: 2, name: 'Due today', snoozedUntil: TODAY, snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z' })],
    })
    expect(item.snooze.active).toBe(false)
  })

  it('breaks when the row changed after the snooze was set', () => {
    // A run gave it a deadline. The snooze was a judgement about an item that
    // no longer exists in that form.
    const [item] = on({
      gigs: [gig({
        id: 3, name: 'Changed', deadline: '2026-09-01',
        snoozedUntil: '2026-10-01', snoozedAt: '2026-08-20T10:00:00.000Z',
        updatedAt: '2026-08-22T08:30:00.000Z',
      })],
    })
    expect(item.snooze).toMatchObject({ active: false, wokenByChange: true })
  })

  it('does not wake itself the moment the snooze is written', () => {
    // Setting a snooze is a write, so snoozed_at and updated_at are stamped
    // with the same value — otherwise every snooze would break instantly.
    const ts = '2026-08-25T14:03:11.900Z'
    const [item] = on({
      gigs: [gig({ id: 4, name: 'Just set', snoozedUntil: '2026-09-30', snoozedAt: ts, updatedAt: ts })],
    })
    expect(item.snooze.active).toBe(true)
  })

  it('treats a legacy bare-date updated_at as unchanged', () => {
    // Production rows carry '2026-08-25' where newer writes carry a full
    // timestamp. A bare date sorts before any same-day timestamp, so this must
    // not read as "changed since the snooze".
    const [item] = on({
      gigs: [gig({ id: 5, name: 'Legacy', snoozedUntil: '2026-09-30', snoozedAt: '2026-08-25T09:00:00.000Z', updatedAt: '2026-08-25' })],
    })
    expect(item.snooze.active).toBe(true)
  })

  it('is inert on a row that was never snoozed', () => {
    const [item] = on({ gigs: [gig({ id: 6, name: 'Plain' })] })
    expect(item.snooze).toEqual({ until: null, active: false, wokenByChange: false, daysUntil: null })
  })

  it('applies to sync targets too', () => {
    const [item] = on({
      sync: [sync({ id: 7, name: 'Agency', snoozedUntil: '2026-09-15', snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z' })],
    })
    expect(item.snooze.active).toBe(true)
  })
})

describe('snooze — what the filters do with it', () => {
  const items = on({
    gigs: [
      gig({ id: 10, name: 'Awake', fitNotes: 'Submission status: NOT submitted.' }),
      gig({
        id: 11, name: 'Deferred', fitNotes: 'Submission status: NOT submitted. Doug should pick a video.',
        snoozedUntil: '2026-09-15', snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
      }),
    ],
  })
  const named = (f: Parameters<typeof matchesFilter>[1]) =>
    items.filter((i) => matchesFilter(i, f)).map((i) => i.title)

  it('keeps a snoozed item in the queue rather than dropping it', () => {
    expect(items.map((i) => i.title).sort()).toEqual(['Awake', 'Deferred'])
  })

  it('hides it from every ordinary filter, including "all"', () => {
    for (const f of ['needs', 'blocked', 'all', 'timing', 'paid', 'conflict'] as const) {
      expect(named(f), f).not.toContain('Deferred')
    }
  })

  it('shows it, and only it, under "snoozed"', () => {
    expect(named('snoozed')).toEqual(['Deferred'])
  })

  it('lets a woken item back into the ordinary filters on its own', () => {
    const woken = on({
      gigs: [gig({
        id: 12, name: 'Back', fitNotes: 'Submission status: NOT submitted.',
        snoozedUntil: '2026-08-01', snoozedAt: '2026-07-01T10:00:00.000Z', updatedAt: '2026-07-01T10:00:00.000Z',
      })],
    })
    expect(woken.filter((i) => matchesFilter(i, 'needs')).map((i) => i.title)).toEqual(['Back'])
    expect(woken.filter((i) => matchesFilter(i, 'snoozed'))).toEqual([])
  })
})

describe('snooze — what the Overview blocks do with it', () => {
  it('leaves a snoozed deadline off the time-critical strip', () => {
    const { timing } = summariseQueue(on({
      gigs: [
        gig({ id: 20, name: 'Visible', deadline: '2026-08-30' }),
        gig({
          id: 21, name: 'Deferred', deadline: '2026-08-30',
          snoozedUntil: '2026-09-15', snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
        }),
      ],
    }))
    expect(timing.map((t) => t.title)).toEqual(['Visible'])
  })

  it('does not count a snoozed row in the open-ended backlog', () => {
    // Snoozing is exactly how that number is meant to come down, so counting
    // deferred rows would make the row impossible to drain.
    const { backlog } = summariseQueue(on({
      gigs: [
        gig({ id: 22, name: 'Rotting', deadline: 'rolling' }),
        gig({
          id: 23, name: 'Deferred', deadline: 'rolling',
          snoozedUntil: '2026-09-15', snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
        }),
      ],
    }))
    expect(backlog.openEnded).toBe(1)
  })
})


// --- data health (block F) ---------------------------------------------------

describe('summariseQueue — data health', () => {
  it('is clean, and hides itself, when nothing is wrong', () => {
    const { health } = summariseQueue(on({ gigs: [gig({ id: 30, name: 'Fine', deadline: '2026-12-01' })] }))
    expect(health).toEqual({ conflicts: 0, proseDeadlines: 0, orphanedReminders: 0, clean: true })
  })

  it('counts a status that contradicts its own note', () => {
    const { health } = summariseQueue(on({
      gigs: [gig({ id: 31, name: 'Contradictory', status: 'submitted', fitNotes: 'Submission status: NOT submitted.' })],
    }))
    expect(health).toMatchObject({ conflicts: 1, clean: false })
  })

  it('counts a deadline still stored as prose', () => {
    const { health } = summariseQueue(on({
      gigs: [
        gig({ id: 32, name: 'Prose', deadline: 'None — rolling artist roster intake' }),
        gig({ id: 33, name: 'Real', deadline: '2026-12-01' }),
      ],
    }))
    expect(health.proseDeadlines).toBe(1)
  })

  it('treats a backfilled row as a real date', () => {
    // deadline is now ISO and the prose has moved to deadline_note, which is
    // exactly what the backfill produces — it must not still read as a finding.
    const { health } = summariseQueue(on({
      gigs: [gig({
        id: 34, name: 'Backfilled', deadline: '2026-12-31',
        deadlineNote: 'Submission window: September 1 – December 31, 2026',
      })],
    }))
    expect(health.proseDeadlines).toBe(0)
  })

  it('still reports a snoozed row as unhealthy', () => {
    // Deferring a decision does not make a contradictory status correct.
    const { health } = summariseQueue(on({
      gigs: [gig({
        id: 35, name: 'Deferred conflict', status: 'submitted',
        fitNotes: 'Submission status: NOT submitted.',
        snoozedUntil: '2026-09-15', snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
      })],
    }))
    expect(health.conflicts).toBe(1)
  })

  it('does not count rows that are already settled', () => {
    const { health } = summariseQueue(on({
      gigs: [gig({ id: 36, name: 'Done', status: 'rejected', deadline: 'rolling forever' })],
    }))
    expect(health.proseDeadlines).toBe(0)
  })

  it('takes the orphan count from the caller, which is the one with the table', () => {
    const { health } = summariseQueue(on({ gigs: [gig({ id: 37, name: 'Fine', deadline: '2026-12-01' })] }), {
      orphanedReminders: 1,
    })
    expect(health).toMatchObject({ orphanedReminders: 1, clean: false })
  })
})

/**
 * Phase 4 — the half of the pipeline the queue could not see.
 *
 * `gigSettled` was `isGigSettled(status) || hasBeenSubmitted(status)`, and
 * `hasBeenSubmitted` is true for the whole follow-up phase. So the two states
 * where the organiser has moved and is waiting on *you* — `info_requested`,
 * which the plan describes as "the one that stalls if nobody notices", and
 * `invited` — were filed as settled and appeared in no filter but Everything.
 */
describe('the follow-up phase, and who is waiting on whom', () => {
  const build = (status: string) =>
    buildReviewQueue({ gigs: [gig({ id: 1, name: 'Winnipeg Folk Festival', status })], today: TODAY })[0]

  it('raises a reply_due flag on an invitation and on a question', () => {
    expect(build('invited').flags.map((f) => f.id)).toContain('reply_due')
    expect(build('info_requested').flags.map((f) => f.id)).toContain('reply_due')
  })

  it('reads an unanswered question as more urgent than an invitation', () => {
    const asked = build('info_requested').flags.find((f) => f.id === 'reply_due')
    const invited = build('invited').flags.find((f) => f.id === 'reply_due')
    expect(asked?.severity).toBe('danger')
    expect(invited?.severity).toBe('warn')
  })

  it('puts both in "needs a decision", where they were absent entirely', () => {
    for (const status of ['invited', 'info_requested']) {
      expect(matchesFilter(build(status), 'needs')).toBe(true)
      expect(matchesFilter(build(status), 'reply')).toBe(true)
    }
  })

  it('leaves a plain wait alone — nothing is owed by you on a sent application', () => {
    for (const status of ['submitted', 'acknowledged']) {
      expect(matchesFilter(build(status), 'needs')).toBe(false)
      expect(matchesFilter(build(status), 'reply')).toBe(false)
      expect(matchesFilter(build(status), 'waiting')).toBe(true)
    }
  })

  it('does not call a booked show a wait — the answer already came back', () => {
    expect(matchesFilter(build('booked'), 'waiting')).toBe(false)
    expect(matchesFilter(build('declined'), 'waiting')).toBe(false)
    expect(matchesFilter(build('shortlisted'), 'waiting')).toBe(false)
  })

  it('counts a pitched sync target as out with them', () => {
    const [item] = buildReviewQueue({ sync: [sync({ id: 2, name: 'Marmoset' })], today: TODAY })
    expect(matchesFilter(item, 'waiting')).toBe(true)
  })

  it('keeps a snoozed invitation out of every filter but Snoozed', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({
        id: 3, name: 'Deferred', status: 'invited',
        snoozedUntil: '2026-09-30', snoozedAt: '2026-08-01', updatedAt: '2026-08-01',
      })],
      today: TODAY,
    })
    expect(matchesFilter(item, 'reply')).toBe(false)
    expect(matchesFilter(item, 'waiting')).toBe(false)
    expect(matchesFilter(item, 'snoozed')).toBe(true)
  })

  it('outranks a deadline: an invitation you have not answered comes first', () => {
    const items = buildReviewQueue({
      gigs: [
        gig({ id: 4, name: 'Due tomorrow', deadline: '2026-08-26' }),
        gig({ id: 5, name: 'Invited', status: 'invited' }),
      ],
      today: TODAY,
    })
    expect(items[0].title).toBe('Invited')
  })
})

/**
 * Silence — the only signal in the pipeline that is an absence.
 *
 * An unanswered application produces no note, no status change and no
 * deadline. Nothing in the queue could raise it until `submitted_at` existed
 * to measure from (migration 0010).
 */
describe('submissionSilence — how long it has been out, and how sure we are', () => {
  const at = (o: Partial<GigOpportunity>) =>
    buildReviewQueue({ gigs: [gig({ id: 1, name: 'Home Routes', status: 'submitted', ...o })], today: TODAY })[0]

  it('counts from the recorded send date and says so', () => {
    const item = at({ submittedAt: '2026-07-26', updatedAt: '2026-08-20' })
    expect(item.silence).toMatchObject({ since: '2026-07-26', exact: true, days: 30 })
  })

  it('falls back to the last change, and never claims that was the send date', () => {
    // Every row that reached this phase before migration 0010 carries a null.
    // The fallback can only under-report — a row sent in July and edited in
    // August reads as five days of silence, not thirty — which is the safe
    // direction for a nudge, but only if nothing shows it as certain.
    const item = at({ submittedAt: null, updatedAt: '2026-08-20' })
    expect(item.silence).toMatchObject({ since: '2026-08-20', exact: false, days: 5 })
  })

  it('is null for anything that was never sent', () => {
    for (const status of ['discovered', 'shortlisted', 'preparing', 'passed']) {
      expect(at({ status, submittedAt: null }).silence).toBeNull()
    }
  })

  it('keeps counting once they acknowledge it — a receipt is not an answer', () => {
    expect(at({ status: 'acknowledged', submittedAt: '2026-07-01' }).silence?.days).toBe(55)
  })

  it('stops at a booking or a rejection — the silence ended', () => {
    for (const status of ['invited', 'declined', 'booked', 'withdrawn']) {
      expect(at({ status, submittedAt: '2026-01-01' }).silence).toBeNull()
    }
  })

  it('never reports negative days for a row touched later today', () => {
    expect(at({ submittedAt: `${TODAY}T09:00:00.000Z` }).silence?.days).toBe(0)
  })
})

describe('the no-reply nudge', () => {
  const silentFor = (days: number, o: Partial<GigOpportunity> = {}) => {
    const since = new Date(`${TODAY}T00:00:00Z`)
    since.setUTCDate(since.getUTCDate() - days)
    return buildReviewQueue({
      gigs: [gig({
        id: 1, name: 'Home Routes', status: 'submitted',
        submittedAt: since.toISOString().slice(0, 10), ...o,
      })],
      today: TODAY,
    })[0]
  }

  it('says nothing before six weeks — panels routinely take that long', () => {
    expect(silentFor(44).flags.map((f) => f.id)).not.toContain('no_reply')
    expect(silentFor(45).flags.map((f) => f.id)).toContain('no_reply')
  })

  it('hardens past ninety days, where "still deciding" stops being likely', () => {
    expect(silentFor(60).flags.find((f) => f.id === 'no_reply')?.severity).toBe('warn')
    expect(silentFor(90).flags.find((f) => f.id === 'no_reply')?.severity).toBe('danger')
  })

  it('qualifies the count when it came from the last change to the row', () => {
    const exact = silentFor(50)
    const guessed = buildReviewQueue({
      gigs: [gig({
        id: 2, name: 'Old row', status: 'submitted',
        submittedAt: null, updatedAt: '2026-06-01',
      })],
      today: TODAY,
    })[0]
    expect(exact.flags.find((f) => f.id === 'no_reply')?.label).toBe('50 days, no reply')
    expect(guessed.flags.find((f) => f.id === 'no_reply')?.label).toMatch(/^About \d+ days, no reply$/)
  })

  it('reaches the queue even though a sent application counts as settled', () => {
    // `isSettled` is right to call this settled — the ball is with the
    // organiser. Silence is the case where waiting for the queue to raise it
    // on its own means waiting forever, so it is an explicit exception.
    const item = silentFor(60)
    expect(isSettled(item)).toBe(true)
    expect(awaitingDecision(item)).toBe(true)
    expect(matchesFilter(item, 'needs')).toBe(true)
    expect(matchesFilter(item, 'waiting')).toBe(true)
  })

  it('does not chase something you deferred yourself', () => {
    const item = silentFor(60, { snoozedUntil: '2026-09-30', snoozedAt: '2026-08-20', updatedAt: '2026-08-20' })
    expect(awaitingDecision(item)).toBe(false)
  })

  it('orders the waiting list longest-silent first', () => {
    const items = buildReviewQueue({
      gigs: [
        gig({ id: 1, name: 'Recent', status: 'submitted', submittedAt: '2026-08-20' }),
        gig({ id: 2, name: 'Ancient', status: 'submitted', submittedAt: '2026-01-04' }),
        gig({ id: 3, name: 'Middling', status: 'submitted', submittedAt: '2026-07-20' }),
      ],
      today: TODAY,
    }).filter((i) => matchesFilter(i, 'waiting'))
    expect(items.map((i) => i.title)).toEqual(['Ancient', 'Middling', 'Recent'])
  })
})

describe('the visa lead time, which is a constraint rather than a cost', () => {
  const at = (o: Partial<GigOpportunity>) =>
    on({ gigs: [gig({ id: 1, name: 'Treefort', ...o })] })[0]

  const inDays = (n: number) =>
    new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

  it('flags a paid US date the paperwork cannot reach in time', () => {
    const flag = at({
      country: 'US', performanceKind: 'paid', deadline: inDays(30), performanceStart: inDays(80),
    }).flags.find((f) => f.id === 'visa_risk')

    expect(flag).toBeDefined()
    expect(flag?.severity).toBe('danger')
    expect(flag?.kind).toBe('warning')
  })

  it('does not flag one with room, or one that needs no permit', () => {
    expect(at({
      country: 'US', performanceKind: 'paid', deadline: inDays(30), performanceStart: inDays(300),
    }).flags.find((f) => f.id === 'visa_risk')).toBeUndefined()

    expect(at({
      country: 'CA', performanceKind: 'paid', deadline: inDays(30), performanceStart: inDays(60),
    }).flags.find((f) => f.id === 'visa_risk')).toBeUndefined()

    expect(at({
      country: 'US', performanceKind: 'showcase', deadline: inDays(30), performanceStart: inDays(60),
    }).flags.find((f) => f.id === 'visa_risk')).toBeUndefined()
  })

  it('asks rather than asserts when nobody has said showcase or paid', () => {
    const flag = at({ country: 'US', performanceStart: inDays(40) }).flags.find((f) => f.id === 'visa_risk')
    expect(flag?.severity).toBe('warn')
    expect(flag?.label).toMatch(/showcase or paid/)
  })

  it('outranks every deadline, because a deadline can still be met', () => {
    const item = at({
      country: 'US', performanceKind: 'paid', deadline: inDays(-5), performanceStart: inDays(60),
    })
    expect(item.flags[0].id).toBe('visa_risk')
    expect(item.score).toBeGreaterThan(
      at({ country: 'CA', deadline: inDays(-5) }).score,
    )
  })

  it('needs a decision even on a row the queue would otherwise call settled', () => {
    // The third explicit exception in `awaitingDecision`, and the only one
    // about a date ahead rather than a row's history: once a submitted
    // application's show is inside ninety days, waiting has already decided.
    const item = at({
      status: 'submitted', submittedAt: `${TODAY}T09:00:00.000Z`,
      country: 'US', performanceKind: 'paid', performanceStart: inDays(60),
    })
    expect(isSettled(item)).toBe(true)
    expect(awaitingDecision(item)).toBe(true)
    expect(matchesFilter(item, 'needs')).toBe(true)
    expect(matchesFilter(item, 'timing')).toBe(true)
  })
})
