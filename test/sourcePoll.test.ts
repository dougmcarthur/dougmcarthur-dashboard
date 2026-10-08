import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import {
  MAX_BODY_BYTES,
  PER_TICK,
  SCOUT_USER_AGENT,
  ensureSeedSources,
  pollSources,
  pruneCandidates,
  readCapped,
  readLastPoll,
} from '../src/lib/sourcePoll'
import { seedSources, sourceState } from '../shared/catalogSources'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The poller, run for real against the production schema and a pretend network.
 *
 * What is held here is what makes it cheap and polite: an unchanged source costs
 * one request and writes nothing, a broken one gets read less and less, one
 * source's failure never costs another's read, and a hostile body is cut off.
 * The pages and feeds are the captures in `test/fixtures/sources/`.
 */

const TODAY = '2026-10-05'
const NOW = new Date(`${TODAY}T15:00:00Z`)
const later = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000)

const fixture = (name: string) => readFileSync(`test/fixtures/sources/${name}`, 'utf8')

const SASK = 'https://www.saskmusic.org/news/sound-opportunities'
const PEI_FEED = 'https://www.musicpei.com/feed/'
const PEI_ICAL = 'https://www.musicpei.com/events-calendar/?ical=1'
const YUKON_FEED = 'https://musicyukon.com/feed/'
const BC_FEED = 'https://musicbc.org/feed/'

type Answer = { status?: number; body?: string; headers?: Record<string, string> } | Error

/** A network that answers from a table and remembers who asked, and how. */
function network(answers: Record<string, Answer>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const table = { ...answers }
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } })
    const answer = table[url] ?? { status: 404, body: 'Not found' }
    if (answer instanceof Error) throw answer
    const status = answer.status ?? 200
    // A 304 has no body, and the platform refuses to build one that does.
    const body = status === 204 || status === 304 ? null : (answer.body ?? '')
    return new Response(body, { status, headers: answer.headers ?? {} })
  }) as typeof fetch
  return { fetchImpl, calls, table, asked: (url: string) => calls.filter((c) => c.url === url) }
}

function world(answers: Record<string, Answer> = {}) {
  const { d1, db } = sqliteD1()
  const net = network(answers)
  const env = { DB: d1 } as never
  const sources = () => db.prepare('SELECT * FROM catalog_sources ORDER BY id').all() as Array<Record<string, any>>
  const source = (url: string) => sources().find((s) => s.url === url)!
  const candidates = (where = '1=1') =>
    db.prepare(`SELECT c.*, s.url AS source_url FROM catalog_candidates c JOIN catalog_sources s ON s.id = c.source_id WHERE ${where} ORDER BY c.id`).all() as Array<Record<string, any>>
  return { env, db, net, sources, source, candidates }
}

const EVERYTHING = { limit: 100, fetchImpl: undefined as unknown as typeof fetch }

describe('the registry', () => {
  it('is seeded from the association list, once', async () => {
    const w = world()
    expect(await ensureSeedSources(w.env, NOW)).toBe(seedSources().length)
    expect(w.sources()).toHaveLength(seedSources().length)
    expect(await ensureSeedSources(w.env, NOW)).toBe(0)
    expect(w.sources()).toHaveLength(seedSources().length)
  })

  it('follows the code when a seed’s address changes, and forgets what it knew of the old one', async () => {
    const w = world()
    await ensureSeedSources(w.env, NOW)
    w.db.prepare(`UPDATE catalog_sources SET url = 'https://old.example/feed', etag = '"x"', content_hash = 'abc', failures = 4 WHERE url = ?`).run(PEI_FEED)

    expect(await ensureSeedSources(w.env, NOW)).toBe(1)
    expect(w.source(PEI_FEED)).toMatchObject({ etag: null, content_hash: null, failures: 0, next_due_at: null })
  })

  it('never touches a source somebody else added', async () => {
    const w = world()
    await ensureSeedSources(w.env, NOW)
    // The owner replaced the seeded News feed with a source of their own that
    // happens to use the same key. The code's list must not win it back.
    w.db.prepare(`DELETE FROM catalog_sources WHERE added_by = 'seed' AND source_key = 'musicpei:news'`).run()
    w.db.prepare(`INSERT INTO catalog_sources (source_key, label, url, kind, added_by, created_at) VALUES ('musicpei:news', 'Mine', 'https://mine.example/f', 'feed', 'owner', '2026-01-01')`).run()
    await ensureSeedSources(w.env, NOW)
    expect(w.sources().find((s) => s.source_key === 'musicpei:news')).toMatchObject({ label: 'Mine', url: 'https://mine.example/f' })
  })

  it('keeps a seed switched off switched off', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml') } })
    await ensureSeedSources(w.env, NOW)
    w.db.prepare('UPDATE catalog_sources SET enabled = 0 WHERE url = ?').run(PEI_FEED)
    await ensureSeedSources(w.env, NOW)
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.source(PEI_FEED).enabled).toBe(0)
    expect(w.net.asked(PEI_FEED)).toHaveLength(0)
  })
})

describe('a read', () => {
  it('says who it is, and asks for the kind of thing it wants', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml') }, [PEI_ICAL]: { body: '' } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.net.asked(PEI_FEED)[0].headers['User-Agent']).toBe(SCOUT_USER_AGENT)
    expect(w.net.asked(PEI_FEED)[0].headers.Accept).toMatch(/application\/rss\+xml/)
    expect(w.net.asked(PEI_ICAL)[0].headers.Accept).toMatch(/text\/calendar/)
    expect(w.net.asked(SASK)[0].headers.Accept).toMatch(/text\/html/)
  })

  it('files a feed’s items as candidates with a verdict and a reason', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml'), headers: { ETag: '"pei-1"' } } })
    const report = await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })

    const rows = w.candidates(`s.url = '${PEI_FEED}'`)
    expect(rows).toHaveLength(10)
    const awards = rows.find((r) => r.title.startsWith('Music PEI Awards 2027'))!
    expect(awards).toMatchObject({ verdict: 'opportunity', category: 'funding', status: 'new' })
    expect(awards.reason).toBe('Says applications or submissions are open.')
    expect(rows.find((r) => r.title.includes('Hiring'))).toMatchObject({ verdict: 'not_opportunity', status: 'ignored' })
    expect(report.results.find((r) => r.source.includes('Music PEI — News'))).toMatchObject({ ok: true, items: 10, added: 10 })
  })

  it('files a listing page’s entries with the deadline the page gave', async () => {
    const w = world({ [SASK]: { body: fixture('saskmusic-opportunities.html') } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    const rows = w.candidates(`s.url = '${SASK}'`)
    expect(rows).toHaveLength(10)
    expect(rows[0]).toMatchObject({ title: 'Artist Opportunity - OUTER LIMITS SHOW SERIES', deadline: '2026-10-06', place_text: 'Calgary, Alberta', status: 'new' })
  })

  it('records what it learned about the source', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml'), headers: { ETag: '"pei-1"', 'Last-Modified': 'Thu, 20 Aug 2026 18:00:00 GMT' } } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.source(PEI_FEED)).toMatchObject({
      last_status: 200,
      last_error: null,
      etag: '"pei-1"',
      last_modified: 'Thu, 20 Aug 2026 18:00:00 GMT',
      last_item_count: 10,
      failures: 0,
      last_ok_at: NOW.toISOString(),
      newest_item_at: '2026-08-20T17:59:47.000Z',
    })
    expect(w.source(PEI_FEED).content_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(w.source(PEI_FEED).next_due_at).toBe(later(24).toISOString())
  })

  it('is written down for the owner: when it last ran and what it found', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml') } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    const last = await readLastPoll(w.env)
    expect(last).toMatchObject({ at: NOW.toISOString(), added: 10 })
    expect(last!.polled).toBeGreaterThan(1)
  })
})

describe('an unchanged source costs nothing', () => {
  it('sends what it was given last time, and a 304 changes nothing but the date', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml'), headers: { ETag: '"pei-1"', 'Last-Modified': 'Thu, 20 Aug 2026 18:00:00 GMT' } } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    const before = w.candidates(`s.url = '${PEI_FEED}'`)

    w.net.table[PEI_FEED] = { status: 304 }
    const report = await pollSources(w.env, { now: later(25), limit: 100, fetchImpl: w.net.fetchImpl })

    const second = w.net.asked(PEI_FEED)[1]
    expect(second.headers['If-None-Match']).toBe('"pei-1"')
    expect(second.headers['If-Modified-Since']).toBe('Thu, 20 Aug 2026 18:00:00 GMT')
    expect(report.results.find((r) => r.source.includes('Music PEI — News'))).toMatchObject({ ok: true, added: 0, note: 'Unchanged.' })
    expect(w.candidates(`s.url = '${PEI_FEED}'`)).toEqual(before)
    expect(w.source(PEI_FEED)).toMatchObject({ last_status: 304, failures: 0, last_item_count: 10 })
  })

  it('compares the body when the server ignores the validators, and writes nothing', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml') } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    const before = w.candidates(`s.url = '${PEI_FEED}'`)

    const report = await pollSources(w.env, { now: later(25), limit: 100, fetchImpl: w.net.fetchImpl })
    expect(report.results.find((r) => r.source.includes('Music PEI — News'))?.note).toBe('Unchanged.')
    // `last_seen_at` did not move, because nothing was looked at.
    expect(w.candidates(`s.url = '${PEI_FEED}'`)).toEqual(before)
  })
})

describe('a source that changed', () => {
  it('extends a deadline, adds a new entry, and leaves what the page dropped where it was', async () => {
    const page = fixture('saskmusic-opportunities.html')
    const w = world({ [SASK]: { body: page } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.candidates(`s.url = '${SASK}'`)).toHaveLength(10)

    const changed = page
      .replace('Deadline: October 6, 2026', 'Deadline: October 30, 2026')
      .replace('<ul class="news">', '<ul class="news"><li><div class="article-brief"><h3><a href="/news/sound-opportunities/view,article/9999/showcase-opportunity-brand-new">Showcase Opportunity: Brand New 2027</a></h3><p class="date">Deadline: December 1, 2026</p></div></li>')
    w.net.table[SASK] = { body: changed }
    const report = await pollSources(w.env, { now: later(25), limit: 100, fetchImpl: w.net.fetchImpl })

    const rows = w.candidates(`s.url = '${SASK}'`)
    expect(rows).toHaveLength(11)
    expect(report.results.find((r) => r.source.includes('SaskMusic'))).toMatchObject({ added: 1 })
    expect(rows.find((r) => r.title.startsWith('Artist Opportunity - OUTER'))).toMatchObject({ deadline: '2026-10-30', last_seen_at: later(25).toISOString() })
    expect(rows.find((r) => r.title === 'Showcase Opportunity: Brand New 2027')).toMatchObject({ verdict: 'opportunity', category: 'showcase', first_seen_at: later(25).toISOString() })
  })

  it('does not write the same item twice', async () => {
    const w = world({ [SASK]: { body: fixture('saskmusic-opportunities.html') } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    w.db.prepare('UPDATE catalog_sources SET content_hash = NULL').run()
    await pollSources(w.env, { now: later(25), limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.candidates(`s.url = '${SASK}'`)).toHaveLength(10)
  })
})

describe('a source that breaks gets read less often, not more', () => {
  it('retries one failure at the usual time, then waits longer each time', async () => {
    const w = world({ [PEI_FEED]: { status: 503, body: 'down' } })
    const poll = (at: Date) => pollSources(w.env, { now: at, limit: 100, force: true, fetchImpl: w.net.fetchImpl })

    await poll(NOW)
    expect(w.source(PEI_FEED)).toMatchObject({ failures: 1, last_status: 503, last_error: 'The site answered 503.', next_due_at: later(24).toISOString() })
    await poll(later(24))
    expect(w.source(PEI_FEED)).toMatchObject({ failures: 2, next_due_at: later(24 + 48).toISOString() })
    await poll(later(72))
    expect(w.source(PEI_FEED)).toMatchObject({ failures: 3, next_due_at: later(72 + 96).toISOString() })
  })

  it('reads a refusal as a refusal and a timeout as no verdict at all', async () => {
    const w = world({ [PEI_FEED]: { status: 403, body: 'no' }, [YUKON_FEED]: new TypeError('fetch failed') })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    const state = (url: string) => {
      const s = w.source(url)
      return sourceState({ enabled: true, kind: s.kind, cadenceHours: s.cadence_hours, lastFetchedAt: s.last_fetched_at, lastOkAt: s.last_ok_at, lastStatus: s.last_status, lastError: s.last_error, lastItemCount: s.last_item_count, newestItemAt: s.newest_item_at }, NOW)
    }
    expect(state(PEI_FEED).state).toBe('refused')
    expect(state(YUKON_FEED)).toEqual({ state: 'unreachable', note: 'fetch failed' })
  })

  it('recovers: one good read clears the back-off', async () => {
    const w = world({ [PEI_FEED]: { status: 500 } })
    await pollSources(w.env, { now: NOW, limit: 100, force: true, fetchImpl: w.net.fetchImpl })
    await pollSources(w.env, { now: later(24), limit: 100, force: true, fetchImpl: w.net.fetchImpl })
    expect(w.source(PEI_FEED).failures).toBe(2)

    w.net.table[PEI_FEED] = { body: fixture('musicpei-feed.xml') }
    await pollSources(w.env, { now: later(72), limit: 100, force: true, fetchImpl: w.net.fetchImpl })
    expect(w.source(PEI_FEED)).toMatchObject({ failures: 0, last_error: null, next_due_at: later(96).toISOString() })
  })

  // The two real dead sources a status code calls fine.
  it('calls an address that answers with nothing empty, and backs off from it', async () => {
    const w = world({ [PEI_ICAL]: { body: '', headers: { 'Content-Type': 'text/html' } }, [BC_FEED]: { body: fixture('musicbc-feed.xml') } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })

    expect(w.source(PEI_ICAL)).toMatchObject({ last_status: 200, last_item_count: 0, last_error: 'The address answered with nothing.', failures: 1 })
    expect(w.source(PEI_ICAL).last_ok_at).toBe(NOW.toISOString())
    expect(w.source(PEI_ICAL).etag).toBeNull()

    const bc = w.source(BC_FEED)
    expect(bc.last_item_count).toBe(3)
    expect(bc.newest_item_at).toBe('2025-02-20T17:00:00.000Z')
    expect(sourceState({ enabled: true, kind: 'feed', cadenceHours: 24, lastFetchedAt: bc.last_fetched_at, lastOkAt: bc.last_ok_at, lastStatus: 200, lastError: null, lastItemCount: 3, newestItemAt: bc.newest_item_at }, NOW).state).toBe('stale')
  })

  it('says a page that is not a feed is not a feed', async () => {
    const w = world({ [YUKON_FEED]: { body: '<!doctype html><html><body>Moved</body></html>' } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.source(YUKON_FEED)).toMatchObject({ last_item_count: 0, last_error: 'The address answered with something that is not a feed.' })
  })
})

describe('one source never costs another its read', () => {
  it('records the failure on the source that had it and carries on', async () => {
    const w = world({
      [YUKON_FEED]: new Error('socket hang up'),
      [PEI_FEED]: { body: fixture('musicpei-feed.xml') },
    })
    const report = await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(report.results.find((r) => r.source.includes('Music Yukon'))).toMatchObject({ ok: false, note: 'socket hang up' })
    expect(report.results.find((r) => r.source.includes('Music PEI — News'))).toMatchObject({ ok: true, added: 10 })
    expect(w.candidates(`s.url = '${PEI_FEED}'`)).toHaveLength(10)
  })

  it('does not let a failure to record escape into the cron', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml') } })
    await ensureSeedSources(w.env, NOW)
    w.db.exec('DROP TABLE catalog_candidates')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const report = await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(report.polled).toBeGreaterThan(0)
    expect(report.results.some((r) => /failed before it could be recorded/.test(r.note))).toBe(true)
    spy.mockRestore()
  })
})

describe('how many, and how often', () => {
  it('reads a few sources a tick, oldest wait first, and never reads one twice in a day', async () => {
    const w = world()
    const first = await pollSources(w.env, { now: NOW, fetchImpl: w.net.fetchImpl })
    expect(first.polled).toBe(PER_TICK)
    const second = await pollSources(w.env, { now: later(1), fetchImpl: w.net.fetchImpl })
    expect(second.polled).toBe(PER_TICK)

    const asked = w.net.calls.map((c) => c.url)
    expect(new Set(asked).size).toBe(asked.length)
  })

  it('has read every source within a day, at a few a tick', async () => {
    const w = world()
    await ensureSeedSources(w.env, NOW)
    const total = w.sources().length
    for (let hour = 0; hour < 24; hour++) await pollSources(w.env, { now: later(hour), fetchImpl: w.net.fetchImpl })
    expect(new Set(w.net.calls.map((c) => c.url)).size).toBe(total)
  })

  it('leaves alone a source that is not due', async () => {
    const w = world({ [PEI_FEED]: { body: fixture('musicpei-feed.xml') } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    await pollSources(w.env, { now: later(2), limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.net.asked(PEI_FEED)).toHaveLength(1)
  })
})

describe('a hostile or enormous body', () => {
  it('is cut at the cap', async () => {
    const res = new Response('x'.repeat(MAX_BODY_BYTES + 500_000))
    const { text, truncated } = await readCapped(res)
    expect(truncated).toBe(true)
    expect(text.length).toBeLessThanOrEqual(MAX_BODY_BYTES)
    expect(text.length).toBeGreaterThan(MAX_BODY_BYTES - 10)
  })

  it('is read whole when it is under the cap', async () => {
    expect(await readCapped(new Response('short body'))).toEqual({ text: 'short body', truncated: false })
  })

  it('still yields what came before the cut', async () => {
    const huge = `<rss><channel><item><title>Apply now: A Real Call</title><link>https://x.example/1</link></item>${'<!-- padding -->'.repeat(300_000)}`
    expect(huge.length).toBeGreaterThan(MAX_BODY_BYTES)
    const w = world({ [PEI_FEED]: { body: huge } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    expect(w.candidates(`s.url = '${PEI_FEED}'`).map((r) => r.title)).toEqual(['Apply now: A Real Call'])
  })

  it('never turns a stranger’s markup into anything but strings', async () => {
    const hostile = `<rss><channel><item><title><![CDATA[Apply now <script>alert(1)</script> ]]></title><link>javascript:alert(1)</link></item></channel></rss>`
    const w = world({ [PEI_FEED]: { body: hostile } })
    await pollSources(w.env, { now: NOW, limit: 100, fetchImpl: w.net.fetchImpl })
    const [row] = w.candidates(`s.url = '${PEI_FEED}'`)
    expect(row.title).not.toContain('<')
    // Stored as text, never followed: the poller makes no second request.
    expect(w.net.calls.map((c) => c.url)).not.toContain('javascript:alert(1)')
  })
})

describe('what is not worth keeping', () => {
  it('prunes the ignored after two months and the closed after six', async () => {
    const w = world()
    await ensureSeedSources(w.env, NOW)
    const id = w.sources()[0].id
    const insert = w.db.prepare(
      `INSERT INTO catalog_candidates (source_id, item_key, title, verdict, reason, status, first_seen_at, last_seen_at) VALUES (?, ?, ?, 'unclear', 'r', ?, '2026-01-01', ?)`,
    )
    const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
    insert.run(id, 'a', 'ignored 61 days ago', 'ignored', ago(61))
    insert.run(id, 'b', 'ignored 59 days ago', 'ignored', ago(59))
    insert.run(id, 'c', 'closed 181 days ago', 'closed', ago(181))
    insert.run(id, 'd', 'closed 179 days ago', 'closed', ago(179))
    insert.run(id, 'e', 'new 200 days ago', 'new', ago(200))
    insert.run(id, 'f', 'new yesterday', 'new', ago(1))

    expect(await pruneCandidates(w.env, NOW)).toBe(3)
    expect(w.candidates().map((r) => r.title).sort()).toEqual(['closed 179 days ago', 'ignored 59 days ago', 'new yesterday'])
  })
})
