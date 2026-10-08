import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { app } from '../src/index'
import { createSession, setSessionMode, sha256Hex } from '../src/lib/auth'
import { SESSION_COOKIE } from '../shared/auth'
import { seedSources } from '../shared/catalogSources'
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
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787', API_TOKEN: 'agent-secret' } as never
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  db.exec(`INSERT INTO users (id, role, tenant_id, display_name, created_at) VALUES ('usr_artist', 'artist', 'tnt_0002', 'Artist', '2026-01-01')`)

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
    expect(by('Music PEI — News')).toMatchObject({ state: 'working', itemCount: 10, kind: 'feed' })
    expect(by('Music PEI — News').counts.calls).toBeGreaterThan(0)
    expect(by('Music BC — News').state).toBe('stale')
    expect(by('Music BC — News').note).toMatch(/months old/)
    expect(by('Music PEI — Events').state).toBe('empty')
    expect(by('SaskMusic — Opportunities and deadlines')).toMatchObject({ state: 'working', itemCount: 10 })
    // The site answered 404.
    expect(body.items.find((s: { label: string }) => /Manitoba Music — Deadlines/.test(s.label))?.state).toBe('unreachable')
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
    expect(awards).toMatchObject({ verdict: 'opportunity', category: 'funding', source: 'Music PEI — News', reason: 'Says applications or submissions are open.' })
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
})
