import { describe, it, expect } from 'vitest'
import { planReplyScan, gigTerms, parseFrom } from '../src/lib/gmailReplies'
import type { MatchableGig } from '../shared/replyMatch'

const TODAY = '2026-09-08'

const gig = (over: Partial<MatchableGig> = {}): MatchableGig => ({
  id: 1,
  name: 'Highlands Music Festival',
  organizer: null,
  status: 'submitted',
  url: 'https://highlandsmusicfestival.ca',
  submittedAt: '2026-06-10T00:00:00Z',
  ...over,
})

/**
 * How far back the scan reaches is derived rather than fixed, which is the
 * whole reason it is worth testing: a comment saying "about a year" goes stale
 * the first time an application ages, and the number is the answer to a
 * question that gets asked.
 */
describe('how far back the scan looks', () => {
  it('reaches back to just before the oldest application still waiting', () => {
    const plan = planReplyScan({
      gigs: [gig({ submittedAt: '2026-06-10T00:00:00Z' })],
      today: TODAY,
    })
    // 90 days from 10 June to 8 September, plus a fortnight of slack.
    expect(plan.windowDays).toBe(104)
    expect(plan.oldestSubmission).toBe('2026-06-10T00:00:00Z')
  })

  it('is set by the oldest, not the newest', () => {
    const plan = planReplyScan({
      gigs: [
        gig({ id: 1, submittedAt: '2026-09-01T00:00:00Z' }),
        gig({ id: 2, name: 'LieLow Music Fest', submittedAt: '2026-01-26T00:00:00Z' }),
      ],
      today: TODAY,
    })
    expect(plan.oldestSubmission).toBe('2026-01-26T00:00:00Z')
    expect(plan.windowDays).toBeGreaterThan(200)
  })

  it('never reaches back more than three years, however old the row', () => {
    const plan = planReplyScan({
      gigs: [gig({ submittedAt: '2015-01-01T00:00:00Z' })],
      today: TODAY,
    })
    expect(plan.windowDays).toBe(1095)
  })

  it('still opens a month when nothing records a submission date', () => {
    // `submitted_at` is null on every row that reached the phase before
    // migration 0010, and `updated_at` is not a substitute.
    const plan = planReplyScan({ gigs: [gig({ submittedAt: null })], today: TODAY })
    expect(plan.windowDays).toBe(30)
    expect(plan.oldestSubmission).toBeNull()
  })

  it('plans nothing when no application is in play', () => {
    const plan = planReplyScan({ gigs: [gig({ status: 'passed' })], today: TODAY })
    expect(plan.queries).toEqual([])
    expect(plan.gigCount).toBe(0)
  })
})

describe('what the scan asks Gmail for', () => {
  it('searches for the names in play, not for the whole mailbox', () => {
    const [q] = planReplyScan({
      gigs: [gig({ name: 'Folk On The Rocks' })],
      today: TODAY,
    }).queries
    expect(q).toContain('"Folk On The Rocks"')
    expect(q).toContain('FOTR')
  })

  it('includes spam and trash, and excludes your own outbound mail', () => {
    const [q] = planReplyScan({ gigs: [gig()], today: TODAY }).queries
    // A rejection auto-filed as spam is the silence this phase exists to break.
    expect(q).toContain('in:anywhere')
    expect(q).toContain('-in:sent')
    expect(q).toContain('-in:draft')
  })

  it('asks for addresses already known to write about a gig', () => {
    const [q] = planReplyScan({
      gigs: [gig()],
      bindings: [{ gigId: 1, kind: 'address', value: 'jdesaulniers@heho.ca' }],
      today: TODAY,
    }).queries
    expect(q).toContain('from:jdesaulniers@heho.ca')
  })

  it('splits into several queries rather than sending one Gmail will refuse', () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      gig({ id: i + 1, name: `Riverbend Valley Roots Gathering Number ${i}` }),
    )
    const plan = planReplyScan({ gigs: many, today: TODAY })
    expect(plan.queries.length).toBeGreaterThan(1)
    for (const q of plan.queries) expect(q.length).toBeLessThanOrEqual(1500)
  })

  it('builds no term for a name with nothing distinctive left in it', () => {
    // "The Music Festival" is every second event in the pipeline; searching for
    // it would return the mailbox.
    expect(gigTerms({ name: 'The Music Festival' })).toEqual([])
  })
})

describe('reading a From header', () => {
  it('splits the display name from the address and lower-cases the address', () => {
    expect(parseFrom('Jane Ireland <Jane@MBArtsNet.ca>')).toEqual({
      address: 'jane@mbartsnet.ca',
      name: 'Jane Ireland',
    })
  })

  it('copes with a bare address and with a quoted name', () => {
    expect(parseFrom('noreply@wufoo.com')).toEqual({ address: 'noreply@wufoo.com', name: null })
    expect(parseFrom('"LieLow Music Fest" <lielowmusicfest@gmail.com>').name).toBe('LieLow Music Fest')
  })
})
