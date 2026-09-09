import { describe, it, expect } from 'vitest'
import {
  normaliseCountry,
  inferTravelBand,
  inferLodgingTier,
  visaFor,
  visaLead,
  estimateGigCost,
  formatCostRange,
  performanceKindOf,
  TRAVEL_BANDS,
  LODGING_TIERS,
  PER_DIEM,
  P2,
} from '../shared/gigCost'
import type { GigOpportunity } from '../shared/types'

// Fixtures date from TODAY, never from the clock. A suite that passes today
// and fails tomorrow fails in CI on somebody else's change.
const TODAY = '2027-01-15'

/** `TODAY` plus n days, as YYYY-MM-DD. */
function day(n: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

function gig(o: Partial<GigOpportunity>): GigOpportunity {
  return {
    id: 1, name: 'A festival', type: 'festival', organizer: null, submissionMethod: null,
    audienceSize: null, genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null,
    feeAmount: null, feeCurrency: 'USD', fee: null, paid: 0, fitNotes: null, fitRationale: null,
    url: null, status: 'shortlisted', googleEventId: null, snoozedUntil: null, snoozedAt: null,
    discoveredAt: TODAY, updatedAt: TODAY, ...o,
  }
}

describe('normaliseCountry', () => {
  it('squashes the spellings the agents and the keyboard produce', () => {
    for (const raw of ['CA', 'ca', 'Canada', ' canada ', 'Can']) {
      expect(normaliseCountry(raw)).toBe('CA')
    }
    for (const raw of ['US', 'usa', 'U.S.A.', 'United States', 'America']) {
      expect(normaliseCountry(raw)).toBe('US')
    }
  })

  it('is null for nothing, and "other" for somewhere real that is neither', () => {
    expect(normaliseCountry(null)).toBeNull()
    expect(normaliseCountry('  ')).toBeNull()
    expect(normaliseCountry('Ireland')).toBe('other')
  })
})

describe('inferTravelBand', () => {
  it('drives to the places you can drive to', () => {
    expect(inferTravelBand('Brandon, MB', 'CA')).toBe('drive')
    expect(inferTravelBand('Thunder Bay, ON', 'CA')).toBe('drive')
    // Across the border and still a drive. The band is distance, not country.
    expect(inferTravelBand('Fargo, ND', 'US')).toBe('drive')
  })

  it('does not call a coast "elsewhere in Canada"', () => {
    expect(inferTravelBand('Halifax, NS', 'CA')).toBe('transcontinental')
    expect(inferTravelBand('Whitehorse, YT', 'CA')).toBe('transcontinental')
    expect(inferTravelBand('Austin, TX', 'US')).toBe('transcontinental')
  })

  it('falls back to the country, and to null when there is nothing to go on', () => {
    expect(inferTravelBand('Ottawa, ON', 'CA')).toBe('regional')
    expect(inferTravelBand('Dublin', 'other')).toBe('international')
    // The honest answer. A default here would report a cheap gig.
    expect(inferTravelBand(null, null)).toBeNull()
    expect(inferTravelBand('Somewhere', null)).toBeNull()
  })
})

describe('inferLodgingTier', () => {
  it('knows the cities where a room is a different animal', () => {
    expect(inferLodgingTier('Toronto, ON', 'regional')).toBe('major')
    expect(inferLodgingTier('Brooklyn, NY', 'transcontinental')).toBe('major')
  })

  it('is standard otherwise, and major for anywhere overseas', () => {
    expect(inferLodgingTier('Gimli, MB', 'drive')).toBe('standard')
    expect(inferLodgingTier(null, 'international')).toBe('major')
  })
})

describe('the visa rule', () => {
  it('costs nothing at home', () => {
    const v = visaFor({ country: 'CA', performanceKind: 'paid' })
    expect(v.kind).toBe('none')
    expect(v.cost).toEqual({ low: 0, high: 0 })
    expect(v.leadTimeDays).toBe(0)
  })

  it('is a B-1 and free for a US showcase', () => {
    const v = visaFor({ country: 'US', performanceKind: 'showcase' })
    expect(v.kind).toBe('b1')
    expect(v.cost).toEqual({ low: 0, high: 0 })
    expect(v.leadTimeDays).toBe(0)
  })

  it('is a P-2 and ninety days for a paid US date', () => {
    const v = visaFor({ country: 'US', performanceKind: 'paid' })
    expect(v.kind).toBe('p2')
    expect(v.leadTimeDays).toBe(P2.leadTimeDays)
    // USD 510 at the exchange band, plus the CFM's CAD 120. Roughly $800.
    expect(v.cost!.low).toBeGreaterThan(750)
    expect(v.cost!.high).toBeLessThan(850)
    expect(v.cost!.low).toBeLessThan(v.cost!.high)
  })

  it('keeps the ninety days when nobody has said which it is', () => {
    // The whole point. Resolving the ambiguity in favour of the cheap answer
    // is how you find out about the lead time with sixty days left.
    const v = visaFor({ country: 'US', performanceKind: null })
    expect(v.kind).toBe('unknown')
    expect(v.leadTimeDays).toBe(P2.leadTimeDays)
    expect(v.cost).toEqual({ low: 0, high: visaFor({ country: 'US', performanceKind: 'paid' }).cost!.high })
  })

  it('says so rather than guessing for a country it does not encode', () => {
    const v = visaFor({ country: 'other', performanceKind: 'paid' })
    expect(v.kind).toBe('unknown')
    expect(v.cost).toBeNull()
    expect(v.reason).toMatch(/by hand/)
  })
})

describe('visaLead — whether there is time to get the paperwork', () => {
  it('does not arise where no permit is needed', () => {
    expect(visaLead(gig({ country: 'CA', performanceKind: 'paid', performanceStart: day(200) }), TODAY)).toBeNull()
    expect(visaLead(gig({ country: 'US', performanceKind: 'showcase', performanceStart: day(30) }), TODAY)).toBeNull()
  })

  it('does not arise without a date to count back from', () => {
    expect(visaLead(gig({ country: 'US', performanceKind: 'paid', performanceStart: null }), TODAY)).toBeNull()
  })

  it('counts from the deadline, not from today', () => {
    // A show 150 days out looks safe from here. It is not: applications do not
    // close for another 100 days, and nobody files a performer's petition
    // before somebody has agreed you are performing.
    const lead = visaLead(
      gig({ country: 'US', performanceKind: 'paid', deadline: day(100), performanceStart: day(150) }),
      TODAY,
    )!
    expect(lead.from).toBe(day(100))
    expect(lead.daysAvailable).toBe(50)
    expect(lead.short).toBe(true)
    expect(lead.certain).toBe(true)
  })

  it('counts from today once the deadline has passed', () => {
    const lead = visaLead(
      gig({ country: 'US', performanceKind: 'paid', deadline: day(-10), performanceStart: day(200) }),
      TODAY,
    )!
    expect(lead.from).toBe(TODAY)
    expect(lead.daysAvailable).toBe(200)
    expect(lead.short).toBe(false)
  })

  it('falls back to today on a prose deadline, which under-reports rather than over-reports', () => {
    const lead = visaLead(
      gig({
        country: 'US', performanceKind: 'paid',
        deadline: 'None — rolling artist roster intake', performanceStart: day(200),
      }),
      TODAY,
    )!
    expect(lead.from).toBe(TODAY)
    expect(lead.short).toBe(false)
  })

  it('is uncertain, not silent, when the kind of performance is unstated', () => {
    const lead = visaLead(gig({ country: 'US', performanceKind: null, performanceStart: day(40) }), TODAY)!
    expect(lead.short).toBe(true)
    expect(lead.certain).toBe(false)
  })

  it('sits exactly on the boundary the right way round', () => {
    const at = visaLead(gig({ country: 'US', performanceKind: 'paid', performanceStart: day(90) }), TODAY)!
    expect(at.daysAvailable).toBe(90)
    expect(at.short).toBe(false)
    const under = visaLead(gig({ country: 'US', performanceKind: 'paid', performanceStart: day(89) }), TODAY)!
    expect(under.short).toBe(true)
  })
})

describe('estimateGigCost', () => {
  it('adds the bands up and reports a range at both ends', () => {
    const e = estimateGigCost(gig({
      country: 'CA', location: 'Gimli, MB', travelBand: 'drive',
      lodgingTier: 'standard', nights: 2,
    }))

    const expected = {
      low: TRAVEL_BANDS.drive.cost.low + LODGING_TIERS.standard.perNight.low * 2 + PER_DIEM.low * 3,
      high: TRAVEL_BANDS.drive.cost.high + LODGING_TIERS.standard.perNight.high * 2 + PER_DIEM.high * 3,
    }
    expect(e.net).toEqual(expected)
    expect(e.net.low).toBeLessThan(e.net.high)
    expect(e.unknowns).toEqual([])
    expect(e.anyInferred).toBe(false)
  })

  it('does not count a missing nights as zero nights', () => {
    // The original concern, and it still holds: null must not quietly become
    // a day trip. What changed is the alternative — a band's usual span,
    // marked as guessed, rather than a gap where the lodging should be. All
    // 34 production rows had a null here, so the gap was every row.
    const e = estimateGigCost(gig({ country: 'CA', travelBand: 'regional', nights: null }))
    expect(e.lines.map((l) => l.id)).toEqual(['travel', 'lodging', 'per_diem'])
    expect(e.lines.find((l) => l.id === 'lodging')!.inferred).toBe(true)
    expect(e.lines.find((l) => l.id === 'per_diem')!.inferred).toBe(true)
    // Regional is 1–2 nights, so the low end is not a day trip.
    expect(e.lines.find((l) => l.id === 'lodging')!.amount.low).toBeGreaterThan(0)
    expect(e.anyInferred).toBe(true)

    const zero = estimateGigCost(gig({ country: 'CA', travelBand: 'regional', nights: 0 }))
    // Stated wins, is exact, and is not marked as a guess.
    expect(zero.lines.map((l) => l.id)).toEqual(['travel', 'per_diem'])
    expect(zero.lines.find((l) => l.id === 'per_diem')!.inferred).toBe(false)
    expect(zero.unknowns).toEqual([])
  })

  it('still reports a gap when there is no band to guess the nights from', () => {
    const e = estimateGigCost(gig({ nights: null }))
    expect(e.lines).toEqual([])
    expect(e.unknowns.join(' ')).toMatch(/no travel band to guess it from/i)
  })

  it('widens the total rather than moving it when the nights are guessed', () => {
    const guessed = estimateGigCost(gig({ country: 'CA', travelBand: 'drive', nights: null }))
    const stated = estimateGigCost(gig({ country: 'CA', travelBand: 'drive', nights: 0 }))
    // Drive is 0–1 nights, so the guess reaches down to the day trip and up
    // past it. A span that only moved the number would be a different claim.
    expect(guessed.net.low).toBe(stated.net.low)
    expect(guessed.net.high).toBeGreaterThan(stated.net.high)
  })

  it('marks a band it had to guess', () => {
    const e = estimateGigCost(gig({ country: 'CA', location: 'Halifax, NS', nights: 1 }))
    expect(e.anyInferred).toBe(true)
    expect(e.lines.find((l) => l.id === 'travel')!.inferred).toBe(true)
    expect(e.lines.find((l) => l.id === 'travel')!.amount).toEqual(TRAVEL_BANDS.transcontinental.cost)
  })

  it('names what it could not band at all', () => {
    const e = estimateGigCost(gig({ nights: 0 }))
    expect(e.lines.map((l) => l.id)).toEqual(['per_diem'])
    expect(e.unknowns.join(' ')).toMatch(/No travel band/)
  })

  it('subtracts what they pay you, taking the low income against the high cost', () => {
    const e = estimateGigCost(gig({
      country: 'CA', travelBand: 'drive', nights: 0, guaranteeAmount: 400, stipendAmount: 100,
    }))
    const gross = {
      low: TRAVEL_BANDS.drive.cost.low + PER_DIEM.low,
      high: TRAVEL_BANDS.drive.cost.high + PER_DIEM.high,
    }
    expect(e.income).toEqual({ low: 500, high: 500 })
    expect(e.net).toEqual({ low: gross.low - 500, high: gross.high - 500 })
  })

  it('converts a USD entry fee, because the number on the form is not the number that leaves the account', () => {
    const e = estimateGigCost(gig({ country: 'CA', travelBand: 'drive', nights: 0, feeAmount: 50, feeCurrency: 'USD' }))
    const fee = e.lines.find((l) => l.id === 'entry_fee')!
    expect(fee.amount.low).toBeGreaterThan(50)
    expect(fee.amount.low).toBeLessThan(fee.amount.high)

    const cad = estimateGigCost(gig({ country: 'CA', travelBand: 'drive', nights: 0, feeAmount: 50, feeCurrency: 'CAD' }))
    expect(cad.lines.find((l) => l.id === 'entry_fee')!.amount).toEqual({ low: 50, high: 50 })
  })

  it('raises an entry fee with no amount rather than costing it at nothing', () => {
    const e = estimateGigCost(gig({ country: 'CA', travelBand: 'drive', nights: 0, paid: 1, feeAmount: null }))
    expect(e.lines.find((l) => l.id === 'entry_fee')).toBeUndefined()
    expect(e.unknowns.join(' ')).toMatch(/no amount recorded/)
  })

  it('puts the P-2 in the sum, and the open question in the unknowns', () => {
    const paid = estimateGigCost(gig({ country: 'US', performanceKind: 'paid', travelBand: 'regional', nights: 2 }))
    expect(paid.lines.find((l) => l.id === 'visa')!.inferred).toBe(false)
    expect(paid.unknowns).toEqual([])

    const unsaid = estimateGigCost(gig({ country: 'US', performanceKind: null, travelBand: 'regional', nights: 2 }))
    expect(unsaid.lines.find((l) => l.id === 'visa')!.inferred).toBe(true)
    expect(unsaid.unknowns.join(' ')).toMatch(/showcase or a paid booking/)

    const showcase = estimateGigCost(gig({ country: 'US', performanceKind: 'showcase', travelBand: 'regional', nights: 2 }))
    expect(showcase.lines.find((l) => l.id === 'visa')).toBeUndefined()
    // The same festival, $0 or about $800, on one fact.
    expect(paid.net.high - showcase.net.high).toBeGreaterThan(700)
  })

  it('never returns a single blended score', () => {
    // Step F's scoring half is not built, and a `value` invented here would be
    // five weights nobody was asked for. Both numbers or neither.
    const e = estimateGigCost(gig({ country: 'CA', travelBand: 'drive', nights: 0 }))
    expect(Object.keys(e)).not.toContain('score')
    expect(Object.keys(e)).not.toContain('efficiency')
    expect(Object.keys(e)).not.toContain('value')
  })
})

describe('formatCostRange', () => {
  it('is a range, never a midpoint', () => {
    expect(formatCostRange({ low: 1400, high: 2300 })).toBe('$1,400–2,300')
  })

  it('collapses only when both ends really are the same', () => {
    expect(formatCostRange({ low: 400, high: 400 })).toBe('$400')
  })

  it('spells out a range that straddles zero rather than squashing the signs', () => {
    expect(formatCostRange({ low: -200, high: 900 })).toBe('−$200 to $900')
    expect(formatCostRange({ low: -900, high: -400 })).toBe('−$900–400')
  })
})

describe('performanceKindOf', () => {
  it('narrows without asserting — status columns are not a closed set', () => {
    expect(performanceKindOf('paid')).toBe('paid')
    expect(performanceKindOf('showcase')).toBe('showcase')
    expect(performanceKindOf('Paid')).toBeNull()
    expect(performanceKindOf('busking')).toBeNull()
    expect(performanceKindOf(null)).toBeNull()
  })
})
