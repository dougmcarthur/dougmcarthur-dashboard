import { describe, it, expect } from 'vitest'
import {
  ASSET_KINDS,
  ASSET_KIND_META,
  addMonths,
  assembleEpk,
  assetHealth,
  assetKindMeta,
  defaultReviewBy,
  normaliseAssetKind,
  pickForLength,
  epkWarnings,
  REVIEW_WARNING_DAYS,
  type ArtistAsset,
} from '../shared/artistAssets'

// Fixtures are dated relative to their own TODAY, never to the real clock: a
// suite that passes today and fails tomorrow fails in CI on somebody else's
// change.
const TODAY = '2026-09-07'

function asset(over: Partial<ArtistAsset> = {}): ArtistAsset {
  return {
    id: 1, kind: 'bio', label: 'Long bio', value: 'x'.repeat(800),
    questionKind: 'bio', variant: 'long', charCount: 800,
    credit: null, usageRights: null, reviewBy: '2027-06-01',
    source: null, notes: null, sortOrder: 0, archived: 0,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('asset kinds', () => {
  it('reads an unknown kind as a fact, the least wrong assumption', () => {
    expect(normaliseAssetKind('sculpture')).toBe('fact')
    expect(normaliseAssetKind(null)).toBe('fact')
    expect(normaliseAssetKind('PHOTO')).toBe('photo')
  })

  it('gives every kind a review interval, so nothing can be added without one', () => {
    for (const k of ASSET_KINDS) expect(ASSET_KIND_META[k].reviewMonths).toBeGreaterThan(0)
  })

  it('asks about the things that go stale fastest, most often', () => {
    // Follower counts before live video before press photos, which is the
    // order they actually rot in.
    expect(assetKindMeta('fact').reviewMonths).toBeLessThan(assetKindMeta('video').reviewMonths)
    expect(assetKindMeta('video').reviewMonths).toBeLessThan(assetKindMeta('photo').reviewMonths)
  })
})

describe('adding months to a date', () => {
  it('lands on the same day of a later month', () => {
    expect(addMonths('2026-09-07', 12)).toBe('2027-09-07')
    expect(addMonths('2026-09-07', 6)).toBe('2027-03-07')
  })

  it('clamps rather than spilling into the next month', () => {
    // 31 January plus one month is the end of February, not the 3rd of March.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-05-31', 1)).toBe('2026-06-30')
  })

  it('crosses a year end', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15')
  })
})

describe('whether an asset is still trustworthy', () => {
  it('is fresh well before its review date', () => {
    const h = assetHealth(asset({ reviewBy: '2027-06-01' }), TODAY)
    expect(h.freshness).toBe('fresh')
    expect(h.daysUntilReview).toBeGreaterThan(REVIEW_WARNING_DAYS)
  })

  it('warns inside the window rather than on the day', () => {
    const h = assetHealth(asset({ reviewBy: '2026-10-01' }), TODAY)
    expect(h.freshness).toBe('due_soon')
  })

  it('is overdue once the date has passed', () => {
    const h = assetHealth(asset({ reviewBy: '2026-08-01' }), TODAY)
    expect(h.freshness).toBe('overdue')
    expect(h.daysUntilReview).toBeLessThan(0)
  })

  it('says so when nothing has ever been decided about it', () => {
    // Distinct from overdue: nobody has claimed this was ever checked, which
    // is a different conversation from "this lapsed".
    const h = assetHealth(asset({ reviewBy: null }), TODAY)
    expect(h.freshness).toBe('unreviewed')
    expect(h.daysUntilReview).toBeNull()
  })

  it('answers the same way whatever day it is asked', () => {
    // The queue never reads the clock, and neither does this.
    const a = asset({ reviewBy: '2026-10-01' })
    expect(assetHealth(a, '2026-09-07').freshness).toBe('due_soon')
    expect(assetHealth(a, '2026-06-07').freshness).toBe('fresh')
    expect(assetHealth(a, '2026-12-07').freshness).toBe('overdue')
  })
})

describe('what is broken about an asset, regardless of its date', () => {
  it('catches a press photo with no photographer credit', () => {
    const h = assetHealth(
      asset({ kind: 'photo', value: 'https://example.com/p.jpg', credit: null }),
      TODAY,
    )
    // Broken the day it was added, and it fails the same way whether the
    // review date has passed or not.
    expect(h.freshness).toBe('fresh')
    expect(h.problem).toMatch(/credit/)
  })

  it('is happy with a credited photo', () => {
    expect(
      assetHealth(asset({ kind: 'photo', value: 'https://e.com/p.jpg', credit: 'A. Photographer' }), TODAY).problem,
    ).toBeNull()
  })

  it('catches a link that is not one, and an empty entry', () => {
    expect(assetHealth(asset({ kind: 'video', value: 'on my phone somewhere' }), TODAY).problem)
      .toMatch(/usable link/)
    expect(assetHealth(asset({ value: null }), TODAY).problem).toMatch(/empty/)
  })
})

describe('the review date a new asset gets', () => {
  it('comes from the kind when none is given', () => {
    expect(defaultReviewBy('bio', TODAY)).toBe('2027-09-07')
    expect(defaultReviewBy('fact', TODAY)).toBe('2027-03-07')
    expect(defaultReviewBy('photo', TODAY)).toBe('2028-09-07')
  })
})

describe('picking the asset that fits a form field', () => {
  const bios = [
    asset({ id: 1, label: 'Short', charCount: 140, value: 'a'.repeat(140) }),
    asset({ id: 2, label: 'Medium', charCount: 400, value: 'a'.repeat(400) }),
    asset({ id: 3, label: 'Long', charCount: 900, value: 'a'.repeat(900) }),
  ]

  it('takes the longest that fits, not the shortest on file', () => {
    // A form asking for 500 characters wants the fullest answer that will go
    // in, not the safest one.
    expect(pickForLength(bios, 500)?.label).toBe('Medium')
    expect(pickForLength(bios, 1000)?.label).toBe('Long')
    expect(pickForLength(bios, 200)?.label).toBe('Short')
  })

  it('takes the fullest when the field states no limit', () => {
    expect(pickForLength(bios, null)?.label).toBe('Long')
  })

  it('offers the shortest rather than nothing when none fits', () => {
    // A bio you have to trim beats a blank box, and the caller can see the
    // length it was handed.
    expect(pickForLength(bios, 50)?.label).toBe('Short')
  })

  it('ignores archived and empty entries', () => {
    expect(pickForLength([asset({ archived: 1 })], null)).toBeUndefined()
    expect(pickForLength([asset({ value: null })], null)).toBeUndefined()
    expect(pickForLength([], null)).toBeUndefined()
  })

  it('falls back to measuring the value when no count was stored', () => {
    const unmeasured = [asset({ id: 9, label: 'Unmeasured', charCount: null, value: 'a'.repeat(200) })]
    expect(pickForLength(unmeasured, 300)?.label).toBe('Unmeasured')
    expect(pickForLength(unmeasured, 100)?.label).toBe('Unmeasured')
  })
})

describe('assembling an EPK', () => {
  const library = [
    asset({ id: 1, kind: 'bio', label: 'Long bio', charCount: 900 }),
    asset({ id: 2, kind: 'bio', label: 'Short bio', charCount: 150 }),
    asset({ id: 3, kind: 'video', label: 'Live at the Park', value: 'https://v.example/1', reviewBy: '2026-08-01' }),
    asset({ id: 4, kind: 'audio', label: 'Latest record', value: 'https://a.example/1' }),
    asset({ id: 5, kind: 'photo', label: 'Press shot', value: 'https://p.example/1', credit: null }),
    asset({ id: 6, kind: 'document', label: 'Stage plot', value: 'https://d.example/1' }),
    asset({ id: 7, kind: 'fact', label: 'Set length', value: '45 minutes', reviewBy: null }),
    asset({ id: 8, kind: 'link', label: 'Website', value: 'https://example.com' }),
  ]

  it('cuts the same material differently for a festival and a sync agency', () => {
    const festival = assembleEpk(library, { audience: 'festival', today: TODAY })
    const sync = assembleEpk(library, { audience: 'sync', today: TODAY })

    // Nobody licensing a recording needs to know how many vocal mics you take.
    expect(festival.sections.map((s) => s.kind)).toContain('document')
    expect(sync.sections.map((s) => s.kind)).not.toContain('document')
    expect(sync.sections.map((s) => s.kind)).not.toContain('fact')
    expect(sync.sections.map((s) => s.kind)).toContain('audio')
  })

  it('counts what is wrong, because a complete-looking EPK of stale material is the failure mode', () => {
    const epk = assembleEpk(library, { audience: 'festival', today: TODAY })
    expect(epk.overdue).toBe(1)      // the live video
    expect(epk.unreviewed).toBe(1)   // the set length
    expect(epk.problems).toBe(1)     // the uncredited photo
  })

  it('names the kinds this audience expects and found nothing for', () => {
    const thin = assembleEpk([asset({ id: 1, kind: 'bio' })], { audience: 'press', today: TODAY })
    expect(thin.missing).toEqual(['photo', 'video', 'link'])
    expect(thin.sections).toHaveLength(1)
  })

  it('leaves archived material out entirely', () => {
    const epk = assembleEpk(
      [asset({ id: 1, kind: 'bio', archived: 1 }), asset({ id: 2, kind: 'bio', label: 'Live one' })],
      { audience: 'press', today: TODAY },
    )
    expect(epk.sections[0].assets.map((a) => a.label)).toEqual(['Live one'])
  })

  it('puts the longest bio first, so the section leads with the fullest one', () => {
    const epk = assembleEpk(library, { audience: 'press', today: TODAY })
    expect(epk.sections[0].assets.map((a) => a.label)).toEqual(['Long bio', 'Short bio'])
  })
})

describe('what an EPK says is wrong with it', () => {
  const TODAY_ = '2026-09-07'
  const make = (assets: ArtistAsset[]) => assembleEpk(assets, { audience: 'press', today: TODAY_ })

  it('says "one is", not "1 are"', () => {
    // A singular count under a plural verb is the sort of thing that ships and
    // then reads wrong forever, so both forms are pinned.
    const one = make([
      asset({ id: 1, kind: 'bio' }),
      asset({ id: 2, kind: 'photo', value: 'https://p/1.jpg', credit: null }),
      asset({ id: 3, kind: 'video', value: 'https://v/1' }),
      asset({ id: 4, kind: 'link', value: 'https://l' }),
    ])
    expect(epkWarnings(one)).toContain('One is missing something it needs.')
  })

  it('switches to the plural at two', () => {
    const two = make([
      asset({ id: 1, kind: 'bio' }),
      asset({ id: 2, kind: 'photo', value: 'https://p/1.jpg', credit: null }),
      asset({ id: 3, kind: 'photo', value: 'https://p/2.jpg', credit: null }),
      asset({ id: 4, kind: 'video', value: 'https://v/1' }),
      asset({ id: 5, kind: 'link', value: 'https://l' }),
    ])
    expect(epkWarnings(two)).toContain('2 are missing something they need.')
  })

  it('lists what is missing as a sentence, not a comma-separated dump', () => {
    const thin = make([asset({ id: 1, kind: 'bio' })])
    expect(epkWarnings(thin)).toContain('Nothing on file for press photos, live video and links.')
  })

  it('uses no list at all for a single missing kind', () => {
    const nearly = make([
      asset({ id: 1, kind: 'bio' }),
      asset({ id: 2, kind: 'photo', value: 'https://p/1.jpg', credit: 'R. N.' }),
      asset({ id: 3, kind: 'video', value: 'https://v/1' }),
    ])
    expect(epkWarnings(nearly)).toContain('Nothing on file for links.')
  })

  it('says nothing at all when nothing is wrong', () => {
    const clean = make([
      asset({ id: 1, kind: 'bio' }),
      asset({ id: 2, kind: 'photo', value: 'https://p/1.jpg', credit: 'R. N.' }),
      asset({ id: 3, kind: 'video', value: 'https://v/1' }),
      asset({ id: 4, kind: 'link', value: 'https://l' }),
    ])
    expect(epkWarnings(clean)).toEqual([])
  })
})
