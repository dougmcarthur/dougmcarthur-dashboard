import { describe, it, expect } from 'vitest'
import {
  DELIVERY_HOLD_DAYS,
  countUnknowns,
  explainMatch,
  groupSkipped,
  isDeliverable,
  matchCatalog,
  type CatalogEntry,
} from '../shared/catalogMatch'
import type { Focus } from '../shared/artistFocus'
import type { Profile } from '../shared/onboarding'

/**
 * The shared catalog, matched to one artist.
 *
 * The rule under every test: facts remove with a reason, weights order and
 * remove nothing, and a missing input is named and never guessed.
 */

const TODAY = '2027-01-15'

const day = (n: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function entry(o: Partial<CatalogEntry> & { id: number }): CatalogEntry {
  return {
    category: 'festival', name: `Entry ${o.id}`, organizer: null, kind: 'Festival', url: 'https://example.test/x',
    deadline: day(30), deadlineNote: null, location: 'Winnipeg, MB', country: 'CA', region: 'MB', genres: null,
    eligibility: null, opensAt: null, feeAmount: null, feeCurrency: null,
    // Long enough ago to be past the holding period, unless a test says otherwise.
    firstSeenAt: day(-30), delivery: null, ...o,
  }
}

const FOCUS: Focus = { goals: ['gigs', 'grants'], reach: ['canada'], homeRegion: 'MB' }
const PROFILE: Profile = { region: 'MB', city: 'Winnipeg', genres: ['folk'] }

const run = (entries: CatalogEntry[], o: { focus?: Focus | null; profile?: Profile | null; have?: number[] } = {}) =>
  matchCatalog({
    entries,
    focus: o.focus === undefined ? FOCUS : o.focus,
    profile: o.profile === undefined ? PROFILE : o.profile,
    have: new Set(o.have ?? []),
    today: TODAY,
  })

describe('what is cleared to go into an artist\'s list', () => {
  it('waits out the holding period, so one poisoned page does not reach everybody at once', () => {
    const fresh = entry({ id: 1, firstSeenAt: day(-1) })
    expect(isDeliverable(fresh, TODAY)).toBe(false)
    expect(isDeliverable(entry({ id: 2, firstSeenAt: day(-DELIVERY_HOLD_DAYS) }), TODAY)).toBe(true)
  })

  it('lets the owner approve at once, and block for good', () => {
    expect(isDeliverable(entry({ id: 1, firstSeenAt: day(0), delivery: 'approved' }), TODAY)).toBe(true)
    expect(isDeliverable(entry({ id: 2, firstSeenAt: day(-90), delivery: 'blocked' }), TODAY)).toBe(false)
  })

  it('counts what is held without listing it, since it is not for anybody yet', () => {
    const r = run([entry({ id: 1, firstSeenAt: day(0) }), entry({ id: 2 })])
    expect(r.held).toBe(1)
    expect(r.matches.map((m) => m.entry.id)).toEqual([2])
    expect(r.skipped).toEqual([])
  })
})

describe('what is removed, and why', () => {
  it('drops a call that has closed, and says when', () => {
    const r = run([entry({ id: 1, deadline: day(-3) })])
    expect(r.matches).toEqual([])
    expect(r.skipped[0]).toMatchObject({ reason: 'closed', text: 'Closed on Jan 12.' })
  })

  it('drops what is already on the list, whatever they did with it', () => {
    const r = run([entry({ id: 1 }), entry({ id: 2 })], { have: [1] })
    expect(r.matches.map((m) => m.entry.id)).toEqual([2])
    expect(r.skipped).toEqual([expect.objectContaining({ reason: 'yours' })])
  })

  it('names a sync organisation instead of adding it, since it means nothing without a pitch', () => {
    const r = run([entry({ id: 1, category: 'sync', deadline: null })])
    expect(r.matches).toEqual([])
    expect(r.skipped[0].reason).toBe('sync_organisation')
  })

  it('says when it could not tell what kind of opportunity it was', () => {
    expect(run([entry({ id: 1, category: 'other' })]).skipped[0].reason).toBe('unclear_kind')
  })

  it('drops a call for residents of another province, with the fact', () => {
    const r = run([entry({ id: 1, eligibility: { residentOf: ['AB', 'BC'] } })])
    expect(r.matches).toEqual([])
    expect(r.skipped[0]).toMatchObject({ reason: 'residents', text: 'For residents of AB, BC. You are in MB.' })
  })

  it('keeps a residents-only call when it is theirs', () => {
    expect(run([entry({ id: 1, eligibility: { residentOf: ['MB'] } })]).matches).toHaveLength(1)
  })

  it('does not drop a residents-only call when it does not know their province, and says so', () => {
    const r = run([entry({ id: 1, eligibility: { residentOf: ['AB'] } })], { focus: { ...FOCUS, homeRegion: null } })
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].unknowns.map((u) => u.text).join(' ')).toMatch(/does not know your province/)
  })

  it('groups the skipped list by reason, so closed is one line and not forty', () => {
    const r = run([1, 2, 3].map((id) => entry({ id, deadline: day(-id) })))
    expect(groupSkipped(r.skipped)).toEqual([{ reason: 'closed', count: 3, example: 'Closed on Jan 14.' }])
  })
})

describe('what only orders', () => {
  const festival = entry({ id: 1, name: 'Festival at home' })
  const abroad = entry({ id: 2, name: 'Festival abroad', location: 'Austin, TX', country: 'US', region: 'TX' })
  const grant = entry({ id: 3, name: 'A grant', category: 'funding', kind: 'Grant', location: 'National (Canada)' })

  it('puts what is within reach first and keeps what is beyond it', () => {
    const r = run([abroad, festival])
    expect(r.matches.map((m) => m.entry.id)).toEqual([1, 2])
    expect(r.matches[1].reasons.join(' ')).toMatch(/beyond the reach you chose/)
  })

  it('weighs what they asked for above how far it is', () => {
    const f: Focus = { goals: ['grants'], reach: ['home'], homeRegion: 'MB' }
    // A grant they asked for beats a festival at home they did not.
    expect(run([festival, grant], { focus: f }).matches.map((m) => m.entry.id)).toEqual([3, 1])
  })

  it('puts the soonest close first among equals, and an undated call after every dated one', () => {
    const r = run([entry({ id: 1, deadline: null }), entry({ id: 2, deadline: day(40) }), entry({ id: 3, deadline: day(5) })])
    expect(r.matches.map((m) => m.entry.id)).toEqual([3, 2, 1])
  })

  it('orders by genre only when both sides said, and never removes on it', () => {
    const folk = entry({ id: 1, genres: ['folk'] })
    const metal = entry({ id: 2, genres: ['punk_metal'] })
    const r = run([metal, folk])
    expect(r.matches.map((m) => m.entry.id)).toEqual([1, 2])
    expect(r.matches[0].reasons.join(' ')).toMatch(/Suits your music: Folk/)
    expect(r.matches[1].reasons.join(' ')).toMatch(/you play something else/)
  })

  it('leaves the order to the deadline when the artist has said nothing', () => {
    const r = run([abroad, festival], { focus: null, profile: null })
    expect(r.matches).toHaveLength(2)
    expect(r.matches.every((m) => m.penalty === 0)).toBe(true)
  })

  it('removes nothing for reach, goals or genre, however badly they miss', () => {
    const f: Focus = { goals: ['sync'], reach: ['home'], homeRegion: 'MB' }
    const r = run([abroad, grant, entry({ id: 4, genres: ['punk_metal'] })], { focus: f })
    expect(r.matches).toHaveLength(3)
  })
})

describe('what it will not guess', () => {
  it('does not call an untagged listing open to any genre', () => {
    const r = run([entry({ id: 1, genres: null })])
    expect(r.matches[0].unknowns.map((u) => u.code)).toContain('genre')
  })

  it('does not say anything about genre for an artist who has not said what they play', () => {
    const r = run([entry({ id: 1, genres: null })], { profile: null })
    expect(r.matches[0].unknowns.map((u) => u.code)).not.toContain('genre')
  })

  it('does not call a listing with no stated eligibility open to anyone', () => {
    const r = run([entry({ id: 1, eligibility: null })])
    expect(r.matches[0].unknowns.map((u) => u.code)).toContain('eligibility')
  })

  it('names membership and age limits as things to check, not as reasons to drop', () => {
    const r = run([entry({ id: 1, eligibility: { membership: ['SOCAN'], minAge: 18 } })])
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].unknowns.map((u) => u.text).join(' ')).toMatch(/Members of SOCAN only/)
    expect(r.matches[0].unknowns.map((u) => u.text).join(' ')).toMatch(/age limit/)
  })

  it('says when a place is unknown, rather than putting it in anyone\'s province', () => {
    const r = run([entry({ id: 1, location: null, country: null, region: null })])
    expect(r.matches[0].unknowns.map((u) => u.code)).toContain('region')
    expect(r.matches[0].focus?.reach).toBe('unknown')
  })

  it('says what the page said when there is no closing date', () => {
    const r = run([entry({ id: 1, deadline: null, deadlineNote: 'Rolling intake' })])
    expect(r.matches[0].unknowns.find((u) => u.code === 'deadline')?.text).toBe('No closing date. The page says: Rolling intake.')
  })
})

describe('what is said about a match', () => {
  it('reads as a paragraph that states what matched and what it could not see', () => {
    const r = run([entry({ id: 1, genres: ['folk'], eligibility: { membership: ['MMA'] } })])
    const text = explainMatch(r.matches[0])
    expect(text).toMatch(/Something you asked for: gigs\./)
    expect(text).toMatch(/Suits your music: Folk\./)
    expect(text).toMatch(/Closes Feb 14\./)
    expect(text).toMatch(/Not stated: .*Members of MMA only/)
    expect(text).toMatch(/Read the listing before you apply\.$/)
  })

  it('counts the gaps across a list, once per match', () => {
    const r = run([entry({ id: 1 }), entry({ id: 2, genres: ['folk'] })])
    expect(countUnknowns(r.matches)).toMatchObject({ genre: 1, eligibility: 2 })
  })

  it('uses no word of loss, and no em dash', () => {
    const r = run([entry({ id: 1, deadline: null })])
    const text = explainMatch(r.matches[0])
    expect(text).not.toMatch(/\b(lose|lost|loss|miss)\b/i)
    expect(text).not.toContain('—')
  })
})
