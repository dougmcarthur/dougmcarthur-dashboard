import { describe, it, expect } from 'vitest'
import { app } from '../src/index'
import { createSession, setSessionMode, sha256Hex } from '../src/lib/auth'
import { SESSION_COOKIE } from '../shared/auth'
import { MIN_GROUP } from '../shared/surveyAnalysis'
import { simulate } from './support/surveyFixtures'
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
  return { env, get, sessionFor }
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

  it('reads the launch checklist from the configuration', async () => {
    const closed = await setup()
    const cookie = await closed.sessionFor('usr_0001', true)
    const a = (await (await closed.get('/api/admin/survey', { Cookie: cookie })).json()) as any
    expect(a.config).toEqual({ open: false, asked: false, contactSet: false, botCheck: false, resultsUrlSet: false })

    const ready = await setup({
      SURVEY_OPEN: 'true',
      SURVEY_CONTACT_EMAIL: 'survey@example.test',
      TURNSTILE_SITE_KEY: 'site',
      TURNSTILE_SECRET_KEY: 'secret',
      SURVEY_RESULTS_URL: 'https://example.test/results',
    })
    const b = (await (await ready.get('/api/admin/survey', { Cookie: await ready.sessionFor('usr_0001', true) })).json()) as any
    expect(b.config).toEqual({ open: true, asked: true, contactSet: true, botCheck: true, resultsUrlSet: true })
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
