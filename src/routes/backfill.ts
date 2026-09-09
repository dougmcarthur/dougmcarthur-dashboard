import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, syncTargets } from '../db/schema'
import { gigNoteColumns, syncNoteColumns, changesFor, type ColumnChange } from '../../shared/noteColumns'
import type { Env } from '../types'

/**
 * Filling the columns migration 0001 added and nobody ever wrote to.
 *
 * `GET` says what it would change; `POST` changes it. The same split the
 * artist sourcing has, and for the same reason: a bulk write you cannot look
 * at first is one you find out about afterwards.
 *
 * **It never overwrites.** A column with something in it is left exactly as
 * it is, whatever the note now says, so a value you set by hand survives and
 * a second run writes nothing. See `changesFor`.
 *
 * This does not retire `shared/reviewParse.ts`. New rows arrive from research
 * agents outside this repo, still writing prose — which is why the gig and
 * sync routes now extract on write. The backfill is the same extraction,
 * applied once to the rows that predate it.
 */
const backfill = new Hono<{ Bindings: Env }>()

export interface RowPlan {
  table: 'gig' | 'sync'
  id: number
  name: string
  changes: ColumnChange[]
}

async function plan(env: Env): Promise<{ rows: RowPlan[]; scanned: number }> {
  const db = getDb(env.DB)
  const gigs = await db.select().from(gigOpportunities)
  const syncs = await db.select().from(syncTargets)
  const rows: RowPlan[] = []

  for (const gig of gigs) {
    const derived = gigNoteColumns(gig)
    const changes = changesFor(gig as unknown as Record<string, unknown>, {
      submissionState: derived.storedSubmissionState,
      submissionMethod: derived.submissionMethod,
      location: derived.location,
      blockedOn: derived.blockedOn,
      feeAmount: derived.feeAmount,
      feeCurrency: derived.feeCurrency,
    })
    if (changes.length) rows.push({ table: 'gig', id: gig.id, name: gig.name, changes })
  }

  for (const target of syncs) {
    const derived = syncNoteColumns(target)
    const changes = changesFor(target as unknown as Record<string, unknown>, {
      confirmationMethod: derived.confirmationMethod,
    })
    if (changes.length) rows.push({ table: 'sync', id: target.id, name: target.name, changes })
  }

  return { rows, scanned: gigs.length + syncs.length }
}

/** Counts per column, which is the number worth reading before a bulk write. */
function summarise(rows: RowPlan[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    for (const change of row.changes) counts[change.column] = (counts[change.column] ?? 0) + 1
  }
  return counts
}

backfill.get('/notes', async (c) => {
  const { rows, scanned } = await plan(c.env)
  return c.json({ scanned, wouldChange: rows.length, byColumn: summarise(rows), rows })
})

backfill.post('/notes', async (c) => {
  const db = getDb(c.env.DB)
  const { rows, scanned } = await plan(c.env)
  const updatedAt = new Date().toISOString()

  for (const row of rows) {
    const values: Record<string, unknown> = {}
    for (const change of row.changes) values[change.column] = change.to
    // `updated_at` is deliberately not touched. It means "when this row's
    // facts last changed", and filling a column from a note that already said
    // so is not a change to the facts — it would also wake every snooze in
    // the table, which reads `updated_at` against `snoozed_at`.
    void updatedAt
    if (row.table === 'gig') {
      await db.update(gigOpportunities).set(values).where(eq(gigOpportunities.id, row.id))
    } else {
      await db.update(syncTargets).set(values).where(eq(syncTargets.id, row.id))
    }
  }

  return c.json({ scanned, changed: rows.length, byColumn: summarise(rows) })
})

export default backfill
