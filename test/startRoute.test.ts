import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { asTenantId, scoped } from '../src/db/scope'
import { getDb } from '../src/db'
import { gigOpportunities, opportunities, syncTargets } from '../src/db/schema'
import { checkPendingTerms, checkTarget } from '../src/lib/syncTerms'
import { mirrorTargetTerms, recordOrgTerms, findingOfRow } from '../src/lib/orgTerms'
import matching from '../src/routes/matching'
import { sqliteD1 } from './support/sqliteD1'

/**
 * What a new account is shown, against the production schema.
 *
 * The questions are whose rows move and what a stranger's request can add. The
 * catalog belongs to nobody and is read by everybody; what is written lands on
 * one tenant's side, and what the owner's research learned about an
 * organisation's terms reaches the catalog only from the owner.
 */

const TODAY = '2027-01-15'
const NOW = `${TODAY}T12:00:00.000Z`
const OWNER = asTenantId('tnt_0001')
const ARTIST = asTenantId('tnt_0002')
const OTHER = asTenantId('tnt_0003')

const day = (n: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function database() {
  const { d1, db } = sqliteD1()
  for (const [id, name] of [['tnt_0002', 'Second Artist'], ['tnt_0003', 'Third Artist']]) {
    db.prepare("INSERT INTO tenants (id, display_name, created_at) VALUES (?, ?, '2026-10-01T00:00:00Z')").run(id, name)
  }
  const env = { DB: d1 } as never

  let n = 0
  const entry = (o: Partial<{
    category: string; name: string; kind: string; location: string | null; country: string | null; region: string | null
    deadline: string | null; deadlineNote: string | null; firstSeenAt: string; delivery: string | null; eligibility: string | null
    site: string | null; policy: string | null; policyEvidence: string | null; exclusivity: string | null
    exclusivityEvidence: string | null; termsReadAt: string | null
  }> = {}) => {
    n++
    db.prepare(
      `INSERT INTO opportunities
         (catalog_key, category, name, kind, url, deadline, deadline_note, location, country, region, eligibility, public,
          first_seen_at, last_seen_at, delivery, site, submission_policy, policy_evidence, policy_url, policy_checked_at,
          exclusivity, exclusivity_evidence, exclusivity_url, terms_read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `key:${n}`, o.category ?? 'funding', o.name ?? `Entry ${n}`, o.kind ?? 'Grant', `https://example.test/${n}`,
      o.deadline === undefined ? day(30) : o.deadline, o.deadlineNote ?? null,
      o.location === undefined ? 'National' : o.location, o.country === undefined ? 'CA' : o.country,
      o.region === undefined ? null : o.region, o.eligibility ?? null,
      o.firstSeenAt ?? day(-30), o.firstSeenAt ?? day(-30), o.delivery ?? null,
      o.site ?? null, o.policy ?? null, o.policyEvidence ?? null, o.policy ? 'https://lib.test/submit' : null,
      o.policy ? day(-2) : null, o.exclusivity ?? null, o.exclusivityEvidence ?? null,
      o.exclusivity ? 'https://lib.test/artists' : null, o.termsReadAt ?? null,
    )
    return n
  }

  /** A sync organisation whose own site says it takes submissions and asks for no exclusivity. */
  const library = (o: Parameters<typeof entry>[0] = {}) =>
    entry({
      category: 'sync', kind: 'Library', deadline: null, location: null, country: null,
      site: 'https://lib.test', policy: 'open', policyEvidence: 'We welcome submissions from independent artists.',
      exclusivity: 'non_exclusive', exclusivityEvidence: 'All of our agreements with artists are non-exclusive.',
      termsReadAt: day(-2), ...o,
    })

  const put = (tenant: string, key: string, value: unknown) =>
    db.prepare("INSERT INTO tenant_settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, '2027-01-01')").run(tenant, key, JSON.stringify(value))

  const gigRows = async (tenant: typeof OWNER) =>
    getDb(d1).select().from(gigOpportunities).where(scoped(gigOpportunities, tenant))
  const syncRows = async (tenant: typeof OWNER) =>
    getDb(d1).select().from(syncTargets).where(scoped(syncTargets, tenant))
  const catalogRow = (id: number) => db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as Record<string, unknown>

  return { env, db, d1, entry, library, put, gigRows, syncRows, catalogRow }
}

function app(env: unknown, tenant: string = 'tnt_0002') {
  const a = new Hono()
  a.use('*', async (c, next) => {
    c.set('actor' as never, { kind: 'user', role: 'artist', tenant, session: { elevatedAt: null } } as never)
    await next()
  })
  a.route('/', matching as never)
  const url = (path: string) => `${path}${path.includes('?') ? '&' : '?'}today=${TODAY}`
  return {
    get: (path: string) => a.request(url(path), undefined, env as never),
    post: (path: string, body: unknown) =>
      a.request(url(path), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, env as never),
  }
}

type Lanes = {
  answered: boolean
  established: boolean
  lanes: {
    order: string[]
    grants: { rows: Array<{ id: number; name: string }>; total: number }
    province: { region: { code: string } | null; rows: Array<{ id: number; name: string }>; heading: string }
    sync: { rows: Array<{ id: number; name: string }>; unclear: Array<{ id: number }>; exclusive: number; closed: number }
  }
}

describe('what a new account is shown', () => {
  it('has something to look at before anything is said', async () => {
    const t = database()
    t.entry({ name: 'Arts Across Canada' })
    t.library({ name: 'Open Library' })

    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.grants.rows.map((r) => r.name)).toEqual(['Arts Across Canada'])
    expect(body.lanes.sync.rows.map((r) => r.name)).toEqual(['Open Library'])
    expect(body.lanes.province.region).toBeNull()
    expect(body.answered).toBe(false)
  })

  it('writes nothing', async () => {
    const t = database()
    t.entry()
    t.library()
    await app(t.env).get('/start')
    expect(await t.gigRows(ARTIST)).toEqual([])
    expect(await t.syncRows(ARTIST)).toEqual([])
  })

  it('names their province from what they said in the welcome questions', async () => {
    const t = database()
    t.entry({ category: 'festival', kind: 'Festival', name: 'Home Fest', location: 'Winnipeg, MB', region: 'MB' })
    t.entry({ category: 'showcase', kind: 'Showcase', name: 'Away Showcase', location: 'Regina, SK', region: 'SK' })
    t.put('tnt_0002', 'onboarding.profile', { region: 'MB', city: null, genres: [] })

    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.province.region?.code).toBe('MB')
    expect(body.lanes.province.rows.map((r) => r.name)).toEqual(['Home Fest'])
  })

  it('prefers the home base they set in Settings to the province they said', async () => {
    const t = database()
    t.entry({ category: 'festival', kind: 'Festival', name: 'Sask Fest', location: 'Regina, SK', region: 'SK' })
    t.put('tnt_0002', 'onboarding.profile', { region: 'MB', city: null, genres: [] })
    t.put('tnt_0002', 'travel.home', { lat: 50.4, lon: -104.6, place: 'Regina, SK', checkedAt: NOW })

    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.province.region?.code).toBe('SK')
    expect(body.lanes.province.rows.map((r) => r.name)).toEqual(['Sask Fest'])
  })

  it('counts what it will not list, so a refusal is never a row', async () => {
    const t = database()
    t.library({ name: 'Wants exclusive', exclusivity: 'exclusive', exclusivityEvidence: 'Exclusive for three years.' })
    t.library({ name: 'Refuses', policy: 'closed', policyEvidence: 'No unsolicited material please.', exclusivity: null, exclusivityEvidence: null })
    t.library({ name: 'Silent', exclusivity: null, exclusivityEvidence: null })

    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.sync.rows).toEqual([])
    expect(body.lanes.sync.unclear).toHaveLength(1)
    expect(body.lanes.sync.exclusive).toBe(1)
    expect(body.lanes.sync.closed).toBe(1)
  })

  it('does not show an entry still in the holding period', async () => {
    const t = database()
    t.entry({ name: 'Just arrived', firstSeenAt: day(0) })
    t.library({ name: 'Just arrived library', firstSeenAt: day(0) })
    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.grants.rows).toEqual([])
    expect(body.lanes.sync.rows).toEqual([])
  })
})

describe('when it is no longer shown', () => {
  const rows = (t: ReturnType<typeof database>, n: number) => {
    for (let i = 0; i < n; i++) {
      t.db
        .prepare(
          "INSERT INTO gig_opportunities (tenant_id, name, type, status, discovered_at, updated_at) VALUES ('tnt_0002', ?, 'festival', 'new', ?, ?)",
        )
        .run(`Row ${i}`, NOW, NOW)
    }
  }

  it('is shown to an account with a few rows, and not once the list is its own', async () => {
    const t = database()
    t.entry()
    rows(t, 11)
    const few = (await (await app(t.env).get('/start')).json()) as Lanes & { lanes: unknown }
    expect(few.established).toBe(false)
    expect(few.lanes).not.toBeNull()

    rows(t, 1)
    const many = (await (await app(t.env).get('/start')).json()) as Lanes & { lanes: unknown }
    expect(many.established).toBe(true)
    expect(many.lanes).toBeNull()
  })

  it('counts Sync targets too', async () => {
    const t = database()
    t.entry()
    rows(t, 6)
    for (let i = 0; i < 6; i++) {
      t.db
        .prepare("INSERT INTO sync_targets (tenant_id, name, status, discovered_at, updated_at) VALUES ('tnt_0002', ?, 'draft_ready', ?, ?)")
        .run(`Target ${i}`, NOW, NOW)
    }
    const body = (await (await app(t.env).get('/start')).json()) as { established: boolean; lanes: unknown }
    expect(body.established).toBe(true)
    expect(body.lanes).toBeNull()
  })

  it('is gone once they have said not now', async () => {
    const t = database()
    t.entry()
    await app(t.env).post('/starter/decline', {})
    const body = (await (await app(t.env).get('/start')).json()) as { answered: boolean; lanes: unknown }
    expect(body.answered).toBe(true)
    expect(body.lanes).toBeNull()
  })

  it('is gone when they have switched suggestions off', async () => {
    const t = database()
    t.entry()
    t.put('tnt_0002', 'matching.off', '2027-01-01T00:00:00.000Z')
    const body = (await (await app(t.env).get('/start')).json()) as { off: boolean; lanes: unknown }
    expect(body.off).toBe(true)
    expect(body.lanes).toBeNull()
  })

  it('does not count rows that belong to another artist', async () => {
    const t = database()
    t.entry()
    for (let i = 0; i < 12; i++) {
      t.db
        .prepare("INSERT INTO gig_opportunities (tenant_id, name, type, status, discovered_at, updated_at) VALUES ('tnt_0001', ?, 'festival', 'new', ?, ?)")
        .run(`Owner row ${i}`, NOW, NOW)
    }
    const body = (await (await app(t.env).get('/start')).json()) as { established: boolean; lanes: unknown }
    expect(body.established).toBe(false)
    expect(body.lanes).not.toBeNull()
  })
})

describe('adding festivals, showcases and grants', () => {
  it('files New rows linked to the catalog, with the reason on the row, and only on this artist', async () => {
    const t = database()
    const id = t.entry({ name: 'Arts Across Canada' })

    const res = await app(t.env).post('/start/add', { ids: [id] })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ added: 1, names: ['Arts Across Canada'] })

    const rows = await t.gigRows(ARTIST)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Arts Across Canada', opportunityId: id, origin: 'catalog', status: 'new' })
    expect(rows[0].fitRationale).toMatch(/Read the listing before you apply/)
    expect(await t.gigRows(OWNER)).toEqual([])
    expect(await t.gigRows(OTHER)).toEqual([])
  })

  it('adds nothing the lanes would not have offered, whatever id it is given', async () => {
    const t = database()
    const closed = t.entry({ name: 'Closed', deadline: day(-3) })
    const provincial = t.entry({ name: 'Provincial grant', location: 'Regina, SK', region: 'SK' })
    const held = t.entry({ name: 'Held', firstSeenAt: day(0) })
    const blocked = t.entry({ name: 'Blocked', delivery: 'blocked' })

    const res = await app(t.env).post('/start/add', { ids: [closed, provincial, held, blocked, 9999] })
    expect(await res.json()).toEqual({ added: 0, names: [] })
    expect(await t.gigRows(ARTIST)).toEqual([])
  })

  it('files one row for one entry, however many times it is asked', async () => {
    const t = database()
    const id = t.entry()
    await app(t.env).post('/start/add', { ids: [id] })
    const second = await app(t.env).post('/start/add', { ids: [id] })
    expect(await second.json()).toEqual({ added: 0, names: [] })
    expect(await t.gigRows(ARTIST)).toHaveLength(1)
  })

  it('does not offer again what they have, so the lane moves on', async () => {
    const t = database()
    const first = t.entry({ name: 'First', deadline: day(10) })
    t.entry({ name: 'Second', deadline: day(20) })
    await app(t.env).post('/start/add', { ids: [first] })
    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.grants.rows.map((r) => r.name)).toEqual(['Second'])
  })

  it('refuses a request with no ids or too many', async () => {
    const t = database()
    expect((await app(t.env).post('/start/add', { ids: [] })).status).toBe(400)
    expect((await app(t.env).post('/start/add', { ids: Array.from({ length: 25 }, (_, i) => i + 1) })).status).toBe(400)
  })
})

describe('adding a sync company', () => {
  it('files a target with the sentences its own site said, linked to the catalog', async () => {
    const t = database()
    const id = t.library({ name: 'Open Library' })

    const res = await app(t.env).post('/start/sync', { id })
    expect(res.status).toBe(200)

    const [row] = await t.syncRows(ARTIST)
    expect(row).toMatchObject({
      name: 'Open Library',
      status: 'draft_ready',
      opportunityId: id,
      website: 'https://lib.test',
      submissionPolicy: 'open',
      policyEvidence: 'We welcome submissions from independent artists.',
    })
    expect(row.policyCheckedAt).not.toBeNull()
    expect(await t.syncRows(OWNER)).toEqual([])
  })

  it('files one row however many times it is asked', async () => {
    const t = database()
    const id = t.library()
    const a = (await (await app(t.env).post('/start/sync', { id })).json()) as { id: number }
    const b = (await (await app(t.env).post('/start/sync', { id })).json()) as { id: number }
    expect(b.id).toBe(a.id)
    expect(await t.syncRows(ARTIST)).toHaveLength(1)
  })

  it('refuses a company whose own site refuses pitches', async () => {
    const t = database()
    const id = t.library({ policy: 'closed', policyEvidence: 'No unsolicited material please.' })
    const res = await app(t.env).post('/start/sync', { id })
    expect(res.status).toBe(409)
    expect(await t.syncRows(ARTIST)).toEqual([])
  })

  it('refuses an id that is not a sync organisation the lane would list', async () => {
    const t = database()
    const grant = t.entry()
    const unread = t.library({ policy: null, policyEvidence: null, exclusivity: null, exclusivityEvidence: null, termsReadAt: null })
    expect((await app(t.env).post('/start/sync', { id: grant })).status).toBe(409)
    expect((await app(t.env).post('/start/sync', { id: unread })).status).toBe(409)
    expect((await app(t.env).post('/start/sync', { id: 9999 })).status).toBe(409)
    expect(await t.syncRows(ARTIST)).toEqual([])
  })

  it('lists a company whose site is silent about exclusivity, and lets it be added with that said', async () => {
    const t = database()
    const id = t.library({ exclusivity: null, exclusivityEvidence: null })
    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.sync.rows).toEqual([])
    expect(body.lanes.sync.unclear.map((r) => r.id)).toEqual([id])
    expect((await app(t.env).post('/start/sync', { id })).status).toBe(200)
  })

  it('does not show a company already on their Sync list', async () => {
    const t = database()
    const id = t.library()
    await app(t.env).post('/start/sync', { id })
    const body = (await (await app(t.env).get('/start')).json()) as Lanes
    expect(body.lanes.sync.rows).toEqual([])
  })
})

/* --------------------------------------------------------------------- */
/* What the owner's research puts on the catalog                          */
/* --------------------------------------------------------------------- */

function site(pages: Record<string, string>): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input)
    const body = pages[url] ?? pages[url.replace(/\/$/, '')]
    const res = new Response(body ?? '', { status: body === undefined ? 404 : 200, headers: { 'content-type': 'text/html' } })
    Object.defineProperty(res, 'url', { value: url })
    return res
  }) as typeof fetch
}

const PAGES = {
  'https://lib.test/': '<p>Independent music library.</p><a href="/submit">Submissions</a><a href="/artists">For artists</a>',
  'https://lib.test/submit': '<p>We welcome submissions from independent artists. Send us your music at submit@lib.test.</p>',
  'https://lib.test/artists': '<p>All of our agreements with artists are non-exclusive, so you keep placing your music elsewhere.</p>',
}

describe('what a read of a target\'s own site puts on the catalog', () => {
  async function target(t: ReturnType<typeof database>, tenant: string, entryId: number | null, website = 'https://lib.test') {
    t.db
      .prepare(
        `INSERT INTO sync_targets (tenant_id, name, agency_type, website, status, opportunity_id, discovered_at, updated_at)
         VALUES (?, 'Open Library', 'library', ?, 'draft_ready', ?, ?, ?)`,
      )
      .run(tenant, website, entryId, NOW, NOW)
    return (t.db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }).id
  }

  const bare = (t: ReturnType<typeof database>) =>
    t.entry({ category: 'sync', kind: 'Library', deadline: null, location: null, country: null })

  it('records both findings with their sentences and the pages they came from', async () => {
    const t = database()
    const entryId = bare(t)
    const id = await target(t, OWNER, entryId)

    await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: site(PAGES) })

    expect(t.catalogRow(entryId)).toMatchObject({
      site: 'https://lib.test',
      submission_policy: 'open',
      policy_evidence: 'We welcome submissions from independent artists.',
      exclusivity: 'non_exclusive',
      exclusivity_url: 'https://lib.test/artists',
      terms_read_at: NOW,
    })
    expect(t.catalogRow(entryId).exclusivity_evidence).toMatch(/non-exclusive/)
  })

  it('does not take another artist\'s read of a page they chose', async () => {
    const t = database()
    const entryId = bare(t)
    const id = await target(t, ARTIST, entryId)

    await checkTarget(t.env, ARTIST, id, { now: NOW, fetchImpl: site(PAGES) })

    expect(t.catalogRow(entryId)).toMatchObject({
      site: null, submission_policy: null, exclusivity: null, terms_read_at: null,
    })
    // Their own row still has what it read: only the shared copy is withheld.
    const [row] = await t.syncRows(ARTIST)
    expect(row.submissionPolicy).toBe('open')
  })

  it('reads a page that says both as exclusive, and a later read cannot undo it', async () => {
    const t = database()
    const entryId = bare(t)
    const id = await target(t, OWNER, entryId)
    const both = {
      ...PAGES,
      'https://lib.test/artists':
        '<p>Our standard artist agreement is non-exclusive.</p><p>Some songwriters sign an exclusive representation agreement with us instead.</p>',
    }
    await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: site(both) })
    expect(t.catalogRow(entryId).exclusivity).toBe('exclusive')

    await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: site(PAGES) })
    expect(t.catalogRow(entryId).exclusivity).toBe('exclusive')
  })

  it('does not count a site that would not open as having been looked at', async () => {
    const t = database()
    const entryId = bare(t)
    const id = await target(t, OWNER, entryId)

    await checkTarget(t.env, OWNER, id, { now: NOW, fetchImpl: site({}) })

    expect(t.catalogRow(entryId).terms_read_at).toBeNull()
    expect(t.catalogRow(entryId).exclusivity).toBeNull()
  })

  it('records a read that found nothing as a look, and leaves exclusivity empty', async () => {
    const t = database()
    const entryId = bare(t)
    const id = await target(t, OWNER, entryId)

    await checkTarget(t.env, OWNER, id, {
      now: NOW,
      fetchImpl: site({ 'https://lib.test/': '<p>Independent music library, founded in 2009.</p>' }),
    })

    expect(t.catalogRow(entryId).terms_read_at).toBe(NOW)
    expect(t.catalogRow(entryId).exclusivity).toBeNull()
  })

  it('mirrors what a target already says, with no network, and leaves exclusivity unread', async () => {
    const t = database()
    const entryId = bare(t)
    const id = await target(t, OWNER, entryId)
    t.db
      .prepare(
        "UPDATE sync_targets SET submission_policy = 'open', policy_evidence = 'We welcome submissions.', policy_url = 'https://lib.test/submit', policy_checked_at = ? WHERE id = ?",
      )
      .run(NOW, id)

    expect(await mirrorTargetTerms(t.env, OWNER)).toBe(1)
    expect(t.catalogRow(entryId)).toMatchObject({
      submission_policy: 'open', policy_evidence: 'We welcome submissions.', exclusivity: null, terms_read_at: null,
    })
    expect(await mirrorTargetTerms(t.env, ARTIST)).toBe(0)
  })

  it('lets a refusal replace an invitation and never the other way', async () => {
    const t = database()
    const entryId = bare(t)
    const input = (policy: 'open' | 'closed', quote: string) => ({
      site: null,
      finding: findingOfRow({ submissionPolicy: policy, policyEvidence: quote, policyUrl: null }),
      checkedAt: NOW,
      exclusivity: null,
      read: false,
    })
    await recordOrgTerms(t.env, OWNER, entryId, input('open', 'We welcome submissions.'))
    await recordOrgTerms(t.env, OWNER, entryId, input('closed', 'No unsolicited material please.'))
    expect(t.catalogRow(entryId).submission_policy).toBe('closed')
    await recordOrgTerms(t.env, OWNER, entryId, input('open', 'We welcome submissions.'))
    expect(t.catalogRow(entryId).submission_policy).toBe('closed')
  })

  it('reads the owner\'s targets that were read before exclusivity was looked for, last in line', async () => {
    const t = database()
    const entryId = bare(t)
    const id = await target(t, OWNER, entryId)
    // Read last month, so it is not due for another thirty days by the policy's own clock.
    t.db
      .prepare(
        "UPDATE sync_targets SET submission_policy = 'open', policy_evidence = 'We welcome submissions.', policy_checked_at = ? WHERE id = ?",
      )
      .run(day(-30), id)

    const run = await checkPendingTerms(t.env, OWNER, TODAY, { now: NOW, fetchImpl: site(PAGES) })
    expect(run).toMatchObject({ due: 1, checked: 1 })
    expect(t.catalogRow(entryId)).toMatchObject({ exclusivity: 'non_exclusive', terms_read_at: NOW })

    // Looked at now, so it is not picked up again.
    const again = await checkPendingTerms(t.env, OWNER, TODAY, { now: NOW, fetchImpl: site(PAGES) })
    expect(again.due).toBe(0)
  })
})
