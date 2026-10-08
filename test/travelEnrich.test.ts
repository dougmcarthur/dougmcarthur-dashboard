import { describe, it, expect } from 'vitest'
import { asTenantId } from '../src/db/scope'
import { countryCodes, geocode, pickPlace, route, userAgent } from '../src/lib/geo'
import { enrichTravel, HOME_KEY, REQUEST_GAP_MS } from '../src/lib/travelEnrich'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Trip distances from OpenStreetMap: the two lookups against a stubbed
 * network, and the hourly job against the production schema in SQLite.
 *
 * What the job must get right is mostly about *not* asking — both services
 * allow one request a second from the whole app and require results to be
 * cached — so most of these count requests as much as they check numbers.
 */

const OWNER = 'tnt_0001'
const OTHER = 'tnt_0002'
const ENV = { DASHBOARD_URL: 'https://scout.example' }
const HOME = { place: 'Winnipeg, MB', lat: 49.8951, lon: -97.1384 }

type Call = { url: string; headers: Record<string, string> }

/** A network that answers Nominatim and OSRM from a script, and records what it was asked. */
function network(answers: {
  geocode?: (q: string) => Array<{ lat: string; lon: string }> | 'down'
  route?: () => { code: string; km?: number; hours?: number } | 'down'
}) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    if (url.includes('nominatim')) {
      const q = new URL(url).searchParams.get('q') ?? ''
      const a = answers.geocode?.(q) ?? []
      if (a === 'down') return new Response('busy', { status: 503 })
      return Response.json(a)
    }
    const r = answers.route?.() ?? { code: 'Ok', km: 118.7, hours: 1.66 }
    if (r === 'down') throw new Error('connect ECONNREFUSED')
    if (r.code !== 'Ok') return Response.json({ code: r.code }, { status: 400 })
    return Response.json({ code: 'Ok', routes: [{ distance: r.km! * 1000, duration: r.hours! * 3600 }] })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

const LAC_DU_BONNET = [{ lat: '50.2549', lon: '-96.0621' }]

function database(gigs: Array<Record<string, unknown>>, home: typeof HOME | null = HOME) {
  const { d1, db } = sqliteD1()
  const columns = db.prepare('PRAGMA table_info(gig_opportunities)').all() as Array<{
    name: string; notnull: number; dflt_value: string | null; pk: number
  }>
  for (const g of gigs) {
    const row: Record<string, unknown> = { tenant_id: OWNER, status: 'new', ...g }
    for (const c of columns) {
      if (c.name in row || c.pk || !c.notnull || c.dflt_value !== null) continue
      row[c.name] = `placeholder ${c.name}`
    }
    const names = Object.keys(row)
    db.prepare(`INSERT INTO gig_opportunities (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
      .run(...(names.map((n) => row[n]) as never[]))
  }
  if (home) {
    db.prepare('INSERT INTO tenant_settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, ?)')
      .run(OWNER, HOME_KEY, JSON.stringify(home), '2026-09-01T00:00:00.000Z')
  }
  const read = (id: number) => db.prepare('SELECT * FROM gig_opportunities WHERE id = ?').get(id) as Record<string, unknown>
  return { env: { ...ENV, DB: d1 } as never, read, db }
}

const pauses: number[] = []
const pause = async (ms: number) => { pauses.push(ms) }
const NOW = new Date('2026-09-26T12:00:00.000Z')

describe('the lookups', () => {
  it('identify the application, never a person', () => {
    expect(userAgent(ENV)).toBe('SunDogsMusicScout/1.0 (+https://scout.example)')
  })

  it('narrow a search to the country, from the row or from a province code', () => {
    expect(countryCodes('CA')).toBe('ca')
    expect(countryCodes(null, 'Winnipeg, MB')).toBe('ca')
    expect(countryCodes(null, 'Austin, TX')).toBe('us')
    expect(countryCodes(null, 'Paris')).toBeNull()
  })

  it('takes the town over the district of the same name', () => {
    // Real: 'Kenora, ON' ranks Kenora District, 713 km away, above the city.
    const district = { lat: '54.02', lon: '-89.16', addresstype: 'county' }
    const city = { lat: '49.77', lon: '-94.49', addresstype: 'city' }
    expect(pickPlace([district, city])).toBe(city)
    // A park is not a region, and still resolves.
    const park = { lat: '50.03', lon: '-96.89', addresstype: 'national_park' }
    expect(pickPlace([park])).toBe(park)
    expect(pickPlace([district])).toBe(district)
  })

  it('tell not-found apart from a network failure', async () => {
    const none = network({ geocode: () => [] })
    expect(await geocode(ENV, 'Nowhere, MB', 'CA', none.fetchImpl)).toEqual({ outcome: 'not_found' })
    expect(none.calls[0].headers['User-Agent']).toContain('SunDogsMusicScout')
    expect(new URL(none.calls[0].url).searchParams.get('countrycodes')).toBe('ca')

    const down = network({ geocode: () => 'down' })
    expect((await geocode(ENV, 'Winnipeg, MB', 'CA', down.fetchImpl)).outcome).toBe('failed')
  })

  it('reads a route, and calls a place with no road not-found rather than down', async () => {
    const ok = network({})
    expect(await route(ENV, HOME, { lat: 50.25, lon: -96.06 }, ok.fetchImpl)).toEqual({
      outcome: 'found', value: { km: 118.7, hours: 1.66 },
    })
    const noRoad = network({ route: () => ({ code: 'NoRoute' }) })
    expect((await route(ENV, HOME, { lat: 58.77, lon: -94.16 }, noRoad.fetchImpl)).outcome).toBe('not_found')
    const down = network({ route: () => 'down' })
    expect((await route(ENV, HOME, { lat: 50, lon: -96 }, down.fetchImpl)).outcome).toBe('failed')
  })
})

describe('the hourly job, run for real', () => {
  it('does nothing without a home base, rather than assuming one', async () => {
    const { env } = database([{ id: 1, name: 'The Listening Room — Lac du Bonnet, MB', country: 'CA' }], null)
    const net = network({ geocode: () => LAC_DU_BONNET })
    const done = await enrichTravel(env, asTenantId(OWNER), { fetchImpl: net.fetchImpl, pause, now: NOW })
    expect(done.noHome).toBe(true)
    expect(net.calls).toHaveLength(0)
  })

  it('measures a gig from home and caches the answer on it', async () => {
    const { env, read } = database([{ id: 1, name: 'The Listening Room — Lac du Bonnet, MB', country: 'CA' }])
    const net = network({ geocode: () => LAC_DU_BONNET })
    const done = await enrichTravel(env, asTenantId(OWNER), { fetchImpl: net.fetchImpl, pause, now: NOW })
    expect(done.measured).toBe(1)
    const row = read(1)
    expect(row).toMatchObject({
      geo_place: 'Lac du Bonnet, MB', geo_home: 'Winnipeg, MB', geo_status: 'found',
      road_km: 118.7, road_hours: 1.66, distance_source: 'route', geo_checked_at: NOW.toISOString(),
    })
    expect(Number(row.crow_km)).toBeGreaterThan(80)
  })

  it('asks nothing the second time, because the answer is cached', async () => {
    const { env } = database([{ id: 1, location: 'Lac du Bonnet, MB', country: 'CA' }])
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: network({ geocode: () => LAC_DU_BONNET }).fetchImpl, pause, now: NOW })
    const again = network({ geocode: () => LAC_DU_BONNET })
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: again.fetchImpl, pause, now: NOW })
    expect(again.calls).toHaveLength(0)
  })

  it('remembers a place the map does not know, and does not ask again every hour', async () => {
    const { env, read } = database([{ id: 1, location: 'Nowheresville, MB', country: 'CA' }])
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: network({ geocode: () => [] }).fetchImpl, pause, now: NOW })
    expect(read(1)).toMatchObject({ geo_status: 'not_found', geo_place: 'Nowheresville, MB', road_km: null })
    const again = network({ geocode: () => [] })
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: again.fetchImpl, pause, now: NOW })
    expect(again.calls).toHaveLength(0)
  })

  it('writes nothing when the network is down, so the next hour retries', async () => {
    const { env, read } = database([{ id: 1, location: 'Lac du Bonnet, MB', country: 'CA' }])
    const done = await enrichTravel(env, asTenantId(OWNER), {
      fetchImpl: network({ geocode: () => LAC_DU_BONNET, route: () => 'down' }).fetchImpl, pause, now: NOW,
    })
    expect(done.failed).toBe(1)
    expect(read(1).geo_status).toBeNull()
  })

  it('falls back to a straight line where there is no road', async () => {
    const { env, read } = database([{ id: 1, location: 'Churchill, MB', country: 'CA' }])
    await enrichTravel(env, asTenantId(OWNER), {
      fetchImpl: network({ geocode: () => [{ lat: '58.7684', lon: '-94.1650' }], route: () => ({ code: 'NoRoute' }) }).fetchImpl,
      pause, now: NOW,
    })
    expect(read(1)).toMatchObject({ geo_status: 'found', distance_source: 'straight_line' })
  })

  it('refuses a road shorter than the straight line, which is the router snapping somewhere else', async () => {
    // Seen for real: Glasgow, Scotland came back as a 1,004 km drive from Winnipeg.
    const { env, read } = database([{ id: 1, location: 'Glasgow, Scotland', country: 'other' }])
    await enrichTravel(env, asTenantId(OWNER), {
      fetchImpl: network({ geocode: () => [{ lat: '55.8617', lon: '-4.2583' }], route: () => ({ code: 'Ok', km: 1004.4, hours: 14.2 }) }).fetchImpl,
      pause, now: NOW,
    })
    const row = read(1)
    expect(row.distance_source).toBe('straight_line')
    expect(Number(row.road_km)).toBeGreaterThan(Number(row.crow_km))
  })

  it('re-routes from a new home without looking the gig up again', async () => {
    const { env, db } = database([{ id: 1, location: 'Lac du Bonnet, MB', country: 'CA' }])
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: network({ geocode: () => LAC_DU_BONNET }).fetchImpl, pause, now: NOW })
    db.prepare('UPDATE tenant_settings SET value = ? WHERE key = ?')
      .run(JSON.stringify({ place: 'Brandon, MB', lat: 49.848, lon: -99.95 }), HOME_KEY)
    const moved = network({ geocode: () => LAC_DU_BONNET })
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: moved.fetchImpl, pause, now: NOW })
    expect(moved.calls.map((c) => (c.url.includes('nominatim') ? 'geocode' : 'route'))).toEqual(['route'])
  })

  it('clears the numbers when the location stops being a place', async () => {
    const { env, read, db } = database([{ id: 1, location: 'Lac du Bonnet, MB', country: 'CA' }])
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: network({ geocode: () => LAC_DU_BONNET }).fetchImpl, pause, now: NOW })
    db.prepare("UPDATE gig_opportunities SET location = 'National (Canada)' WHERE id = 1").run()
    const done = await enrichTravel(env, asTenantId(OWNER), { fetchImpl: network({}).fetchImpl, pause, now: NOW })
    expect(done.cleared).toBe(1)
    expect(read(1)).toMatchObject({ geo_status: null, road_km: null, geo_place: null })
  })

  it('waits a second between requests, and before the first when the caller just made one', async () => {
    const { env } = database([
      { id: 1, location: 'Lac du Bonnet, MB', country: 'CA' },
      { id: 2, location: 'Brandon, MB', country: 'CA' },
    ])
    pauses.length = 0
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: network({ geocode: () => LAC_DU_BONNET }).fetchImpl, pause, now: NOW })
    // Four requests, three gaps.
    expect(pauses).toEqual([REQUEST_GAP_MS, REQUEST_GAP_MS, REQUEST_GAP_MS])

    const fresh = database([{ id: 1, location: 'Lac du Bonnet, MB', country: 'CA' }])
    pauses.length = 0
    await enrichTravel(fresh.env, asTenantId(OWNER), {
      fetchImpl: network({ geocode: () => LAC_DU_BONNET }).fetchImpl, pause, now: NOW, afterRequest: true,
    })
    expect(pauses).toEqual([REQUEST_GAP_MS, REQUEST_GAP_MS])
  })

  it('measures only the tenant it was given', async () => {
    const { env, read } = database([
      { id: 1, location: 'Lac du Bonnet, MB', country: 'CA' },
      { id: 2, location: 'Lac du Bonnet, MB', country: 'CA', tenant_id: OTHER },
    ])
    await enrichTravel(env, asTenantId(OWNER), { fetchImpl: network({ geocode: () => LAC_DU_BONNET }).fetchImpl, pause, now: NOW })
    expect(read(1).geo_status).toBe('found')
    expect(read(2).geo_status).toBeNull()
  })

  it('leaves the rest for the next hour once it reaches its limit', async () => {
    const { env } = database([1, 2, 3].map((id) => ({ id, location: `Town${id}, MB`, country: 'CA' })))
    const done = await enrichTravel(env, asTenantId(OWNER), {
      fetchImpl: network({ geocode: () => LAC_DU_BONNET }).fetchImpl, pause, now: NOW, limit: 2,
    })
    expect(done.measured).toBe(2)
    expect(done.remaining).toBe(1)
  })
})
