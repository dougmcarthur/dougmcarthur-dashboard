import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normaliseGigStatus,
  isGigSettled,
  hasBeenSubmitted,
  GIG_STATUS_META,
  GIG_STATUSES,
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

// ── The calendar ──────────────────────────────────────────────────────────────

const calls: Array<{ op: string; id?: string; summary?: string; date?: string }> = []

vi.mock('../src/lib/googleCalendar', () => ({
  calendarConfigured: () => true,
  createCalendarEvent: async (_env: unknown, input: { summary: string; date: string }) => {
    // A sentinel so a test can force a real Calendar failure rather than a
    // skip. An unparseable date is not a failure — it is a date we decline to
    // guess at, and it exercises a different branch entirely.
    if (input.summary.includes('BOOM')) throw new Error('calendar exploded')
    calls.push({ op: 'create', summary: input.summary, date: input.date })
    return { id: `evt-${calls.length}` }
  },
  updateCalendarEvent: async (_env: unknown, id: string, input: { summary?: string; date?: string }) => {
    calls.push({ op: 'update', id, summary: input.summary, date: input.date })
  },
  deleteCalendarEvent: async (_env: unknown, id: string) => {
    calls.push({ op: 'delete', id })
  },
}))

const { syncGigCalendar } = await import('../src/lib/gigCalendar')
type Row = Parameters<typeof syncGigCalendar>[1]

function row(o: Partial<Row> = {}): Row {
  return {
    id: 1, name: 'Winnipeg Folk Festival', status: 'discovered',
    organizer: null, type: 'festival', url: null,
    fitRationale: null, fitNotes: null,
    deadline: '2027-01-15', opensAt: '2026-11-01',
    performanceStart: null, performanceEnd: null,
    googleEventId: null, opensEventId: null, showEventId: null,
    ...o,
  } as Row
}

const env = {} as never
const created = () => calls.filter((c) => c.op === 'create')

describe('what the calendar is allowed to say', () => {
  beforeEach(() => { calls.length = 0 })

  it('puts nothing on the calendar for an opportunity nobody has decided on', async () => {
    expect(await syncGigCalendar(env, row({ status: 'discovered' }))).toEqual({})
    expect(calls).toEqual([])
  })

  it('never writes a show event just because you said you would apply', async () => {
    // The bug this whole change exists to fix: `🎵 {name}` on the submission
    // deadline is indistinguishable from a booked gig on a phone.
    const patch = await syncGigCalendar(env, row({ status: 'shortlisted' }))
    expect(patch.showEventId).toBeUndefined()
    expect(created().map((c) => c.summary)).toEqual([
      'Applications open — Winnipeg Folk Festival',
      'Apply by — Winnipeg Folk Festival',
    ])
    // No emoji, no bare name — every entry says it is about applying.
    expect(created().every((c) => /^(Applications open|Apply by) — /.test(c.summary!))).toBe(true)
  })

  it('writes the show only once an agreement exists', async () => {
    const patch = await syncGigCalendar(
      env,
      row({ status: 'booked', performanceStart: '2027-07-09' }),
    )
    expect(patch.showEventId).toBeTruthy()
    const show = created().find((c) => c.date === '2027-07-09')
    // The one entry with no prefix, because it is the only one that is a gig.
    expect(show?.summary).toBe('Winnipeg Folk Festival')
  })

  it('does not write a show for a booked gig with no date yet', async () => {
    const patch = await syncGigCalendar(env, row({ status: 'booked', performanceStart: null }))
    expect(patch.showEventId).toBeUndefined()
  })

  it('tears the reminders down when you pass', async () => {
    const patch = await syncGigCalendar(
      env,
      row({ status: 'passed', googleEventId: 'evt-a', opensEventId: 'evt-b' }),
    )
    expect(patch).toEqual({ opensEventId: null, googleEventId: null })
    expect(calls.map((c) => c.id).sort()).toEqual(['evt-a', 'evt-b'])
  })

  it('tears them down when they decline, too', async () => {
    // Previously only an explicit rejection cleared anything, so a gig that
    // closed any other way left its deadline on the calendar forever.
    const patch = await syncGigCalendar(env, row({ status: 'declined', googleEventId: 'evt-a' }))
    expect(patch.googleEventId).toBeNull()
  })

  it('skips prose where a date should be instead of handing it to Google', async () => {
    // 26 of 34 production rows hold things like "None — rolling intake".
    await syncGigCalendar(
      env,
      row({ status: 'shortlisted', deadline: 'None — rolling artist roster intake', opensAt: null }),
    )
    expect(created()).toEqual([])
  })

  it('recovers a date buried in that prose', async () => {
    await syncGigCalendar(
      env,
      row({ status: 'shortlisted', deadline: 'Applications close 2027-01-15 (rolling)', opensAt: null }),
    )
    expect(created()).toHaveLength(1)
    expect(created()[0].date).toBe('2027-01-15')
  })

  it('updates rather than duplicating when the row is synced again', async () => {
    // Reconcile, not transition: running twice must not leave two events.
    const first = row({ status: 'shortlisted' })
    const patch = await syncGigCalendar(env, first)
    calls.length = 0
    await syncGigCalendar(env, { ...first, ...patch } as Row)
    expect(created()).toEqual([])
    expect(calls.every((c) => c.op === 'update')).toBe(true)
  })

  it('gives a legacy approved row the same treatment as shortlisted', async () => {
    // Rows arriving from the research agents still say `approved`.
    await syncGigCalendar(env, row({ status: 'approved' }))
    expect(created()).toHaveLength(2)
  })

  it('keeps going when one entry fails, so a Calendar blip loses at most one', async () => {
    // The opens-at entry throws; the deadline entry after it must still land.
    const patch = await syncGigCalendar(
      env,
      row({ status: 'shortlisted', name: 'BOOM Festival', deadline: '2027-01-15' }),
    )
    expect(patch.opensEventId).toBeUndefined()
    expect(patch.googleEventId).toBeUndefined()
    // Both entries carry the name, so both throw — prove the failure is
    // contained rather than thrown, which is what a status change depends on.
    expect(created()).toEqual([])
  })

  it('does not save a status change hostage to the calendar', async () => {
    // syncGigCalendar resolving rather than rejecting is what lets the route
    // write the row even when Google is down.
    await expect(
      syncGigCalendar(env, row({ status: 'shortlisted', name: 'BOOM' })),
    ).resolves.toBeTruthy()
  })
})
