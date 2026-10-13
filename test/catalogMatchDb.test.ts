import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { asTenantId } from '../src/db/scope'
import { getDb } from '../src/db'
import { gigOpportunities } from '../src/db/schema'
import { readGigs } from '../src/db/gigRows'
import { DAILY_LIMIT, STARTER_LIMIT, matchNewForTenant, planMatches } from '../src/lib/catalogMatch'
import matching from '../src/routes/matching'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The shared catalog, matched to an artist, against the production schema.
 *
 * What matters here is whose rows move: the catalog is read by everybody, and
 * what is written lands on one tenant's side and nowhere else.
 */

const TODAY = '2027-01-15'
const NOW = `${TODAY}T12:00:00.000Z`
const OWNER = asTenantId('tnt_0001')
const ARTIST = asTenantId('tnt_0002')

const day = (n: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function database() {
  const { d1, db } = sqliteD1()
  db.exec("INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Second Artist', '2026-10-01T00:00:00Z')")
  const env = { DB: d1 } as never

  let n = 0
  const entry = (o: Partial<{
    name: string; category: string; kind: string; deadline: string | null; location: string; country: string
    region: string | null; genres: string | null; eligibility: string | null; firstSeenAt: string; delivery: string | null
  }> = {}) => {
    n++
    db.prepare(
      `INSERT INTO opportunities
         (catalog_key, category, name, kind, url, deadline, location, country, region, genres, eligibility, public,
          first_seen_at, last_seen_at, delivery)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      `key:${n}`, o.category ?? 'festival', o.name ?? `Entry ${n}`, o.kind ?? 'Festival', `https://example.test/${n}`,
      o.deadline === undefined ? day(30) : o.deadline, o.location ?? 'Winnipeg, MB', o.country ?? 'CA',
      o.region === undefined ? 'MB' : o.region, o.genres ?? null, o.eligibility ?? null,
      o.firstSeenAt ?? day(-30), o.firstSeenAt ?? day(-30), o.delivery ?? null,
    )
    return n
  }

  const say = (tenant: string, goals: unknown, profile?: unknown) => {
    const put = (key: string, value: unknown) =>
      db.prepare("INSERT INTO tenant_settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, '2027-01-01')").run(tenant, key, JSON.stringify(value))
    put('onboarding.goals', goals)
    if (profile) put('onboarding.profile', profile)
  }

  const rows = async (tenant: typeof OWNER) =>
    readGigs(await getDb(d1).select().from(gigOpportunities).where(eqTenant(tenant)))

  return { env, db, entry, say, rows }
}

import { scoped } from '../src/db/scope'
const eqTenant = (tenant: typeof OWNER) => scoped(gigOpportunities, tenant)

const GOALS = { goals: ['gigs'], reach: ['canada'], note: null }
const PROFILE = { region: 'MB', city: 'Winnipeg', genres: ['folk'] }

function app(env: unknown, tenant: string = 'tnt_0002') {
  const a = new Hono()
  a.use('*', async (c, next) => {
    c.set('actor' as never, { kind: 'user', role: 'artist', tenant, session: { elevatedAt: null } } as never)
    await next()
  })
  a.route('/', matching as never)
  return { request: (path: string, init?: RequestInit) => a.request(`${path}${path.includes('?') ? '&' : '?'}today=${TODAY}`, init, env as never) }
}

describe('the preview', () => {
  it('lists what is theirs, with reasons, and counts what it left out', async () => {
    const t = database()
    t.entry({ name: 'At home' })
    t.entry({ name: 'Closed', deadline: day(-4) })
    t.entry({ name: 'Just arrived', firstSeenAt: day(0) })
    t.say('tnt_0002', GOALS, PROFILE)

    const res = await app(t.env).request('/starter')
    const body = (await res.json()) as {
      said: boolean; willAdd: Array<{ name: string; reasons: string[] }>; held: number; skipped: Array<{ reason: string; count: number }>
    }
    expect(body.said).toBe(true)
    expect(body.willAdd.map((m) => m.name)).toEqual(['At home'])
    expect(body.willAdd[0].reasons.join(' ')).toMatch(/Something you asked for: gigs/)
    expect(body.held).toBe(1)
    expect(body.skipped).toEqual([expect.objectContaining({ reason: 'closed', count: 1 })])
  })

  it('says so when the artist has told Scout nothing, rather than showing a list that means nothing', async () => {
    const t = database()
    t.entry()
    const body = (await (await app(t.env).request('/starter')).json()) as { said: boolean }
    expect(body.said).toBe(false)
  })

  it('writes nothing', async () => {
    const t = database()
    t.entry()
    t.say('tnt_0002', GOALS)
    await app(t.env).request('/starter')
    expect(await t.rows(ARTIST)).toEqual([])
  })
})

describe('adding the starter set', () => {
  it('files them as New rows linked to the catalog, with the reason on the row', async () => {
    const t = database()
    const id = t.entry({ name: 'At home' })
    t.say('tnt_0002', GOALS, PROFILE)

    const res = await app(t.env).request('/starter', { method: 'POST' })
    expect(((await res.json()) as { added: number }).added).toBe(1)

    const [row] = await t.rows(ARTIST)
    expect(row).toMatchObject({ name: 'At home', status: 'discovered', opportunityId: id, origin: 'catalog', tenantId: 'tnt_0002' })
    expect(row.fitRationale).toMatch(/Something you asked for: gigs\./)
    expect(row.fitRationale).toMatch(/Read the listing before you apply\.$/)
  })

  it('adds each call once, even when asked twice', async () => {
    const t = database()
    t.entry()
    t.say('tnt_0002', GOALS)
    const a = app(t.env)
    await a.request('/starter', { method: 'POST' })
    const second = (await (await a.request('/starter', { method: 'POST' })).json()) as { added: number }
    expect(second.added).toBe(0)
    expect(await t.rows(ARTIST)).toHaveLength(1)
  })

  it('does not add a call that closed since the screen was drawn', async () => {
    const t = database()
    const id = t.entry({ deadline: day(2) })
    t.say('tnt_0002', GOALS)
    t.db.prepare('UPDATE opportunities SET deadline = ? WHERE id = ?').run(day(-1), id)
    await app(t.env).request('/starter', { method: 'POST' })
    expect(await t.rows(ARTIST)).toEqual([])
  })

  it('stops at the cap, taking the best first', async () => {
    const t = database()
    for (let i = 1; i <= STARTER_LIMIT + 5; i++) t.entry({ name: `Call ${String(i).padStart(2, '0')}`, deadline: day(i) })
    t.say('tnt_0002', GOALS, PROFILE)
    await app(t.env).request('/starter', { method: 'POST' })
    const rows = await t.rows(ARTIST)
    expect(rows).toHaveLength(STARTER_LIMIT)
    expect(rows.map((r) => r.name)).toContain('Call 01')
    expect(rows.map((r) => r.name)).not.toContain(`Call ${STARTER_LIMIT + 5}`)
  })

  it('leaves the owner\'s rows, and everybody else\'s, alone', async () => {
    const t = database()
    t.entry()
    t.say('tnt_0002', GOALS)
    await app(t.env).request('/starter', { method: 'POST' })
    expect(await t.rows(OWNER)).toEqual([])
  })

  it('remembers the answer, so the card stops asking', async () => {
    const t = database()
    t.entry()
    t.say('tnt_0002', GOALS)
    const a = app(t.env)
    expect(((await (await a.request('/starter')).json()) as { answered: boolean }).answered).toBe(false)
    await a.request('/starter/decline', { method: 'POST' })
    expect(((await (await a.request('/starter')).json()) as { answered: boolean }).answered).toBe(true)
    expect(await t.rows(ARTIST)).toEqual([])
  })
})

describe('what is never offered again', () => {
  it('is a row they removed, which would otherwise come back tomorrow night', async () => {
    const t = database()
    t.entry()
    t.say('tnt_0002', GOALS)
    await app(t.env).request('/starter', { method: 'POST' })
    t.db.exec("DELETE FROM gig_opportunities WHERE tenant_id = 'tnt_0002'")

    const plan = await planMatches(t.env, ARTIST, TODAY)
    expect(plan.matches).toEqual([])
    expect((await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).added).toBe(0)
  })
})

describe('the daily run', () => {
  it('adds what is new and what they asked for, and rings the bell once', async () => {
    const t = database()
    t.entry({ name: 'Fresh gig', firstSeenAt: day(-5) })
    t.say('tnt_0002', GOALS, PROFILE)

    expect(await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).toEqual({ added: 1, skipped: null })
    const events = t.db.prepare("SELECT title, kind, tier, tenant_id FROM notification_events WHERE tenant_id = 'tnt_0002'").all()
    expect(events).toEqual([expect.objectContaining({ title: '1 new match for you', kind: 'automation', tier: 'info' })])

    // Idempotent: the same morning again adds nothing and rings nothing.
    expect(await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).toEqual({ added: 0, skipped: null })
    expect(t.db.prepare("SELECT count(*) AS n FROM notification_events WHERE tenant_id = 'tnt_0002'").get()).toEqual({ n: 1 })
  })

  it('adds only what they asked for, within the reach they chose', async () => {
    const t = database()
    t.entry({ name: 'A grant', category: 'funding', kind: 'Grant', firstSeenAt: day(-5) })
    t.entry({ name: 'Abroad', location: 'Austin, TX', country: 'US', region: 'TX', firstSeenAt: day(-5) })
    t.say('tnt_0002', GOALS, PROFILE)
    expect((await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).added).toBe(0)
  })

  it('looks only at what is recent, and leaves the backlog to the preview', async () => {
    const t = database()
    t.entry({ name: 'Old news', firstSeenAt: day(-200) })
    t.say('tnt_0002', GOALS, PROFILE)
    expect((await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).added).toBe(0)
  })

  it('is a trickle', async () => {
    const t = database()
    for (let i = 1; i <= DAILY_LIMIT + 4; i++) t.entry({ name: `Call ${i}`, firstSeenAt: day(-5), deadline: day(i) })
    t.say('tnt_0002', GOALS, PROFILE)
    expect((await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).added).toBe(DAILY_LIMIT)
  })

  it('does nothing for an artist who switched suggestions off, or has said nothing', async () => {
    const t = database()
    t.entry({ firstSeenAt: day(-5) })
    expect(await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).toEqual({ added: 0, skipped: 'nothing_said' })
    t.say('tnt_0002', GOALS, PROFILE)
    await app(t.env).request('/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })
    expect(await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).toEqual({ added: 0, skipped: 'off' })
    expect(await t.rows(ARTIST)).toEqual([])
  })

  it('does not deliver an entry the owner blocked, or one still in its holding period', async () => {
    const t = database()
    t.entry({ name: 'Blocked', delivery: 'blocked', firstSeenAt: day(-5) })
    t.entry({ name: 'Too new', firstSeenAt: day(-1) })
    t.say('tnt_0002', GOALS, PROFILE)
    expect((await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).added).toBe(0)
  })

  it('delivers an approved entry at once', async () => {
    const t = database()
    t.entry({ name: 'Approved', delivery: 'approved', firstSeenAt: day(0) })
    t.say('tnt_0002', GOALS, PROFILE)
    expect((await matchNewForTenant(t.env, ARTIST, TODAY, NOW)).added).toBe(1)
  })
})

describe('the switch', () => {
  it('is on until they turn it off, and can be turned back on', async () => {
    const t = database()
    const a = app(t.env)
    const read = async () => ((await (await a.request('/settings')).json()) as { enabled: boolean }).enabled
    expect(await read()).toBe(true)
    await a.request('/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) })
    expect(await read()).toBe(false)
    await a.request('/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) })
    expect(await read()).toBe(true)
  })
})
