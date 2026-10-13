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
import { homeRegionOf, regionOf } from './regions'
import { regionPoint } from './regionDistance'
import {
  bandFromDistance,
  crowKm,
  driveCost,
  driveNights,
  estimateDrive,
  formatDriveTime,
  measuredDistance,
  placeOf,
  type MeasuredDistance,
} from './travelDistance'
export { placeOf } from './travelDistance'

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
 * Return airfare or fuel, one person with gear, banded by distance from the
 * artist's home. Bands rather than a distance calculation because the input is
 * a prose location and a computed 1,847 km would imply a precision the address
 * "Whitehorse, YT" does not carry. Where a home base is set and the place is on
 * a map, the real distance picks the band instead; see `travelDistance.ts`.
 */
export const TRAVEL_BANDS: Record<TravelBand, { label: string; note: string; cost: CostRange }> = {
  // The band that was missing, and its absence was not cosmetic: a show at
  // Birds Hill Park, thirty kilometres out, priced as a regional *flight* at
  // $450–850, and one in Winnipeg itself as a $120–400 drive. Both are wrong
  // in the direction that matters most here — they make home-town gigs look
  // expensive, for an artist whose stated goal is expanding beyond Winnipeg.
  local: { label: 'Local, in town', note: 'In or beside your home town. Fuel and parking.', cost: { low: 0, high: 40 } },
  drive: { label: 'Driving', note: 'Within about 800 km of home. Fuel and wear, there and back.', cost: { low: 120, high: 400 } },
  regional: {
    label: 'Flights within Canada or the near US',
    note: 'Return airfare for you and your gear, elsewhere in Canada or the near US.',
    cost: { low: 450, high: 850 },
  },
  transcontinental: {
    label: 'Flights coast to coast, or the far US',
    note: 'Return airfare for you and your gear, to a coast or the far US.',
    cost: { low: 700, high: 1400 },
  },
  international: { label: 'Flights overseas', note: 'Return airfare for you and your gear, overseas.', cost: { low: 1300, high: 2600 } },
}

/**
 * Per night. `none` is for a drive you sleep at home either side of, or a billet.
 *
 * `stay` finishes the sentence "Accommodation, 2 nights ___", so a line says
 * what kind of room it priced rather than a bare tier name.
 */
export const LODGING_TIERS: Record<LodgingTier, { label: string; stay: string; perNight: CostRange }> = {
  none: { label: 'Hosted or no overnight', stay: 'with a host, at no cost', perNight: { low: 0, high: 0 } },
  standard: { label: 'Standard hotel', stay: 'in a standard hotel', perNight: { low: 130, high: 200 } },
  major: { label: 'Major-city hotel', stay: 'in a major-city hotel', perNight: { low: 190, high: 330 } },
}

/**
 * Food, and getting around once you are there, per day. Days are nights + 1:
 * you eat on the way home.
 *
 * Two lines on screen because they are two different things to a reader, and
 * one number labelled "food and ground" was neither. `PER_DIEM` is their sum
 * and is unchanged, so splitting them moved no total.
 */
export const MEALS_PER_DAY: CostRange = { low: 40, high: 70 }
export const GROUND_PER_DAY: CostRange = { low: 15, high: 25 }
export const PER_DIEM: CostRange = {
  low: MEALS_PER_DAY.low + GROUND_PER_DAY.low,
  high: MEALS_PER_DAY.high + GROUND_PER_DAY.high,
}

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
 * Where an artist travels from, as far as a guess needs to know it.
 *
 * Just the province: the guess below works between regions, and a city is
 * for the measured path. `place` is as the artist typed it, so a gig in the
 * same town can be told from a gig somewhere else in the province.
 */
export interface Home {
  region: string | null
  place?: string | null
}

/** The home the guess needs, from the place the artist typed: "Calgary, AB". */
export function homeFrom(place: string | null | undefined): Home | null {
  const trimmed = place?.trim()
  if (!trimmed) return null
  return { region: homeRegionOf(trimmed), place: trimmed }
}

const cityOf = (place: string | null | undefined): string =>
  (place ?? '').split(',')[0].trim().toLowerCase()

/**
 * A band guessed from the location string and, when it is known, where the
 * artist lives. Null means it could not be guessed, which is a better answer
 * than a default.
 *
 * It is the rule the measured path uses, applied to a coarser distance: the
 * straight line between the artist's province and the gig's, through
 * `bandFromDistance`. A gig in the artist's own province is a drive, and in
 * their own town is local. With no home it can only say Canada or the US is
 * elsewhere, which is a flight, and an overseas country is international. It
 * does not know anybody's home by default: it used to, and the answer was
 * Winnipeg's for everyone.
 */
export function inferTravelBand(
  location: string | null | undefined,
  country: Country | null,
  home?: Home | null,
): TravelBand | null {
  const t = (location ?? '').trim()
  if (/\b(online|virtual|remote)\b/i.test(t)) return null

  const region = regionOf(t)
  const homeRegion = home?.region ?? null

  if (homeRegion && region) {
    if (region.country === 'CA' && region.code === homeRegion) {
      return cityOf(t) && cityOf(t) === cityOf(home?.place) ? 'local' : 'drive'
    }
    const from = regionPoint(homeRegion, 'CA')
    const to = regionPoint(region.code, region.country)
    if (from && to) {
      const crow = crowKm(from, to)
      return bandFromDistance({ roadKm: estimateDrive(crow).km, crowKm: crow, overseas: false })
    }
  }

  if (country === 'other') return 'international'
  if (country === 'CA' || country === 'US') return 'regional'
  // No country on the row: a place that names a Canadian or US region has one.
  return region ? 'regional' : null
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
  id: 'travel' | 'lodging' | 'meals' | 'ground' | 'visa' | 'entry_fee'
  /** What it is, in the words a screen shows: "Flights", "Accommodation". */
  label: string
  /** What is inside it, in a sentence, so a figure never stands alone. */
  detail: string
  amount: CostRange
  /** The band came from a guess rather than from the row. Shown as "about". */
  inferred: boolean
  /**
   * Where a derived figure came from, when it was measured rather than
   * guessed: a road route, or a straight line when no route was available.
   * The screen credits OpenStreetMap beside either.
   */
  basis?: 'route' | 'straight_line'
}

/** Money they pay toward the trip, itemised the way the listing does. */
export interface PayLine {
  id: 'guarantee' | 'stipend'
  label: string
  detail: string
  amount: CostRange
}

/**
 * How the trip sits against what it pays, in words that do not treat spending
 * on a career as losing money.
 *
 * - `income`: it pays more than it costs, even at the expensive end.
 * - `even`: the two ranges overlap, so it could come out either way.
 * - `investment`: it costs more than it pays, even at the cheap end. Showcases,
 *   festivals and conferences are mostly this, and it is what they are for:
 *   being seen, in a room, by people who book.
 *
 * Decided from the *range*, never a midpoint, like everything else here: a
 * trip is only called income when the worst case still leaves you ahead.
 */
export type OutlookId = 'income' | 'even' | 'investment'

export interface Outlook {
  id: OutlookId
  /** The word on the badge. */
  label: string
  /** One sentence in dollars. Reads aloud on its own. */
  summary: string
  /**
   * The figure the summary is about, always positive where it can be: how far
   * ahead, or how much goes in. An `even` outlook keeps its signs, since it
   * runs from ahead to in.
   */
  amount: CostRange
  /** Whether any pay is recorded. Without it an investment is only the cost of taking part. */
  payKnown: boolean
}

export interface CostEstimate {
  lines: CostLine[]
  /** Every cost added up: the estimated total, before anything they pay. */
  gross: CostRange
  /** What they pay toward the trip, itemised. */
  payLines: PayLine[]
  /** Everything they pay you. */
  income: CostRange
  /** Cost less income. Negative means the trip pays for itself. */
  net: CostRange
  /** Null when there is nothing to set against anything: no cost counted, no pay recorded. */
  outlook: Outlook | null
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
> & Partial<Pick<
  GigOpportunity,
  'name' | 'geoStatus' | 'geoPlace' | 'roadKm' | 'roadHours' | 'crowKm' | 'distanceSource'
>>


/**
 * The travel line's words for a measured trip. A drive says its road distance
 * and time; a flight says how far away the place is, because the road would
 * be the wrong number twice over: nobody drives it, and the fare follows the
 * straight line if it follows anything. Home is "in town", not "0 km (0 min)".
 */
function distanceLabel(band: TravelBand, m: MeasuredDistance): string {
  const km = (n: number) => `${Math.round(n).toLocaleString('en-CA')} km`
  if (band === 'local' && m.roadKm < 5) return TRAVEL_BANDS.local.label
  if (band === 'local' || band === 'drive') {
    return `${TRAVEL_BANDS[band].label}, ${km(m.roadKm)} each way (about ${formatDriveTime(m.roadHours)})`
  }
  return `Flights, about ${km(m.crowKm)} away`
}

/**
 * The whole trip, as a range, with what it could not count named beside it.
 *
 * Nothing is silently defaulted. A missing `nights` leaves lodging and per
 * diem out of the sum and puts a sentence in `unknowns`; it does not become
 * zero nights, because zero nights is a real answer that some rows genuinely
 * have and this is not one of them.
 */
export function estimateGigCost(row: CostRow, home?: Home | null): CostEstimate {
  const lines: CostLine[] = []
  const unknowns: string[] = []

  const country = normaliseCountry(row.country)
  const statedBand = travelBandOf(row.travelBand)
  // A measured distance outranks the place-name guess and yields to a band a
  // person set. See shared/travelDistance.ts.
  const measured = statedBand ? null : measuredDistance(row)
  const band =
    statedBand ??
    (measured
      ? bandFromDistance({ roadKm: measured.roadKm, crowKm: measured.crowKm, overseas: country === 'other' })
      : inferTravelBand(placeOf(row), country, home))

  if (band) {
    // A drive is priced by its length when the length is known; a flight's
    // fare does not follow distance, so it keeps the band's range.
    const byDistance = measured && (band === 'drive' || band === 'local')
    lines.push({
      id: 'travel',
      label: measured ? distanceLabel(band, measured) : TRAVEL_BANDS[band].label,
      detail: TRAVEL_BANDS[band].note,
      amount: byDistance ? driveCost(measured.roadKm) : TRAVEL_BANDS[band].cost,
      inferred: statedBand === null,
      ...(measured ? { basis: measured.source } : {}),
    })
  } else {
    unknowns.push('No travel band, and nothing in the location to guess one from.')
  }

  const statedNights = typeof row.nights === 'number' && row.nights >= 0 ? row.nights : null
  // Stated wins and is exact. Otherwise the band's usual span, as a range,
  // see NIGHTS_BY_BAND for why a range rather than a number.
  const nights: { low: number; high: number } | null =
    statedNights !== null
      ? { low: statedNights, high: statedNights }
      : measured && band === 'drive'
      ? // A drive's nights follow its hours, not its band: an hour and a
        // quarter to Lac du Bonnet is a day trip, eight to Saskatoon is not.
        driveNights(measured.roadHours)
      : band
      ? NIGHTS_BY_BAND[band]
      : null
  const nightsInferred = statedNights === null

  if (nights === null) {
    unknowns.push('Nights away is not set, and there is no travel band to guess it from.')
  } else if (nights.high > 0) {
    const statedTier = lodgingTierOf(row.lodgingTier)
    const tier = statedTier ?? inferLodgingTier(placeOf(row), band)
    lines.push({
      id: 'lodging',
      label: `Accommodation, ${describeNights(nights)} ${LODGING_TIERS[tier].stay}`,
      detail: 'A room for each night you are away.',
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
      id: 'meals',
      label: `Meals, ${describeNights(days, 'day')}`,
      detail: 'Food on the way, while you are there, and on the way home.',
      amount: { low: MEALS_PER_DAY.low * days.low, high: MEALS_PER_DAY.high * days.high },
      inferred: nightsInferred,
    })
    lines.push({
      id: 'ground',
      label: `Local transport, ${describeNights(days, 'day')}`,
      detail: 'Taxis, transit and parking once you are there.',
      amount: { low: GROUND_PER_DAY.low * days.low, high: GROUND_PER_DAY.high * days.high },
      inferred: nightsInferred,
    })
  }

  const visa = visaFor({ country, performanceKind: performanceKindOf(row.performanceKind) })
  if (visa.cost === null) {
    unknowns.push(visa.reason)
  } else if (visa.cost.high > 0) {
    lines.push({
      id: 'visa',
      label: visa.kind === 'p2' ? 'US work permit (P-2)' : 'US work permit, if it turns out to be needed',
      detail:
        visa.kind === 'p2'
          ? 'The US petition fee, plus the Canadian Federation of Musicians’ paperwork.'
          : 'Only a paid booking needs one. A showcase usually does not.',
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
      label: usd ? `Entry fee (USD ${row.feeAmount})` : `Entry fee (${row.feeCurrency} ${row.feeAmount})`,
      detail: usd ? 'Paid to apply, converted to Canadian dollars.' : 'Paid to apply.',
      amount: usd ? round(scale(flat(row.feeAmount), USD_CAD)) : flat(row.feeAmount),
      inferred: false,
    })
  } else if (row.paid === 1) {
    unknowns.push('There is an entry fee on this one and no amount recorded.')
  }

  const payLines: PayLine[] = []
  if (row.guaranteeAmount && row.guaranteeAmount > 0) {
    payLines.push({
      id: 'guarantee',
      label: 'Performance fee',
      detail: 'What they pay you to play.',
      amount: flat(row.guaranteeAmount),
    })
  }
  if (row.stipendAmount && row.stipendAmount > 0) {
    payLines.push({
      id: 'stipend',
      label: 'Stipend',
      detail: 'Money toward your costs, whatever you play.',
      amount: flat(row.stipendAmount),
    })
  }

  const income = flat((row.stipendAmount ?? 0) + (row.guaranteeAmount ?? 0))
  const gross = round(lines.reduce((acc, l) => add(acc, l.amount), flat(0)))
  const net = round(less(gross, income))
  // Recorded as zero is a statement; not recorded is an absence. Only the
  // second leaves an investment saying it may not be the whole picture.
  const payKnown = row.guaranteeAmount != null || row.stipendAmount != null

  return {
    lines,
    gross,
    payLines,
    income,
    net,
    outlook: outlookOf({ gross, income, net, payKnown, costed: lines.length > 0 }),
    visa,
    unknowns,
    anyInferred: lines.some((l) => l.inferred),
  }
}

/**
 * Whether this trip is income, an investment, or could be either.
 *
 * The words are chosen, not neutral. Playing a showcase or a festival that does
 * not cover its costs is spending on being heard, and "loss" is the wrong
 * frame for it: it makes the most useful rooms in this business look like
 * mistakes. `test/gigCost.test.ts` fails if a word of loss gets back in.
 *
 * Null when there is nothing on either side: no cost counted and no pay
 * recorded. A label there would be a claim about a row that has none of the
 * inputs.
 */
export function outlookOf(input: {
  gross: CostRange
  income: CostRange
  net: CostRange
  payKnown: boolean
  /** At least one cost line was counted. */
  costed: boolean
}): Outlook | null {
  const { gross, income, net, payKnown, costed } = input
  if (!costed && income.high <= 0) return null

  // Pay with nothing counted against it: say what it pays and no more. "You
  // come out ahead" of costs that were never counted is not a claim to make.
  if (!costed) {
    return {
      id: 'income',
      label: 'Income',
      summary: `Pays about ${formatCostRange(income)}. No costs are counted against it yet.`,
      amount: income,
      payKnown,
    }
  }

  if (gross.high === 0 && income.high === 0) return null

  if (net.low === 0 && net.high === 0) {
    return { id: 'even', label: 'Pays its way', summary: 'Pays about what it costs.', amount: net, payKnown }
  }

  if (net.high <= 0) {
    const ahead = { low: -net.high, high: -net.low }
    return {
      id: 'income',
      label: 'Income',
      summary: `Pays more than it costs. You come out about ${formatCostRange(ahead)} ahead.`,
      amount: ahead,
      payKnown,
    }
  }

  if (net.low >= 0) {
    return {
      id: 'investment',
      label: 'Investment',
      summary: payKnown
        ? `Costs more than it pays. You put in about ${formatCostRange(net)}, after what they pay you.`
        : `You put in about ${formatCostRange(net)} to take part. No pay is recorded for this one.`,
      amount: net,
      payKnown,
    }
  }

  return {
    id: 'even',
    label: 'Could pay its way',
    summary:
      `Could go either way, from about ${formatCostRange({ low: -net.low, high: -net.low })} ahead ` +
      `to ${formatCostRange({ low: net.high, high: net.high })} put in.`,
    amount: net,
    payKnown,
  }
}

/**
 * Where a trip sits between a big investment and a big payout, for the scale
 * on the cost panel.
 *
 * Positions run 0 to 1 with **0 the bigger-investment end, 1 the bigger-payout
 * end and 0.5 even**. A trip is a range, so it is a bar and not a point: a bar
 * that straddles the middle says "could go either way" without a word.
 *
 * The scale is not linear, and the reason is the one this graphic exists for. A
 * $200 trip and a $4,000 one have to read as different sizes, and on a straight
 * line out to $5,000 the first would be a hairline beside the middle. Each side
 * is logarithmic from a $100 knee, so the first few hundred dollars get real
 * room and the ends are for the trips that genuinely are big. Past $5,000 a
 * bar stops at the edge rather than leaving the track.
 */
export const SCALE_LIMIT = 5000
const SCALE_KNEE = 100

/** `ahead` is positive when the trip pays, negative when it costs. */
export function scalePosition(ahead: number): number {
  const side = Math.sign(ahead) * Math.log1p(Math.abs(ahead) / SCALE_KNEE) / Math.log1p(SCALE_LIMIT / SCALE_KNEE)
  return 0.5 + 0.5 * Math.max(-1, Math.min(1, side))
}

export interface OutlookScale {
  /** Left and right edge of the bar, 0 to 1. Always `from <= to`. */
  from: number
  to: number
  /** The range ran past the scale's end, and the bar was stopped there. */
  clippedLeft: boolean
  clippedRight: boolean
  /** Fixed marks, so the track reads as a scale and not a bar in a box. */
  ticks: Array<{ position: number; ahead: number }>
}

const SCALE_TICKS = [-2000, -500, 500, 2000]

export function outlookScale(net: CostRange): OutlookScale {
  // Net is cost less pay, so a bigger net is further toward the investment end.
  return {
    from: scalePosition(-net.high),
    to: scalePosition(-net.low),
    clippedLeft: -net.high < -SCALE_LIMIT,
    clippedRight: -net.low > SCALE_LIMIT,
    ticks: SCALE_TICKS.map((ahead) => ({ position: scalePosition(ahead), ahead })),
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
