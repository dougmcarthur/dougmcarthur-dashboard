import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'
import { gigStage, gigStatusFromStored, storedGigState } from '../shared/gigStage'

/**
 * Migration 0031, run for real.
 *
 * A data migration is the one kind a test can check completely: build the
 * schema production has — `schema.sql`, then every migration before this one —
 * put a row in it for every spelling, run the file, and read the rows back
 * through the same function the Worker uses. There is no D1 here, but D1 is
 * SQLite, and so is `node:sqlite`.
 *
 * `createRequire` rather than an import, so the bundler in front of vitest
 * does not try to resolve a builtin it may not know about.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

const MIGRATION = '0031_gig_status_to_stage.sql'

/**
 * Every spelling a row written before 0030 could hold: the fourteen statuses
 * and the four legacy words `normaliseGigStatus` still reads. Pinned rather
 * than derived: after 0031 nothing writes this vocabulary, so a status added
 * later can never be in a row this has to convert.
 */
const OLD_SPELLINGS = [
  'discovered', 'shortlisted', 'preparing', 'submitted', 'acknowledged', 'info_requested', 'invited',
  'booked', 'declined', 'passed', 'expired', 'withdrawn', 'archived',
  'pending_review', 'approved', 'rejected', 'sent',
]

/** Stored in the new shape since 2a, or unknown, or empty: all to be left alone. */
const LEAVE_ALONE: Array<{ status: string | null; outcome: string | null; flag: string | null }> = [
  { status: 'new', outcome: null, flag: null },
  { status: 'applied', outcome: null, flag: 'offer_pending' },
  { status: 'closed', outcome: 'accepted', flag: null },
  { status: 'closed', outcome: null, flag: null },
  // Status columns are not a closed set. Read as a new gig either way; kept as written.
  { status: 'waitlisted', outcome: null, flag: null },
  { status: null, outcome: null, flag: null },
]

type Row = { id: number; status: string | null; outcome: string | null; flag: string | null; updated_at: string }

function productionShapedDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('schema.sql', 'utf8'))
  for (const file of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) {
    if (file >= MIGRATION) break
    db.exec(readFileSync(`migrations/${file}`, 'utf8'))
  }
  return db
}

/** Insert one gig, filling whatever the real table requires with placeholders. */
function insertGig(db: InstanceType<typeof DatabaseSync>, id: number, values: Record<string, string | null>) {
  const columns = db.prepare('PRAGMA table_info(gig_opportunities)').all() as Array<{
    name: string; notnull: number; dflt_value: string | null; pk: number
  }>
  const row: Record<string, string | number | null> = { id, updated_at: `2026-09-${String((id % 28) + 1).padStart(2, '0')}T10:00:00.000Z` }
  for (const c of columns) {
    if (c.name in row || c.name in values || c.pk || !c.notnull || c.dflt_value !== null) continue
    row[c.name] = `placeholder ${c.name}`
  }
  Object.assign(row, values)
  const names = Object.keys(row)
  db.prepare(`INSERT INTO gig_opportunities (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...names.map((n) => row[n]))
}

function readAll(db: InstanceType<typeof DatabaseSync>): Row[] {
  return db.prepare('SELECT id, status, outcome, flag, updated_at FROM gig_opportunities ORDER BY id').all() as Row[]
}

describe('migration 0031 — gig statuses to the stored stage shape', () => {
  const db = productionShapedDatabase()
  const spellings = [...OLD_SPELLINGS, ' Approved ', 'SUBMITTED']
  spellings.forEach((status, i) => insertGig(db, i + 1, { status }))
  LEAVE_ALONE.forEach((values, i) => insertGig(db, 100 + i, values))

  const before = readAll(db)
  db.exec(readFileSync(`migrations/${MIGRATION}`, 'utf8'))
  const after = readAll(db)
  const was = (id: number) => before.find((r) => r.id === id)!
  const now = (id: number) => after.find((r) => r.id === id)!

  it('writes every old spelling exactly as storedGigState would write it', () => {
    spellings.forEach((status, i) => {
      const { status: stage, outcome, flag } = now(i + 1)
      expect({ status: stage, outcome, flag }, status).toEqual(storedGigState(status))
    })
  })

  it('leaves every row reading as the same stage it read as before', () => {
    for (const row of after) {
      expect(gigStage(gigStatusFromStored(row)), `row ${row.id}`).toBe(gigStage(gigStatusFromStored(was(row.id))))
    }
  })

  it('reads every row back as the same status, bar the two 2a already folds', () => {
    // `preparing` and `acknowledged` do not survive 2a's round trip: stored
    // as In progress and Applied, they read back as `shortlisted` and
    // `submitted`, exactly as a row written since 2a already does.
    const FOLDED: Record<string, string> = { preparing: 'shortlisted', acknowledged: 'submitted' }
    for (const row of after) {
      const old = gigStatusFromStored(was(row.id))
      expect(gigStatusFromStored(row), `row ${row.id} (${was(row.id).status})`).toBe(FOLDED[old] ?? old)
    }
  })

  it('never calls your rejection theirs', () => {
    // `rejected` was the old word for *you* passing. Reading it back as
    // `declined` would rewrite history into the organiser saying no.
    const id = spellings.indexOf('rejected') + 1
    expect(now(id)).toMatchObject({ status: 'closed', outcome: 'passed' })
  })

  it('leaves new-shape, unknown and empty rows exactly as they were', () => {
    LEAVE_ALONE.forEach((_, i) => expect(now(100 + i)).toEqual(was(100 + i)))
  })

  it('does not touch updated_at, which would wake every snooze', () => {
    for (const row of after) expect(row.updated_at, `row ${row.id}`).toBe(was(row.id).updated_at)
  })

  it('changes nothing when run a second time', () => {
    db.exec(readFileSync(`migrations/${MIGRATION}`, 'utf8'))
    expect(readAll(db)).toEqual(after)
  })
})
