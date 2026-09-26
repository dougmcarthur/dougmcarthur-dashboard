/**
 * OpenStreetMap, asked two questions: where is this place, and how far is the
 * drive between two points.
 *
 * Nominatim answers the first and OSRM's public server the second. Both are
 * free, both are run by volunteers, and both publish usage rules this file is
 * shaped around rather than merely aware of:
 *
 *  - **One request a second, from the whole app.** The caller paces itself
 *    (`travelEnrich.ts` waits between requests); nothing here is ever fired
 *    in a loop without that pause.
 *  - **Identify the application.** A generic library User-Agent is refused, so
 *    every request says it is Sun Dogs Music Scout and where it runs. It names
 *    the app, never a person.
 *  - **Cache the results.** Nothing is looked up on a page view: answers are
 *    stored on the gig by the hourly job, and asked again only when the place
 *    or the home base changes.
 *  - **Credit OpenStreetMap** wherever a figure derived from it is shown — the
 *    trip cost panel does.
 *
 * OSRM's public server is for reasonable non-commercial use and makes no
 * promise about uptime. Routing is therefore replaceable and never required:
 * when it is down, the job leaves the row for the next hour; when it finds no
 * road, a straight-line estimate stands in and says so.
 *
 * Three outcomes, kept apart on purpose, because they want different handling:
 * `found`, `not_found` (a verdict about the place — remembered, not retried
 * every hour) and `failed` (a fact about the network — no verdict, retried).
 */

import type { Coordinates } from '../../shared/travelDistance'
import type { Env } from '../types'

export type Lookup<T> = { outcome: 'found'; value: T } | { outcome: 'not_found' } | { outcome: 'failed'; reason: string }

export function userAgent(env: Pick<Env, 'DASHBOARD_URL'>): string {
  const site = (env.DASHBOARD_URL ?? '').replace(/\/$/, '') || 'https://scout.sundogsmusic.ca'
  return `SunDogsMusicScout/1.0 (+${site})`
}

const PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'])
const STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA',
  'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK',
  'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

/**
 * ISO country codes for Nominatim's `countrycodes`: from the gig's coarse
 * country when it has one, else from a trailing province or state code in the
 * place itself — which is how a home base typed as "Winnipeg, MB" narrows to
 * Canada without anybody choosing a country.
 */
export function countryCodes(country: string | null | undefined, place = ''): string | null {
  const c = (country ?? '').trim().toLowerCase()
  if (c === 'ca' || c === 'canada') return 'ca'
  if (c === 'us' || c === 'usa' || c === 'united states') return 'us'
  const code = place.match(/,\s*([A-Za-z]{2})\s*$/)?.[1]?.toUpperCase()
  if (code && PROVINCES.has(code)) return 'ca'
  if (code && STATES.has(code)) return 'us'
  return null
}

export interface NominatimResult {
  lat: string
  lon: string
  addresstype?: string
}

/** Where people live: what a gig in "Town, XX" means. */
const SETTLEMENTS = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'suburb', 'neighbourhood', 'locality'])
/** Whole regions: a centroid in the middle of one is not where a gig is. */
const AREAS = new Set(['country', 'state', 'province', 'region', 'state_district', 'county', 'district'])

/**
 * The best of Nominatim's candidates for a gig's place: a settlement if there
 * is one, else anything that is not a whole region — a park, a venue — else
 * whatever came first. Birds Hill Park, MB is a park and still resolves.
 */
export function pickPlace<T extends NominatimResult>(results: T[]): T | undefined {
  return (
    results.find((r) => SETTLEMENTS.has(r.addresstype ?? '')) ??
    results.find((r) => !AREAS.has(r.addresstype ?? '')) ??
    results[0]
  )
}

/**
 * Where a place is. `country` narrows the search, which is what lets a
 * province code resolve — "Lac du Bonnet, MB" finds the town in Canada — and
 * keeps London, ON from being London.
 */
export async function geocode(
  env: Pick<Env, 'DASHBOARD_URL'>,
  place: string,
  country: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Lookup<Coordinates>> {
  // Five candidates rather than one, because the top match is not always the
  // town: "Kenora, ON" ranks Kenora District — a county spanning northwestern
  // Ontario, 713 km away — above Kenora the city, 150 km away. See pickPlace.
  const params = new URLSearchParams({ q: place, format: 'jsonv2', limit: '5' })
  const codes = countryCodes(country, place)
  if (codes) params.set('countrycodes', codes)
  try {
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': userAgent(env), Accept: 'application/json' },
    })
    if (!res.ok) return { outcome: 'failed', reason: `Nominatim ${res.status}` }
    const results = (await res.json()) as NominatimResult[]
    const first = pickPlace(results)
    if (!first) return { outcome: 'not_found' }
    const lat = Number(first.lat)
    const lon = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { outcome: 'failed', reason: 'Nominatim returned no coordinates' }
    return { outcome: 'found', value: { lat, lon } }
  } catch (err) {
    return { outcome: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * The drive between two points, one way. `not_found` means there is no road —
 * Churchill, MB has none — which is a real answer, not an outage.
 */
export async function route(
  env: Pick<Env, 'DASHBOARD_URL'>,
  from: Coordinates,
  to: Coordinates,
  fetchImpl: typeof fetch = fetch,
): Promise<Lookup<{ km: number; hours: number }>> {
  const path = `${from.lon},${from.lat};${to.lon},${to.lat}`
  try {
    const res = await fetchImpl(`https://router.project-osrm.org/route/v1/driving/${path}?overview=false`, {
      headers: { 'User-Agent': userAgent(env), Accept: 'application/json' },
    })
    // OSRM answers "no route" with a 400 and a code, so the body is read
    // before the status is judged.
    const body = (await res.json().catch(() => null)) as
      | { code?: string; routes?: Array<{ distance: number; duration: number }> }
      | null
    if (body?.code === 'NoRoute' || body?.code === 'NoSegment') return { outcome: 'not_found' }
    if (!res.ok || body?.code !== 'Ok' || !body.routes?.[0]) {
      return { outcome: 'failed', reason: `OSRM ${res.status}${body?.code ? ` ${body.code}` : ''}` }
    }
    const { distance, duration } = body.routes[0]
    return { outcome: 'found', value: { km: distance / 1000, hours: duration / 3600 } }
  } catch (err) {
    return { outcome: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}
