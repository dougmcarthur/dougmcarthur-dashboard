import { gigMoves } from '../shared/gigStage'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normaliseGigStatus,
  isGigSettled,
  hasBeenSubmitted,
  GIG_STATUS_META,
  GIG_STATUSES,
  nextGigStatuses,
  isGigTransitionAllowed,
} from '../shared/gigStatus'

describe('the rename', () => {
  it('reads approved as "I will apply", not as booked', () => {
    // The whole point. `approved` never meant a date was secured, but the app
    // behaved as though it did.
    expect(normaliseGigStatus('approved')).toBe('shortlisted')
    expect(GIG_STATUS_META.shortlisted.decider).toBe('you')
  })

  it('reads rejected as YOUR no, never as theirs', () => {
    // The dangerous one. `rejected` meant you passed; mapping it to `declined`
    // would rewrite twenty-two months of history into rejections you never got.
    expect(normaliseGigStatus('rejected')).toBe('passed')
    expect(normaliseGigStatus('rejected')).not.toBe('declined')
    expect(GIG_STATUS_META.passed.decider).toBe('you')
    expect(GIG_STATUS_META.declined.decider).toBe('them')
  })

  it('maps the rest of the legacy vocabulary', () => {
    expect(normaliseGigStatus('pending_review')).toBe('discovered')
    expect(normaliseGigStatus('sent')).toBe('submitted')
  })

  it('is idempotent, so a normalised row does not drift on the next write', () => {
    for (const s of GIG_STATUSES) expect(normaliseGigStatus(s)).toBe(s)
  })

  it('sends anything unrecognised back to a human rather than throwing', () => {
    expect(normaliseGigStatus('who knows')).toBe('discovered')
    expect(normaliseGigStatus(null)).toBe('discovered')
    expect(normaliseGigStatus('')).toBe('discovered')
  })

  it('tolerates case and whitespace from whatever posted the row', () => {
    expect(normaliseGigStatus('  Approved ')).toBe('shortlisted')
  })

  it('names a decider for every status, because that is the point', () => {
    for (const s of GIG_STATUSES) {
      expect(['app', 'you', 'them', 'nobody']).toContain(GIG_STATUS_META[s].decider)
    }
  })
})

describe('settled and submitted are different questions', () => {
  it('treats an application you have sent as unsettled — the ball is with them', () => {
    expect(hasBeenSubmitted('submitted')).toBe(true)
    expect(isGigSettled('submitted')).toBe(false)
  })

  it('treats a gig you passed on as settled but never submitted', () => {
    expect(isGigSettled('passed')).toBe(true)
    expect(hasBeenSubmitted('passed')).toBe(false)
  })

  it('counts an invitation as submitted, because an application produced it', () => {
    expect(hasBeenSubmitted('invited')).toBe(true)
    expect(hasBeenSubmitted('declined')).toBe(true)
    expect(hasBeenSubmitted('booked')).toBe(true)
  })

  it('does not count deciding to apply as having applied', () => {
    expect(hasBeenSubmitted('shortlisted')).toBe(false)
    expect(hasBeenSubmitted('preparing')).toBe(false)
    // And the legacy spelling of the same thing.
    expect(hasBeenSubmitted('approved')).toBe(false)
  })
})

// ── Where a gig's dates end up ────────────────────────────────────────────────

const calls: Array<{ surface: 'calendar' | 'tasks'; op: string; id?: string; summary?: string; date?: string }> = []

/**
 * Two surfaces now, and which one a given entry lands on is the thing under
 * test. `prefs` is an argument rather than a database read for the reason
 * `buildReviewQueue` takes `today`: same inputs, same answer, every run.
 *
 * The calendar seam is `{ accessToken, calendarId }`, so a grant can point it
 * at the artist's own calendar; these drive the stored-secret path, which is
 * still exactly what they were written to cover.
 */
vi.mock('../src/lib/googleCalendar', () => ({
  calendarConfigured: () => true,
  targetFromEnv: async () => ({ accessToken: 'test-token', calendarId: 'test-calendar' }),
  createEventOn: async (_t: unknown, input: { summary: string; date: string }) => {
    // A sentinel so a test can force a real Calendar failure rather than a
    // skip. An unparseable date is not a failure — it is a date we decline to
    // guess at, and it exercises a different branch entirely.
    if (input.summary.includes('BOOM')) throw new Error('calendar exploded')
    calls.push({ surface: 'calendar', op: 'create', summary: input.summary, date: input.date })
    return { id: `evt-${calls.length}` }
  },
  updateEventOn: async (_t: unknown, id: string, input: { summary?: string; date?: string }) => {
    calls.push({ surface: 'calendar', op: 'update', id, summary: input.summary, date: input.date })
  },
  deleteEventOn: async (_t: unknown, id: string) => {
    calls.push({ surface: 'calendar', op: 'delete', id })
  },
}))

vi.mock('../src/lib/googleTasks', () => ({
  createTaskOn: async (_t: unknown, input: { title: string; due: string }) => {
    if (input.title.includes('BOOM')) throw new Error('tasks exploded')
    calls.push({ surface: 'tasks', op: 'create', summary: input.title, date: input.due })
    return { id: `task-${calls.length}`, status: 'needsAction' }
  },
  updateTaskOn: async (_t: unknown, id: string, input: { title?: string; due?: string }) => {
    calls.push({ surface: 'tasks', op: 'update', id, summary: input.title, date: input.due })
  },
  // `gone` is the sentinel for a task somebody deleted in Google. Null and
  // "completed" are the two answers this function exists to tell apart.
  readTaskOn: async (_t: unknown, id: string) =>
    id.includes('gone') ? null : { id, status: completed ? 'completed' : 'needsAction' },
  deleteTaskOn: async (_t: unknown, id: string) => {
    calls.push({ surface: 'tasks', op: 'delete', id })
  },
}))

/** Flipped by the one test about a task somebody already ticked off. */
let completed = false

vi.mock('../src/lib/googleGrant', () => ({
  // A tasks grant that works, so the tasks half of the reconcile is reachable
  // without a database. The calendar half goes through the secrets path above.
  readGrant: async (_e: unknown, _t: unknown, purpose: string) =>
    purpose === 'tasks'
      ? { connected: true, canDraft: true, tasksListId: 'list-1', calendarId: null }
      : { connected: false, canDraft: false, tasksListId: null, calendarId: null },
  accessTokenForGrant: async () => 'tasks-token',
}))

const { syncGigNudges } = await import('../src/lib/gigNudges')
const { NUDGE_DEFAULTS } = await import('../shared/nudgeRouting')
type Row = Parameters<typeof syncGigNudges>[1]

const TODAY = '2026-09-16'

function row(o: Partial<Row> = {}): Row {
  return {
    id: 1, name: 'Winnipeg Folk Festival', status: 'discovered',
    organizer: null, type: 'festival', url: null,
    fitRationale: null, fitNotes: null,
    deadline: '2027-01-15', opensAt: '2026-11-01',
    performanceStart: null, performanceEnd: null,
    submittedAt: null, updatedAt: `${TODAY}T00:00:00Z`,
    googleEventId: null, opensEventId: null, showEventId: null,
    opensTaskId: null, deadlineTaskId: null, replyTaskId: null,
    ...o,
  } as Row
}

const env = {} as never
const TENANT = 'doug' as never

/** The defaults: shows on the calendar, the work in Tasks. */
const sync = (r: Row, prefs = NUDGE_DEFAULTS) =>
  syncGigNudges(env, r, { tenant: TENANT, prefs, today: TODAY })

/** Everything to a calendar, which is what the app did before this split. */
const ALL_CALENDAR = { ...NUDGE_DEFAULTS, deadline: 'calendar', opens: 'calendar', reply: 'off' } as const

const created = (surface?: 'calendar' | 'tasks') =>
  calls.filter((c) => c.op === 'create' && (!surface || c.surface === surface))

describe('what goes on a calendar and what goes in a task list', () => {
  beforeEach(() => { calls.length = 0; completed = false })

  it('puts nothing anywhere for an opportunity nobody has decided on', async () => {
    expect(await sync(row({ status: 'discovered' }))).toEqual({})
    expect(calls).toEqual([])
  })

  it('sends the application work to Tasks and leaves the calendar alone', async () => {
    // The split this release exists for. A deadline is a piece of work; a
    // calendar entry is a claim that you have to be somewhere.
    const patch = await sync(row({ status: 'shortlisted' }))
    expect(created('calendar')).toEqual([])
    expect(created('tasks').map((c) => c.summary)).toEqual([
      'Start the application — Winnipeg Folk Festival',
      'Apply by — Winnipeg Folk Festival',
    ])
    expect(patch.opensTaskId).toBeTruthy()
    expect(patch.deadlineTaskId).toBeTruthy()
    expect(patch.showEventId).toBeUndefined()
  })

  it('holds the opening task back a day, so the prep exists when you look', async () => {
    // A form that was not accepting applications yesterday has no fields to
    // read until it is, so a task due the morning it opens sends you to an
    // empty panel. See DEFAULT_OPENING_LEAD_DAYS.
    await sync(row({ status: 'shortlisted', opensAt: '2026-11-01' }))
    expect(created('tasks')[0].date).toBe('2026-11-02')
  })

  it('honours a zero lead time for a deployment whose agents run hourly', async () => {
    await sync(row({ status: 'shortlisted' }), { ...NUDGE_DEFAULTS, openingLeadDays: 0 })
    expect(created('tasks')[0].date).toBe('2026-11-01')
  })

  it('still puts the application work on the calendar when asked to', async () => {
    const patch = await sync(row({ status: 'shortlisted' }), ALL_CALENDAR)
    expect(created('tasks')).toEqual([])
    expect(created('calendar').map((c) => c.summary)).toEqual([
      'Start the application — Winnipeg Folk Festival',
      'Apply by — Winnipeg Folk Festival',
    ])
    expect(patch.showEventId).toBeUndefined()
  })

  it('never writes a show event just because you said you would apply', async () => {
    // The bug the entry names exist to fix: `🎵 {name}` on the submission
    // deadline is indistinguishable from a booked gig on a phone.
    const patch = await sync(row({ status: 'shortlisted' }), ALL_CALENDAR)
    expect(patch.showEventId).toBeUndefined()
    expect(created('calendar').every((c) => /^(Start the application|Apply by) — /.test(c.summary!))).toBe(true)
  })

  it('writes the show only once an agreement exists, and only to a calendar', async () => {
    const patch = await sync(row({ status: 'booked', performanceStart: '2027-07-09' }))
    expect(patch.showEventId).toBeTruthy()
    const show = created('calendar').find((c) => c.date === '2027-07-09')
    // The one entry with no prefix, because it is the only one that is a gig.
    expect(show?.summary).toBe('Winnipeg Folk Festival')
    expect(created('tasks')).toEqual([])
  })

  it('does not write a show for a booked gig with no date yet', async () => {
    const patch = await sync(row({ status: 'booked', performanceStart: null }))
    expect(patch.showEventId).toBeUndefined()
  })

  it('raises a task when the ball is back with you', async () => {
    // `info_requested` is the state that exists because it stalls if nobody
    // notices, so it is the one that most needs a nudge. Due today: it is not
    // an appointment, it is a thing already waiting on you.
    const patch = await sync(row({ status: 'info_requested' }))
    expect(patch.replyTaskId).toBeTruthy()
    const reply = created('tasks').find((c) => c.summary?.startsWith('Reply —'))
    expect(reply?.date).toBe(TODAY)
  })

  it('raises one for an application that has gone quiet, dated when it went quiet', async () => {
    // Silence is the only signal that is an absence. The due date is the day
    // the threshold was crossed, which is in the past — an overdue task is
    // exactly the right shape for "this should have been chased weeks ago".
    const patch = await sync(row({ status: 'submitted', submittedAt: '2026-06-01T00:00:00Z' }))
    expect(patch.replyTaskId).toBeTruthy()
    expect(created('tasks').find((c) => c.summary?.startsWith('Reply —'))?.date).toBe('2026-07-16')
  })

  it('says nothing about an application that is merely waiting', async () => {
    const patch = await sync(row({ status: 'submitted', submittedAt: `${TODAY}T00:00:00Z` }))
    expect(patch.replyTaskId).toBeUndefined()
  })

  it('tears the reminders down when you pass', async () => {
    const patch = await sync(
      row({ status: 'passed', opensTaskId: 'task-a', deadlineTaskId: 'task-b' }),
    )
    expect(patch).toEqual({ opensTaskId: null, deadlineTaskId: null })
    expect(calls.map((c) => c.id).sort()).toEqual(['task-a', 'task-b'])
  })

  it('tears them down when they decline, too', async () => {
    // Previously only an explicit rejection cleared anything, so a gig that
    // closed any other way left its deadline on the calendar forever.
    const patch = await sync(row({ status: 'declined', deadlineTaskId: 'task-a' }))
    expect(patch.deadlineTaskId).toBeNull()
  })

  it('leaves a task you already ticked off alone', async () => {
    // Re-dating a finished chore is how an app starts nagging about work that
    // is done. A completed task still exists, which is the only reason this
    // can be told apart from a task somebody deleted.
    completed = true
    const first = row({ status: 'shortlisted' })
    const patch = await sync(first)
    calls.length = 0
    await sync({ ...first, ...patch } as Row)
    expect(calls).toEqual([])
  })

  it('forgets a task somebody deleted, rather than updating a ghost', async () => {
    // Null from `readTaskOn` means gone. Clearing the column is what lets the
    // next reconcile make a fresh one instead of PATCHing a 404 forever.
    const patch = await sync(row({ status: 'shortlisted', deadlineTaskId: 'task-gone' }))
    expect(patch.deadlineTaskId).toBeNull()
  })

  it('skips prose where a date should be instead of handing it to Google', async () => {
    // 26 of 34 production rows hold things like "None — rolling intake".
    await sync(row({ status: 'shortlisted', deadline: 'None — rolling artist roster intake', opensAt: null }))
    expect(created()).toEqual([])
  })

  it('recovers a date buried in that prose', async () => {
    await sync(row({ status: 'shortlisted', deadline: 'Applications close 2027-01-15 (rolling)', opensAt: null }))
    expect(created()).toHaveLength(1)
    expect(created()[0].date).toBe('2027-01-15')
  })

  it('updates rather than duplicating when the row is synced again', async () => {
    // Reconcile, not transition: running twice must not leave two of anything.
    const first = row({ status: 'shortlisted' })
    const patch = await sync(first)
    calls.length = 0
    await sync({ ...first, ...patch } as Row)
    expect(created()).toEqual([])
    expect(calls.every((c) => c.op === 'update')).toBe(true)
  })

  it('gives a legacy approved row the same treatment as shortlisted', async () => {
    // Rows arriving from the research agents still say `approved`.
    await sync(row({ status: 'approved' }))
    expect(created()).toHaveLength(2)
  })

  it('keeps going when one entry fails, so a blip loses at most one', async () => {
    const patch = await sync(row({ status: 'shortlisted', name: 'BOOM Festival' }))
    expect(patch.opensTaskId).toBeUndefined()
    expect(patch.deadlineTaskId).toBeUndefined()
    // Both entries carry the name, so both throw — prove the failure is
    // contained rather than thrown, which is what a status change depends on.
    expect(created()).toEqual([])
  })

  it('does not save a status change hostage to Google', async () => {
    // Resolving rather than rejecting is what lets the route write the row
    // even when Google is down.
    await expect(sync(row({ status: 'shortlisted', name: 'BOOM' }))).resolves.toBeTruthy()
  })
})

describe('the daily reconcile, which is what notices silence', () => {
  beforeEach(() => { calls.length = 0; completed = false })

  it('raises a reply task for a row nobody has touched since it went quiet', async () => {
    // The gap this exists to close. Four of the five nudges follow from an
    // edit; this one follows from time passing, and nothing writes to the row
    // on the day it crosses the threshold. Waiting for an edit to notice
    // silence is waiting for the thing silence is the absence of.
    const { reconcileAllGigs } = await import('../src/lib/gigNudges')
    const saved: Array<{ id: number; patch: Record<string, unknown> }> = []

    const result = await reconcileAllGigs(
      env,
      {
        gigs: async () => [row({ id: 7, status: 'submitted', submittedAt: '2026-06-01T00:00:00Z' })],
        save: async (id, patch) => { saved.push({ id, patch: patch as Record<string, unknown> }) },
      },
      { tenant: TENANT, prefs: NUDGE_DEFAULTS, today: TODAY },
    )

    expect(result.changed).toBe(1)
    expect(saved[0].id).toBe(7)
    expect(saved[0].patch.replyTaskId).toBeTruthy()
  })

  it('writes nothing for a row already in the right shape', async () => {
    // Idempotent, which is what makes running this every night affordable.
    const { reconcileAllGigs } = await import('../src/lib/gigNudges')
    const saved: number[] = []
    const settled = row({ id: 8, status: 'archived' })

    const result = await reconcileAllGigs(
      env,
      { gigs: async () => [settled], save: async (id) => { saved.push(id) } },
      { tenant: TENANT, prefs: NUDGE_DEFAULTS, today: TODAY },
    )
    expect(result.changed).toBe(0)
    expect(saved).toEqual([])
  })

  it('keeps going when one gig fails, so one bad row does not stop the sweep', async () => {
    const { reconcileAllGigs } = await import('../src/lib/gigNudges')
    const saved: number[] = []

    const result = await reconcileAllGigs(
      env,
      {
        gigs: async () => [
          row({ id: 1, status: 'shortlisted', name: 'BOOM Festival' }),
          row({ id: 2, status: 'shortlisted' }),
        ],
        save: async (id) => { saved.push(id) },
      },
      { tenant: TENANT, prefs: NUDGE_DEFAULTS, today: TODAY },
    )
    // The first writes nothing because both its entries threw; the second is
    // reconciled normally rather than abandoned.
    expect(saved).toEqual([2])
    expect(result.changed).toBe(1)
  })
})

describe('the moves the pipeline offers', () => {
  it('covers every status, so a new one cannot be added without deciding this', () => {
    for (const s of GIG_STATUSES) {
      expect(Array.isArray(nextGigStatuses(s)), s).toBe(true)
    }
  })

  it('never offers a move to a status that does not exist', () => {
    const known = new Set<string>(GIG_STATUSES)
    for (const s of GIG_STATUSES) {
      for (const to of nextGigStatuses(s)) expect(known.has(to), `${s} -> ${to}`).toBe(true)
    }
  })

  it('never offers a move to itself', () => {
    for (const s of GIG_STATUSES) expect(nextGigStatuses(s)).not.toContain(s)
  })

  /**
   * The one that matters. `declined` is their word; if you turn down an
   * invitation that is `withdrawn`. Offering the wrong one would let a
   * mis-click record that you were rejected from a festival that wanted you —
   * and a settled row is not something you go back and re-read.
   */
  it('lets an offer fall through on their side, and names it that way', () => {
    // This was refused so a mis-click could not record a rejection from a
    // festival that wanted you. It is allowed now because an offer is not a
    // booking — terms can fail — and the only button that writes it says
    // "Offer fell through" rather than "Declined".
    expect(isGigTransitionAllowed('invited', 'declined')).toBe(true)
    expect(nextGigStatuses('invited')).toContain('withdrawn')
    const move = gigMoves('invited').find((m) => m.to === 'declined')
    expect(move?.label).toBe('Offer fell through')
  })

  it('lets you change your mind before anything is sent, and calls it passing', () => {
    expect(isGigTransitionAllowed('shortlisted', 'passed')).toBe(true)
    expect(isGigTransitionAllowed('preparing', 'passed')).toBe(true)
    // After it has gone out they have seen it, so pulling out is withdrawing.
    expect(isGigTransitionAllowed('submitted', 'passed')).toBe(false)
    expect(isGigTransitionAllowed('submitted', 'withdrawn')).toBe(true)
  })

  it('offers only archiving out of a terminal status', () => {
    for (const s of GIG_STATUSES.filter((x) => GIG_STATUS_META[x].terminal && x !== 'archived')) {
      expect(nextGigStatuses(s), s).toEqual(['archived'])
    }
    expect(nextGigStatuses('archived')).toEqual([])
  })

  it('refuses to skip the follow-up phase entirely', () => {
    // A row arriving on `booked` straight from `submitted` is claiming an
    // invitation that never happened. The research agents PATCH this too.
    expect(isGigTransitionAllowed('submitted', 'booked')).toBe(false)
    expect(isGigTransitionAllowed('invited', 'booked')).toBe(true)
  })

  it('treats re-stating the current status as a no-op, not a transition', () => {
    // An ordinary field edit sends the whole row back, status included.
    for (const s of GIG_STATUSES) expect(isGigTransitionAllowed(s, s), s).toBe(true)
  })

  it('reads legacy spellings on both sides before deciding', () => {
    // `approved` is `shortlisted`, so this is the ordinary "I applied" move.
    expect(isGigTransitionAllowed('approved', 'submitted')).toBe(true)
    // And `sent` is `submitted`, so this is the no-op above under an old name.
    expect(isGigTransitionAllowed('sent', 'submitted')).toBe(true)
  })

  it('reaches every non-legacy status from discovered', () => {
    // A status nothing can reach is a status the app cannot record. Walked
    // rather than asserted, so adding an unreachable one fails here.
    const seen = new Set<string>(['discovered'])
    const queue = ['discovered']
    while (queue.length) {
      for (const to of nextGigStatuses(queue.shift()!)) {
        if (!seen.has(to)) { seen.add(to); queue.push(to) }
      }
    }
    expect([...GIG_STATUSES].filter((s) => !seen.has(s))).toEqual([])
  })
})
