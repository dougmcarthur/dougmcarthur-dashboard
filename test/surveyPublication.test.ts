import { describe, it, expect } from 'vitest'
import { app } from '../src/index'
import { createSession, setSessionMode, sha256Hex } from '../src/lib/auth'
import { PUBLICATION_KEY } from '../src/lib/surveyPublication'
import { SESSION_COOKIE } from '../shared/auth'
import { PUBLISH_FLOOR, type PublicResults } from '../shared/surveyPublic'
import type { Respondent } from '../shared/surveyAnalysis'
import { simulateFull } from './support/surveyFixtures'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Publishing the survey's summary, through the real middleware with real
 * sessions and the production schema. What is held here is who may do it, that
 * what goes public is what was looked at, and that the public page can be
 * served to anybody without being able to name anybody.
 */

async function setup() {
  const { d1, db } = sqliteD1()
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787', API_TOKEN: 'agent-secret' } as never

  // The migrations seed the owner (usr_0001); one artist is added beside them.
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  db.exec(`INSERT INTO users (id, role, tenant_id, display_name, created_at) VALUES ('usr_artist', 'artist', 'tnt_0002', 'Artist', '2026-01-01')`)

  const insert = db.prepare(
    `INSERT INTO survey_responses (id, instrument, source, device, plan, answers, seconds, status, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const ids: string[] = []
  const add = (r: Respondent, status = 'complete') => {
    const id = `${'0'.repeat(28)}${String(ids.length + 1).padStart(4, '0')}`
    ids.push(id)
    insert.run(id, r.instrument, r.source, r.device, JSON.stringify(r.plan), JSON.stringify(r.answers), JSON.stringify(r.seconds), status, r.createdAt, r.createdAt, status === 'complete' ? r.completedAt : null)
  }
  const fill = (n: number, from = 1) => {
    for (let i = 0; i < n; i++) add(simulateFull(from + i))
  }

  const sessionFor = async (userId: string, admin: boolean) => {
    const { token } = await createSession(env, { credentialId: null, label: 'test', userId })
    if (admin) await setSessionMode(env, await sha256Hex(token), 'admin')
    return `${SESSION_COOKIE}=${token}`
  }
  const call = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) =>
    app.request(
      path,
      { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined },
      env,
    )
  const owner = async () => ({ Cookie: await sessionFor('usr_0001', true) })
  const preview = async (headers: Record<string, string>, query = '') =>
    (await (await call('GET', `/api/admin/survey/publication${query}`, headers)).json()) as any
  const publicResults = async () => (await (await call('GET', '/api/public/survey/results')).json()) as { published: boolean; results?: PublicResults }
  return { db, ids, add, fill, call, owner, preview, publicResults, sessionFor }
}

const PUB = '/api/admin/survey/publication'

describe('the public page, before and after', () => {
  it('has nothing published to begin with, and needs no sign-in to ask', async () => {
    const t = await setup()
    t.fill(60)
    const res = await t.call('GET', '/api/public/survey/results')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ published: false })
  })

  it('is served whether the survey is open or closed', async () => {
    const t = await setup()
    t.fill(60)
    const as = await t.owner()
    const p = await t.preview(as)
    await t.call('POST', PUB, as, { fingerprint: p.fingerprint })
    // Nothing is set to open the survey; the results are still there to read.
    expect((await t.publicResults()).published).toBe(true)
  })

  it('treats a stored row it cannot read, or does not know, as nothing published', async () => {
    const t = await setup()
    const put = (value: string) =>
      t.db.prepare(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, '2026-01-01T00:00:00.000Z')`).run(PUBLICATION_KEY, value)
    put('not json at all')
    expect(await t.publicResults()).toEqual({ published: false })
    put(JSON.stringify({ version: 999, n: 5, publishedAt: 'x' }))
    expect(await t.publicResults()).toEqual({ published: false })
    put('null')
    expect(await t.publicResults()).toEqual({ published: false })
  })
})

describe('who may preview, publish and take down', () => {
  const attempts: Array<[string, string, unknown?]> = [
    ['GET', PUB],
    ['POST', PUB, { fingerprint: 'a'.repeat(64) }],
    ['DELETE', PUB],
  ]

  it('nobody without a session', async () => {
    const t = await setup()
    for (const [m, p, b] of attempts) expect((await t.call(m, p, {}, b)).status, m).toBe(401)
  })

  it('not an artist', async () => {
    const t = await setup()
    const cookie = { Cookie: await t.sessionFor('usr_artist', false) }
    for (const [m, p, b] of attempts) expect((await t.call(m, p, cookie, b)).status, m).toBe(403)
  })

  it('not the owner either, until they are in admin mode', async () => {
    const t = await setup()
    const cookie = { Cookie: await t.sessionFor('usr_0001', false) }
    for (const [m, p, b] of attempts) {
      const res = await t.call(m, p, cookie, b)
      expect(res.status, m).toBe(403)
      expect(await res.json()).toMatchObject({ needsMode: 'admin' })
    }
  })

  it('not a research agent holding a token', async () => {
    const t = await setup()
    for (const [m, p, b] of attempts) expect((await t.call(m, p, { Authorization: 'Bearer agent-secret' }, b)).status, m).toBe(403)
  })

  it('and a refused call leaves nothing published', async () => {
    const t = await setup()
    t.fill(60)
    await t.call('POST', PUB, {}, { fingerprint: 'a'.repeat(64) })
    expect((await t.publicResults()).published).toBe(false)
  })
})

describe('the preview', () => {
  it('builds what would be published, with a digest of it, and says nothing is public yet', async () => {
    const t = await setup()
    t.fill(140)
    const p = await t.preview(await t.owner())
    expect(p.blockers).toEqual([])
    expect(p.preview.n).toBe(140)
    expect(p.preview.ranking).toHaveLength(13)
    expect(p.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(p.published).toBeNull()
  })

  it('says why it cannot be built, and builds nothing, below the floor', async () => {
    const t = await setup()
    t.fill(PUBLISH_FLOOR - 1)
    const p = await t.preview(await t.owner())
    expect(p.blockers).toHaveLength(1)
    expect(p.blockers[0]).toMatch(/Only 29 completed responses are in/)
    expect(p.preview).toBeNull()
    expect(p.fingerprint).toBeNull()
  })

  it('counts completed responses only', async () => {
    const t = await setup()
    t.fill(PUBLISH_FLOOR - 1)
    for (let i = 0; i < 10; i++) t.add(simulateFull(900 + i), 'in_progress')
    expect((await t.preview(await t.owner())).blockers).toHaveLength(1)
  })

  it('leaves out the flagged only when asked, and the digest follows', async () => {
    const t = await setup()
    t.fill(40)
    for (let i = 0; i < 5; i++) t.add(simulateFull(600 + i, { failCheck: true }))
    const as = await t.owner()
    const plain = await t.preview(as)
    const filtered = await t.preview(as, '?failedCheck=1')
    expect(plain.preview.n).toBe(45)
    expect(filtered.preview.n).toBe(40)
    expect(filtered.preview.leftOut).toEqual({ count: 5, failedCheck: true, speeders: false })
    expect(filtered.fingerprint).not.toBe(plain.fingerprint)
  })

  it('does not change what is public', async () => {
    const t = await setup()
    t.fill(60)
    await t.preview(await t.owner())
    expect((await t.publicResults()).published).toBe(false)
  })
})

describe('publishing', () => {
  it('puts the reviewed summary on the public page, exactly', async () => {
    const t = await setup()
    t.fill(140)
    const as = await t.owner()
    const p = await t.preview(as)

    const res = await t.call('POST', PUB, as, { fingerprint: p.fingerprint })
    expect(res.status).toBe(200)
    expect(((await res.json()) as any).published).toMatchObject({ n: 140, outOfDate: false })

    const pub = await t.publicResults()
    expect(pub.published).toBe(true)
    const { publishedAt: a, ...shown } = pub.results!
    const { publishedAt: b, ...reviewed } = p.preview
    expect(a).toEqual(expect.any(String))
    expect(b).toEqual(expect.any(String))
    expect(shown).toEqual(reviewed)
  })

  it('refuses when responses arrived after the preview, and leaves what was public alone', async () => {
    const t = await setup()
    t.fill(60)
    const as = await t.owner()
    const looked = await t.preview(as)

    t.fill(5, 2000)
    const res = await t.call('POST', PUB, as, { fingerprint: looked.fingerprint })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ changed: true })
    expect((await t.publicResults()).published).toBe(false)

    // The new version can be reviewed, and then published.
    const again = await t.preview(as)
    expect(again.preview.n).toBe(65)
    expect((await t.call('POST', PUB, as, { fingerprint: again.fingerprint })).status).toBe(200)
    expect((await t.publicResults()).results!.n).toBe(65)
  })

  it('refuses a digest from different exclusions than the ones it is asked to publish with', async () => {
    const t = await setup()
    t.fill(40)
    for (let i = 0; i < 5; i++) t.add(simulateFull(600 + i, { failCheck: true }))
    const as = await t.owner()
    const withFlagged = await t.preview(as)
    const res = await t.call('POST', PUB, as, { fingerprint: withFlagged.fingerprint, failedCheck: true })
    expect(res.status).toBe(409)
    expect((await t.publicResults()).published).toBe(false)
  })

  it('refuses below the floor, whatever digest it is given', async () => {
    const t = await setup()
    t.fill(PUBLISH_FLOOR - 1)
    const res = await t.call('POST', PUB, await t.owner(), { fingerprint: 'a'.repeat(64) })
    expect(res.status).toBe(409)
    expect(((await res.json()) as any).error).toMatch(/Only 29 completed responses are in/)
    expect((await t.publicResults()).published).toBe(false)
  })

  it('refuses a body that is not a digest, and takes no content from the browser', async () => {
    const t = await setup()
    t.fill(60)
    const as = await t.owner()
    for (const body of [{}, { fingerprint: 'short' }, { fingerprint: 'g'.repeat(64) }]) {
      expect((await t.call('POST', PUB, as, body)).status).toBe(400)
    }
    // A snapshot sent by the browser is not read: the Worker builds its own and the digest will not match.
    const forged = await t.call('POST', PUB, as, { fingerprint: 'a'.repeat(64), results: { n: 9999, ranking: [] } })
    expect(forged.status).toBe(409)
    expect((await t.publicResults()).published).toBe(false)
  })

  it('replaces what was published, rather than adding to it', async () => {
    const t = await setup()
    t.fill(60)
    const as = await t.owner()
    await t.call('POST', PUB, as, { fingerprint: (await t.preview(as)).fingerprint })
    t.fill(20, 3000)
    await t.call('POST', PUB, as, { fingerprint: (await t.preview(as)).fingerprint })
    expect((await t.publicResults()).results!.n).toBe(80)
    expect(t.db.prepare(`SELECT count(*) AS n FROM app_settings WHERE key = ?`).get(PUBLICATION_KEY)).toEqual({ n: 1 })
  })
})

describe('what the public page carries', () => {
  it('names no response, no channel, no free-text answer and no identity', async () => {
    const t = await setup()
    const tagged = Array.from({ length: 60 }, (_, i) => ({ ...simulateFull(i + 1), source: `zz-channel-${i}` }))
    for (const r of tagged) t.add(r)
    const as = await t.owner()
    await t.call('POST', PUB, as, { fingerprint: (await t.preview(as)).fingerprint })

    const text = await (await t.call('GET', '/api/public/survey/results')).text()
    for (const id of t.ids) expect(text).not.toContain(id)
    expect(text).not.toContain('zz-channel')
    expect(text).not.toContain('PRIVATE-NOTE')
    for (const marker of ['Under 25', 'Prefer not to say', 'Indigenous', 'New to Canada', '$50,000']) expect(text, marker).not.toContain(marker)
  })
})

describe('keeping it up to date, and taking it down', () => {
  it('says the published page is out of date once responses arrive, and not before', async () => {
    const t = await setup()
    t.fill(60)
    const as = await t.owner()
    await t.call('POST', PUB, as, { fingerprint: (await t.preview(as)).fingerprint })
    expect((await t.preview(as)).published).toMatchObject({ n: 60, outOfDate: false })

    t.fill(3, 4000)
    expect((await t.preview(as)).published).toMatchObject({ n: 60, outOfDate: true })
  })

  it('takes the page down at once, and can be asked twice', async () => {
    const t = await setup()
    t.fill(60)
    const as = await t.owner()
    await t.call('POST', PUB, as, { fingerprint: (await t.preview(as)).fingerprint })
    expect((await t.publicResults()).published).toBe(true)

    expect((await t.call('DELETE', PUB, as)).status).toBe(200)
    expect(await t.publicResults()).toEqual({ published: false })
    expect((await t.call('DELETE', PUB, as)).status).toBe(200)
    expect((await t.preview(as)).published).toBeNull()
  })

  it('does not touch a response, publishing or not', async () => {
    const t = await setup()
    t.fill(60)
    const before = t.db.prepare('SELECT count(*) AS n FROM survey_responses').get()
    const as = await t.owner()
    await t.call('POST', PUB, as, { fingerprint: (await t.preview(as)).fingerprint })
    await t.call('DELETE', PUB, as)
    expect(t.db.prepare('SELECT count(*) AS n FROM survey_responses').get()).toEqual(before)
  })
})
