import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { asTenantId } from '../src/db/scope'
import { REVISIT_LIMIT, revisitForms } from '../src/lib/formRevisit'
import type { PrepOutcome } from '../src/lib/applicationPrep'
import { NO_FORM_NOTE } from '../shared/application'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The nightly look at forms that were not there the first time, run for real
 * against the production schema.
 *
 * What it selects, writes and refuses to touch is the whole question, so this
 * is a real SQLite rather than a stub: a WHERE that missed the tenant would
 * read a stranger's festival pages, and an UPDATE that touched `updated_at`
 * would wake every snooze in the table.
 */

const TODAY = '2026-10-05'
const NOW = `${TODAY}T08:00:00.000Z`
const OWNER = 'tnt_0001'
const OTHER = 'tnt_0002'
const FORM_URL = 'https://canmorefolkfest.festivalpro.com/form/59EFFCD97622A7A502E7/0'
const LISTING = 'https://www.canmorefolkfestival.com/get-involved/artist-info'

function day(offset: number): string {
  const d = new Date(`${TODAY}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

type Seed = {
  name?: string
  tenant?: string
  status?: string
  url?: string | null
  applicationUrl?: string | null
  opensAt?: string | null
  deadline?: string | null
  prepStatus?: string | null
  prepNote?: string | null
  prepCheckedAt?: string | null
}

function database(seeds: Seed[]) {
  const { d1, db } = sqliteD1()
  seeds.forEach((s, i) => {
    db.prepare(
      `INSERT INTO gig_opportunities (id, tenant_id, name, type, status, url, application_url, opens_at, deadline,
         prep_status, prep_note, prep_checked_at, discovered_at, updated_at)
       VALUES (?, ?, ?, 'festival', ?, ?, ?, ?, ?, ?, ?, ?, '2026-07-01T00:00:00.000Z', '2026-07-02T00:00:00.000Z')`,
    ).run(
      i + 1,
      s.tenant ?? OWNER,
      s.name ?? `Festival ${i + 1}`,
      s.status ?? 'shortlisted',
      s.url === undefined ? LISTING : s.url,
      s.applicationUrl ?? null,
      s.opensAt ?? null,
      s.deadline ?? null,
      s.prepStatus ?? null,
      s.prepNote ?? null,
      s.prepCheckedAt ?? null,
    )
  })
  const gig = (id: number) => db.prepare('SELECT * FROM gig_opportunities WHERE id = ?').get(id) as Record<string, any>
  const fields = (id: number) =>
    db.prepare('SELECT field_key, label, required FROM application_fields WHERE gig_id = ? ORDER BY position').all(id) as Array<Record<string, any>>
  const events = () =>
    db.prepare('SELECT tenant_id, tier, title, href, dedupe_key FROM notification_events ORDER BY id').all() as Array<Record<string, any>>
  return { env: { DB: d1 } as never, db, gig, fields, events }
}

/** What reading Canmore's form returns, and what a listing with no form returns. */
const FORM: PrepOutcome = {
  status: 'ready',
  note: null,
  title: 'ARTIST APPLICATION',
  url: FORM_URL,
  fields: [
    { fieldKey: '765', label: 'Band/Artist Name', fieldType: 'text', required: true, position: 0 },
    { fieldKey: '2933', label: 'Artist Biography', fieldType: 'textarea', required: true, position: 1 },
  ],
}
const NOTHING = (url: string): PrepOutcome => ({
  status: 'not_found',
  note: `${NO_FORM_NOTE} — the application may open later, be a PDF, or be submitted by email.`,
  title: null,
  fields: [],
  url,
  blockedKind: 'no-fields',
})

/** A reader that answers from a table of addresses, and remembers who asked. */
function reader(answers: Record<string, PrepOutcome | Error>) {
  const asked: string[] = []
  const read = (async (url: string) => {
    asked.push(url)
    const answer = answers[url] ?? NOTHING(url)
    if (answer instanceof Error) throw answer
    return answer
  }) as never
  return { read, asked }
}

describe('the nightly look at forms', () => {
  it('reads a form that has opened, stages its questions, and tells the artist', async () => {
    const { env, gig, fields, events } = database([{ opensAt: day(-1), name: 'Canmore Folk Festival 2027' }])
    const { read, asked } = reader({ [LISTING]: FORM })

    const run = await revisitForms(env, asTenantId(OWNER), TODAY, { read, now: NOW })

    expect(run).toMatchObject({ due: 1, read: 1, opened: 1 })
    expect(asked).toEqual([LISTING])
    expect(fields(1).map((f) => f.label)).toEqual(['Band/Artist Name', 'Artist Biography'])
    // The address that was found is the one that is kept.
    expect(gig(1)).toMatchObject({ prep_status: 'ready', application_url: FORM_URL, prep_checked_at: NOW })
    expect(events()).toEqual([
      expect.objectContaining({
        tenant_id: OWNER,
        tier: 'info',
        title: 'Canmore Folk Festival 2027: the application form is open — 2 fields read',
        href: '#gigs/1',
        dedupe_key: 'form-read:1',
      }),
    ])
  })

  it('never moves the status and never touches updated_at', async () => {
    const { env, gig } = database([{ status: 'shortlisted' }])
    await revisitForms(env, asTenantId(OWNER), TODAY, { read: reader({ [LISTING]: FORM }).read, now: NOW })
    // `shortlisted` stays: the artist said yes, but they did not start. And
    // `updated_at` stays, or every snooze in the table would wake.
    expect(gig(1).status).toBe('shortlisted')
    expect(gig(1).updated_at).toBe('2026-07-02T00:00:00.000Z')
    expect(gig(1).prep_status).toBe('ready')
  })

  it('looks only at gigs that are due, and only at the artist’s own', async () => {
    const { env, gig } = database([
      { name: 'Due: undated, never looked at' },
      { name: 'New, not yours yet', status: 'discovered' },
      { name: 'Opens next week', opensAt: day(7) },
      { name: 'Already read', prepStatus: 'ready', prepCheckedAt: `${day(-20)}T08:00:00Z` },
      { name: 'Deadline passed', deadline: day(-2) },
      { name: 'Looked at this morning', prepStatus: 'not_found', prepCheckedAt: NOW },
      { name: 'Behind a login', prepStatus: 'blocked', prepNote: 'The application form is behind a login.', prepCheckedAt: `${day(-9)}T08:00:00Z` },
      { name: 'No address', url: null },
      { name: 'A stranger’s', tenant: OTHER, url: 'https://elsewhere.example/artists' },
    ])
    const { read, asked } = reader({})

    const run = await revisitForms(env, asTenantId(OWNER), TODAY, { read, now: NOW })

    expect(run.due).toBe(1)
    expect(asked).toEqual([LISTING])
    expect(gig(9).prep_checked_at).toBeNull() // the stranger's row was never opened
  })

  it('looks at the one looked at longest ago first, and no more than the limit', async () => {
    const stale = (n: number) => ({ prepStatus: 'not_found', prepCheckedAt: `${day(-n)}T08:00:00Z` })
    const { env } = database([
      { url: 'https://a.example/', ...stale(9) },
      { url: 'https://b.example/', ...stale(30) },
      { url: 'https://c.example/' }, // never looked at
      { url: 'https://d.example/', ...stale(12) },
    ])
    const { read, asked } = reader({})

    const run = await revisitForms(env, asTenantId(OWNER), TODAY, { read, now: NOW, limit: 3 })

    expect(run).toMatchObject({ due: 4, read: 3 })
    expect(asked).toEqual(['https://c.example/', 'https://b.example/', 'https://d.example/'])
    expect(REVISIT_LIMIT).toBeGreaterThan(0)
  })

  it('does not stop for one festival’s page falling over', async () => {
    const { env, gig } = database([{ url: 'https://down.example/' }, { url: LISTING }])
    const { read } = reader({ 'https://down.example/': new Error('socket hang up'), [LISTING]: FORM })

    const run = await revisitForms(env, asTenantId(OWNER), TODAY, { read, now: NOW })

    expect(run).toMatchObject({ due: 2, read: 1, opened: 1 })
    expect(gig(2).prep_status).toBe('ready')
  })

  it('is quiet about an undated window with no form yet, and looks again a week on', async () => {
    const { env, gig, events } = database([{}])
    const { read, asked } = reader({})
    const tenant = asTenantId(OWNER)

    await revisitForms(env, tenant, TODAY, { read, now: NOW })
    expect(gig(1).prep_status).toBe('not_found') // not "blocked": nothing here says it is by hand
    expect(events()).toEqual([])

    // The same day, and six days on: not due. A week on: due.
    await revisitForms(env, tenant, TODAY, { read, now: NOW })
    await revisitForms(env, tenant, day(6), { read, now: `${day(6)}T08:00:00.000Z` })
    expect(asked).toHaveLength(1)
    await revisitForms(env, tenant, day(7), { read, now: `${day(7)}T08:00:00.000Z` })
    expect(asked).toHaveLength(2)
  })

  it('says a dated window still has no form a week on, once however often it looks', async () => {
    const { env, events } = database([{ name: 'Slow Festival', opensAt: day(-7) }])
    const { read } = reader({})
    const tenant = asTenantId(OWNER)

    await revisitForms(env, tenant, TODAY, { read, now: NOW })
    await revisitForms(env, tenant, day(1), { read, now: `${day(1)}T08:00:00.000Z` })

    expect(events()).toHaveLength(1)
    expect(events()[0]).toMatchObject({ tier: 'attention', dedupe_key: 'form-missing:1' })
    expect(events()[0].title).toContain('Slow Festival: applications opened')
    expect(events()[0].title).toContain('still cannot find the form')
  })

  it('records a form behind a login as found, saves its address, and stops looking', async () => {
    const portal = 'https://fest.submittable.com/submit/12345/artists'
    const wall: PrepOutcome = {
      status: 'blocked',
      note: 'The application form is behind a login, so it can’t be read automatically.',
      title: null,
      fields: [],
      url: portal,
      blockedKind: 'login',
    }
    const { env, gig, events } = database([{}])
    const { read, asked } = reader({ [LISTING]: wall })
    const tenant = asTenantId(OWNER)

    await revisitForms(env, tenant, TODAY, { read, now: NOW })
    expect(gig(1)).toMatchObject({ prep_status: 'blocked', application_url: portal })
    expect(events()[0].dedupe_key).toBe('form-blocked:1')

    await revisitForms(env, tenant, day(30), { read, now: `${day(30)}T08:00:00.000Z` })
    expect(asked).toHaveLength(1)
  })

  it('renames questions an earlier read filed by number, and keeps what the artist wrote', async () => {
    // The first read of Canmore's form filed its questions as "765" and "2933".
    const { env, db, fields } = database([{ prepStatus: 'failed', prepCheckedAt: `${day(-1)}T08:00:00Z` }])
    const stored = db.prepare(
      `INSERT INTO application_fields (tenant_id, gig_id, field_key, label, field_type, required, position,
         answer, answer_state, created_at, updated_at)
       VALUES (?, 1, ?, ?, 'text', 0, ?, ?, ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
    )
    stored.run(OWNER, '765', '765', 0, 'Doug McArthur', 'approved')
    stored.run(OWNER, '2933', '2933', 1, null, 'empty')

    await revisitForms(env, asTenantId(OWNER), TODAY, { read: reader({ [LISTING]: FORM }).read, now: NOW })

    expect(fields(1).map((f) => [f.field_key, f.label])).toEqual([
      ['765', 'Band/Artist Name'],
      ['2933', 'Artist Biography'],
    ])
    const answer = db.prepare("SELECT answer, answer_state FROM application_fields WHERE field_key = '765'").get()
    expect(answer).toMatchObject({ answer: 'Doug McArthur', answer_state: 'approved' })
  })
})

describe('where it runs', () => {
  it('is on the daily tick, for every tenant, ahead of the reminder reconcile', () => {
    const src = readFileSync('src/index.ts', 'utf8')
    expect(src).toMatch(/for \(const tenant of tenants\) \{\s*try \{\s*const run = await revisitForms\(env, tenant, today\)/)
    expect(src.indexOf('revisitForms(env, tenant, today)')).toBeLessThan(src.indexOf('reconcileGigNudges(env, tenant, today)'))
  })
})
