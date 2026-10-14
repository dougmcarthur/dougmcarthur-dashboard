import { describe, it, expect } from 'vitest'
import { asTenantId, scoped, withTenant } from '../src/db/scope'
import { getDb } from '../src/db'
import { gigOpportunities, notificationEvents } from '../src/db/schema'
import { gigStatusColumns, readGigs } from '../src/db/gigRows'
import { catalogueEntry } from '../src/lib/catalog'
import { reopenIntakes, REOFFER_LIMIT } from '../src/lib/intakes'
import { GIVE_UP_DAYS, PROGRAMMES_PER_TICK, refreshProgrammes } from '../src/lib/programmeRefresh'
import { sqliteD1 } from './support/sqliteD1'

/**
 * A programme that comes round again, against the production schema.
 *
 * The questions are whose rows move, what a stranger's sighting can change, and
 * that running it twice does nothing the second time. The catalog belongs to
 * nobody; what is written lands on one tenant's side.
 */

const TODAY = '2027-01-15'
const NOW = `${TODAY}T12:00:00.000Z`
const OWNER = asTenantId('tnt_0001')
const ARTIST = asTenantId('tnt_0002')

const day = (n: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function database() {
  const { d1, db } = sqliteD1()
  db.prepare("INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Second Artist', '2026-10-01T00:00:00Z')").run()
  const env = { DB: d1 } as never

  let n = 0
  const entry = (o: Partial<{
    name: string; category: string; url: string | null; deadline: string | null; deadlineNote: string | null
    location: string | null; country: string | null; pub: number; delivery: string | null
    reopenedAt: string | null; checkedAt: string | null; eligibility: string | null; firstSeenAt: string
  }> = {}) => {
    n++
    db.prepare(
      `INSERT INTO opportunities
         (catalog_key, category, name, kind, url, deadline, deadline_note, location, country, public, first_seen_at,
          last_seen_at, delivery, reopened_at, intake_checked_at, eligibility)
       VALUES (?, ?, ?, 'Grant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `key:${n}`, o.category ?? 'funding', o.name ?? `Programme ${n}`,
      o.url === undefined ? `https://programme${n}.example.test/apply` : o.url,
      o.deadline === undefined ? day(40) : o.deadline, o.deadlineNote ?? null,
      o.location === undefined ? 'National' : o.location, o.country === undefined ? 'CA' : o.country,
      o.pub ?? 1, o.firstSeenAt ?? day(-300), o.firstSeenAt ?? day(-300), o.delivery ?? null,
      o.reopenedAt ?? null, o.checkedAt ?? null, o.eligibility ?? null,
    )
    return n
  }

  const gig = async (tenant: typeof OWNER, entryId: number | null, o: {
    status: Parameters<typeof gigStatusColumns>[0]; deadline?: string | null; name?: string
    snoozedUntil?: string | null; snoozedAt?: string | null; updatedAt?: string
  }) => {
    const [r] = await getDb(d1)
      .insert(gigOpportunities)
      .values(
        withTenant(tenant, {
          name: o.name ?? 'Programme',
          type: 'grant',
          deadline: o.deadline === undefined ? day(-30) : o.deadline,
          ...gigStatusColumns(o.status),
          opportunityId: entryId,
          snoozedUntil: o.snoozedUntil ?? null,
          snoozedAt: o.snoozedAt ?? null,
          discoveredAt: `${day(-100)}T00:00:00.000Z`,
          updatedAt: o.updatedAt ?? `${day(-30)}T00:00:00.000Z`,
        }),
      )
      .returning({ id: gigOpportunities.id })
    return r.id
  }

  const put = (tenant: string, key: string, value: unknown) =>
    db.prepare("INSERT INTO tenant_settings (tenant_id, key, value, updated_at) VALUES (?, ?, ?, '2027-01-01')").run(tenant, key, JSON.stringify(value))

  const rows = async (tenant: typeof OWNER) =>
    readGigs(await getDb(d1).select().from(gigOpportunities).where(scoped(gigOpportunities, tenant)))
  const events = async (tenant: typeof OWNER) =>
    getDb(d1).select().from(notificationEvents).where(scoped(notificationEvents, tenant))
  const catalogRow = (id: number) => db.prepare('SELECT * FROM opportunities WHERE id = ?').get(id) as Record<string, unknown>

  return { env, db, d1, entry, gig, put, rows, events, catalogRow }
}

describe('a passed intake is offered again', () => {
  it('files a new row, with the reason first, and leaves the old one as it was', async () => {
    const t = database()
    const id = t.entry({ name: 'Touring Fund', deadline: day(40) })
    const old = await t.gig(ARTIST, id, { status: 'passed', deadline: day(-30), name: 'Touring Fund' })

    const run = await reopenIntakes(t.env, ARTIST, TODAY, NOW)
    expect(run).toEqual({ advanced: 0, reoffered: 1 })

    const rows = await t.rows(ARTIST)
    expect(rows).toHaveLength(2)
    const fresh = rows.find((r) => r.id !== old)!
    expect(fresh).toMatchObject({
      name: 'Touring Fund', status: 'discovered', opportunityId: id, origin: 'catalog', deadline: day(40),
    })
    expect(fresh.fitRationale).toMatch(/^This programme is open again\. You passed on the last intake, which closed Dec 16, 2026\./)
    // What they decided is not rewritten by the programme coming back.
    expect(rows.find((r) => r.id === old)).toMatchObject({ status: 'passed', deadline: day(-30) })
  })

  it('says so on the bell', async () => {
    const t = database()
    const id = t.entry({ name: 'Touring Fund' })
    await t.gig(ARTIST, id, { status: 'passed' })
    await reopenIntakes(t.env, ARTIST, TODAY, NOW)

    const [event] = await t.events(ARTIST)
    expect(event.title).toBe('1 programme is open again')
    expect(event.body).toBe('Touring Fund: open again, closes Feb 24.')
    expect(event.href).toBe('#gigs')
  })

  it('does it once, however many nights it runs', async () => {
    const t = database()
    const id = t.entry()
    await t.gig(ARTIST, id, { status: 'passed' })
    await reopenIntakes(t.env, ARTIST, TODAY, NOW)
    const again = await reopenIntakes(t.env, ARTIST, TODAY, NOW)
    expect(again).toEqual({ advanced: 0, reoffered: 0 })
    expect(await t.rows(ARTIST)).toHaveLength(2)
    expect(await t.events(ARTIST)).toHaveLength(1)
  })

  it('offers a missed intake again too', async () => {
    const t = database()
    const id = t.entry()
    await t.gig(ARTIST, id, { status: 'expired' })
    expect(await reopenIntakes(t.env, ARTIST, TODAY, NOW)).toEqual({ advanced: 0, reoffered: 1 })
    expect((await t.rows(ARTIST)).find((r) => r.status === 'discovered')?.fitRationale).toMatch(/You missed the last intake/)
  })

  it.each([
    ['one they applied to and lost', 'declined'],
    ['one they won', 'booked'],
    ['one they archived', 'archived'],
    ['one in progress', 'shortlisted'],
    ['one that is out', 'submitted'],
  ] as const)('does not offer %s', async (_why, status) => {
    const t = database()
    const id = t.entry()
    await t.gig(ARTIST, id, { status })
    expect(await reopenIntakes(t.env, ARTIST, TODAY, NOW)).toEqual({ advanced: 0, reoffered: 0 })
    expect(await t.rows(ARTIST)).toHaveLength(1)
  })

  it('does not offer anything for a programme that has no new date, or has not opened to anyone', async () => {
    const t = database()
    await t.gig(ARTIST, t.entry({ deadline: day(-30) }), { status: 'passed', deadline: day(-30) })
    await t.gig(ARTIST, t.entry({ deadline: null }), { status: 'passed' })
    expect(await reopenIntakes(t.env, ARTIST, TODAY, NOW)).toEqual({ advanced: 0, reoffered: 0 })
  })

  it('waits out the holding period for a new intake, and the owner can block it', async () => {
    const t = database()
    const held = t.entry({ reopenedAt: `${day(-1)}T00:00:00.000Z` })
    const blocked = t.entry({ delivery: 'blocked' })
    await t.gig(ARTIST, held, { status: 'passed' })
    await t.gig(ARTIST, blocked, { status: 'passed' })
    expect(await reopenIntakes(t.env, ARTIST, TODAY, NOW)).toEqual({ advanced: 0, reoffered: 0 })
  })

  it('does not offer a call for residents of another province', async () => {
    const t = database()
    const id = t.entry({ eligibility: JSON.stringify({ residentOf: ['SK'] }) })
    await t.gig(ARTIST, id, { status: 'passed' })
    t.put('tnt_0002', 'onboarding.goals', { goals: ['grants'], reach: ['canada'], note: null })
    t.put('tnt_0002', 'travel.home', { lat: 49.9, lon: -97.1, place: 'Winnipeg, MB', checkedAt: NOW })

    expect(await reopenIntakes(t.env, ARTIST, TODAY, NOW)).toEqual({ advanced: 0, reoffered: 0 })
  })

  it('files nothing for an artist who switched suggestions off, and still moves what they have', async () => {
    const t = database()
    t.put('tnt_0002', 'matching.off', '2027-01-01T00:00:00.000Z')
    const id = t.entry()
    await t.gig(ARTIST, id, { status: 'passed', deadline: day(-30) })
    const other = t.entry()
    const newRow = await t.gig(ARTIST, other, { status: 'new', deadline: day(-30) })

    const run = await reopenIntakes(t.env, ARTIST, TODAY, NOW)
    expect(run).toEqual({ advanced: 1, reoffered: 0 })
    expect((await t.rows(ARTIST)).find((r) => r.id === newRow)?.deadline).toBe(day(40))
  })

  it('stops at a night\'s limit and finishes the next', async () => {
    const t = database()
    for (let i = 0; i < REOFFER_LIMIT + 2; i++) {
      await t.gig(ARTIST, t.entry(), { status: 'passed' })
    }
    expect((await reopenIntakes(t.env, ARTIST, TODAY, NOW)).reoffered).toBe(REOFFER_LIMIT)
    expect((await reopenIntakes(t.env, ARTIST, TODAY, NOW)).reoffered).toBe(2)
    expect((await reopenIntakes(t.env, ARTIST, TODAY, NOW)).reoffered).toBe(0)
  })

  it('moves only this artist\'s rows', async () => {
    const t = database()
    const id = t.entry()
    await t.gig(ARTIST, id, { status: 'passed' })
    await t.gig(OWNER, id, { status: 'submitted', deadline: day(-30) })

    await reopenIntakes(t.env, ARTIST, TODAY, NOW)
    expect(await t.rows(OWNER)).toHaveLength(1)
    expect(await t.events(OWNER)).toEqual([])
  })
})

describe('a New row follows its programme', () => {
  it('moves to the newer date and wakes the snooze that was made against the old one', async () => {
    const t = database()
    const id = t.entry({ deadline: day(40), deadlineNote: 'Earliest of several dates on the programme page' })
    const rowId = await t.gig(ARTIST, id, {
      status: 'new',
      deadline: day(-30),
      snoozedUntil: day(-31),
      snoozedAt: `${day(-60)}T00:00:00.000Z`,
      updatedAt: `${day(-60)}T00:00:00.000Z`,
    })

    expect(await reopenIntakes(t.env, ARTIST, TODAY, NOW)).toEqual({ advanced: 1, reoffered: 0 })

    const row = (await t.rows(ARTIST)).find((r) => r.id === rowId)!
    expect(row).toMatchObject({
      deadline: day(40),
      deadlineNote: 'Earliest of several dates on the programme page',
      updatedAt: NOW,
    })
    // `updated_at` past `snoozed_at` is how a snooze learns the row changed under it.
    expect(row.updatedAt > row.snoozedAt!).toBe(true)
    expect(await t.rows(ARTIST)).toHaveLength(1)
  })

  it('is told on the bell as a moved deadline', async () => {
    const t = database()
    await t.gig(ARTIST, t.entry({ name: 'Touring Fund' }), { status: 'new', deadline: day(-30) })
    await reopenIntakes(t.env, ARTIST, TODAY, NOW)
    expect((await t.events(ARTIST))[0].body).toBe('Touring Fund: the deadline moved from Dec 16, 2026 to Feb 24.')
  })
})

describe('what a sighting may change on the catalog', () => {
  const facts = (deadline: string | null) => ({
    category: 'funding' as const, name: 'Touring Fund', organizer: null, kind: 'Grant',
    url: 'https://touring.example.test/fund', deadline, deadlineNote: null, location: 'National', country: 'CA',
    feeAmount: null, feeCurrency: null, opensAt: null,
  })

  async function seeded(deadline: string | null) {
    const t = database()
    const id = t.entry({ url: 'https://touring.example.test/fund', deadline })
    // The key is the address, so the same programme found again lands on this entry.
    t.db.prepare("UPDATE opportunities SET catalog_key = 'url:touring.example.test/fund' WHERE id = ?").run(id)
    return { t, id }
  }

  it('moves a closed deadline forward for the platform\'s own research, and holds it as a new arrival', async () => {
    const { t, id } = await seeded(day(-30))
    const res = await catalogueEntry(t.env, facts(day(60)), {}, NOW, true, 'agent')
    expect(res).toEqual({ id, created: false })
    expect(t.catalogRow(id)).toMatchObject({ deadline: day(60), reopened_at: NOW })
  })

  it('does not take an artist re-typing a row as news about the programme', async () => {
    const { t, id } = await seeded(day(-30))
    await catalogueEntry(t.env, facts(day(60)), {}, NOW, false, 'artist')
    expect(t.catalogRow(id)).toMatchObject({ deadline: day(-30), reopened_at: null })
  })

  it('does not move a deadline that is still ahead', async () => {
    const { t, id } = await seeded(day(10))
    await catalogueEntry(t.env, facts(day(60)), {}, NOW, true, 'agent')
    expect(t.catalogRow(id)).toMatchObject({ deadline: day(10), reopened_at: null })
  })

  it('still fills a deadline that was empty, as it always did', async () => {
    const { t, id } = await seeded(null)
    await catalogueEntry(t.env, facts(day(60)), {}, NOW, true, 'agent')
    expect(t.catalogRow(id)).toMatchObject({ deadline: day(60), reopened_at: null })
  })
})

describe('looking for a next intake on the programme\'s own page', () => {
  const PAGE = `<p>The Touring Fund supports artists on the road.</p>
<p><strong>Next deadline</strong>: March 1, 2027 | September 1, 2027</p>`
  const STALE = '<p><strong>Next deadline</strong>: October 1, 2026</p>'

  const site = (pages: Record<string, string>): typeof fetch =>
    (async (input: unknown) => {
      const url = String(input)
      const body = pages[url]
      const res = new Response(body ?? '', { status: body === undefined ? 404 : 200, headers: { 'content-type': 'text/html' } })
      Object.defineProperty(res, 'url', { value: url })
      return res
    }) as typeof fetch

  it('moves a closed entry to the date its page now states, and says there were two', async () => {
    const t = database()
    const id = t.entry({ url: 'https://touring.example.test/fund', deadline: day(-30) })
    const run = await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({ 'https://touring.example.test/fund': PAGE }) })

    expect(run).toEqual({ looked: 1, advanced: 1 })
    expect(t.catalogRow(id)).toMatchObject({
      deadline: '2027-03-01',
      deadline_note: 'Earliest of several dates on the programme page',
      reopened_at: NOW,
      intake_checked_at: NOW,
    })
  })

  it('leaves an entry whose page names nothing newer, and still records the look', async () => {
    const t = database()
    const id = t.entry({ url: 'https://touring.example.test/fund', deadline: day(-30) })
    const run = await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({ 'https://touring.example.test/fund': STALE }) })
    expect(run).toEqual({ looked: 1, advanced: 0 })
    expect(t.catalogRow(id)).toMatchObject({ deadline: day(-30), reopened_at: null, intake_checked_at: NOW })
  })

  it('records a page that would not open as a look, so it is retried in a week and not every hour', async () => {
    const t = database()
    const id = t.entry({ url: 'https://gone.example.test/fund', deadline: day(-30) })
    await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({}) })
    expect(t.catalogRow(id).intake_checked_at).toBe(NOW)
    expect((await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({}) })).looked).toBe(0)
  })

  it('looks again after a week', async () => {
    const t = database()
    t.entry({ url: 'https://touring.example.test/fund', deadline: day(-30), checkedAt: `${day(-8)}T00:00:00.000Z` })
    t.entry({ url: 'https://other.example.test/fund', deadline: day(-30), checkedAt: `${day(-3)}T00:00:00.000Z` })
    const run = await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({}) })
    expect(run.looked).toBe(1)
  })

  it('never reads an entry with no date, a private one, a blocked one, or one that closed long ago', async () => {
    const t = database()
    t.entry({ url: 'https://a.example.test/fund', deadline: null, deadlineNote: 'Rolling' })
    t.entry({ url: 'https://b.example.test/fund', deadline: day(-30), pub: 0 })
    t.entry({ url: 'https://c.example.test/fund', deadline: day(-30), delivery: 'blocked' })
    t.entry({ url: 'https://d.example.test/fund', deadline: day(-GIVE_UP_DAYS - 5) })
    t.entry({ url: 'https://e.example.test/fund', deadline: day(20) })
    t.entry({ url: 'https://f.example.test/fund', deadline: day(-30), category: 'sync' })
    const log: string[] = []
    const fetchImpl = (async (u: unknown) => { log.push(String(u)); return new Response('', { status: 404 }) }) as typeof fetch
    const run = await refreshProgrammes(t.env, { now: NOW, fetchImpl })
    expect(run).toEqual({ looked: 0, advanced: 0 })
    expect(log).toEqual([])
  })

  it('does not follow an address that is not a plain web page', async () => {
    const t = database()
    const id = t.entry({ url: 'javascript:alert(1)', deadline: day(-30) })
    const log: string[] = []
    const fetchImpl = (async (u: unknown) => { log.push(String(u)); return new Response('', { status: 200 }) }) as typeof fetch
    await refreshProgrammes(t.env, { now: NOW, fetchImpl })
    expect(log).toEqual([])
    expect(t.catalogRow(id).intake_checked_at).toBe(NOW)
  })

  it('looks at a few a tick, the longest-waiting first', async () => {
    const t = database()
    for (let i = 0; i < PROGRAMMES_PER_TICK + 2; i++) t.entry({ url: `https://p${i}.example.test/fund`, deadline: day(-30) })
    const run = await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({}) })
    expect(run.looked).toBe(PROGRAMMES_PER_TICK)
    const next = await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({}) })
    expect(next.looked).toBe(2)
  })

  it('feeds the nightly step: an entry it moved is offered again once it has waited out the hold', async () => {
    const t = database()
    const id = t.entry({ name: 'Touring Fund', url: 'https://touring.example.test/fund', deadline: day(-30) })
    await t.gig(ARTIST, id, { status: 'passed', deadline: day(-30), name: 'Touring Fund' })

    await refreshProgrammes(t.env, { now: NOW, fetchImpl: site({ 'https://touring.example.test/fund': PAGE }) })
    // A new arrival: not on anybody's list the day it was seen.
    expect(await reopenIntakes(t.env, ARTIST, TODAY, NOW)).toEqual({ advanced: 0, reoffered: 0 })

    const later = day(4)
    const run = await reopenIntakes(t.env, ARTIST, later, `${later}T12:00:00.000Z`)
    expect(run.reoffered).toBe(1)
  })
})
