/**
 * How far a gig is from home, and what that says about getting there.
 *
 * The trip-cost estimate used to guess its travel band from place names on a
 * list written for Winnipeg — `LOCAL_PLACES`, `DRIVE_PLACES` — plus a rule for
 * Manitoba. Two things were wrong with that shape. It could not judge the
 * boundary that actually costs money, drive or fly, for anywhere nobody had
 * listed: Regina, Thunder Bay, Minneapolis. And it is Winnipeg's list, so for
 * any other artist every answer is wrong.
 *
 * So the distance is measured instead. `src/lib/travelEnrich.ts` geocodes the
 * gig's place with OpenStreetMap's Nominatim and routes the drive from the
 * artist's home base with OSRM, and caches the answer on the row. This file is
 * everything that follows from those numbers, and it reads no network and no
 * clock: which places can be looked up at all, the band a distance means, and
 * what a drive of that length costs and how many nights it takes.
 *
 * The rules the cost module holds still hold here: every figure is a range,
 * and a distance nobody measured is never a guess dressed as a measurement —
 * without one, the estimate falls back to the place-name guess and says so.
 */

import type { TravelBand } from './gigCost'

/**
 * Where a gig is: the location, or failing that a place the research agent
 * put at the end of the name.
 *
 * The agents often title a gig "The Listening Room — Lac du Bonnet, MB" and
 * leave `location` empty. Only that exact shape is read: a dash, then
 * "Town, XX" at the very end. A looser match would take an organisation for a
 * place — "(Manitoba Music)" is who runs a night, not where it is.
 */
export function placeOf(row: { location?: string | null; name?: string | null }): string | null {
  if (row.location?.trim()) return row.location
  const tail = (row.name ?? '').match(/[—–-]\s*([^—–-]+,\s*[A-Z]{2})\s*$/)
  return tail ? tail[1].trim() : null
}

/** Words that mean "no single place", whatever else the string says. */
const NOT_A_PLACE = /\b(national|nationwide|canada-wide|country-wide|online|virtual|remote|various|multiple|tbd|tba|anywhere|touring|international)\b/i

/**
 * A place worth looking up on a map, or null.
 *
 * "Town, Region" and nothing vaguer. A bare "Manitoba" geocodes to the middle
 * of the province and would report a precise distance to a point in the bush;
 * "National (Canada)" is a grant with no trip in it. Both are better left to
 * the place-name guess, which at least knows it is guessing.
 */
export function mappablePlace(row: { location?: string | null; name?: string | null }): string | null {
  const place = placeOf(row)?.trim()
  if (!place || NOT_A_PLACE.test(place)) return null
  const parts = place.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length < 2 || parts.some((p) => p.length > 60)) return null
  return parts.join(', ')
}

export interface Coordinates {
  lat: number
  lon: number
}

/** Great-circle distance in km. What a flight band turns on. */
export function crowKm(a: Coordinates, b: Coordinates): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/**
 * When routing is down or finds no road, a straight line scaled to roughly
 * what roads add, at highway pace. Marked `straight_line` wherever it is used,
 * because it is the rougher of the two answers.
 */
export const ROAD_FACTOR = 1.25
export const HIGHWAY_KMH = 85

export function estimateDrive(crow: number): { km: number; hours: number } {
  const km = crow * ROAD_FACTOR
  return { km, hours: km / HIGHWAY_KMH }
}

/**
 * The band a measured distance means.
 *
 * Road distance decides whether you drive — up to 800 km one way, which is
 * where `TRAVEL_BANDS.drive` has always drawn the line in words. Past that it
 * is a flight, and a flight's price turns on the straight line rather than the
 * road: under 1,850 km is a regional fare (Toronto from Winnipeg, Montreal),
 * beyond it the coasts and the far US. Overseas is international whatever the
 * distance, because the fare is.
 */
export const LOCAL_ROAD_KM = 60
export const DRIVE_ROAD_KM = 800
export const REGIONAL_CROW_KM = 1850

export function bandFromDistance(input: {
  roadKm: number
  crowKm: number
  overseas: boolean
}): TravelBand {
  if (input.overseas) return 'international'
  if (input.roadKm <= LOCAL_ROAD_KM) return 'local'
  if (input.roadKm <= DRIVE_ROAD_KM) return 'drive'
  return input.crowKm <= REGIONAL_CROW_KM ? 'regional' : 'transcontinental'
}

/**
 * A drive's cost from its length: fuel and wear, there and back, as a range.
 *
 * $0.15–0.25 a km covers a car's running cost from economical to not — the
 * same spread the fixed $120–400 drive band implied across its 800 km. Rounded
 * to ten dollars, because the precision of the rate does not reach the unit.
 */
export const DRIVE_COST_PER_KM = { low: 0.15, high: 0.25 }

export function driveCost(roadKm: number): { low: number; high: number } {
  const round = (n: number) => Math.round(n / 10) * 10
  return {
    low: round(2 * roadKm * DRIVE_COST_PER_KM.low),
    high: round(2 * roadKm * DRIVE_COST_PER_KM.high),
  }
}

/**
 * Nights away for a drive of this many hours one way, when nobody has said.
 *
 * Up to two hours is a day trip. Up to five you might come home after the set
 * or might not. Past five, playing and driving back the same night is a
 * night's sleep you do not get, so it is at least one.
 */
export function driveNights(hours: number): { low: number; high: number } {
  if (hours <= 2) return { low: 0, high: 0 }
  if (hours <= 5) return { low: 0, high: 1 }
  return { low: 1, high: 2 }
}

/** The measured distance for a row, or null when there is none to trust. */
export interface MeasuredDistance {
  roadKm: number
  roadHours: number
  crowKm: number
  source: 'route' | 'straight_line'
}

/**
 * The cached distance, if it is still about this gig's place.
 *
 * A location edited since the job last ran means the numbers are for somewhere
 * else, so they are not used until the job catches up — the estimate falls back
 * to the place-name guess for that hour rather than pricing the wrong town.
 */
export function measuredDistance(row: {
  location?: string | null
  name?: string | null
  geoStatus?: string | null
  geoPlace?: string | null
  roadKm?: number | null
  roadHours?: number | null
  crowKm?: number | null
  distanceSource?: string | null
}): MeasuredDistance | null {
  if (row.geoStatus !== 'found') return null
  if (!row.geoPlace || row.geoPlace !== mappablePlace(row)) return null
  if (row.roadKm == null || row.roadHours == null || row.crowKm == null) return null
  return {
    roadKm: row.roadKm,
    roadHours: row.roadHours,
    crowKm: row.crowKm,
    source: row.distanceSource === 'route' ? 'route' : 'straight_line',
  }
}

/** "1 h 20 min", for a drive. */
export function formatDriveTime(hours: number): string {
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * A link that opens the place in the reader's maps, or null when there is no
 * single place to open. A link and nothing embedded: nothing loads from any
 * map service until somebody clicks it.
 */
export function mapsLink(row: { location?: string | null; name?: string | null }): string | null {
  const place = mappablePlace(row)
  if (!place) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`
}
