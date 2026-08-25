#!/usr/bin/env -S npx tsx
/**
 * One-time backfill for migration 0003: move what is crammed into
 * `gig_opportunities.deadline` into `deadline` / `deadline_note` / `opens_at`.
 *
 *   npx tsx scripts/backfill-deadlines.ts              # dry run, local D1
 *   npx tsx scripts/backfill-deadlines.ts --remote     # dry run, production
 *   npx tsx scripts/backfill-deadlines.ts --remote --apply
 *
 * Dry run is the default and prints every row it would change, old value
 * beside new. Nothing is written without --apply.
 *
 * The extraction is `splitDeadline()` from shared/reviewParse.ts — the same
 * function the Worker uses to read these rows today. Deliberately not a second
 * set of heuristics: scripts/backfill-structured-columns.js has its own, and
 * that is exactly why nobody can say whether its output matches what the UI
 * shows. Here, if the backfill and the UI ever disagree, it is a bug in one
 * function rather than a difference of opinion between two.
 *
 * Reversible: `deadline_note` keeps the original value verbatim whenever it
 * held anything beyond a date, so the pre-backfill column can be reconstructed
 * with `UPDATE gig_opportunities SET deadline = deadline_note WHERE
 * deadline_note IS NOT NULL`.
 */

import { execFileSync } from 'node:child_process'
import { splitDeadline } from '../shared/reviewParse'

const DB = 'dougmcarthur-music-hq'
const remote = process.argv.includes('--remote')
const apply = process.argv.includes('--apply')

interface GigRow {
  id: number
  name: string
  deadline: string | null
  deadline_note: string | null
  opens_at: string | null
}

function d1<T>(sql: string, json: true): T[]
function d1(sql: string, json?: false): void
function d1<T>(sql: string, json = false): T[] | void {
  const args = ['wrangler', 'd1', 'execute', DB, remote ? '--remote' : '--local', '--command', sql]
  if (json) args.push('--json')
  // execFileSync, not execSync: these SQL strings carry apostrophes and em
  // dashes straight out of the notes, and shell-quoting them by hand is how
  // a backfill script corrupts the data it was written to clean up.
  const out = execFileSync('npx', args, { encoding: 'utf8', stdio: json ? 'pipe' : 'inherit' })
  if (!json) return
  const parsed = JSON.parse(out) as Array<{ results: T[] }>
  return parsed[0]?.results ?? []
}

const quote = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`)

const rows = d1<GigRow>(
  'SELECT id, name, deadline, deadline_note, opens_at FROM gig_opportunities ORDER BY id',
  true,
)

const changes: Array<{ row: GigRow; date: string | null; note: string | null; opensAt: string | null }> = []

for (const row of rows) {
  // Already split — a re-run must not re-parse a cleaned column and lose the
  // note, so rows that have been through this are skipped outright.
  if (row.deadline_note !== null || row.opens_at !== null) continue

  const split = splitDeadline(row.deadline)
  const unchanged =
    split.date === row.deadline && split.note === null && split.opensAt === null
  if (unchanged) continue

  changes.push({ row, date: split.date, note: split.note, opensAt: split.opensAt })
}

const target = remote ? 'production' : 'local'
console.log(`${rows.length} gigs in ${target}; ${changes.length} would change.\n`)

for (const { row, date, note, opensAt } of changes) {
  console.log(`#${row.id} ${row.name}`)
  console.log(`   was  deadline=${JSON.stringify(row.deadline)}`)
  console.log(`   now  deadline=${JSON.stringify(date)} opens_at=${JSON.stringify(opensAt)}`)
  console.log(`        deadline_note=${JSON.stringify(note)}`)
}

if (!apply) {
  console.log(`\nDry run — nothing written. Re-run with --apply to commit.`)
  process.exit(0)
}

if (changes.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

// One statement per row rather than a single batch: D1 reports which command
// failed, and a partial backfill is resumable because finished rows now carry
// a deadline_note and are skipped on the next run.
//
// `updated_at` is deliberately left alone. Moving a value between columns is
// not something happening to the opportunity, and the Overview reads
// updated_at == discovered_at to find rows nobody has ever touched — bumping
// it here would wipe that signal off the dashboard in a single run.
for (const { row, date, note, opensAt } of changes) {
  d1(
    `UPDATE gig_opportunities SET deadline = ${quote(date)}, deadline_note = ${quote(note)}, ` +
      `opens_at = ${quote(opensAt)} WHERE id = ${row.id}`,
  )
}

console.log(`\nApplied ${changes.length} update(s) to ${target}.`)
