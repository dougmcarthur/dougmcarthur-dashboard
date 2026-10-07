import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { createSession, sha256Hex } from '../src/lib/auth'
import {
  AgentGigSchema,
  AgentPromoSchema,
  AgentSyncSchema,
  AgentTaskRunSchema,
} from '../src/lib/agentWrites'
import {
  AGENT_DAILY_LIMITS,
  AGENT_TEXT_MAX,
  duplicateGig,
  duplicateSyncTarget,
  overDailyLimit,
  windowStart,
} from '../shared/agentWrites'
import { SESSION_COOKIE } from '../shared/auth'
import { createGig, createPromoDraft, createSyncTarget, logRun, type ApiConfig } from '../scripts/agents/api'
import { TOOL_SPECS } from '../scripts/agents/tools'
import { sqliteD1 } from './support/sqliteD1'

/**
 * What an issued agent token may carry through the doors it already has.
 *
 * `agentRoutes.test.ts` holds which routes. This holds the body: a routine has
 * a shell and reads pages written by strangers, so a request that never went
 * through `cli.ts` is the case that matters — a gig filed already `booked`, a
 * run stamped next year, a hundred copies of one festival.
 */

const props = (spec: { inputSchema: { properties: object } }) => Object.keys(spec.inputSchema.properties).sort()
const keys = (schema: { shape: object }) => Object.keys(schema.shape).sort()

describe('the Worker accepts exactly what the agent tools send', () => {
  it('names the same fields as each tool', () => {
    // `status` is the one the runners add themselves (`discovered`).
    expect(keys(AgentGigSchema)).toEqual([...props(TOOL_SPECS.create_gig_opportunity), 'status'].sort())
    expect(keys(AgentSyncSchema)).toEqual(props(TOOL_SPECS.create_sync_target))
    expect(keys(AgentPromoSchema)).toEqual(props(TOOL_SPECS.create_promo_draft))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('passes the bodies the runners really post', async () => {
    const bodies: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        bodies[new URL(url).pathname] = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({ id: 1 }), { status: 200 })
      }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const cfg: ApiConfig = { baseUrl: 'https://scout.test', token: 't', apply: true }

    // cli.ts and run.ts both add `status: 'discovered'` to a gig.
    await createGig(cfg, {
      name: 'Folk Fest',
      type: 'festival',
      url: 'https://folkfest.example/artists',
      fitRationale: 'Fits.',
      paid: true,
      feeAmount: 25,
      feeCurrency: 'CAD',
      status: 'discovered',
    })
    await createSyncTarget(cfg, {
      name: 'Library',
      agencyType: 'library',
      contactEmail: 'a@b.test',
      website: 'https://library.example',
      submissionPolicy: 'open',
      policyQuote: 'We welcome submissions.',
      policyUrl: 'https://library.example/submit',
      notes: 'n',
      pitchDraft: 'p',
    })
    await createPromoDraft(cfg, { month: '2026-11', title: 't', content: 'c' })
    await logRun(cfg, { taskId: 'gig-festival-scan', status: 'ok', summary: 's', itemsAdded: 2 })

    expect(AgentGigSchema.safeParse(bodies['/api/gigs']).success).toBe(true)
    expect(AgentSyncSchema.safeParse(bodies['/api/sync']).success).toBe(true)
    expect(AgentPromoSchema.safeParse(bodies['/api/promo']).success).toBe(true)
    expect(AgentTaskRunSchema.safeParse(bodies['/api/task-runs']).success).toBe(true)
  })

  it('refuses every field the tools never send', () => {
    const refused: Array<[string, unknown]> = [
      ['gig status', { ...{ name: 'x', type: 'festival' }, status: 'booked' }],
      ['gig show dates', { name: 'x', type: 'festival', performanceStart: '2027-07-01', performanceEnd: '2027-07-03' }],
      ['gig guarantee', { name: 'x', type: 'festival', guaranteeAmount: 5000 }],
      ['gig submitted stamp', { name: 'x', type: 'festival', submittedAt: '2026-01-01T00:00:00Z' }],
      ['sync status', { name: 'x', submissionPolicy: 'unknown', status: 'confirmed' }],
      ['promo status', { month: '2026-11', title: 't', content: 'c', status: 'posted' }],
      ['run timestamp', { task_id: 'gig-festival-scan', status: 'ok', run_at: '2099-01-01T00:00:00Z' }],
    ]
    const schemas = [AgentGigSchema, AgentGigSchema, AgentGigSchema, AgentGigSchema, AgentSyncSchema, AgentPromoSchema, AgentTaskRunSchema]
    refused.forEach(([label, body], i) => expect(schemas[i].safeParse(body).success, label).toBe(false))
  })

  it('only takes a web address as a web address', () => {
    for (const url of ['javascript:alert(1)', 'ftp://files.example/x', 'data:text/html,hi', 'not a url']) {
      expect(AgentGigSchema.safeParse({ name: 'x', type: 'festival', url }).success, url).toBe(false)
      expect(AgentGigSchema.safeParse({ name: 'x', type: 'festival', applicationUrl: url }).success, url).toBe(false)
    }
    expect(AgentGigSchema.safeParse({ name: 'x', type: 'festival', url: '' }).success).toBe(true)
  })

  it('bounds every text field', () => {
    const long = (n: number) => 'x'.repeat(n)
    const cases: Array<[string, any, Record<string, string>, number]> = [
      ['gig name', AgentGigSchema, { type: 'festival' }, AGENT_TEXT_MAX.name],
      ['gig fitRationale', AgentGigSchema, { name: 'x', type: 'festival' }, AGENT_TEXT_MAX.prose],
      ['gig deadlineNote', AgentGigSchema, { name: 'x', type: 'festival' }, AGENT_TEXT_MAX.note],
      ['sync notes', AgentSyncSchema, { name: 'x', submissionPolicy: 'unknown' }, AGENT_TEXT_MAX.prose],
      ['sync pitchDraft', AgentSyncSchema, { name: 'x', submissionPolicy: 'unknown' }, AGENT_TEXT_MAX.pitch],
      ['promo content', AgentPromoSchema, { month: '2026-11', title: 't' }, AGENT_TEXT_MAX.prose],
      ['run summary', AgentTaskRunSchema, { task_id: 't', status: 'ok' }, AGENT_TEXT_MAX.summary],
    ]
    for (const [label, schema, base, max] of cases) {
      const field = label.split(' ')[1]
      expect(schema.safeParse({ ...base, [field]: long(max) }).success, `${label} at the limit`).toBe(true)
      expect(schema.safeParse({ ...base, [field]: long(max + 1) }).success, `${label} over it`).toBe(false)
    }
  })

  it('leaves a pitch the room the prompt asks for and then some', () => {
    // 190 words is where the tool starts nudging; a hard refusal that low would
    // lose a draft to an encoding limit. 190 words of long ones is ~1,500 chars.
    expect(AGENT_TEXT_MAX.pitch).toBeGreaterThan(190 * 12)
  })
})

describe('the daily ceiling', () => {
  it('opens at the limit, not above it', () => {
    expect(overDailyLimit('gig', AGENT_DAILY_LIMITS.gig - 1)).toBe(false)
    expect(overDailyLimit('gig', AGENT_DAILY_LIMITS.gig)).toBe(true)
  })

  it('looks back one day from the instant it is handed', () => {
    expect(windowStart(new Date('2026-10-07T08:00:00.000Z'))).toBe('2026-10-06T08:00:00.000Z')
  })
})

describe('what counts as a repeat', () => {
  const known = [
    { id: 4, name: 'Winnipeg Folk Festival', url: 'https://www.winnipegfolkfestival.ca/artists/apply', applicationUrl: null },
    { id: 9, name: 'Canmore Folk Music Festival', url: null, applicationUrl: 'https://canmorefolkfest.festivalpro.com/form/59EF/0' },
    { id: 12, name: 'Arts Council grants', url: 'https://artscouncil.example/', applicationUrl: null },
    { id: 15, name: 'Call by id', url: 'https://portal.example/call?id=1', applicationUrl: null },
  ]

  it('is the same name however it is spelled', () => {
    expect(duplicateGig({ name: 'WINNIPEG FOLK FESTIVAL!' }, known)?.id).toBe(4)
    expect(duplicateGig({ name: 'winnipeg  folk-festival' }, known)?.id).toBe(4)
    expect(duplicateGig({ name: 'Winnipeg Folk Festival 2027' }, known)).toBeNull()
  })

  it('is the same page, whichever of the two addresses it came in as', () => {
    expect(duplicateGig({ name: 'Other name', url: 'http://winnipegfolkfestival.ca/artists/apply/' }, known)?.id).toBe(4)
    expect(duplicateGig({ name: 'Other name', applicationUrl: 'https://canmorefolkfest.festivalpro.com/form/59EF/0' }, known)?.id).toBe(9)
  })

  it('is not two programmes sharing a home page, or two calls sharing a path', () => {
    expect(duplicateGig({ name: 'A different grant', url: 'https://artscouncil.example/' }, known)).toBeNull()
    expect(duplicateGig({ name: 'Call two', url: 'https://portal.example/call?id=2' }, known)).toBeNull()
  })

  it('is a sync target of the same name or at the same address', () => {
    const targets = [{ id: 2, name: 'Musicbed', contactEmail: 'Submit@Musicbed.test' }]
    expect(duplicateSyncTarget({ name: 'musicbed' }, targets)?.id).toBe(2)
    expect(duplicateSyncTarget({ name: 'Musicbed Inc.', contactEmail: 'submit@musicbed.test' }, targets)?.id).toBe(2)
    expect(duplicateSyncTarget({ name: 'Artlist', contactEmail: '' }, targets)).toBeNull()
  })
})

// The Worker reads the clock for its trailing day and its run stamps, so the
// clock is pinned: a fixture counted from the real "now" is the mistake
// uiConsistency.test.ts exists to catch.
const NOW = '2026-10-07T12:00:00.000Z'
const OLD = '2026-10-05T12:00:00.000Z'

afterEach(() => vi.useRealTimers())

/** The Worker, with real sessions and a real SQLite behind it. */
async function setup() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  const { d1, db } = sqliteD1()
  const env = { DB: d1, DASHBOARD_URL: 'http://localhost:8787', API_TOKEN: 'legacy-secret' } as never

  // The migrations seed the owner on tnt_0001. The token belongs to an artist.
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)
  db.prepare(`INSERT INTO agent_tokens (id, tenant_id, token_hash, label) VALUES ('tok_1', 'tnt_0002', ?, 'Research routines')`).run(
    await sha256Hex('issued-token'),
  )

  const send = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(
      path,
      { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
      env,
    )
  const agent = (path: string, body: unknown) => send(path, body, { Authorization: 'Bearer issued-token' })
  const legacy = (path: string, body: unknown) => send(path, body, { Authorization: 'Bearer legacy-secret' })
  const person = async (path: string, body: unknown) => {
    const { token } = await createSession(env, { credentialId: null, label: 'test', userId: 'usr_0001' })
    return send(path, body, { Cookie: `${SESSION_COOKIE}=${token}` })
  }
  const count = (table: string, tenant = 'tnt_0002') =>
    (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE tenant_id = ?`).get(tenant) as { n: number }).n

  const seedGigs = (n: number, tenant: string, at: string) => {
    const insert = db.prepare(
      `INSERT INTO gig_opportunities (tenant_id, name, type, status, discovered_at, updated_at) VALUES (?, ?, 'festival', 'discovered', ?, ?)`,
    )
    for (let i = 0; i < n; i++) insert.run(tenant, `Seeded ${tenant} ${at} ${i}`, at, at)
  }
  return { db, env, agent, legacy, person, count, seedGigs }
}

const FOLK = { name: 'Folk Fest', type: 'festival', url: 'https://folkfest.example/artists', fitRationale: 'Fits.', status: 'discovered' }

describe('POST /api/gigs with an issued token', () => {
  it('files what the tool sends, to the token\'s own artist', async () => {
    const t = await setup()
    const res = await t.agent('/api/gigs', FOLK)
    expect(res.status).toBe(201)
    expect(t.count('gig_opportunities')).toBe(1)
    expect(t.count('gig_opportunities', 'tnt_0001')).toBe(0)
  })

  it('refuses a row filed further along than discovered, and stores nothing', async () => {
    const t = await setup()
    const res = await t.agent('/api/gigs', { ...FOLK, status: 'booked', performanceStart: '2027-07-01', performanceEnd: '2027-07-03' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/status|performanceStart/)
    expect(t.count('gig_opportunities')).toBe(0)
  })

  it('refuses a link that is not a web page', async () => {
    const t = await setup()
    expect((await t.agent('/api/gigs', { ...FOLK, url: 'javascript:alert(1)' })).status).toBe(400)
    expect(t.count('gig_opportunities')).toBe(0)
  })

  it('refuses a field past its limit', async () => {
    const t = await setup()
    const res = await t.agent('/api/gigs', { ...FOLK, fitRationale: 'x'.repeat(AGENT_TEXT_MAX.prose + 1) })
    expect(res.status).toBe(400)
    expect(t.count('gig_opportunities')).toBe(0)
  })

  it('says which row it repeats, and files nothing', async () => {
    const t = await setup()
    expect((await t.agent('/api/gigs', FOLK)).status).toBe(201)

    const again = await t.agent('/api/gigs', { ...FOLK, name: 'FOLK FEST!', url: 'https://other.example/x' })
    expect(again.status).toBe(409)
    expect(((await again.json()) as { error: string }).error).toMatch(/gig #1, "Folk Fest"/)

    const samePage = await t.agent('/api/gigs', { ...FOLK, name: 'Renamed Fest' })
    expect(samePage.status).toBe(409)
    expect(t.count('gig_opportunities')).toBe(1)
  })

  it('does not take another artist\'s row for a repeat', async () => {
    const t = await setup()
    t.db.prepare(
      `INSERT INTO gig_opportunities (tenant_id, name, type, url, discovered_at, updated_at) VALUES ('tnt_0001', 'Folk Fest', 'festival', ?, ?, ?)`,
    ).run(FOLK.url, NOW, NOW)
    expect((await t.agent('/api/gigs', FOLK)).status).toBe(201)
  })

  it('stops at the daily ceiling, counting only the last day and only its own artist', async () => {
    const t = await setup()
    t.seedGigs(AGENT_DAILY_LIMITS.gig, 'tnt_0001', NOW)
    t.seedGigs(AGENT_DAILY_LIMITS.gig, 'tnt_0002', OLD)
    expect((await t.agent('/api/gigs', FOLK)).status).toBe(201)

    t.seedGigs(AGENT_DAILY_LIMITS.gig - 1, 'tnt_0002', NOW)
    const res = await t.agent('/api/gigs', { ...FOLK, name: 'One too many', url: 'https://x.example/too/many' })
    expect(res.status).toBe(429)
    expect(((await res.json()) as { error: string }).error).toContain(`${AGENT_DAILY_LIMITS.gig} a day`)
  })
})

describe('POST /api/sync, /api/promo and /api/task-runs with an issued token', () => {
  it('files a sync target and refuses its repeats and its extras', async () => {
    const t = await setup()
    const body = { name: 'Musicbed', agencyType: 'library', contactEmail: 'submit@musicbed.test', notes: 'n', pitchDraft: 'p', submissionPolicy: 'unknown' }
    expect((await t.agent('/api/sync', body)).status).toBe(201)
    expect((await t.agent('/api/sync', { ...body, name: 'Other', contactEmail: 'SUBMIT@musicbed.test' })).status).toBe(409)
    expect((await t.agent('/api/sync', { name: 'Artlist', submissionPolicy: 'unknown', status: 'confirmed' })).status).toBe(400)
    expect(t.count('sync_targets')).toBe(1)
  })

  it('refuses a sync target filed without saying what its own pages say about pitches', async () => {
    // A target whose About page said "no unsolicited material" was filed as ready
    // to pitch. "unknown" is an allowed answer; saying nothing is not.
    const t = await setup()
    const res = await t.agent('/api/sync', { name: 'Musicbed', contactEmail: 'submit@musicbed.test', notes: 'n', pitchDraft: 'p' })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/submissionPolicy/)
    expect(t.count('sync_targets')).toBe(0)
  })

  it('files a promo draft, refuses a status, and stops at its ceiling', async () => {
    const t = await setup()
    const draft = (n: number) => ({ month: '2026-11', title: `Draft ${n}`, content: 'Something real.' })
    expect((await t.agent('/api/promo', { ...draft(0), status: 'posted' })).status).toBe(400)
    for (let i = 0; i < AGENT_DAILY_LIMITS.promo; i++) expect((await t.agent('/api/promo', draft(i))).status).toBe(201)
    expect((await t.agent('/api/promo', draft(99))).status).toBe(429)
    expect(t.count('promo_drafts')).toBe(AGENT_DAILY_LIMITS.promo)
  })

  it('refuses a run stamped by the caller', async () => {
    const t = await setup()
    const res = await t.agent('/api/task-runs', { task_id: 'gig-festival-scan', status: 'ok', run_at: '2099-01-01T00:00:00.000Z' })
    expect(res.status).toBe(400)
    expect(t.count('task_runs')).toBe(0)
  })

  it('stamps a run with the Worker\'s own clock', async () => {
    const t = await setup()
    expect((await t.agent('/api/task-runs', { task_id: 'gig-festival-scan', status: 'ok', summary: 's', items_added: 1 })).status).toBe(201)
    const { run_at } = t.db.prepare(`SELECT run_at FROM task_runs WHERE tenant_id = 'tnt_0002'`).get() as { run_at: string }
    expect(run_at).toBe(NOW)
  })
})

describe('who else reaches the same routes', () => {
  it('ignores a run date from the legacy secret too, because neither runner sends one', async () => {
    const t = await setup()
    const res = await t.legacy('/api/task-runs', { task_id: 'gig-festival-scan', status: 'ok', run_at: '2099-01-01T00:00:00.000Z' })
    expect(res.status).toBe(201)
    const { run_at } = t.db.prepare(`SELECT run_at FROM task_runs WHERE tenant_id = 'tnt_0001'`).get() as { run_at: string }
    expect(run_at).toBe(NOW)
  })

  it('leaves a signed-in person\'s form alone', async () => {
    const t = await setup()
    // Everything an agent is refused, from the artist themselves.
    const gig = await t.person('/api/gigs', { name: 'Private show', type: 'house concert', status: 'booked', performanceStart: '2027-07-01', performanceEnd: '2027-07-01' })
    expect(gig.status).toBe(201)
    const run = await t.person('/api/task-runs', { task_id: 'gig-festival-scan', status: 'ok', run_at: '2026-06-01T00:00:00.000Z' })
    expect(run.status).toBe(201)
    const { run_at } = t.db.prepare(`SELECT run_at FROM task_runs WHERE tenant_id = 'tnt_0001'`).get() as { run_at: string }
    expect(run_at).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('the middleware is on every create route', () => {
  const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

  it('names its kind before the route\'s own validator', () => {
    const routes: Array<[string, string]> = [
      ['../src/routes/gigs.ts', "gigs.post('/', agentWrite('gig'), zValidator("],
      ['../src/routes/sync.ts', "sync.post('/', agentWrite('sync'), zValidator("],
      ['../src/routes/promo.ts', "promo.post('/', agentWrite('promo'), zValidator("],
      ['../src/routes/taskRuns.ts', "  agentWrite('taskRun'),\n  zValidator("],
    ]
    for (const [file, expected] of routes) expect(src(file), file).toContain(expected)
  })
})
