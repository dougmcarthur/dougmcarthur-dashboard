/**
 * Measure how far each gig is from home, and cache the answer on the gig.
 *
 * Run from the hourly cron, per tenant, a few gigs at a time. A gig is looked
 * at only when its place or the artist's home base has changed since its
 * numbers were written (`geo_place`, `geo_home`) — so after the first pass the
 * job asks nothing of anybody until something is edited, which is what both
 * services' usage rules ask for. See src/lib/geo.ts for those rules and
 * shared/travelDistance.ts for what the numbers are used for.
 *
 * **The home base is the artist's**, a tenant setting, and there is no default.
 * Without one the job does nothing and the cost panel keeps guessing from place
 * names, and says so — a distance from a home nobody set is a guess dressed as
 * a measurement.
 *
 * Three rules about failure:
 *  - A place Nominatim does not know is written as `not_found` with the place
 *    it was asked about, so it is not asked again every hour; editing the
 *    location asks again.
 *  - A network failure writes nothing, so the next hour retries it.
 *  - A place with no road to it gets a straight-line estimate, marked
 *    `straight_line`, rather than no distance at all.
 */

import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, tenantSettings } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { readGigs } from '../db/gigRows'
import { crowKm, estimateDrive, mappablePlace, type Coordinates } from '../../shared/travelDistance'
import { geocode, route } from './geo'
import type { Env } from '../types'

export const HOME_KEY = 'travel.home'

export interface HomeBase extends Coordinates {
  /** As the artist typed it: "Winnipeg, MB". */
  place: string
}

export async function readHome(env: Env, tenant: TenantId): Promise<HomeBase | null> {
  const row = await getDb(env.DB)
    .select()
    .from(tenantSettings)
    .where(scoped(tenantSettings, tenant, eq(tenantSettings.key, HOME_KEY)))
    .get()
  if (!row) return null
  try {
    const home = JSON.parse(row.value) as HomeBase
    return typeof home.lat === 'number' && typeof home.lon === 'number' && home.place ? home : null
  } catch {
    // A home nobody can read is no home, never a guess at one.
    return null
  }
}

export async function writeHome(env: Env, tenant: TenantId, home: HomeBase | null): Promise<void> {
  const db = getDb(env.DB)
  // Delete-then-insert, for the reason `writeTenantSetting` gives: an upsert
  // names a uniqueness constraint, and naming none survives any change to it.
  await db.delete(tenantSettings).where(scoped(tenantSettings, tenant, eq(tenantSettings.key, HOME_KEY)))
  if (!home) return
  await db
    .insert(tenantSettings)
    .values(withTenant(tenant, { key: HOME_KEY, value: JSON.stringify(home), updatedAt: new Date().toISOString() }))
}

/** Waits between requests. Replaced in tests. */
export type Pause = (ms: number) => Promise<void>
const wait: Pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A second and a little over: both services allow one request a second from the whole app. */
export const REQUEST_GAP_MS = 1100

export interface EnrichResult {
  measured: number
  notFound: number
  failed: number
  cleared: number
  /** Gigs still waiting, for the next hour. */
  remaining: number
  noHome: boolean
}

export async function enrichTravel(
  env: Env,
  tenant: TenantId,
  options: {
    limit?: number
    now?: Date
    fetchImpl?: typeof fetch
    pause?: Pause
    /**
     * The caller has just made a request of its own — saving a home base looks
     * it up — so even the first request here waits its second.
     */
    afterRequest?: boolean
  } = {},
): Promise<EnrichResult> {
  const { limit = 10, now = new Date(), fetchImpl = fetch, pause = wait, afterRequest = false } = options
  const result: EnrichResult = { measured: 0, notFound: 0, failed: 0, cleared: 0, remaining: 0, noHome: false }

  const home = await readHome(env, tenant)
  if (!home) {
    result.noHome = true
    return result
  }

  const db = getDb(env.DB)
  const gigs = await db
    .select()
    .from(gigOpportunities)
    .where(scoped(gigOpportunities, tenant))
    .then(readGigs)

  const EMPTY = {
    geoPlace: null, geoHome: null, geoStatus: null, geoLat: null, geoLon: null,
    roadKm: null, roadHours: null, crowKm: null, distanceSource: null,
  }
  const write = (id: number, values: Partial<typeof gigOpportunities.$inferInsert>) =>
    db
      .update(gigOpportunities)
      .set({ ...values, geoCheckedAt: now.toISOString() })
      .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, id)))

  // A gig whose location stopped being a place ("National (Canada)" after an
  // edit) loses its old numbers, so nothing prices the town it used to name.
  for (const g of gigs) {
    if (!mappablePlace(g) && g.geoStatus) {
      await write(g.id, EMPTY)
      result.cleared++
    }
  }

  const stale = gigs.filter((g) => {
    const place = mappablePlace(g)
    return place !== null && (g.geoPlace !== place || g.geoHome !== home.place)
  })
  result.remaining = Math.max(0, stale.length - limit)

  let requests = afterRequest ? 1 : 0
  const paced = async <T>(call: () => Promise<T>): Promise<T> => {
    if (requests++ > 0) await pause(REQUEST_GAP_MS)
    return call()
  }

  for (const g of stale.slice(0, limit)) {
    const place = mappablePlace(g)!

    // Only the home moved: the gig's own coordinates are still good.
    let at: Coordinates | null =
      g.geoPlace === place && g.geoStatus === 'found' && g.geoLat != null && g.geoLon != null
        ? { lat: g.geoLat, lon: g.geoLon }
        : null

    if (!at) {
      const found = await paced(() => geocode(env, place, g.country, fetchImpl))
      if (found.outcome === 'failed') {
        result.failed++
        continue
      }
      if (found.outcome === 'not_found') {
        await write(g.id, { ...EMPTY, geoPlace: place, geoHome: home.place, geoStatus: 'not_found' })
        result.notFound++
        continue
      }
      at = found.value
    }

    const crow = crowKm(home, at)
    const drive = await paced(() => route(env, home, at!, fetchImpl))
    if (drive.outcome === 'failed') {
      result.failed++
      continue
    }
    // A road shorter than the straight line is not a road: the router snapped
    // an endpoint somewhere it could reach. Seen for real — Glasgow, Scotland
    // came back as a 1,004 km drive from Winnipeg, 5,789 km away. Treated as
    // no route, which is what it is.
    const routed = drive.outcome === 'found' && drive.value.km >= crow * 0.95 ? drive.value : null
    const road = routed ?? estimateDrive(crow)

    await write(g.id, {
      geoPlace: place,
      geoHome: home.place,
      geoStatus: 'found',
      geoLat: at.lat,
      geoLon: at.lon,
      roadKm: Math.round(road.km * 10) / 10,
      roadHours: Math.round(road.hours * 100) / 100,
      crowKm: Math.round(crow * 10) / 10,
      distanceSource: routed ? 'route' : 'straight_line',
    })
    result.measured++
  }

  return result
}
