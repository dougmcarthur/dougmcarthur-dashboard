import { describe, it, expect } from 'vitest'
import { matchCatalog, type CatalogEntry, type OrgTerms } from '../shared/catalogMatch'
import {
  LANE_SIZE,
  buildStartLanes,
  httpUrl,
  isNationalGrant,
  isRolling,
  provinceOf,
  syncCandidates,
} from '../shared/startLanes'
import type { Focus } from '../shared/artistFocus'
import type { GoalId } from '../shared/onboarding'

/**
 * What an account with nothing on it is shown.
 *
 * The rules under every test are the matcher's own: facts remove with a reason,
 * a missing input is named and never guessed, and silence is never a clause that
 * is missing. The gig lanes are cut from `matchCatalog`'s output, so the tests
 * compose through it and a closed call stays closed here for the same reason.
 */

const TODAY = '2027-01-15'
const day = (n: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function entry(o: Partial<CatalogEntry> & { id: number }): CatalogEntry {
  return {
    category: 'funding', name: `Entry ${o.id}`, organizer: null, kind: 'Grant', url: 'https://example.test/x',
    deadline: day(30), deadlineNote: null, location: 'National', country: 'CA', region: null, genres: null,
    eligibility: null, opensAt: null, feeAmount: null, feeCurrency: null,
    firstSeenAt: day(-30), delivery: null, ...o,
  }
}

const ORG_OPEN: OrgTerms = {
  site: 'https://library.example.test',
  submissionPolicy: 'open',
  policyEvidence: 'We welcome submissions from independent artists.',
  policyUrl: 'https://library.example.test/submit',
  policyCheckedAt: day(-3),
  exclusivity: 'non_exclusive',
  exclusivityEvidence: 'All of our agreements with artists are non-exclusive.',
  exclusivityUrl: 'https://library.example.test/artists',
  termsReadAt: day(-3),
}

const org = (o: Partial<OrgTerms> = {}): OrgTerms => ({ ...ORG_OPEN, ...o })
const sync = (id: number, o: Partial<OrgTerms> | null = {}, rest: Partial<CatalogEntry> = {}): CatalogEntry =>
  entry({ id, category: 'sync', kind: 'Library', deadline: null, location: null, country: null, org: o === null ? null : org(o), ...rest })

const FOCUS: Focus = { goals: [], reach: [], homeRegion: null }

function lanes(entries: CatalogEntry[], o: { home?: string | null; goals?: GoalId[]; haveSync?: number[]; have?: number[] } = {}) {
  const home = o.home === undefined ? null : o.home
  const focus: Focus | null = home || o.goals?.length ? { goals: o.goals ?? [], reach: [], homeRegion: home } : null
  const { matches } = matchCatalog({ entries, focus, profile: null, have: new Set(o.have ?? []), today: TODAY })
  return buildStartLanes({
    matches, entries, haveSync: new Set(o.haveSync ?? []), home, goals: o.goals ?? [], today: TODAY,
  })
}

describe('which grants are open to artists anywhere in Canada', () => {
  const national = [
    ['National', 'CA'],
    ['Canada', 'CA'],
    ['Canada-wide', null],
    ['Nationwide', null],
    ['Across Canada', 'CA'],
  ] as const
  it.each(national)('calls a grant at %j national', (location, country) => {
    expect(isNationalGrant(entry({ id: 1, location, country }))).toBe(true)
  })

  it('does not call a grant national for having no place at all', () => {
    expect(isNationalGrant(entry({ id: 1, location: null }))).toBe(false)
  })

  it('does not call a provincial grant national, whether the column or the place says so', () => {
    expect(isNationalGrant(entry({ id: 1, location: 'Winnipeg, MB' }))).toBe(false)
    expect(isNationalGrant(entry({ id: 2, location: 'National', region: 'MB' }))).toBe(false)
  })

  it('does not call a grant restricted to residents national', () => {
    expect(isNationalGrant(entry({ id: 1, eligibility: { residentOf: ['MB'] } }))).toBe(false)
  })

  it('does not call a foreign programme national here', () => {
    expect(isNationalGrant(entry({ id: 1, location: 'National', country: 'US' }))).toBe(false)
  })

  it('is about funding and nothing else', () => {
    expect(isNationalGrant(entry({ id: 1, category: 'festival', location: 'National' }))).toBe(false)
  })
})

describe('the grant lane', () => {
  it('lists open national grants with why, and says how many there are', () => {
    const l = lanes([entry({ id: 1, name: 'Arts Across Canada' }), entry({ id: 2, name: 'Provincial', location: 'Regina, SK' })])
    expect(l.grants.rows.map((r) => r.name)).toEqual(['Arts Across Canada'])
    expect(l.grants.rows[0].reasons[0]).toBe('Open to artists anywhere in Canada.')
    expect(l.grants.heading).toBe('1 grant is open to artists anywhere in Canada.')
  })

  it('keeps a rolling intake, since there is no closing date to miss', () => {
    const l = lanes([entry({ id: 1, deadline: null, deadlineNote: 'Rolling intake, apply any time' })])
    expect(l.grants.rows[0].rolling).toBe(true)
    expect(l.grants.rows[0].reasons.join(' ')).toMatch(/no closing date to miss/)
    expect(l.grants.rows[0].unknowns.join(' ')).not.toMatch(/No closing date/)
  })

  it('names a missing closing date as unknown and does not call it rolling', () => {
    const l = lanes([entry({ id: 1, deadline: null, deadlineNote: null })])
    expect(l.grants.rows[0].rolling).toBe(false)
    expect(l.grants.rows[0].unknowns).toContain('No closing date stated.')
  })

  it('drops a call that has closed, for the matcher\'s reason', () => {
    const l = lanes([entry({ id: 1, deadline: day(-2) })])
    expect(l.grants.rows).toEqual([])
    expect(l.grants.heading).toMatch(/^Scout has no grant to show you/)
  })

  it('drops what is already on the list', () => {
    const l = lanes([entry({ id: 1 }), entry({ id: 2 })], { have: [1] })
    expect(l.grants.rows.map((r) => r.id)).toEqual([2])
  })

  it('does not wait for the artist to say anything', () => {
    const l = lanes([entry({ id: 1 })], { home: null, goals: [] })
    expect(l.grants.total).toBe(1)
  })

  it('shows a few and counts the rest', () => {
    const many = Array.from({ length: LANE_SIZE + 3 }, (_, i) => entry({ id: i + 1 }))
    const l = lanes(many)
    expect(l.grants.rows).toHaveLength(LANE_SIZE)
    expect(l.grants.total).toBe(LANE_SIZE + 3)
  })
})

describe('the province lane', () => {
  const festival = (id: number, o: Partial<CatalogEntry> = {}) =>
    entry({ id, category: 'festival', kind: 'Festival', location: 'Winnipeg, MB', ...o })
  const showcase = (id: number, o: Partial<CatalogEntry> = {}) =>
    entry({ id, category: 'showcase', kind: 'Showcase', location: 'Brandon, MB', ...o })

  it('asks for a province instead of showing somebody else\'s', () => {
    const l = lanes([festival(1)], { home: null })
    expect(l.province.region).toBeNull()
    expect(l.province.rows).toEqual([])
    expect(l.province.heading).toMatch(/Tell Scout which province/)
  })

  it('shows festivals and showcases in their province, and nothing from another', () => {
    const l = lanes([festival(1), showcase(2), festival(3, { location: 'Regina, SK' })], { home: 'MB' })
    expect(l.province.rows.map((r) => r.id)).toEqual([1, 2])
    expect(l.province.region).toEqual({ code: 'MB', name: 'Manitoba' })
    expect(l.province.heading).toBe('2 festivals and showcases in Manitoba are open for applications.')
  })

  it('reads the province from the place when the column is empty, and from the column first', () => {
    expect(provinceOf({ region: null, location: 'Brandon, MB' })).toBe('MB')
    expect(provinceOf({ region: 'SK', location: 'Brandon, MB' })).toBe('SK')
    expect(provinceOf({ region: 'TX', location: 'Austin, TX' })).toBeNull()
    expect(provinceOf({ region: null, location: 'Birds Hill' })).toBeNull()
  })

  it('does not put a listing with no province in anybody\'s', () => {
    const l = lanes([festival(1, { location: 'Birds Hill Park' })], { home: 'MB' })
    expect(l.province.rows).toEqual([])
  })

  it('says what it does not have, in one sentence', () => {
    const l = lanes([], { home: 'MB' })
    expect(l.province.heading).toBe('Scout has no open festival or showcase in Manitoba to show you right now.')
  })

  it('is not for grants, even in their province', () => {
    const l = lanes([entry({ id: 1, location: 'Winnipeg, MB' })], { home: 'MB' })
    expect(l.province.rows).toEqual([])
  })
})

describe('the sync lane', () => {
  it('shows a company only when its own site says it takes submissions and asks for no exclusivity', () => {
    const l = lanes([sync(1)])
    expect(l.sync.rows).toHaveLength(1)
    expect(l.sync.rows[0]).toMatchObject({
      policyQuote: 'We welcome submissions from independent artists.',
      exclusivityQuote: 'All of our agreements with artists are non-exclusive.',
    })
    expect(l.sync.heading).toBe('1 sync company takes submissions and says it asks for no exclusivity.')
  })

  it('lists a company whose site is silent about exclusivity apart, and never as a good bet', () => {
    const l = lanes([sync(1, { exclusivity: null, exclusivityEvidence: null, exclusivityUrl: null })])
    expect(l.sync.rows).toEqual([])
    expect(l.sync.unclear.map((r) => r.id)).toEqual([1])
    expect(l.sync.unclear[0].exclusivityQuote).toBeNull()
    expect(l.sync.heading).toMatch(/^Scout has no sync company to show you/)
  })

  it('counts a company that asks for exclusivity and does not list it', () => {
    const l = lanes([sync(1, { exclusivity: 'exclusive', exclusivityEvidence: 'Exclusive for three years.' })])
    expect(l.sync.rows).toEqual([])
    expect(l.sync.unclear).toEqual([])
    expect(l.sync.exclusive).toBe(1)
  })

  it('counts a company that refuses cold pitches and never lists it', () => {
    const l = lanes([sync(1, { submissionPolicy: 'closed', policyEvidence: 'No unsolicited material please.' })])
    expect(l.sync.rows).toEqual([])
    expect(l.sync.unclear).toEqual([])
    expect(l.sync.closed).toBe(1)
  })

  it('does not show a company whose submissions policy nobody found, whatever its exclusivity says', () => {
    const none = lanes([sync(1, { submissionPolicy: null, policyEvidence: null })])
    expect(none.sync.rows).toEqual([])
    expect(none.sync.unclear).toEqual([])
  })

  it('does not take an exclusivity claim without its sentence', () => {
    const l = lanes([sync(1, { exclusivityEvidence: null })])
    expect(l.sync.rows).toEqual([])
    expect(l.sync.unclear.map((r) => r.id)).toEqual([1])
  })

  it('skips a company already on their Sync list, and one still in the holding period', () => {
    const entries = [sync(1), sync(2), sync(3, {}, { firstSeenAt: day(0) })]
    const l = lanes(entries, { haveSync: [1] })
    expect(l.sync.rows.map((r) => r.id)).toEqual([2])
  })

  it('does not show an entry with no terms recorded at all', () => {
    const l = lanes([sync(1, null)])
    expect(l.sync.rows).toEqual([])
    expect(l.sync.unclear).toEqual([])
  })

  it('puts the companies somebody has read ahead of the ones nobody has', () => {
    const c = syncCandidates(
      [
        sync(1, { exclusivity: null, exclusivityEvidence: null, termsReadAt: null }, { name: 'A unread' }),
        sync(2, { exclusivity: null, exclusivityEvidence: null, termsReadAt: day(-1) }, { name: 'B read' }),
      ],
      new Set(),
      TODAY,
    )
    expect(c.unclear.map((r) => r.name)).toEqual(['B read', 'A unread'])
    expect(c.unclear.map((r) => r.exclusivityRead)).toEqual([true, false])
  })

  it('never lists an organisation in the gig lanes', () => {
    const l = lanes([sync(1, {}, { location: 'National' })], { home: 'MB' })
    expect(l.grants.rows).toEqual([])
    expect(l.province.rows).toEqual([])
  })
})

describe('the order of the lanes', () => {
  it('is the same for everybody who has said nothing', () => {
    expect(lanes([]).order).toEqual(['grants', 'province', 'sync'])
  })

  it('puts what they asked for first and drops nothing', () => {
    expect(lanes([], { goals: ['sync'] }).order).toEqual(['sync', 'grants', 'province'])
    expect(lanes([], { goals: ['gigs', 'sync'] }).order).toEqual(['province', 'sync', 'grants'])
  })
})

describe('what is written for a person to read', () => {
  it('is whole sentences without a dash standing in for a comma', () => {
    const l = lanes([entry({ id: 1 }), sync(2), sync(3, { exclusivity: null, exclusivityEvidence: null })], { home: 'MB' })
    const headings = [l.grants.heading, l.province.heading, l.sync.heading]
    for (const h of headings) {
      expect(h).not.toMatch(/—|–/)
      expect(h).toMatch(/[.]$/)
      expect(h.split(/\s+/).length).toBeGreaterThan(5)
    }
  })

  it('reads a rolling note and nothing else as rolling', () => {
    expect(isRolling({ deadline: null, deadlineNote: 'Rolling artist roster intake' })).toBe(true)
    expect(isRolling({ deadline: null, deadlineNote: 'Check back in September' })).toBe(false)
    expect(isRolling({ deadline: day(10), deadlineNote: 'Rolling' })).toBe(false)
  })
})

describe('what a row says about where it is', () => {
  it('says it once, and never in a way that contradicts the lane it is in', () => {
    const entries = [entry({ id: 1, category: 'festival', kind: 'Festival', location: 'Selkirk, MB', region: 'MB' })]
    // The route hands the matcher no focus until goals are chosen, even when the
    // province is known, and with no home it labels a Manitoba place "Elsewhere
    // in Canada" beside a lane that says "In Manitoba".
    const { matches } = matchCatalog({ entries, focus: null, profile: null, have: new Set(), today: TODAY })
    expect(matches[0].reasons.join(' ')).toMatch(/Elsewhere in Canada/)

    const l = buildStartLanes({ matches, entries, haveSync: new Set(), home: 'MB', goals: [], today: TODAY })
    expect(l.province.rows[0].reasons.join(' ')).toBe('In Manitoba. Closes Feb 14.')
  })
})

describe('what may be a link', () => {
  it('is http or https and nothing else', () => {
    expect(httpUrl('https://example.test/apply')).toBe('https://example.test/apply')
    expect(httpUrl('http://example.test')).toBe('http://example.test/')
    expect(httpUrl('javascript:alert(1)')).toBeNull()
    expect(httpUrl('data:text/html,<p>hi</p>')).toBeNull()
    expect(httpUrl('not a url')).toBeNull()
    expect(httpUrl(null)).toBeNull()
  })

  it('is applied to every address a lane row carries', () => {
    const l = lanes([
      entry({ id: 1, url: 'javascript:alert(1)' }),
      sync(2, { site: 'javascript:alert(2)', policyUrl: 'data:text/html,x', exclusivityUrl: 'javascript:alert(3)' }),
    ])
    expect(l.grants.rows[0].url).toBeNull()
    expect(l.sync.rows[0]).toMatchObject({ site: null, policyUrl: null, exclusivityUrl: null })
  })
})
