import { readFileSync } from 'node:fs'
import { getTableColumns } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'
import { app } from '../src/index'
import { surveyResponses } from '../src/db/schema'
import { SURVEY_LIMITS } from '../src/routes/survey'
import { verifyTurnstile } from '../src/lib/turnstile'
import { screenKind, type Plan } from '../shared/surveyDesign'
import { questionOf, SCREEN_IN, type ChoiceQuestion } from '../shared/surveyInstrument'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The survey's public routes, run for real against the production schema.
 *
 * What is being held here is the notice a respondent reads: nothing identifies
 * them, closing without saving deletes, a finished response cannot be taken
 * back, and the survey does not open until it can name a contact. Each of those
 * is a promise made in plain words, so each is a test.
 */

const OPEN = { SURVEY_OPEN: 'true', SURVEY_CONTACT_EMAIL: 'survey@example.test' }

function setup(vars: Record<string, string> = OPEN) {
  const { d1, db } = sqliteD1()
  const env = { DB: d1, ...vars } as never
  const call = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      `/api/public/survey/${path}`,
      { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
      env,
    )
  const status = () => app.request('/api/public/survey/status', {}, env)
  const row = (id: string) => db.prepare('SELECT * FROM survey_responses WHERE id = ?').get(id) as Record<string, any> | undefined
  const count = () => (db.prepare('SELECT count(*) AS n FROM survey_responses').get() as { n: number }).n
  return { env, db, call, status, row, count }
}

/** A valid answer for any screen of a plan, as the page would send it. */
function answerFor(plan: Plan, screen: string): unknown {
  switch (screenKind(screen)) {
    case 'intro':
      return {}
    case 'rank': {
      const task = plan.rank.find((t) => t.id === screen)!
      return { best: task.items[0], worst: task.items[3] }
    }
    case 'choice': {
      const task = plan.choice.find((t) => t.id === screen)!
      return { choice: task.check ? task.dominant : 'a' }
    }
    default: {
      const q = questionOf(screen)!
      if (q.kind === 'text') return { text: 'The crowd, and the drive home.' }
      const cq = q as ChoiceQuestion
      const first = cq.options.find((o) => !o.exclusive) ?? cq.options[0]
      return cq.kind === 'multi' ? { value: [first.id] } : { value: screen === 'S1' ? SCREEN_IN : first.id }
    }
  }
}

async function startOne(t: ReturnType<typeof setup>, extra: Record<string, unknown> = {}) {
  const res = await t.call('start', { source: 'test-channel', device: 'computer', ...extra })
  expect(res.status).toBe(200)
  return (await res.json()) as { id: string; plan: Plan }
}

describe('closed until it can say who to ask', () => {
  it('is closed by default', async () => {
    const t = setup({})
    expect(await (await t.status()).json()).toMatchObject({ open: false, contact: null })
    const res = await t.call('start', {})
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ closed: true })
    expect(t.count()).toBe(0)
  })

  it('stays closed when asked to open but with no contact address', async () => {
    const t = setup({ SURVEY_OPEN: 'true' })
    expect((await (await t.status()).json()).open).toBe(false)
    expect((await t.call('start', {})).status).toBe(403)
  })

  it('stays closed with a contact address but not asked to open', async () => {
    const t = setup({ SURVEY_OPEN: 'false', SURVEY_CONTACT_EMAIL: 'survey@example.test' })
    expect((await t.call('start', {})).status).toBe(403)
  })

  it('opens with both, and tells the page the contact address for the notice', async () => {
    const t = setup()
    expect(await (await t.status()).json()).toMatchObject({ open: true, contact: 'survey@example.test', siteKey: null })
  })

  it('does not offer the spam check unless both halves are configured', async () => {
    expect((await (await setup({ ...OPEN, TURNSTILE_SITE_KEY: 'site' }).status()).json()).siteKey).toBeNull()
    expect((await (await setup({ ...OPEN, TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 's' }).status()).json()).siteKey).toBe('site')
  })

  it('can be reached with no sign-in', async () => {
    // The whole `/api/public/` prefix is outside the session check.
    const t = setup()
    expect((await t.status()).status).toBe(200)
  })
})

describe('a respondent from start to finish', () => {
  it('starts a response with a random id and a plan, and stores both', async () => {
    const t = setup()
    const { id, plan } = await startOne(t)
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(plan.screens[0]).toBe('S1')
    const row = t.row(id)!
    expect(row.status).toBe('in_progress')
    expect(row.source).toBe('test-channel')
    expect(row.device).toBe('computer')
    expect(JSON.parse(row.plan)).toEqual(plan)
  })

  it('gives two respondents two different ids and plans', async () => {
    const t = setup()
    const a = await startOne(t)
    const b = await startOne(t)
    expect(a.id).not.toBe(b.id)
    expect(a.plan.seed).not.toBe(b.plan.seed)
  })

  it('takes every screen, finishes, and keeps what was shown beside what was answered', async () => {
    const t = setup()
    const { id, plan } = await startOne(t)

    for (const screen of plan.screens) {
      const res = await t.call('answer', { id, screen, answer: answerFor(plan, screen), seconds: 4 })
      expect(res.status, screen).toBe(200)
    }
    const done = await t.call('complete', { id })
    expect(done.status).toBe(200)
    expect(await done.json()).toMatchObject({ status: 'complete' })

    const row = t.row(id)!
    expect(row.status).toBe('complete')
    expect(row.completed_at).not.toBeNull()
    expect(Object.keys(JSON.parse(row.answers)).sort()).toEqual([...plan.screens].sort())
    expect(Object.keys(JSON.parse(row.seconds)).length).toBe(plan.screens.length)
    expect(row.saves).toBe(plan.screens.length)
  })

  it('lets a returning respondent pick up where they left off', async () => {
    const t = setup()
    const { id, plan } = await startOne(t)
    await t.call('answer', { id, screen: 'S1', answer: { value: SCREEN_IN } })
    await t.call('answer', { id, screen: 'A1', answer: { value: 'A1.mb' } })
    const res = await t.call('resume', { id })
    const body = (await res.json()) as { status: string; plan: Plan; answers: Record<string, unknown> }
    expect(body.status).toBe('in_progress')
    expect(body.plan).toEqual(plan)
    expect(body.answers).toEqual({ S1: { value: SCREEN_IN }, A1: { value: 'A1.mb' } })
  })

  it('refuses to finish until the last question has been reached', async () => {
    const t = setup()
    const { id, plan } = await startOne(t)
    await t.call('answer', { id, screen: 'S1', answer: { value: SCREEN_IN } })
    expect((await t.call('complete', { id })).status).toBe(409)
    await t.call('answer', { id, screen: 'E5', answer: { skipped: true } })
    expect((await t.call('complete', { id })).status).toBe(200)
    expect(plan.screens).toContain('E5')
  })

  it('refuses any more answers once it is finished', async () => {
    const t = setup()
    const { id } = await startOne(t)
    await t.call('answer', { id, screen: 'E5', answer: { skipped: true } })
    await t.call('complete', { id })
    expect((await t.call('answer', { id, screen: 'A1', answer: { value: 'A1.mb' } })).status).toBe(409)
  })

  it('thanks and stops anybody who is not the artist, and keeps only that', async () => {
    const t = setup()
    const { id } = await startOne(t)
    const res = await t.call('answer', { id, screen: 'S1', answer: { value: 'S1.rep' } })
    expect(await res.json()).toMatchObject({ status: 'screened_out' })
    expect(t.row(id)).toMatchObject({ status: 'screened_out' })
    expect(JSON.parse(t.row(id)!.answers)).toEqual({ S1: { value: 'S1.rep' } })
  })
})

describe('close without saving', () => {
  it('deletes the response, answers and all', async () => {
    const t = setup()
    const { id } = await startOne(t)
    await t.call('answer', { id, screen: 'S1', answer: { value: SCREEN_IN } })
    expect((await t.call('discard', { id })).status).toBe(200)
    expect(t.row(id)).toBeUndefined()
    expect(t.count()).toBe(0)
  })

  it('cannot take back a finished survey, as the notice says', async () => {
    const t = setup()
    const { id } = await startOne(t)
    await t.call('answer', { id, screen: 'E5', answer: { skipped: true } })
    await t.call('complete', { id })
    expect((await t.call('discard', { id })).status).toBe(409)
    expect(t.row(id)).toBeDefined()
  })

  it('says nothing is wrong about one that is already gone, and cannot be used to find out which ids exist', async () => {
    const t = setup()
    const res = await t.call('discard', { id: 'a'.repeat(32) })
    expect(res.status).toBe(200)
  })
})

describe('answers that did not come from the screen', () => {
  it('turns away an option the question never offered, a screen that is not in the plan, and a bad id', async () => {
    const t = setup()
    const { id } = await startOne(t)
    expect((await t.call('answer', { id, screen: 'A2', answer: { value: 'A3.solo' } })).status).toBe(400)
    expect((await t.call('answer', { id, screen: 'R99', answer: { best: 'f01', worst: 'f02' } })).status).toBe(400)
    expect((await t.call('answer', { id: 'not-an-id', screen: 'A2', answer: { value: 'A2.lt2' } })).status).toBe(400)
    expect((await t.call('resume', { id: 'b'.repeat(32) })).status).toBe(404)
    expect(JSON.parse(t.row(id)!.answers)).toEqual({})
  })

  it('refuses a request body that is too large', async () => {
    const t = setup()
    const { id } = await startOne(t)
    const res = await t.call('answer', { id, screen: 'E5', answer: { text: 'x' } }, { 'content-length': String(SURVEY_LIMITS.bodyBytes + 1) })
    expect(res.status).toBe(413)
  })

  it('stops a script that writes to one response without end', async () => {
    const t = setup()
    const { id } = await startOne(t)
    t.db.prepare('UPDATE survey_responses SET saves = ? WHERE id = ?').run(SURVEY_LIMITS.savesPerResponse, id)
    expect((await t.call('answer', { id, screen: 'A2', answer: { value: 'A2.lt2' } })).status).toBe(429)
  })

  it('refuses a source tag that is not a plain tag', async () => {
    const t = setup()
    expect((await t.call('start', { source: 'a b' })).status).toBe(400)
    expect((await t.call('start', { source: 'x'.repeat(41) })).status).toBe(400)
    expect((await t.call('start', { source: 'https://evil.example' })).status).toBe(400)
  })
})

describe('bots and floods', () => {
  it('gives a form-filling bot an answer that looks like a person’s, and stores nothing', async () => {
    const t = setup()
    const res = await t.call('start', { website: 'http://spam.example' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; plan: Plan }
    expect(body.id).toMatch(/^[0-9a-f]{32}$/)
    expect(body.plan.screens[0]).toBe('S1')
    expect(t.count()).toBe(0)
  })

  it('asks for the spam check when it is configured, and turns away a start with no token', async () => {
    const t = setup({ ...OPEN, TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' })
    const res = await t.call('start', {})
    expect(res.status).toBe(400)
    expect(t.count()).toBe(0)
  })

  it('stops new starts, for everybody, past the hourly cap — and says to come back', async () => {
    const t = setup()
    const insert = t.db.prepare(
      `INSERT INTO survey_responses (id, instrument, plan, created_at, updated_at) VALUES (?, 'x', '{}', '2999-01-01T00:00:00.000Z', '2999-01-01T00:00:00.000Z')`,
    )
    for (let i = 0; i < SURVEY_LIMITS.startsPerHour; i++) insert.run(`f${String(i).padStart(31, '0')}`)
    const res = await t.call('start', {})
    expect(res.status).toBe(429)
    expect(((await res.json()) as { error: string }).error).toMatch(/try again/i)
  })

  it('stops for good at the overall limit', async () => {
    const t = setup()
    const insert = t.db.prepare(
      `INSERT INTO survey_responses (id, instrument, plan, created_at, updated_at) VALUES (?, 'x', '{}', '2000-01-01T00:00:00.000Z', '2000-01-01T00:00:00.000Z')`,
    )
    t.db.exec('BEGIN')
    for (let i = 0; i < SURVEY_LIMITS.total; i++) insert.run(`e${String(i).padStart(31, '0')}`)
    t.db.exec('COMMIT')
    expect((await t.call('start', {})).status).toBe(429)
  })
})

describe('the spam check', () => {
  const reply = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  it('passes what Cloudflare passes and fails what it fails', async () => {
    expect(await verifyTurnstile('s', 'tok', reply({ success: true }))).toBe('passed')
    expect(await verifyTurnstile('s', 'tok', reply({ success: false }))).toBe('failed')
  })

  it('fails with no token, without asking anyone', async () => {
    const never = (async () => {
      throw new Error('should not be called')
    }) as unknown as typeof fetch
    expect(await verifyTurnstile('s', undefined, never)).toBe('failed')
  })

  it('lets a response through when Cloudflare cannot be reached, which says nothing about the visitor', async () => {
    const down = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    expect(await verifyTurnstile('s', 'tok', down)).toBe('unavailable')
    expect(await verifyTurnstile('s', 'tok', reply({}, 503))).toBe('unavailable')
  })

  it('sends only the secret and the token, never an address', async () => {
    let sent: URLSearchParams | undefined
    const spy = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams
      return new Response(JSON.stringify({ success: true }))
    }) as unknown as typeof fetch
    await verifyTurnstile('the-secret', 'the-token', spy)
    expect([...sent!.keys()].sort()).toEqual(['response', 'secret'])
  })
})

describe('what the notice says is not stored', () => {
  it('has no column that could hold a person, or an address, or a hash of either', () => {
    expect(Object.keys(getTableColumns(surveyResponses)).sort()).toEqual([
      'answers', 'completedAt', 'createdAt', 'device', 'id', 'instrument', 'language',
      'plan', 'saves', 'seconds', 'source', 'status', 'updatedAt',
    ])
  })

  const route = readFileSync('src/routes/survey.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('never reads a header that names a visitor', () => {
    for (const name of ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'true-client-ip', 'user-agent', 'cf-ipcountry']) {
      expect(route.toLowerCase(), name).not.toContain(name)
    }
    // The only header it reads at all is the length of the body.
    expect([...route.matchAll(/\.header\('([^']+)'\)/g)].map((m) => m[1].toLowerCase())).toEqual(['content-length'])
  })

  it('never hashes anything, so there is no derived identifier either', () => {
    expect(route).not.toMatch(/sha256|digest\(|hash/i)
  })

  it('never puts the response id in a path, where the request logger prints it', () => {
    expect(route).not.toMatch(/survey\/[a-z]*\/?:/i)
    expect(route).not.toMatch(/'\/survey\/:/)
    expect([...route.matchAll(/survey\.(?:get|post|put|delete)\('([^']+)'/g)].map((m) => m[1]).sort()).toEqual([
      '/survey/answer', '/survey/complete', '/survey/discard', '/survey/resume', '/survey/start', '/survey/status',
    ])
  })

  it('has nothing to do with an artist’s rows', () => {
    expect(route).not.toMatch(/tenantOf|scoped\(|withTenant|asTenantId/)
  })

  it('forwards no address to the spam check', () => {
    expect(readFileSync('src/lib/turnstile.ts', 'utf8')).not.toMatch(/remoteip/i)
  })
})
