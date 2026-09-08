/**
 * Give the local D1 database the baseline the migrations assume.
 *
 * `migrations/0001` opens with `ALTER TABLE gig_opportunities`, because when it
 * was written that table already existed — production was created from
 * `schema.sql` by hand, before any of this went through the ledger. Remote has
 * carried that baseline ever since and nobody has needed to think about it.
 *
 * A fresh clone has no such history, so `wrangler d1 migrations apply --local`
 * met an empty database and died on `no such table: gig_opportunities` at the
 * first file. The local path has therefore never worked from a clean checkout.
 *
 * This applies `schema.sql` first, and only when the baseline is missing.
 * Deliberately a check rather than making `schema.sql` idempotent: that file
 * says it was pulled verbatim out of `sqlite_master`, and it is the record of
 * what production looked like before migration 0001 — rewriting its statements
 * to suit a dev convenience would cost more than it saves.
 *
 * Local only. Nothing here can reach the remote database, and the remote
 * ledger is untouched: no `0000` migration is introduced, so production has
 * nothing new to reconcile.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** One source for the database name — it is already declared in wrangler.toml. */
function databaseName() {
  const toml = readFileSync('wrangler.toml', 'utf8')
  const match = toml.match(/^\s*database_name\s*=\s*["']([^"']+)["']/m)
  if (!match) {
    throw new Error('No database_name in wrangler.toml — cannot tell which database to bootstrap.')
  }
  return match[1]
}

function wrangler(args) {
  // stdout captured, stderr inherited: wrangler writes its banner and warnings
  // to stderr, and mixing those into the JSON is how the parse breaks.
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  })
}

const db = databaseName()

const probe = wrangler([
  'd1', 'execute', db, '--local', '--json',
  '--command', "SELECT name FROM sqlite_master WHERE type='table' AND name='gig_opportunities'",
])

let hasBaseline = false
try {
  // [{ results: [...], success: true, meta: {...} }]
  hasBaseline = JSON.parse(probe)[0].results.length > 0
} catch (err) {
  throw new Error(`Could not read the local database: ${err instanceof Error ? err.message : err}`)
}

if (hasBaseline) {
  console.log(`${db}: local baseline already present, nothing to do.`)
  process.exit(0)
}

console.log(`${db}: empty local database — applying schema.sql before the migrations.`)
wrangler(['d1', 'execute', db, '--local', '--file=./schema.sql'])
console.log(`${db}: baseline applied.`)
