#!/usr/bin/env -S npx tsx
/**
 * Issue, list or revoke an agent token, from a terminal.
 *
 *   npx tsx scripts/issue-agent-token.ts "Research routines"            # dry run
 *   npx tsx scripts/issue-agent-token.ts "Research routines" --apply    # issues one
 *   npx tsx scripts/issue-agent-token.ts --list
 *   npx tsx scripts/issue-agent-token.ts --revoke <id> --apply
 *
 * The app has the routes for this (`src/routes/agentTokens.ts`) and no screen
 * yet. Until it does, this is how the Claude Code routines get their
 * credential — see docs/agent-routines.md.
 *
 * It writes one row into `agent_tokens` through `wrangler d1 execute
 * --remote`: data, not schema, so the migration ledger is untouched. It does
 * not ask for a passkey the way the route does, and does not need to — it
 * needs a logged-in Cloudflare account, which already owns the database and
 * every secret on the Worker. That is a stronger credential than a session,
 * not a weaker one.
 *
 * Same shape as the route: a random token, stored only as its SHA-256, shown
 * once. The token goes to stdout on its own; everything else to stderr, so it
 * can be piped somewhere without the commentary.
 */

import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const DATABASE = 'dougmcarthur-music-hq'

/** Control characters, which have no business in a label shown on a screen. */
const CONTROL = /[\u0000-\u001f]/

/** SQLite string literal. The label is the only value here a person types. */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

interface D1Result {
  results: Array<Record<string, unknown>>
  meta?: { changes?: number }
}

/** Runs one statement against production, without a shell in between. */
function d1(sql: string): D1Result {
  const out = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', DATABASE, '--remote', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const parsed = JSON.parse(out) as D1Result[]
  return parsed[0]
}

function fail(message: string, code = 1): never {
  console.error(message)
  process.exit(code)
}

function list(): void {
  const { results } = d1(
    'SELECT id, label, created_at, last_used_at, revoked_at FROM agent_tokens ORDER BY created_at DESC',
  )
  if (!results.length) return console.error('No agent tokens have been issued.')
  for (const row of results) {
    const state = row.revoked_at ? `revoked ${row.revoked_at}` : `last used ${row.last_used_at ?? 'never'}`
    console.error(`${row.id}  ${row.label}  issued ${row.created_at}  ${state}`)
  }
}

function revoke(id: string, apply: boolean): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) fail(`That is not a token id: ${id}`)
  if (!apply) return console.error(`[dry run] would revoke agent token ${id}. Add --apply to do it.`)
  const { meta } = d1(
    `UPDATE agent_tokens SET revoked_at = ${literal(new Date().toISOString())} ` +
      `WHERE id = ${literal(id)} AND revoked_at IS NULL`,
  )
  if (meta?.changes !== 1) fail(`No live token with id ${id}. --list shows what exists.`)
  console.error(`Revoked ${id}. Delete its credential from the cloud environment too.`)
}

function issue(label: string, apply: boolean): void {
  const name = label.trim()
  if (!name || name.length > 80 || CONTROL.test(name)) {
    fail('A label is required: up to 80 characters, saying what will hold the token.')
  }
  if (!apply) {
    return console.error(`[dry run] would issue an agent token labelled "${name}" for the owner. Add --apply.`)
  }

  const token = randomBytes(32).toString('base64url')
  const id = randomBytes(16).toString('base64url')
  const hash = createHash('sha256').update(token, 'utf8').digest('hex')

  // The owner's tenant, found the way `ownerTenant` finds it: the earliest
  // account with the owner role. Zero rows inserted means there is no owner,
  // which is a reason to stop rather than to guess a tenant.
  const { meta } = d1(
    'INSERT INTO agent_tokens (id, tenant_id, token_hash, label, created_at) ' +
      `SELECT ${literal(id)}, tenant_id, ${literal(hash)}, ${literal(name)}, ${literal(new Date().toISOString())} ` +
      "FROM users WHERE role = 'owner' AND tenant_id IS NOT NULL ORDER BY created_at LIMIT 1",
  )
  if (meta?.changes !== 1) fail('No owner account was found, so no token was issued.')

  console.error(`Issued agent token ${id} ("${name}"). It is shown once, below; nothing can show it again.`)
  console.log(token)
}

function main(): void {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const rest = args.filter((arg) => arg !== '--apply')

  if (rest[0] === '--list') return list()
  if (rest[0] === '--revoke') return revoke(rest[1] ?? '', apply)
  if (rest.length === 1 && !rest[0].startsWith('--')) return issue(rest[0], apply)
  fail('Usage: issue-agent-token.ts "<label>" [--apply] | --list | --revoke <id> [--apply]', 2)
}

main()
