import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { app } from '../src/index'
import { createSession, setSessionMode, sha256Hex } from '../src/lib/auth'
import { SESSION_COOKIE } from '../shared/auth'
import { seedSources } from '../shared/catalogSources'
import { PER_TICK, ensureSeedSources } from '../src/lib/sourcePoll'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The owner's view of what Scout reads for calls — who may see it, what it
 * says, and that it never prints the name a source is filed under.
 */

const fixture = (name: string) => readFileSync(`test/fixtures/sources/${name}`, 'utf8')

const PAGES: Record<string, { body: string; status?: number }> = {
  'https://www.musicpei.com/feed/': { body: fixture('musicpei-feed.xml') },
  'https://musicbc.org/feed/': { body: fixture('musicbc-feed.xml') },
  'https://www.saskmusic.org/news/sound-opportunities': { body: fixture('saskmusic-opportunities.html') },
  'https://www.musicpei.com/events-calendar/?ical=1': { body: '' },
}

/** The whole internet, as far as the poller is concerned. */
function stubNetwork() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const page = PAGES[url]
      return page ? new Response(page.body, { status: page.status ?? 200 }) : new Response('Not found', { status: 404 })
    }),
  )
}

/**
 * The fixtures are pages captured on 2026-10-06, and SaskMusic's carries a
 * deadline of that very day: a poll run by the real clock files it `closed` from
 * the next morning and the "calls" view stops showing it. Only Date is faked, so
 * timers and the SQLite stand-in keep working.
 */
const CAPTURED_ON = new Date('2026-10-06T18:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CAPTURED_ON)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function setup() {
  const { d1, db } = sqliteD1()
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787' } as never
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  db.exec(`INSERT INTO users (id, role, tenant_id, display_name, created_at) VALUES ('usr_artist', 'artist', 'tnt_0002', 'Artist', '2026-01-01')`)
  // The agent case holds an issued token: the shared secret is retired.
  db.prepare(`INSERT INTO agent_tokens (id, tenant_id, token_hash, label) VALUES ('tok_agent', 'tnt_0001', ?, 'Research routines')`).run(
    await sha256Hex('agent-secret'),
  )

  const cookie = async (userId: string, admin: boolean) => {
    const { token } = await createSession(env, { credentialId: null, label: 'test', userId })
    if (admin) await setSessionMode(env, await sha256Hex(token), 'admin')
    return `${SESSION_COOKIE}=${token}`
  }
  const call = async (method: string, path: string, who: 'owner' | 'artist' | 'ownerArtistMode' | 'agent' | 'nobody', body?: unknown) => {
    const headers: Record<string, string> = {}
    if (who === 'owner') headers.Cookie = await cookie('usr_0001', true)
    if (who === 'ownerArtistMode') headers.Cookie = await cookie('usr_0001', false)
    if (who === 'artist') headers.Cookie = await cookie('usr_artist', false)
    if (who === 'agent') headers.Authorization = 'Bearer agent-secret'
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env)
  }
  return { env, db, call }
}

const PATHS: Array<[string, string]> = [
  ['GET', '/api/admin/catalog/sources'],
  ['GET', '/api/admin/catalog/candidates'],
  ['POST', '/api/admin/catalog/poll'],
  ['PATCH', '/api/admin/catalog/sources/1'],
]

describe('who may see what Scout reads', () => {
  it('nobody without a session', async () => {
    const t = await setup()
    for (const [method, path] of PATHS) expect((await t.call(method, path, 'nobody', method === 'PATCH' ? { enabled: false } : undefined)).status, path).toBe(401)
  })

  it('not an artist, not a research agent, and not the owner until they have switched to admin mode', async () => {
    const t = await setup()
    for (const who of ['artist', 'agent', 'ownerArtistMode'] as const) {
      for (const [method, path] of PATHS) {
        const res = await t.call(method, path, who, method === 'PATCH' ? { enabled: false } : undefined)
        expect(res.status, `${who} ${method} ${path}`).toBe(403)
      }
    }
  })
})

describe('the owner’s view', () => {
  async function polled() {
    stubNetwork()
    const t = await setup()
    // Six at a time, so three presses read all of them.
    for (let i = 0; i < 3; i++) expect((await t.call('POST', '/api/admin/catalog/poll', 'owner')).status).toBe(200)
    return t
  }

  it('reads the sources, a few at a time, and reports what it found', async () => {
    stubNetwork()
    const t = await setup()
    const res = await t.call('POST', '/api/admin/catalog/poll', 'owner')
    const report = await res.json()
    expect(report.polled).toBe(6)
    expect(report.polled).toBe(report.ok + report.failed)
    const next = await (await t.call('POST', '/api/admin/catalog/poll', 'owner')).json()
    // The second press reads the next six, not the same six.
    expect(next.results.map((r: { source: string }) => r.source).filter((s: string) => report.results.some((r: { source: string }) => r.source === s))).toEqual([])
  })

  it('says how each source is doing, in words, with what it found', async () => {
    const t = await polled()
    const body = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    expect(body.items).toHaveLength(seedSources().length)
    expect(body.lastPoll.polled).toBeGreaterThan(0)

    const by = (label: string) => body.items.find((s: { label: string }) => s.label === label)
    expect(by('Music PEI · News')).toMatchObject({ state: 'working', itemCount: 10, kind: 'feed' })
    expect(by('Music PEI · News').counts.calls).toBeGreaterThan(0)
    expect(by('Music BC · News').state).toBe('stale')
    expect(by('Music BC · News').note).toMatch(/months old/)
    expect(by('Music PEI · Events').state).toBe('empty')
    expect(by('SaskMusic · Opportunities and deadlines')).toMatchObject({ state: 'working', itemCount: 10 })
    // The site answered 404.
    expect(body.items.find((s: { label: string }) => /Manitoba Music · Deadlines/.test(s.label))?.state).toBe('unreachable')
  })

  it('never prints the name a source is filed under', async () => {
    const t = await polled()
    const sources = JSON.stringify(await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json())
    const candidates = JSON.stringify(await (await t.call('GET', '/api/admin/catalog/candidates?view=calls', 'owner')).json())
    for (const seed of seedSources()) {
      expect(sources).not.toContain(seed.key)
      expect(candidates).not.toContain(seed.key)
    }
    expect(sources).not.toMatch(/"sourceKey"|"source_key"/)
  })

  it('lists the calls it found, with the sentence that decided each', async () => {
    const t = await polled()
    const { items } = await (await t.call('GET', '/api/admin/catalog/candidates?view=calls', 'owner')).json()
    const awards = items.find((i: { title: string }) => i.title.startsWith('Music PEI Awards 2027'))
    expect(awards).toMatchObject({ verdict: 'opportunity', category: 'funding', source: 'Music PEI · News', reason: 'Says applications or submissions are open.' })
    const outer = items.find((i: { title: string }) => i.title.includes('OUTER LIMITS'))
    expect(outer).toMatchObject({ deadline: '2026-10-06', placeText: 'Calgary, Alberta' })
  })

  it('shows what it threw away, so a rule that is missing real calls can be found', async () => {
    const t = await polled()
    const { items } = await (await t.call('GET', '/api/admin/catalog/candidates?view=ignored', 'owner')).json()
    expect(items.some((i: { title: string }) => /Hiring/.test(i.title))).toBe(true)
    expect(items.every((i: { verdict: string }) => i.verdict === 'not_opportunity')).toBe(true)
  })

  it('refuses a view it does not know, rather than quietly showing everything', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/admin/catalog/candidates?view=all', 'owner')).status).toBe(400)
  })

  it('switches a source off, and leaves it off', async () => {
    stubNetwork()
    const t = await setup()
    await t.call('POST', '/api/admin/catalog/poll', 'owner')
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    const id = items[0].id
    expect((await t.call('PATCH', `/api/admin/catalog/sources/${id}`, 'owner', { enabled: false })).status).toBe(200)
    const after = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    expect(after.items.find((s: { id: number }) => s.id === id)).toMatchObject({ enabled: false, state: 'off' })
    expect((await t.call('PATCH', '/api/admin/catalog/sources/9999', 'owner', { enabled: false })).status).toBe(404)
  })

  it('switches a source back on without touching how often it is read', async () => {
    const t = await seeded()
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    const id = items[0].id
    await t.call('PATCH', `/api/admin/catalog/sources/${id}`, 'owner', { cadenceHours: 168 })
    await t.call('PATCH', `/api/admin/catalog/sources/${id}`, 'owner', { enabled: false })
    await t.call('PATCH', `/api/admin/catalog/sources/${id}`, 'owner', { enabled: true })
    const after = (await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()).items.find((s: { id: number }) => s.id === id)
    expect(after).toMatchObject({ enabled: true, cadenceHours: 168 })
  })
})

/** The registry filled in but nothing read yet, which is how a fresh deployment starts. */
async function seeded() {
  const t = await setup()
  await ensureSeedSources(t.env, CAPTURED_ON)
  return t
}

describe('how often a source is read', () => {
  it('starts at daily for every source, and reports what the cron can do in a day', async () => {
    stubNetwork()
    const t = await setup()
    await t.call('POST', '/api/admin/catalog/poll', 'owner')
    const body = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    expect(body.items.every((s: { cadenceHours: number }) => s.cadenceHours === 24)).toBe(true)
    expect(body.capacityPerDay).toBe(PER_TICK * 24)
  })

  it('counts a new frequency from the last read, not from the click', async () => {
    stubNetwork()
    const t = await setup()
    // Six at a time, so three presses read all of them.
    for (let i = 0; i < 3; i++) await t.call('POST', '/api/admin/catalog/poll', 'owner')
    const read = async () => {
      const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
      return items.find((s: { label: string }) => s.label === 'Music PEI · News')
    }
    const before = await read()
    expect(before.state).toBe('working')
    expect(Date.parse(before.nextDueAt) - Date.parse(before.lastFetchedAt)).toBe(24 * 3_600_000)

    // The clock moves on; the next read still counts from the last one.
    vi.setSystemTime(new Date(CAPTURED_ON.getTime() + 5 * 3_600_000))
    expect((await t.call('PATCH', `/api/admin/catalog/sources/${before.id}`, 'owner', { cadenceHours: 168 })).status).toBe(200)
    const weekly = await read()
    expect(weekly.cadenceHours).toBe(168)
    expect(Date.parse(weekly.nextDueAt) - Date.parse(weekly.lastFetchedAt)).toBe(168 * 3_600_000)

    await t.call('PATCH', `/api/admin/catalog/sources/${before.id}`, 'owner', { cadenceHours: 6 })
    const often = await read()
    expect(Date.parse(often.nextDueAt) - Date.parse(often.lastFetchedAt)).toBe(6 * 3_600_000)
  })

  it('keeps the back-off a failing source has earned', async () => {
    stubNetwork()
    const t = await setup()
    // Two failed reads put the multiple at two.
    await t.call('POST', '/api/admin/catalog/poll', 'owner')
    await t.call('POST', '/api/admin/catalog/poll', 'owner')
    await t.call('POST', '/api/admin/catalog/poll', 'owner')
    t.db.prepare(`UPDATE catalog_sources SET failures = 2 WHERE label LIKE 'Manitoba Music · Deadlines%'`).run()
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    const dead = items.find((s: { label: string }) => /Manitoba Music · Deadlines/.test(s.label))
    await t.call('PATCH', `/api/admin/catalog/sources/${dead.id}`, 'owner', { cadenceHours: 48 })
    const after = (await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()).items.find((s: { id: number }) => s.id === dead.id)
    expect(Date.parse(after.nextDueAt) - Date.parse(after.lastFetchedAt)).toBe(48 * 2 * 3_600_000)
  })

  it('refuses a frequency it does not offer, and a request that changes nothing', async () => {
    const t = await seeded()
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    const id = items[0].id
    for (const body of [{ cadenceHours: 5 }, { cadenceHours: 0 }, { cadenceHours: 24.5 }, { cadenceHours: '24' }, {}]) {
      expect((await t.call('PATCH', `/api/admin/catalog/sources/${id}`, 'owner', body)).status, JSON.stringify(body)).toBe(400)
    }
    const after = (await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()).items.find((s: { id: number }) => s.id === id)
    expect(after.cadenceHours).toBe(24)
  })

  it('leaves a source nobody has read yet due when its frequency changes', async () => {
    const t = await seeded()
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    // Nothing has been polled, so there is no last read to count from.
    const id = items[0].id
    expect(items[0].nextDueAt).toBeNull()
    await t.call('PATCH', `/api/admin/catalog/sources/${id}`, 'owner', { cadenceHours: 168 })
    const after = (await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()).items.find((s: { id: number }) => s.id === id)
    expect(after).toMatchObject({ cadenceHours: 168, nextDueAt: null })
  })

  it('does not let an artist or an agent change it', async () => {
    const t = await setup()
    for (const who of ['artist', 'agent', 'ownerArtistMode'] as const) {
      expect((await t.call('PATCH', '/api/admin/catalog/sources/1', who, { cadenceHours: 168 })).status, who).toBe(403)
    }
  })
})

describe('paging what was found', () => {
  async function polled() {
    stubNetwork()
    const t = await setup()
    for (let i = 0; i < 3; i++) await t.call('POST', '/api/admin/catalog/poll', 'owner')
    return t
  }

  it('says how many there are, and returns one screenful of them', async () => {
    const t = await polled()
    const all = await (await t.call('GET', '/api/admin/catalog/candidates?view=ignored&limit=50', 'owner')).json()
    expect(all.total).toBeGreaterThan(2)
    expect(all.items.length).toBe(Math.min(50, all.total))

    const first = await (await t.call('GET', '/api/admin/catalog/candidates?view=ignored&limit=10', 'owner')).json()
    expect(first.total).toBe(all.total)
    expect(first.items.length).toBeLessThanOrEqual(10)

    // The second page starts where the first one stopped.
    const second = await (await t.call('GET', '/api/admin/catalog/candidates?view=ignored&limit=10&offset=10', 'owner')).json()
    const firstIds = new Set(first.items.map((i: { id: number }) => i.id))
    expect(second.items.some((i: { id: number }) => firstIds.has(i.id))).toBe(false)
    expect(first.items.length + second.items.length).toBeLessThanOrEqual(all.total)
  })

  it('returns nothing, and still the total, past the end', async () => {
    const t = await polled()
    const res = await (await t.call('GET', '/api/admin/catalog/candidates?view=calls&offset=5000', 'owner')).json()
    expect(res.items).toEqual([])
    expect(res.total).toBeGreaterThan(0)
  })

  it('will not be asked for everything at once', async () => {
    const t = await polled()
    const res = await (await t.call('GET', '/api/admin/catalog/candidates?view=ignored&limit=1000000', 'owner')).json()
    expect(res.items.length).toBeLessThanOrEqual(10)
  })

  it('narrows to one source, and counts only that source', async () => {
    const t = await polled()
    const { items: sources } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    const pei = sources.find((s: { label: string }) => s.label === 'Music PEI · News')
    const only = await (await t.call('GET', `/api/admin/catalog/candidates?view=ignored&limit=50&source=${pei.id}`, 'owner')).json()
    expect(only.items.every((i: { source: string }) => i.source === 'Music PEI · News')).toBe(true)
    const every = await (await t.call('GET', '/api/admin/catalog/candidates?view=ignored&limit=50', 'owner')).json()
    expect(only.total).toBeLessThan(every.total)
    // A source id that is not a number is no filter, not an error and not an empty list.
    const junk = await (await t.call('GET', '/api/admin/catalog/candidates?view=ignored&limit=50&source=abc', 'owner')).json()
    expect(junk.total).toBe(every.total)
  })
})

describe('paging the public listings', () => {
  async function withListings(n: number) {
    const t = await setup()
    const insert = t.db.prepare(
      `INSERT INTO opportunities (catalog_key, category, name, organizer, public, first_seen_at, last_seen_at) VALUES (?, 'festival', ?, ?, 1, ?, ?)`,
    )
    for (let i = 1; i <= n; i++) {
      const seen = `2026-09-${String(i).padStart(2, '0')}T00:00:00.000Z`
      insert.run(`key-${i}`, i === 7 ? 'Prairie Folk Night' : `Festival ${i}`, i === 7 ? 'The Hall' : null, seen, seen)
    }
    return t
  }

  it('returns the newest first, a screenful at a time, with the total', async () => {
    const t = await withListings(23)
    const first = await (await t.call('GET', '/api/admin/listings?limit=10', 'owner')).json()
    expect(first.total).toBe(23)
    expect(first.items).toHaveLength(10)
    expect(first.items[0].name).toBe('Festival 23')
    const third = await (await t.call('GET', '/api/admin/listings?limit=10&offset=20', 'owner')).json()
    expect(third.items.map((i: { name: string }) => i.name)).toEqual(['Festival 3', 'Festival 2', 'Festival 1'])
  })

  it('searches by name or by organiser, and counts only what matched', async () => {
    const t = await withListings(23)
    const byName = await (await t.call('GET', '/api/admin/listings?q=prairie', 'owner')).json()
    expect(byName).toMatchObject({ total: 1, items: [{ name: 'Prairie Folk Night' }] })
    const byOrganiser = await (await t.call('GET', '/api/admin/listings?q=the%20hall', 'owner')).json()
    expect(byOrganiser.total).toBe(1)
    const none = await (await t.call('GET', '/api/admin/listings?q=zzzz', 'owner')).json()
    expect(none).toMatchObject({ total: 0, items: [] })
  })

  it('treats a wildcard typed into the search as an ordinary character', async () => {
    const t = await withListings(5)
    // `%` would match everything if it were passed through to LIKE.
    const res = await (await t.call('GET', '/api/admin/listings?q=%25', 'owner')).json()
    expect(res.total).toBe(5)
    const underscore = await (await t.call('GET', '/api/admin/listings?q=Festival_1', 'owner')).json()
    expect(underscore.total).toBe(1)
  })

  it('is the owner’s alone', async () => {
    const t = await setup()
    for (const who of ['nobody', 'artist', 'agent', 'ownerArtistMode'] as const) {
      expect((await t.call('GET', '/api/admin/listings', who)).status, who).toBe(who === 'nobody' ? 401 : 403)
    }
  })
})

describe('the read history', () => {
  it('records each read and lists them newest first, for the owner only', async () => {
    stubNetwork()
    const t = await seeded()
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    const pei = items.find((s: { label: string }) => s.label === 'Music PEI · News')
    for (let i = 0; i < 2; i++) await t.call('POST', `/api/admin/catalog/sources/${pei.id}/poll`, 'owner')
    const reads = await (await t.call('GET', `/api/admin/catalog/sources/${pei.id}/reads`, 'owner')).json()
    expect(reads.items).toHaveLength(2)
    expect(reads.items[0]).toMatchObject({ ok: true, items: 10 })
    expect((await t.call('GET', `/api/admin/catalog/sources/${pei.id}/reads`, 'artist')).status).toBe(403)
  })
})

describe('the change log and the search', () => {
  it('logs a successful write, not a refused one or a read, and finds things by name', async () => {
    const t = await seeded()
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    await t.call('PATCH', `/api/admin/catalog/sources/${items[0].id}`, 'owner', { enabled: false })
    await t.call('PATCH', `/api/admin/catalog/sources/${items[0].id}`, 'owner', { cadenceHours: 5 })
    const log = await (await t.call('GET', '/api/admin/changes', 'owner')).json()
    expect(log.total).toBe(1)
    expect(log.items[0].summary).toMatch(/external data source/)
    const hit = await (await t.call('GET', '/api/admin/search?q=Music%20PEI', 'owner')).json()
    expect(hit.groups.some((g: { section: string }) => g.section === 'sources')).toBe(true)
    expect((await (await t.call('GET', '/api/admin/search?q=a', 'owner')).json()).groups).toEqual([])
    expect((await t.call('GET', '/api/admin/changes', 'artist')).status).toBe(403)
    expect((await t.call('GET', '/api/admin/search?q=zz', 'artist')).status).toBe(403)
  })
})

describe('the sidebar badges', () => {
  async function withThings() {
    stubNetwork()
    const t = await setup()
    for (let i = 0; i < 3; i++) await t.call('POST', '/api/admin/catalog/poll', 'owner')
    const message = t.db.prepare(
      `INSERT INTO feedback (tenant_id, kind, message, context, created_at, read_at) VALUES ('tnt_0001', 'idea', ?, '{}', '2026-10-06T00:00:00Z', ?)`,
    )
    message.run('first', null)
    message.run('second', null)
    message.run('third, already read', '2026-10-06T01:00:00Z')
    const request = t.db.prepare(
      `INSERT INTO invite_requests (name, email, message, status, created_at) VALUES (?, ?, 'hello', ?, '2026-10-06T00:00:00Z')`,
    )
    request.run('Waiting', 'waiting@example.test', 'new')
    request.run('Answered', 'answered@example.test', 'invited')
    return t
  }

  const ATTENTION = ['overdue', 'stale', 'empty', 'refused', 'unreachable']
  const failingOf = async (t: Awaited<ReturnType<typeof setup>>) => {
    const { items } = await (await t.call('GET', '/api/admin/catalog/sources', 'owner')).json()
    return items.filter((s: { enabled: boolean; state: string }) => s.enabled && ATTENTION.includes(s.state))
  }

  it('counts what is unread, what is waiting and what has stopped answering, and nothing answered or read', async () => {
    const t = await withThings()
    const failing = await failingOf(t)
    // The fixtures include a dead feed, an empty calendar and a 404, so this is not a count of zero.
    expect(failing.length).toBeGreaterThan(0)
    const badges = await (await t.call('GET', '/api/admin/badges', 'owner')).json()
    expect(badges).toEqual({ feedbackUnread: 2, requestsOpen: 1, sourcesFailing: failing.length })
  })

  it('does not count a source the owner has switched off, which is how a badge on a dead one clears', async () => {
    const t = await withThings()
    const before = await failingOf(t)
    await t.call('PATCH', `/api/admin/catalog/sources/${before[0].id}`, 'owner', { enabled: false })
    const after = (await (await t.call('GET', '/api/admin/badges', 'owner')).json()).sourcesFailing
    expect(after).toBe(before.length - 1)
  })

  it('is zero everywhere on an empty deployment', async () => {
    const t = await setup()
    expect(await (await t.call('GET', '/api/admin/badges', 'owner')).json()).toEqual({
      feedbackUnread: 0,
      requestsOpen: 0,
      sourcesFailing: 0,
    })
  })

  it('is the owner’s alone', async () => {
    const t = await setup()
    expect((await t.call('GET', '/api/admin/badges', 'nobody')).status).toBe(401)
    for (const who of ['artist', 'agent', 'ownerArtistMode'] as const) {
      expect((await t.call('GET', '/api/admin/badges', who)).status, who).toBe(403)
    }
  })
})
