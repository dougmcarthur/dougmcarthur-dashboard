import { describe, it, expect } from 'vitest'
import {
  beyondReachNote,
  focusFrom,
  focusOfItem,
  goalOf,
  homeRegionOf,
  reachVerdict,
  regionOf,
  whereIs,
  type Focus,
} from '../shared/artistFocus'
import { buildReviewQueue } from '../shared/reviewQueue'
import type { GigOpportunity } from '../shared/types'

/**
 * What the artist asked for, read against what is in front of them.
 *
 * The rule under every test here: it orders what is undecided and removes
 * nothing. A call beyond the reach somebody chose is still on the list.
 */

const TODAY = '2027-01-15'

const focus = (o: Partial<Focus>): Focus => ({ goals: [], reach: [], homeRegion: 'MB', ...o })

describe('regionOf', () => {
  it('reads a province or state from the end of a place', () => {
    expect(regionOf('Winnipeg, MB')).toEqual({ code: 'MB', country: 'CA' })
    expect(regionOf('Brandon, Manitoba')).toEqual({ code: 'MB', country: 'CA' })
    expect(regionOf('Austin, TX')).toEqual({ code: 'TX', country: 'US' })
    expect(regionOf("St. John's, Newfoundland and Labrador")).toEqual({ code: 'NL', country: 'CA' })
  })

  it('skips a country written after the region, and does not take Canada for California', () => {
    expect(regionOf('Toronto, ON, Canada')).toEqual({ code: 'ON', country: 'CA' })
    expect(regionOf('Toronto, ON, CA')).toEqual({ code: 'ON', country: 'CA' })
    expect(regionOf('Austin, TX, USA')).toEqual({ code: 'TX', country: 'US' })
    expect(regionOf('Fresno, CA')).toEqual({ code: 'CA', country: 'US' })
  })

  it('finds a province named anywhere in the text as a last resort', () => {
    expect(regionOf('somewhere in Manitoba')).toEqual({ code: 'MB', country: 'CA' })
  })

  it('does not guess at a place that does not say', () => {
    expect(regionOf('Birds Hill')).toBeNull()
    expect(regionOf('')).toBeNull()
    expect(regionOf(null)).toBeNull()
  })

  it('takes a home province only from Canada', () => {
    expect(homeRegionOf('Winnipeg, MB')).toBe('MB')
    expect(homeRegionOf('Austin, TX')).toBeNull()
    expect(homeRegionOf(null)).toBeNull()
  })
})

describe('focusFrom', () => {
  it('is nothing at all when the artist has not said', () => {
    expect(focusFrom(null, 'Winnipeg, MB')).toBeNull()
    expect(focusFrom({ goals: [], reach: [], note: null }, 'Winnipeg, MB')).toBeNull()
  })

  it('resolves the province from the home base, and leaves it empty without one', () => {
    const goals = { goals: ['gigs' as const], reach: ['home' as const], note: null }
    expect(focusFrom(goals, 'Winnipeg, MB')?.homeRegion).toBe('MB')
    expect(focusFrom(goals, null)?.homeRegion).toBeNull()
  })
})

describe('whereIs', () => {
  it('tells the home province from the rest of Canada', () => {
    expect(whereIs({ location: 'Gimli, MB', country: 'CA' }, 'MB')).toBe('home')
    expect(whereIs({ location: 'Calgary, AB', country: 'CA' }, 'MB')).toBe('canada')
  })

  it('does not call a Canadian place home when home is not known', () => {
    expect(whereIs({ location: 'Gimli, MB', country: 'CA' }, null)).toBe('canada')
  })

  it('uses the country column, and the place when nobody filled it in', () => {
    expect(whereIs({ location: 'Austin, TX', country: null }, 'MB')).toBe('us')
    expect(whereIs({ location: 'Glasgow', country: 'UK' }, 'MB')).toBe('abroad')
    expect(whereIs({ location: 'Somewhere', country: null }, 'MB')).toBeNull()
  })

  it('treats online and nationwide programmes as having no trip in them', () => {
    expect(whereIs({ location: 'Online', country: null }, 'MB')).toBe('no_travel')
    expect(whereIs({ location: 'National (Canada)', country: 'CA' }, 'MB')).toBe('no_travel')
  })
})

describe('reachVerdict', () => {
  it('counts across Canada as including home', () => {
    const f = focus({ reach: ['canada'] })
    expect(reachVerdict('home', f)).toBe('within')
    expect(reachVerdict('canada', f)).toBe('within')
    expect(reachVerdict('us', f)).toBe('beyond')
  })

  it('takes "my province" at its word when the province is known', () => {
    const f = focus({ reach: ['home'] })
    expect(reachVerdict('home', f)).toBe('within')
    expect(reachVerdict('canada', f)).toBe('beyond')
  })

  it('cannot tell when "my province" has no province behind it', () => {
    const f = focus({ reach: ['home'], homeRegion: null })
    expect(reachVerdict('canada', f)).toBe('unknown')
  })

  it('treats the United States and overseas as their own choices', () => {
    expect(reachVerdict('us', focus({ reach: ['canada', 'us'] }))).toBe('within')
    expect(reachVerdict('abroad', focus({ reach: ['canada', 'us'] }))).toBe('beyond')
    expect(reachVerdict('abroad', focus({ reach: ['international'] }))).toBe('within')
  })

  it('never calls an online call beyond anyone', () => {
    expect(reachVerdict('no_travel', focus({ reach: ['home'] }))).toBe('within')
  })

  it('makes no claim when nothing was chosen, or the place is unknown', () => {
    expect(reachVerdict('us', focus({ reach: [] }))).toBe('unknown')
    expect(reachVerdict(null, focus({ reach: ['home'] }))).toBe('unknown')
    expect(reachVerdict('us', null)).toBe('unknown')
  })
})

describe('goalOf', () => {
  it('maps the kinds of opportunity to the questions the welcome flow asks', () => {
    expect(goalOf({ kind: 'gig', type: 'Folk Festival' })).toBe('gigs')
    expect(goalOf({ kind: 'gig', type: 'Showcase' })).toBe('gigs')
    expect(goalOf({ kind: 'gig', type: 'Grant' })).toBe('grants')
    expect(goalOf({ kind: 'sync' })).toBe('sync')
    expect(goalOf({ kind: 'promo' })).toBe('promo')
  })

  it('makes no claim for a type that is plainly none of them', () => {
    expect(goalOf({ kind: 'gig', type: 'Venue' })).toBeNull()
    expect(goalOf({ kind: 'gig', type: null })).toBeNull()
  })
})

describe('what an item is told', () => {
  it('weighs what was asked for above how far away it is', () => {
    const f = focus({ goals: ['gigs'], reach: ['canada'] })
    const festivalAbroad = focusOfItem({ kind: 'gig', type: 'Festival', location: 'Austin, TX', country: 'US' }, f)!
    const grantAtHome = focusOfItem({ kind: 'gig', type: 'Grant', location: 'Winnipeg, MB', country: 'CA' }, f)!
    expect(festivalAbroad.penalty).toBe(1)
    expect(grantAtHome.penalty).toBe(2)
  })

  it('says the place and the choice in plain words', () => {
    const f = focus({ reach: ['canada'] })
    const item = focusOfItem({ kind: 'gig', type: 'Festival', location: 'Austin, TX', country: 'US' }, f)!
    expect(beyondReachNote(item)).toBe('In the United States, beyond the reach you chose')
    const near = focusOfItem({ kind: 'gig', type: 'Festival', location: 'Gimli, MB', country: 'CA' }, f)!
    expect(beyondReachNote(near)).toBeNull()
  })

  it('is null when the artist has not said, so nothing is ordered', () => {
    expect(focusOfItem({ kind: 'gig', type: 'Festival' }, null)).toBeNull()
  })
})

// ── In the queue ──────────────────────────────────────────────────────────────

function gig(o: Partial<GigOpportunity>): GigOpportunity {
  return {
    id: 1, name: 'A festival', type: 'Festival', organizer: null, submissionMethod: null,
    audienceSize: null, genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null,
    feeAmount: null, feeCurrency: 'USD', fee: null, paid: 0, fitNotes: null, fitRationale: null,
    url: null, status: 'discovered', googleEventId: null, snoozedUntil: null, snoozedAt: null,
    discoveredAt: TODAY, updatedAt: TODAY, location: null, country: null, ...o,
  } as GigOpportunity
}

const order = (items: GigOpportunity[], f: Focus | null) =>
  buildReviewQueue({ gigs: items, today: TODAY, focus: f }).map((i) => i.title)

describe('the queue, ordered by what was asked for', () => {
  const abroad = gig({ id: 1, name: 'Alpha, abroad', location: 'Austin, TX', country: 'US' })
  const nearby = gig({ id: 2, name: 'Zulu, nearby', location: 'Gimli, MB', country: 'CA' })
  const grant = gig({ id: 3, name: 'Mike, a grant', type: 'Grant', location: 'National (Canada)', country: 'CA' })

  it('puts what is within reach ahead of what is beyond it, and keeps both', () => {
    const f = focus({ reach: ['canada'] })
    expect(order([abroad, nearby], f)).toEqual(['Zulu, nearby', 'Alpha, abroad'])
  })

  it('leaves the order alone when the artist has not said', () => {
    // Without a focus the tie is broken by title, as it always was.
    expect(order([abroad, nearby], null)).toEqual(['Alpha, abroad', 'Zulu, nearby'])
  })

  it('puts what they asked for ahead of what they did not', () => {
    const f = focus({ goals: ['gigs'] })
    expect(order([grant, nearby], f)).toEqual(['Zulu, nearby', 'Mike, a grant'])
  })

  it('weighs a goal above distance, so a festival abroad beats a grant they did not ask for', () => {
    const f = focus({ goals: ['gigs'], reach: ['canada'] })
    expect(order([grant, abroad], f)).toEqual(['Alpha, abroad', 'Mike, a grant'])
  })

  it('lets a deadline outrank a preference', () => {
    const closing = gig({ id: 4, name: 'Closing grant', type: 'Grant', deadline: '2027-01-20', location: 'National (Canada)', country: 'CA' })
    const f = focus({ goals: ['gigs'] })
    expect(order([nearby, closing], f)[0]).toBe('Closing grant')
  })

  it('removes nothing', () => {
    const f = focus({ goals: ['gigs'], reach: ['home'] })
    expect(order([abroad, nearby, grant], f)).toHaveLength(3)
  })

  it('does not reshuffle what is already decided', () => {
    const sent = gig({ id: 5, name: 'Applied, abroad', status: 'submitted', location: 'Austin, TX', country: 'US' })
    const f = focus({ reach: ['home'] })
    const without = order([sent, nearby], null)
    expect(order([sent, nearby], f).indexOf('Applied, abroad')).toBe(without.indexOf('Applied, abroad'))
  })

  it('carries the verdict on the item, for the screen to say', () => {
    const items = buildReviewQueue({ gigs: [abroad], today: TODAY, focus: focus({ reach: ['canada'] }) })
    expect(items[0].focus).toMatchObject({ reach: 'beyond', where: 'us', penalty: 1 })
    expect(buildReviewQueue({ gigs: [abroad], today: TODAY })[0].focus).toBeNull()
  })
})
