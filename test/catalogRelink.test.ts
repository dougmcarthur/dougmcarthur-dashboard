import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { asTenantId } from '../src/db/scope'
import { RELINK_LIMIT, relinkMissing } from '../src/lib/catalog'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The nightly retry for a catalog link that failed when the row was filed.
 *
 * Filing never waits on the catalog, and the module said a later pass would
 * link what it missed — but the only later pass was a backfill that runs once.
 * These run against the production schema, because what a retry selects, whom
 * it publishes and whose rows it leaves alone is the whole question.
 */

const OWNER = asTenantId('tnt_0001')
const OTHER = asTenantId('tnt_0002')
const WHEN = '2026-09-01T10:00:00.000Z'

function setup() {
  const { d1, db } = sqliteD1()
  db.exec(`INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Artist', '2026-01-01')`)

  const gig = (tenant: string, name: string, over: { status?: string; url?: string | null; type?: string; opportunityId?: number } = {}) =>
    Number(
      db
        .prepare(
          `INSERT INTO gig_opportunities (tenant_id, name, type, status, url, opportunity_id, discovered_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          tenant,
          name,
          over.type ?? 'festival',
          over.status ?? 'discovered',
          over.url === undefined ? `https://${name.toLowerCase().replace(/\W+/g, '')}.example/artists` : over.url,
          over.opportunityId ?? null,
          WHEN,
          WHEN,
        ).lastInsertRowid,
    )
  const sync = (tenant: string, name: string, agencyType: string, status = 'draft_ready') =>
    Number(
      db
        .prepare(`INSERT INTO sync_targets (tenant_id, name, agency_type, status, discovered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(tenant, name, agencyType, status, WHEN, WHEN).lastInsertRowid,
    )
  const linked = (table: 'gig_opportunities' | 'sync_targets', id: number) =>
    (db.prepare(`SELECT opportunity_id AS o FROM ${table} WHERE id = ?`).get(id) as { o: number | null }).o
  const entry = (id: number | null) =>
    db.prepare('SELECT name, public, last_seen_at FROM opportunities WHERE id = ?').get(id ?? -1) as
      | { name: string; public: number; last_seen_at: string }
      | undefined
  const entries = () => (db.prepare('SELECT count(*) AS n FROM opportunities').get() as { n: number }).n

  return { env: { DB: d1 } as never, db, gig, sync, linked, entry, entries }
}

afterEach(() => vi.restoreAllMocks())

describe('relinking rows that missed the catalog', () => {
  it('links a row whose first attempt failed, once the catalog is back', async () => {
    const t = setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = t.gig(OWNER.toString(), 'Folk Fest')

    // The catalog write fails while the row stands — exactly what linkGig swallows.
    t.db.exec('ALTER TABLE opportunities RENAME TO opportunities_away')
    expect(await relinkMissing(t.env, OWNER)).toBe(0)
    expect(t.linked('gig_opportunities', id)).toBeNull()

    t.db.exec('ALTER TABLE opportunities_away RENAME TO opportunities')
    expect(await relinkMissing(t.env, OWNER)).toBe(1)
    expect(t.entry(t.linked('gig_opportunities', id))?.name).toBe('Folk Fest')
  })

  it('publishes a find nobody has touched, and hides what the artist has acted on', async () => {
    const t = setup()
    const fresh = t.gig(OWNER.toString(), 'Open Call Fest')
    const acted = t.gig(OWNER.toString(), 'Private Offer Fest', { status: 'submitted' })
    const house = t.gig(OWNER.toString(), 'House Concert', { type: 'house concert' })

    expect(await relinkMissing(t.env, OWNER)).toBe(3)
    expect(t.entry(t.linked('gig_opportunities', fresh))?.public).toBe(1)
    expect(t.entry(t.linked('gig_opportunities', acted))?.public).toBe(0)
    // Linked, so it stops being retried, but never a public category.
    expect(t.entry(t.linked('gig_opportunities', house))?.public).toBe(0)
  })

  it('links organisations, publishes only the untouched, and leaves a person alone', async () => {
    const t = setup()
    const fresh = t.sync(OWNER.toString(), 'Open Library', 'library')
    const pitched = t.sync(OWNER.toString(), 'Pitched Publisher', 'publisher', 'pitched')
    const person = t.sync(OWNER.toString(), 'A Supervisor', 'supervisor')

    expect(await relinkMissing(t.env, OWNER)).toBe(2)
    expect(t.entry(t.linked('sync_targets', fresh))?.public).toBe(1)
    expect(t.entry(t.linked('sync_targets', pitched))?.public).toBe(0)
    expect(t.linked('sync_targets', person)).toBeNull()
    // A person is never catalogued, so there is nothing to retry — and nothing to count.
    expect(await relinkMissing(t.env, OWNER)).toBe(0)
  })

  it('does not touch a row that is already linked', async () => {
    const t = setup()
    t.db
      .prepare(`INSERT INTO opportunities (id, catalog_key, category, name, public, first_seen_at, last_seen_at) VALUES (7, 'url:old.example/apply', 'festival', 'Old Fest', 1, ?, ?)`)
      .run(WHEN, WHEN)
    const id = t.gig(OWNER.toString(), 'Old Fest', { opportunityId: 7, url: 'https://old.example/apply' })

    expect(await relinkMissing(t.env, OWNER)).toBe(0)
    expect(t.linked('gig_opportunities', id)).toBe(7)
    expect(t.entry(7)?.last_seen_at).toBe(WHEN)
    expect(t.entries()).toBe(1)
  })

  it('is one artist at a time', async () => {
    const t = setup()
    const mine = t.gig(OWNER.toString(), 'Mine Fest')
    const theirs = t.gig(OTHER.toString(), 'Theirs Fest')

    expect(await relinkMissing(t.env, OWNER)).toBe(1)
    expect(t.linked('gig_opportunities', mine)).not.toBeNull()
    expect(t.linked('gig_opportunities', theirs)).toBeNull()

    expect(await relinkMissing(t.env, OTHER)).toBe(1)
    expect(t.linked('gig_opportunities', theirs)).not.toBeNull()
  })

  it('takes a bounded bite a night and finishes on the next', async () => {
    const t = setup()
    const extra = 5
    for (let i = 0; i < RELINK_LIMIT + extra; i++) t.gig(OWNER.toString(), `Festival Number ${i}`)

    expect(await relinkMissing(t.env, OWNER)).toBe(RELINK_LIMIT)
    expect(await relinkMissing(t.env, OWNER)).toBe(extra)
    expect(await relinkMissing(t.env, OWNER)).toBe(0)
  })
})

describe('the nightly pass is wired in', () => {
  it('runs from housekeeping for every tenant, and the module no longer promises a daily backfill', () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    const index = read('../src/index.ts')
    expect(index).toMatch(/for \(const tenant of tenants\) \{\s+try \{\s+const linked = await relinkMissing\(env, tenant\)/)
    expect(read('../src/lib/catalog.ts')).not.toMatch(/the daily backfill links it/)
  })
})
