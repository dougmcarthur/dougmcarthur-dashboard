/**
 * What a trip costs, and the paperwork that gates it.
 *
 * Step F of docs/gig-pipeline-plan.md, cost half.
 *
 * **Cost is a denominator, not a criterion.** The scoring half — the
 * swing-weighted `value` this number would divide into — is deliberately not
 * here. Those weights have to be elicited once against the real range of
 * opportunities, by the person whose taste is being encoded; shipping a
 * `value` before that would mean inventing them. So this module produces the
 * denominator and stops, and nothing in it returns a single blended score.
 * That restraint is the point: a blended number is how you end up applying to
 * something that scored 78 without noticing it costs $4,000.
 *
 * **Every figure is a range.** `$1,400–2,300` is honest; `$1,847` is a lie
 * with a decimal place. The bands below are hand-set and are the part of this
 * file meant to be argued with — they are named constants rather than numbers
 * buried in a sum for exactly that reason.
 *
 * Everything is CAD. The queue's rule applies here too: no function in this
 * file reads the clock. `today` is an argument.
 */

import type { GigOpportunity } from './types'

/** An estimate. Both ends always, never a midpoint. */
export interface CostRange {
  low: number
  high: number
}

export type TravelBand = 'local' | 'drive' | 'regional' | 'transcontinental' | 'international'
export type LodgingTier = 'none' | 'standard' | 'major'
export type PerformanceKind = 'showcase' | 'paid'
export type Country = 'CA' | 'US' | 'other'

/**
 * Return airfare or fuel, one person with gear, banded by distance from
 * Winnipeg. Bands rather than a distance calculation because the input is a
 * prose location and a computed 1,847 km would imply a precision the address
 * "Whitehorse, YT" does not carry.
 */
export const TRAVEL_BANDS: Record<TravelBand, { label: string; note: string; cost: CostRange }> = {
  // The band that was missing, and its absence was not cosmetic: a show at
  // Birds Hill Park, thirty kilometres out, priced as a regional *flight* at
  // $450–850, and one in Winnipeg itself as a $120–400 drive. Both are wrong
  // in the direction that matters most here — they make home-town gigs look
  // expensive, for an artist whose stated goal is expanding beyond Winnipeg.
  local: { label: 'Local', note: 'In or beside Winnipeg — fuel and parking', cost: { low: 0, high: 40 } },
  drive: { label: 'Drive', note: 'Within about 800 km of Winnipeg', cost: { low: 120, high: 400 } },
  regional: { label: 'Regional flight', note: 'Elsewhere in Canada, or the near US', cost: { low: 450, high: 850 } },
  transcontinental: { label: 'Transcontinental flight', note: 'A coast, or the far US', cost: { low: 700, high: 1400 } },
  international: { label: 'International flight', note: 'Overseas', cost: { low: 1300, high: 2600 } },
}

/** Per night. `none` is for a drive you sleep at home either side of, or a billet. */
export const LODGING_TIERS: Record<LodgingTier, { label: string; perNight: CostRange }> = {
  none: { label: 'Hosted or no overnight', perNight: { low: 0, high: 0 } },
  standard: { label: 'Standard', perNight: { low: 130, high: 200 } },
  major: { label: 'Major city', perNight: { low: 190, high: 330 } },
}

/** Food and ground transport, per day. Days are nights + 1: you eat on the way home. */
export const PER_DIEM: CostRange = { low: 55, high: 95 }

/**
 * How many nights a trip of each band usually takes, when nobody has said.
 *
 * A **range**, not a number, and that is what makes this honest rather than
 * the silent default the module refuses everywhere else. Guessing "1 night"
 * for a drive would decide between a day trip to Gimli and an overnight to
 * Thunder Bay by picking one; `0–1` says the estimate does not know which,
 * and the arithmetic already carries that all the way to the total.
 *
 * `nights` stated on the row still wins and is still exact. This only stops
 * every row that has never been edited from reporting a travel-only cost with
 * a gap where the lodging should be — which was all 34 of them.
 */
export const NIGHTS_BY_BAND: Record<TravelBand, { low: number; high: number }> = {
  // Nobody books a hotel in the city they live in.
  local: { low: 0, high: 0 },
  drive: { low: 0, high: 1 },
  regional: { low: 1, high: 2 },
  transcontinental: { low: 2, high: 3 },
  international: { low: 3, high: 5 },
}

/**
 * The rate is why a US figure is a range even where the fee is fixed. Wide
 * enough to cover an ordinary year and narrow enough to be worth having; it
 * is a constant so that revising it is one edit rather than a search.
 */
export const USD_CAD: CostRange = { low: 1.33, high: 1.42 }

/**
 * The P-2, which is the number that surprises people.
 *
 * A Canadian musician doing a **paid** US performance needs one: the USCIS
 * petition fee plus the CFM's administration on the Canadian side, and ninety
 * days of lead time. The lead time is the part that matters more than the
 * money — see `visaLead`, and see docs/gig-pipeline-plan.md §7 for sources.
 */
export const P2 = {
  uscisUsd: 510,
  cfmAdminCad: 120,
  leadTimeDays: 90,
} as const

export type VisaKind =
  /** No border to cross. */
  | 'none'
  /** A showcase or conference may go as a business visitor. Free. */
  | 'b1'
  /** A paid US performance. */
  | 'p2'
  /** Not answerable from what the row says. */
  | 'unknown'

export interface VisaRequirement {
  kind: VisaKind
  /** Null only when the rules for this country are not encoded here. */
  cost: CostRange | null
  /** Days of lead time the paperwork needs. 0 where there is no paperwork. */
  leadTimeDays: number
  /** Why, in a sentence, because a number nobody can check is a number nobody should trust. */
  reason: string
}

const add = (a: CostRange, b: CostRange): CostRange => ({ low: a.low + b.low, high: a.high + b.high })

/**
 * Cost minus income. The high end takes the *low* income and the high costs,
 * because a range subtracted the other way would report a best case as if it
 * were a worst one.
 */
const less = (cost: CostRange, income: CostRange): CostRange => ({
  low: cost.low - income.high,
  high: cost.high - income.low,
})

const scale = (r: CostRange, by: CostRange): CostRange => ({ low: r.low * by.low, high: r.high * by.high })

const flat = (n: number): CostRange => ({ low: n, high: n })

/** "2 nights", or "1\u20132 nights" where the span is a guess. */
function describeNights(span: { low: number; high: number }, unit = 'night'): string {
  const n = span.low === span.high ? `${span.low}` : `${span.low}\u2013${span.high}`
  return `${n} ${unit}${span.low === 1 && span.high === 1 ? '' : 's'}`
}

const round = (r: CostRange): CostRange => ({ low: Math.round(r.low), high: Math.round(r.high) })

/**
 * Squash a country into the only three answers the visa rule distinguishes.
 *
 * Generous about spelling because this column will be filled by the research
 * agents, by hand, and by neither consistently.
 */
export function normaliseCountry(raw: string | null | undefined): Country | null {
  if (!raw) return null
  // Trimmed *after* the squash: "U.S.A." leaves a trailing space behind.
  const t = raw.toLowerCase().replace(/[.\s]+/g, ' ').trim()
  if (!t) return null
  if (['ca', 'can', 'canada'].includes(t)) return 'CA'
  if (['us', 'usa', 'u s', 'u s a', 'united states', 'united states of america', 'america'].includes(t)) return 'US'
  return 'other'
}

/**
 * Places close enough to drive, and places far enough that "elsewhere in
 * Canada" is the wrong band for them.
 *
 * A convenience, not a gazetteer. `travel_band` is the column that decides;
 * these lists only stop the estimate being empty on the 34 rows that predate
 * the column, and every estimate says which of its bands were guessed.
 */
/**
 * Home, and the ring around it you would not sleep away from.
 *
 * Birds Hill Park is on this list because the Winnipeg Folk Festival is held
 * there and it is a half-hour drive, not because the list is trying to be a
 * gazetteer.
 */
const LOCAL_PLACES = [
  'winnipeg', 'birds hill', 'east st paul', 'west st paul', 'headingley',
  'oak bluff', 'lorette', 'niverville', 'st norbert', 'charleswood', 'transcona',
]

const DRIVE_PLACES = [
  'manitoba', 'winnipeg', 'brandon', 'gimli', 'dauphin', 'steinbach', 'selkirk', 'morden', 'winkler',
  'saskatchewan', 'regina', 'saskatoon', 'yorkton',
  'thunder bay', 'kenora', 'dryden', 'fort frances',
  'north dakota', 'fargo', 'grand forks', 'minot',
  'minneapolis', 'saint paul', 'st paul', 'duluth', 'minnesota',
]

const FAR_PLACES = [
  'british columbia', 'vancouver', 'victoria', 'kelowna', 'whistler',
  'yukon', 'whitehorse', 'northwest territories', 'yellowknife', 'nunavut', 'iqaluit',
  'nova scotia', 'halifax', 'new brunswick', 'moncton', 'fredericton', 'prince edward island',
  'charlottetown', 'newfoundland', "st john's", 'st johns',
  'california', 'los angeles', 'san francisco', 'oakland', 'san diego',
  'new york', 'brooklyn', 'boston', 'philadelphia', 'washington',
  'texas', 'austin', 'houston', 'dallas', 'florida', 'miami', 'georgia', 'atlanta',
  'seattle', 'portland', 'oregon', 'washington state', 'arizona', 'phoenix', 'new orleans', 'louisiana',
]

/** Cities where a room is a different animal. Same caveat as above. */
const MAJOR_CITIES = [
  'toronto', 'vancouver', 'montreal', 'montréal', 'calgary', 'ottawa',
  'new york', 'brooklyn', 'san francisco', 'los angeles', 'boston', 'chicago', 'seattle',
  'washington', 'austin', 'nashville', 'miami',
  'london', 'paris', 'amsterdam', 'berlin', 'dublin', 'tokyo', 'sydney', 'melbourne',
]

const mentions = (haystack: string, needles: string[]): boolean =>
  needles.some((n) => haystack.includes(n))

/**
 * A band guessed from the location string. Null means it could not be
 * guessed, which is a better answer than a default.
 */
export function inferTravelBand(location: string | null | undefined, country: Country | null): TravelBand | null {
  const t = (location ?? '').toLowerCase()
  if (t && mentions(t, LOCAL_PLACES)) return 'local'
  if (t && mentions(t, DRIVE_PLACES)) return 'drive'
  if (t && mentions(t, FAR_PLACES)) return 'transcontinental'
  // A Manitoba address is a drive at worst, whether or not the town is on a
  // list. The province is about 1,200 km end to end and the far corner of it
  // is still not a flight — "Birds Hill Park, MB" was banding as a regional
  // flight purely for not being a place anybody had named.
  if (/,\s*mb\b|\bmanitoba\b/.test(t)) return 'drive'
  if (country === 'other') return 'international'
  if (country === 'CA' || country === 'US') return 'regional'
  return null
}

/** A tier guessed from the location string. Defaults to `standard`, which is the common case. */
export function inferLodgingTier(location: string | null | undefined, band: TravelBand | null): LodgingTier {
  const t = (location ?? '').toLowerCase()
  if (t && mentions(t, MAJOR_CITIES)) return 'major'
  if (band === 'international') return 'major'
  return 'standard'
}

/**
 * Which permit, and how long before the show it has to start.
 *
 * The same festival costs $0 or about $800 in paperwork depending on one
 * fact, which is why `performance_kind` is a column rather than an
 * assumption. An unstated kind returns `unknown` and *keeps the ninety-day
 * lead time*: resolving the ambiguity in favour of the cheap answer is how
 * you discover the ninety days with sixty left.
 */
export function visaFor(input: { country: Country | null; performanceKind: PerformanceKind | null }): VisaRequirement {
  const { country, performanceKind } = input
  const p2Cost = round(add(scale(flat(P2.uscisUsd), USD_CAD), flat(P2.cfmAdminCad)))

  if (country === null) {
    return {
      kind: 'unknown',
      cost: null,
      leadTimeDays: 0,
      reason: 'No country on the row, so nothing can be said about a border.',
    }
  }
  if (country === 'CA') {
    return { kind: 'none', cost: flat(0), leadTimeDays: 0, reason: 'A Canadian date needs no permit.' }
  }
  if (country === 'other') {
    return {
      kind: 'unknown',
      cost: null,
      leadTimeDays: 0,
      reason: 'Outside Canada and the US. Only the US rule is encoded here — check this one by hand.',
    }
  }
  if (performanceKind === 'showcase') {
    return {
      kind: 'b1',
      cost: flat(0),
      leadTimeDays: 0,
      reason: 'A showcase or conference appearance may enter as a B-1 business visitor, which costs nothing.',
    }
  }
  if (performanceKind === 'paid') {
    return {
      kind: 'p2',
      cost: p2Cost,
      leadTimeDays: P2.leadTimeDays,
      reason: `A paid US performance needs a P-2: USD ${P2.uscisUsd} to USCIS plus about CAD ${P2.cfmAdminCad} in CFM administration, and ${P2.leadTimeDays} days of lead time.`,
    }
  }
  return {
    kind: 'unknown',
    cost: { low: 0, high: p2Cost.high },
    leadTimeDays: P2.leadTimeDays,
    reason: 'A US date, and nobody has said whether it is a showcase or a paid booking. Showcase is free; paid is a P-2 and ninety days.',
  }
}

const DAY = 86_400_000

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative when `to` is first. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN
  return Math.round((b - a) / DAY)
}

export interface VisaLead {
  requirement: VisaRequirement
  /** The date the count starts from — the deadline, or today once that has passed. */
  from: string
  /** Days between that date and the performance. */
  daysAvailable: number
  /** Fewer days than the permit needs. */
  short: boolean
  /**
   * False when the kind of performance is unstated, so the permit might not
   * apply at all. A question rather than a problem, and labelled as one.
   */
  certain: boolean
}

/**
 * Whether there is time to get the paperwork.
 *
 * The count starts at the **deadline**, not at today: you cannot file for a
 * performer's petition before somebody has agreed you are performing, and
 * nobody agrees before applications close. So a deadline sitting inside
 * ninety days of the show is a hard problem however good the opportunity is
 * — which is the whole reason this is a flag and not a line item in the cost.
 *
 * Null when the question does not arise: no permit needed, or no performance
 * date to count back from. An unknown answer is not the same as a safe one,
 * so `certain` carries that distinction rather than a null hiding it.
 */
export function visaLead(
  row: Pick<GigOpportunity, 'country' | 'performanceKind' | 'performanceStart' | 'deadline'>,
  today: string,
): VisaLead | null {
  const country = normaliseCountry(row.country)
  const requirement = visaFor({ country, performanceKind: performanceKindOf(row.performanceKind) })
  if (requirement.leadTimeDays === 0) return null

  const show = row.performanceStart?.slice(0, 10)
  if (!show || Number.isNaN(Date.parse(`${show}T00:00:00Z`))) return null

  // `deadline` holds prose on most rows. An unparseable one falls back to
  // today, which under-reports the risk rather than over-reporting it — the
  // wrong direction for a nudge, but the right one for a claim.
  const dl = row.deadline?.slice(0, 10) ?? ''
  const deadlineIsDate = /^\d{4}-\d{2}-\d{2}$/.test(dl) && !Number.isNaN(Date.parse(`${dl}T00:00:00Z`))
  const from = deadlineIsDate && dl > today ? dl : today

  const daysAvailable = daysBetween(from, show)
  if (Number.isNaN(daysAvailable)) return null

  return {
    requirement,
    from,
    daysAvailable,
    short: daysAvailable < requirement.leadTimeDays,
    certain: requirement.kind === 'p2',
  }
}

/** Narrow a stored string to the kinds this module knows, without asserting. */
export function performanceKindOf(raw: string | null | undefined): PerformanceKind | null {
  return raw === 'showcase' || raw === 'paid' ? raw : null
}

function travelBandOf(raw: string | null | undefined): TravelBand | null {
  return raw === 'drive' || raw === 'regional' || raw === 'transcontinental' || raw === 'international' ? raw : null
}

function lodgingTierOf(raw: string | null | undefined): LodgingTier | null {
  return raw === 'none' || raw === 'standard' || raw === 'major' ? raw : null
}

export interface CostLine {
  id: 'travel' | 'lodging' | 'per_diem' | 'visa' | 'entry_fee'
  label: string
  amount: CostRange
  /** The band came from a guess rather than from the row. Shown as "about". */
  inferred: boolean
}

export interface CostEstimate {
  lines: CostLine[]
  /** Everything they pay you. */
  income: CostRange
  /** Cost less income. Negative means the trip pays for itself. */
  net: CostRange
  visa: VisaRequirement
  /**
   * What could not be counted, each as a sentence. A cost estimate missing
   * its lodging is not a cheap gig, and the difference has to be on screen or
   * the number is worse than none.
   */
  unknowns: string[]
  /** True where any line was banded from a guess. */
  anyInferred: boolean
}

type CostRow = Pick<
  GigOpportunity,
  | 'location' | 'country' | 'travelBand' | 'lodgingTier' | 'nights' | 'performanceKind'
  | 'stipendAmount' | 'guaranteeAmount' | 'feeAmount' | 'feeCurrency' | 'paid'
>

/**
 * The whole trip, as a range, with what it could not count named beside it.
 *
 * Nothing is silently defaulted. A missing `nights` leaves lodging and per
 * diem out of the sum and puts a sentence in `unknowns`; it does not become
 * zero nights, because zero nights is a real answer that some rows genuinely
 * have and this is not one of them.
 */
export function estimateGigCost(row: CostRow): CostEstimate {
  const lines: CostLine[] = []
  const unknowns: string[] = []

  const country = normaliseCountry(row.country)
  const statedBand = travelBandOf(row.travelBand)
  const band = statedBand ?? inferTravelBand(row.location, country)

  if (band) {
    lines.push({
      id: 'travel',
      label: TRAVEL_BANDS[band].label,
      amount: TRAVEL_BANDS[band].cost,
      inferred: statedBand === null,
    })
  } else {
    unknowns.push('No travel band, and nothing in the location to guess one from.')
  }

  const statedNights = typeof row.nights === 'number' && row.nights >= 0 ? row.nights : null
  // Stated wins and is exact. Otherwise the band's usual span, as a range —
  // see NIGHTS_BY_BAND for why a range rather than a number.
  const nights: { low: number; high: number } | null =
    statedNights !== null
      ? { low: statedNights, high: statedNights }
      : band
      ? NIGHTS_BY_BAND[band]
      : null
  const nightsInferred = statedNights === null

  if (nights === null) {
    unknowns.push('Nights away is not set, and there is no travel band to guess it from.')
  } else if (nights.high > 0) {
    const statedTier = lodgingTierOf(row.lodgingTier)
    const tier = statedTier ?? inferLodgingTier(row.location, band)
    lines.push({
      id: 'lodging',
      label: `${LODGING_TIERS[tier].label}, ${describeNights(nights)}`,
      // The low end takes the fewest nights and the high end the most, so a
      // guessed span widens the total rather than moving it.
      amount: {
        low: LODGING_TIERS[tier].perNight.low * nights.low,
        high: LODGING_TIERS[tier].perNight.high * nights.high,
      },
      inferred: statedTier === null || nightsInferred,
    })
  }

  if (nights !== null) {
    const days = { low: nights.low + 1, high: nights.high + 1 }
    lines.push({
      id: 'per_diem',
      label: `Food and ground, ${describeNights(days, 'day')}`,
      amount: { low: PER_DIEM.low * days.low, high: PER_DIEM.high * days.high },
      inferred: nightsInferred,
    })
  }

  const visa = visaFor({ country, performanceKind: performanceKindOf(row.performanceKind) })
  if (visa.cost === null) {
    unknowns.push(visa.reason)
  } else if (visa.cost.high > 0) {
    lines.push({
      id: 'visa',
      label: visa.kind === 'p2' ? 'P-2 petition' : 'Work permit, if it turns out to be needed',
      amount: visa.cost,
      inferred: visa.kind === 'unknown',
    })
    if (visa.kind === 'unknown') unknowns.push(visa.reason)
  }

  // What you pay them to be looked at. Converted where it is in USD, for the
  // same reason the P-2 is: the number on the form is not the number that
  // leaves the account.
  if (row.feeAmount && row.feeAmount > 0) {
    const usd = (row.feeCurrency ?? 'USD').toUpperCase() === 'USD'
    lines.push({
      id: 'entry_fee',
      label: usd ? `Entry fee, USD ${row.feeAmount}` : `Entry fee, ${row.feeCurrency} ${row.feeAmount}`,
      amount: usd ? round(scale(flat(row.feeAmount), USD_CAD)) : flat(row.feeAmount),
      inferred: false,
    })
  } else if (row.paid === 1) {
    unknowns.push('There is an entry fee on this one and no amount recorded.')
  }

  const income = flat((row.stipendAmount ?? 0) + (row.guaranteeAmount ?? 0))
  const gross = lines.reduce((acc, l) => add(acc, l.amount), flat(0))

  return {
    lines,
    income,
    net: round(less(gross, income)),
    visa,
    unknowns,
    anyInferred: lines.some((l) => l.inferred),
  }
}

/**
 * `$1,400–2,300`, and `−$900–400` when the trip pays for itself.
 *
 * A range that straddles zero is spelled out with both signs rather than
 * squashed, because "−$200 to $900" and "$200–900" are different sentences.
 */
export function formatCostRange(r: CostRange): string {
  const bare = (v: number) => Math.round(Math.abs(v)).toLocaleString('en-CA')
  const money = (v: number) => `${Math.round(v) < 0 ? '\u2212' : ''}$${bare(v)}`
  const lo = Math.round(r.low)
  const hi = Math.round(r.high)

  if (lo === hi) return money(lo)
  // Same sign at both ends: one sign, one dollar mark, the pair after it.
  if ((lo < 0) === (hi < 0)) return `${money(lo)}\u2013${bare(hi)}`
  // Straddling zero, where squashing the signs would read as a plain range.
  return `${money(lo)} to ${money(hi)}`
}
