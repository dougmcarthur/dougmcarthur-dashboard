import { describe, it, expect } from 'vitest'
import { app } from '../src/index'
import { createSession, setSessionMode, sha256Hex } from '../src/lib/auth'
import { SESSION_COOKIE } from '../shared/auth'
import { MIN_GROUP } from '../shared/surveyAnalysis'
import { simulate, storeSurveySettings } from './support/surveyFixtures'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The owner's side of the survey, through the real middleware with real
 * sessions. What is held here is who may see it and what it may show: only an
 * owner in admin mode, nothing that names a respondent, and no group under ten.
 */

const RESPONDENTS = 140

async function setup(vars: Record<string, string> = {}) {
  const { d1, db } = sqliteD1()
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787', API_TOKEN: 'agent-secret', ...vars } as never

  // The migrations seed the owner (usr_0001, on tnt_0001); one artist is added beside them.
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  db.exec(`INSERT INTO users (id, role, tenant_id, display_name, created_at) VALUES ('usr_artist', 'artist', 'tnt_0002', 'Artist', '2026-01-01')`)

  const insert = db.prepare(
    `INSERT INTO survey_responses (id, instrument, source, device, plan, answers, seconds, status, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'complete', ?, ?, ?)`,
  )
  for (let i = 1; i <= RESPONDENTS; i++) {
    const r = simulate(i)
    insert.run(
      `0000000000000000000000000000${String(i).padStart(4, '0')}`,
      r.instrument, r.source, r.device, JSON.stringify(r.plan), JSON.stringify(r.answers), JSON.stringify(r.seconds),
      r.createdAt, r.createdAt, r.completedAt,
    )
  }

  const sessionFor = async (userId: string, admin: boolean) => {
    const { token } = await createSession(env, { credentialId: null, label: 'test', userId })
    if (admin) await setSessionMode(env, await sha256Hex(token), 'admin')
    return `${SESSION_COOKIE}=${token}`
  }
  const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers }, env)
  const patch = (body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      '/api/admin/survey/settings',
      { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
      env,
    )
  const publicStatus = async () => (await (await app.request('/api/public/survey/status', {}, env)).json()) as any
  return { env, db, get, patch, publicStatus, sessionFor }
}

describe('who may see the survey results', () => {
  it('nobody without a session', async () => {
    const t = await setup()
    expect((await t.get('/api/admin/survey')).status).toBe(401)
    expect((await t.get('/api/admin/survey/export')).status).toBe(401)
  })

  it('not an artist, not even to say they are in admin mode', async () => {
    const t = await setup()
    const cookie = await t.sessionFor('usr_artist', false)
    expect((await t.get('/api/admin/survey', { Cookie: cookie })).status).toBe(403)
    expect((await t.get('/api/admin/survey/export', { Cookie: cookie })).status).toBe(403)
  })

  it('not the owner either, until they have switched to admin mode', async () => {
    const t = await setup()
    const res = await t.get('/api/admin/survey', { Cookie: await t.sessionFor('usr_0001', false) })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ needsMode: 'admin' })
  })

  it('not a research agent holding a token', async () => {
    const t = await setup()
    const res = await t.get('/api/admin/survey', { Authorization: 'Bearer agent-secret' })
    expect(res.status).toBe(403)
  })
})

describe('what the owner sees', () => {
  it('the summary, with the ranking and the choices', async () => {
    const t = await setup()
    const res = await t.get('/api/admin/survey', { Cookie: await t.sessionFor('usr_0001', true) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.summary.counts).toMatchObject({ started: RESPONDENTS, complete: RESPONDENTS })
    expect(body.summary.ranking.respondents).toBe(RESPONDENTS)
    expect(body.summary.choices.tasks).toBe(RESPONDENTS * 8)
    expect(body.truncated).toBe(false)
  })

  it('names no respondent: no id anywhere in what comes back', async () => {
    const t = await setup()
    const res = await t.get('/api/admin/survey', { Cookie: await t.sessionFor('usr_0001', true) })
    expect(await res.text()).not.toContain('0000000000000000')
  })

  it('shows no group of fewer than ten, in any table', async () => {
    const t = await setup()
    const body = (await (await t.get('/api/admin/survey', { Cookie: await t.sessionFor('usr_0001', true) })).json()) as any
    for (const rows of [body.summary.channels, ...Object.values(body.summary.composition)] as Array<Array<{ label: string; n: number | null }>>) {
      for (const row of rows) expect(row.n === null || row.n >= MIN_GROUP, row.label).toBe(true)
    }
  })

  it('reads what is switched on and set from the stored settings', async () => {
    const closed = await setup()
    const cookie = await closed.sessionFor('usr_0001', true)
    const a = (await (await closed.get('/api/admin/survey', { Cookie: cookie })).json()) as any
    expect(a.config).toEqual({
      open: false,
      asked: false,
      contact: null,
      siteKey: null,
      secretSet: false,
      botCheck: false,
      resultsUrl: 'http://localhost:8787/survey-results',
      changedAt: null,
    })

    const ready = await setup({ TURNSTILE_SECRET_KEY: 'secret' })
    storeSurveySettings(ready.db, { open: true, contact: 'survey@example.test', siteKey: 'site-key-123' }, '2026-02-03T04:05:06.000Z')
    const b = (await (await ready.get('/api/admin/survey', { Cookie: await ready.sessionFor('usr_0001', true) })).json()) as any
    expect(b.config).toEqual({
      open: true,
      asked: true,
      contact: 'survey@example.test',
      siteKey: 'site-key-123',
      secretSet: true,
      botCheck: true,
      resultsUrl: 'http://localhost:8787/survey-results',
      changedAt: '2026-02-03T04:05:06.000Z',
    })
  })

  it('never sends the Turnstile secret back, only whether it is there', async () => {
    const t = await setup({ TURNSTILE_SECRET_KEY: 'a-very-secret-value' })
    const res = await t.get('/api/admin/survey', { Cookie: await t.sessionFor('usr_0001', true) })
    expect(await res.text()).not.toContain('a-very-secret-value')
  })

  it('leaves out the flagged respondents only when asked', async () => {
    const t = await setup()
    const cookie = await t.sessionFor('usr_0001', true)
    const plain = (await (await t.get('/api/admin/survey', { Cookie: cookie })).json()) as any
    const filtered = (await (await t.get('/api/admin/survey?failedCheck=1&speeders=1', { Cookie: cookie })).json()) as any
    expect(plain.summary.excluding).toEqual({ failedCheck: false, speeders: false })
    expect(filtered.summary.excluding).toEqual({ failedCheck: true, speeders: true })
    // Flagged, never removed from the count of who answered.
    expect(filtered.summary.counts.complete).toBe(RESPONDENTS)
  })
})

describe('the export', () => {
  it('is the raw rows as a spreadsheet, one per response, to the owner alone', async () => {
    const t = await setup()
    const res = await t.get('/api/admin/survey/export', { Cookie: await t.sessionFor('usr_0001', true) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toContain('attachment')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const lines = (await res.text()).trim().split('\n')
    expect(lines[0].startsWith('id,status,source,device')).toBe(true)
    expect(lines.length).toBeGreaterThan(RESPONDENTS)
  })
})

describe('who may open and close the survey', () => {
  it('nobody without a session', async () => {
    const t = await setup()
    expect((await t.patch({ open: true })).status).toBe(401)
  })

  it('not an artist', async () => {
    const t = await setup()
    const res = await t.patch({ open: true }, { Cookie: await t.sessionFor('usr_artist', false) })
    expect(res.status).toBe(403)
  })

  it('not the owner either, until they have switched to admin mode', async () => {
    const t = await setup()
    const res = await t.patch({ open: true }, { Cookie: await t.sessionFor('usr_0001', false) })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ needsMode: 'admin' })
    expect((await t.publicStatus()).open).toBe(false)
  })

  it('not a research agent holding a token', async () => {
    const t = await setup()
    expect((await t.patch({ open: true }, { Authorization: 'Bearer agent-secret' })).status).toBe(403)
  })
})

describe('opening and closing it from admin mode', () => {
  const asOwner = async (t: Awaited<ReturnType<typeof setup>>) => ({ Cookie: await t.sessionFor('usr_0001', true) })

  it('refuses to open without a contact address, and stores nothing', async () => {
    const t = await setup()
    const res = await t.patch({ open: true }, await asOwner(t))
    expect(res.status).toBe(409)
    expect(((await res.json()) as any).error).toMatch(/contact address/i)
    expect((await t.publicStatus()).open).toBe(false)
    expect(t.db.prepare(`SELECT count(*) AS n FROM app_settings WHERE key LIKE 'survey.%'`).get()).toEqual({ n: 0 })
  })

  it('opens in one request when the address comes with it, and the public page sees it at once', async () => {
    const t = await setup()
    const res = await t.patch({ contact: 'hello@example.test', open: true }, await asOwner(t))
    expect(res.status).toBe(200)
    expect(((await res.json()) as any).config).toMatchObject({ open: true, asked: true, contact: 'hello@example.test' })
    expect(await t.publicStatus()).toMatchObject({ open: true, contact: 'hello@example.test' })
  })

  it('opens with an address stored earlier, then closes again', async () => {
    const t = await setup()
    const as = await asOwner(t)
    expect((await t.patch({ contact: 'hello@example.test' }, as)).status).toBe(200)
    expect((await t.publicStatus()).open).toBe(false)

    expect((await t.patch({ open: true }, as)).status).toBe(200)
    expect((await t.publicStatus()).open).toBe(true)

    const closed = await t.patch({ open: false }, as)
    expect(closed.status).toBe(200)
    expect(((await closed.json()) as any).config).toMatchObject({ open: false, asked: false, contact: 'hello@example.test' })
    expect((await t.publicStatus()).open).toBe(false)
  })

  it('will not strip the address from an open survey, which would close it behind a switch that reads on', async () => {
    const t = await setup()
    const as = await asOwner(t)
    await t.patch({ contact: 'hello@example.test', open: true }, as)

    for (const contact of ['', null]) {
      const res = await t.patch({ contact }, as)
      expect(res.status).toBe(409)
      expect(((await res.json()) as any).error).toMatch(/close the survey/i)
    }
    expect(await t.publicStatus()).toMatchObject({ open: true, contact: 'hello@example.test' })

    // Closing and removing it in one request is fine: nothing is left open.
    expect((await t.patch({ open: false, contact: null }, as)).status).toBe(200)
    expect(await t.publicStatus()).toMatchObject({ open: false, contact: null })
  })

  it('only moves "changed" when the switch does', async () => {
    const t = await setup()
    const as = await asOwner(t)
    await t.patch({ contact: 'hello@example.test', open: true }, as)
    const first = ((await (await t.get('/api/admin/survey', as)).json()) as any).config.changedAt
    expect(first).toEqual(expect.any(String))

    t.db.prepare(`UPDATE app_settings SET updated_at = '2020-01-01T00:00:00.000Z' WHERE key = 'survey.open'`).run()
    await t.patch({ open: true, contact: 'other@example.test' }, as)
    const second = ((await (await t.get('/api/admin/survey', as)).json()) as any).config.changedAt
    expect(second).toBe('2020-01-01T00:00:00.000Z')
  })

  it('takes a site key in the shape Cloudflare issues, since every respondent’s browser is handed it', async () => {
    const t = await setup()
    const as = await asOwner(t)
    for (const siteKey of ['has spaces in it', '<script>alert(1)</script>', 'short', 'x'.repeat(101)]) {
      expect((await t.patch({ siteKey }, as)).status, siteKey).toBe(400)
    }
    const ok = await t.patch({ siteKey: '0x4AAAAAAAbcdefGHIJ_k-1' }, as)
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as any).config).toMatchObject({ siteKey: '0x4AAAAAAAbcdefGHIJ_k-1', botCheck: false })
  })

  it('switches the spam check on only with both halves, and clears the key when told to', async () => {
    const t = await setup({ TURNSTILE_SECRET_KEY: 'secret' })
    const as = await asOwner(t)
    await t.patch({ contact: 'hello@example.test', open: true, siteKey: 'site-key-123' }, as)
    expect(await t.publicStatus()).toMatchObject({ siteKey: 'site-key-123' })

    await t.patch({ siteKey: '' }, as)
    expect((await t.publicStatus()).siteKey).toBeNull()
  })

  it('rejects a bad address and anything it was not asked for', async () => {
    const t = await setup()
    const as = await asOwner(t)
    expect((await t.patch({ contact: 'not an address' }, as)).status).toBe(400)
    expect((await t.patch({ open: 'yes' }, as)).status).toBe(400)
    expect((await t.patch({ results: 'x' }, as)).status).toBe(400)
    expect((await t.get('/api/admin/survey', as).then((r) => r.json())) as any).toMatchObject({ config: { contact: null } })
  })

  it('does not touch a response while it does any of this', async () => {
    const t = await setup()
    const before = t.db.prepare('SELECT count(*) AS n FROM survey_responses').get()
    await t.patch({ contact: 'hello@example.test', open: true }, await asOwner(t))
    expect(t.db.prepare('SELECT count(*) AS n FROM survey_responses').get()).toEqual(before)
  })
})
