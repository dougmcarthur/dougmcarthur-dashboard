import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  clampPage,
  normalisePageSize,
  pageCount,
  paginate,
  parsePaging,
} from '../shared/pagination'
import {
  ATTENTION_STATES,
  SOURCE_CADENCES,
  cadenceLabel,
  isCadence,
  needsAttention,
  orderSources,
  readsPerDay,
} from '../shared/sourceControls'

/**
 * The admin lists: how they page, which sources come first, and what the
 * owner may set a source's frequency to.
 */

describe('paging', () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1)

  it('shows one screenful and says which rows', () => {
    const first = paginate(items, 1, 10)
    expect(first.rows).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(first).toMatchObject({ page: 1, pages: 3, total: 23, from: 1, to: 10 })
    const last = paginate(items, 3, 10)
    expect(last.rows).toEqual([21, 22, 23])
    expect(last).toMatchObject({ from: 21, to: 23 })
  })

  it('moves a page that no longer exists to the nearest one that does', () => {
    // Hiding the only row on page three leaves two pages, not an empty third.
    expect(paginate(items.slice(0, 20), 3, 10)).toMatchObject({ page: 2, from: 11, to: 20 })
    expect(clampPage(0, 23, 10)).toBe(1)
    expect(clampPage(-4, 23, 10)).toBe(1)
    expect(clampPage(Number.NaN, 23, 10)).toBe(1)
    expect(clampPage(99, 23, 10)).toBe(3)
  })

  it('has one page, and no rows said, for an empty list', () => {
    expect(paginate([], 1, 10)).toEqual({ rows: [], page: 1, pages: 1, total: 0, from: 0, to: 0 })
    expect(pageCount(0, 10)).toBe(1)
  })

  it('offers three sizes and nothing else', () => {
    expect([...PAGE_SIZES]).toEqual([10, 25, 50])
    expect(normalisePageSize(25)).toBe(25)
    expect(normalisePageSize('50')).toBe(50)
    // A limit a browser can set to a million is a way to ask for everything.
    for (const wild of [1_000_000, '1000000', 0, -5, 'all', null, undefined, 12]) {
      expect(normalisePageSize(wild)).toBe(DEFAULT_PAGE_SIZE)
    }
  })

  it('reads limit and offset from a query string without ever throwing', () => {
    expect(parsePaging('25', '50')).toEqual({ limit: 25, offset: 50 })
    expect(parsePaging(undefined, undefined)).toEqual({ limit: 10, offset: 0 })
    expect(parsePaging('9999', '-3')).toEqual({ limit: 10, offset: 0 })
    expect(parsePaging('10', '1.5')).toEqual({ limit: 10, offset: 0 })
    expect(parsePaging('10', 'abc')).toEqual({ limit: 10, offset: 0 })
  })
})

describe('the order of the sources', () => {
  const src = (label: string, enabled = true) => ({ label, enabled })

  it('puts the ones that are switched off last, each group by name', () => {
    const ordered = orderSources([src('Zed'), src('Alpha', false), src('Mid'), src('Beta', false), src('Able')])
    expect(ordered.map((s) => s.label)).toEqual(['Able', 'Mid', 'Zed', 'Alpha', 'Beta'])
  })

  it('does not change the list it was given', () => {
    const list = [src('B', false), src('A')]
    orderSources(list)
    expect(list.map((s) => s.label)).toEqual(['B', 'A'])
  })
})

describe('what needs the owner’s attention', () => {
  it('is the states that are a fact about the source, not a decision or a wait', () => {
    expect([...ATTENTION_STATES].sort()).toEqual(['empty', 'overdue', 'refused', 'stale', 'unreachable'])
    // Off is the owner's own decision; never read is a source that has not had its turn; working needs nothing.
    for (const quiet of ['off', 'never', 'working'] as const) expect(needsAttention(quiet)).toBe(false)
    for (const loud of ATTENTION_STATES) expect(needsAttention(loud)).toBe(true)
  })
})

describe('how often a source is read', () => {
  it('is a closed set that includes the 24 hours every row already has', () => {
    expect(SOURCE_CADENCES.map((c) => c.hours)).toEqual([6, 12, 24, 48, 168])
    expect(isCadence(24)).toBe(true)
    for (const nope of [0, 1, 5, 25, 720, -24, Number.NaN]) expect(isCadence(nope)).toBe(false)
  })

  it('says each in words, and still says a value it did not offer', () => {
    expect(cadenceLabel(24)).toBe('daily')
    expect(cadenceLabel(168)).toBe('weekly')
    expect(cadenceLabel(36)).toBe('every 36 hours')
  })

  it('adds up what the settings ask for, counting only sources that are on', () => {
    expect(
      readsPerDay([
        { enabled: true, cadenceHours: 24 },
        { enabled: true, cadenceHours: 6 },
        { enabled: false, cadenceHours: 6 },
        { enabled: true, cadenceHours: 168 },
      ]),
    ).toBe(5)
    expect(readsPerDay([])).toBe(0)
  })
})

import { describeAdminChange } from '../shared/adminLog'

describe('the change log', () => {
  it('says what a write did and ignores reads', () => {
    expect(describeAdminChange('GET', '/artists')).toBeNull()
    expect(describeAdminChange('DELETE', '/artists/tnt_0002')).toBe('Removed an artist and their data')
    expect(describeAdminChange('POST', '/invites')).toBe('Issued an invitation')
    expect(describeAdminChange('PATCH', '/catalog/sources/4')).toMatch(/external data source/)
  })
  it('logs an unknown write generically, and never carries a path id into the sentence', () => {
    expect(describeAdminChange('POST', '/something/new')).toBe('Changed something in admin mode')
    expect(describeAdminChange('DELETE', '/invites/inv_secret123')).not.toContain('secret123')
  })
})
