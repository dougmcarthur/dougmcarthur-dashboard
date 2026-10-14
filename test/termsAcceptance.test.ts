import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { TERMS_VERSION } from '../shared/terms'
import { asTenantId } from '../src/db/scope'
import { findInvite, issueInvite, redeemInvite } from '../src/lib/invites'
import { removeTenant } from '../src/lib/tenantRemoval'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Which terms an account agreed to, and when.
 *
 * The invitation screen says that setting up a passkey is agreeing to the
 * terms of service. This is the record of which terms, and it is held to four
 * things: the version is the one the page says it is, it is written where the
 * account is created and nowhere else, it is null on every account that
 * predates it, and it goes with the account.
 *
 * Nothing here reads the real clock. The redemption is handed an instant, as
 * it is in the route, and the page's date is parsed by hand rather than through
 * `Date`, so the run in `TZ=Pacific/Auckland` reads the same sentence.
 */

const read = (path: string) => readFileSync(path, 'utf8')
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const NOW = new Date('2026-10-13T15:30:00.000Z')

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** What the page's "Last updated" line says, as an ISO date. Null when the line is not there. */
function pageDate(html: string): string | null {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const found = text.match(new RegExp(`Last updated (${MONTHS.join('|')}) (\\d{1,2}), (\\d{4})\\.`))
  if (!found) return null
  const month = MONTHS.indexOf(found[1]) + 1
  return `${found[3]}-${String(month).padStart(2, '0')}-${found[2].padStart(2, '0')}`
}

describe('the version is the page’s own date', () => {
  it('is an ISO calendar date', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const [y, m, d] = TERMS_VERSION.split('-').map(Number)
    const roundTrip = new Date(Date.UTC(y, m - 1, d))
    expect([roundTrip.getUTCFullYear(), roundTrip.getUTCMonth() + 1, roundTrip.getUTCDate()]).toEqual([y, m, d])
  })

  it('agrees with the “Last updated” line on /terms-of-service/', () => {
    // Red when either moves without the other: a page edited and not the
    // constant records an account against words it was never shown, and a
    // constant moved and not the page names a version nobody can read.
    const date = pageDate(read('frontend/terms-of-service/index.html'))
    expect(date, 'the page has no “Last updated <Month> <day>, <year>.” line').not.toBeNull()
    expect(TERMS_VERSION).toBe(date)
  })

  it('is written in one place, the constant', () => {
    // A literal date beside the write would be a second constant that the test
    // above never reads.
    const writer = withoutComments(read('src/lib/invites.ts'))
    expect(writer).toContain('termsVersion: TERMS_VERSION')
    expect(writer).not.toMatch(/termsVersion:\s*['"`]/)
  })
})

describe('migration 0041 is additive and honest', () => {
  const MIGRATION = '0041_terms_acceptance.sql'
  const sql = withoutComments(read(`migrations/${MIGRATION}`).replace(/^--.*$/gm, ''))

  it('adds two nullable columns and does nothing else', () => {
    const statements = sql.split(';').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)
    expect(statements).toEqual([
      'ALTER TABLE users ADD COLUMN terms_version TEXT',
      'ALTER TABLE users ADD COLUMN terms_accepted_at TEXT',
    ])
  })

  it('does not backfill, default or constrain', () => {
    expect(sql).not.toMatch(/\bNOT NULL\b/i)
    expect(sql).not.toMatch(/\bDEFAULT\b/i)
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i)
  })

  it('leaves an account that was already there reading null, run for real', () => {
    // The schema production has before this file: schema.sql, then every
    // earlier migration. The owner's account is the row this is about.
    const db = new DatabaseSync(':memory:')
    db.exec(read('schema.sql'))
    for (const file of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) {
      if (file >= MIGRATION) break
      db.exec(read(`migrations/${file}`))
    }
    db.prepare(
      `INSERT INTO users (id, role, tenant_id, display_name, email, created_at)
       VALUES ('usr_before', 'owner', 'tnt_before', 'Before', 'before@example.test', '2026-09-01T00:00:00.000Z')`,
    ).run()

    db.exec(read(`migrations/${MIGRATION}`))

    const row = db.prepare('SELECT terms_version, terms_accepted_at FROM users WHERE id = ?').get('usr_before')
    expect(row).toEqual({ terms_version: null, terms_accepted_at: null })

    const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{
      name: string; notnull: number; dflt_value: string | null
    }>
    for (const name of ['terms_version', 'terms_accepted_at']) {
      const column = columns.find((c) => c.name === name)
      expect(column, `${name} is missing`).toBeDefined()
      expect(column?.notnull).toBe(0)
      expect(column?.dflt_value).toBeNull()
    }
  })
})

describe('what redeeming an invitation writes, run for real', () => {
  async function redeemOne() {
    const { d1, db } = sqliteD1()
    const env = { DB: d1 } as never

    // An account from before the record: the five columns it had, and no more.
    db.prepare(
      `INSERT INTO users (id, role, tenant_id, display_name, email, created_at)
       VALUES ('usr_owner', 'owner', 'tnt_owner', 'Owner', 'owner@example.test', '2026-06-01T00:00:00.000Z')`,
    ).run()

    const issued = await issueInvite(env, {
      email: 'new.artist@example.test',
      displayName: 'A New Artist',
      issuedBy: 'usr_owner',
      now: NOW,
    })
    const found = await findInvite(env, issued.token, NOW)
    expect(found?.state).toBe('valid')
    const account = await redeemInvite(env, found!.invite, NOW)

    const user = (id: string) =>
      db
        .prepare('SELECT created_at, terms_version, terms_accepted_at FROM users WHERE id = ?')
        .get(id) as { created_at: string; terms_version: string | null; terms_accepted_at: string | null } | undefined
    return { env, db, account, user }
  }

  it('records the version in force and the instant the account was created', async () => {
    const { account, user } = await redeemOne()
    expect(user(account.userId)).toEqual({
      created_at: NOW.toISOString(),
      terms_version: TERMS_VERSION,
      terms_accepted_at: NOW.toISOString(),
    })
  })

  it('takes the time it was handed, not the clock', async () => {
    // NOW is in the past by the time this runs; a read of the real clock would
    // put a different stamp on the row.
    const { account, user } = await redeemOne()
    expect(user(account.userId)?.terms_accepted_at).toBe('2026-10-13T15:30:00.000Z')
  })

  it('does not touch an account that was already there', async () => {
    const { user } = await redeemOne()
    expect(user('usr_owner')).toEqual({
      created_at: '2026-06-01T00:00:00.000Z',
      terms_version: null,
      terms_accepted_at: null,
    })
  })

  it('goes with the account when the artist is removed', async () => {
    const { env, db, account, user } = await redeemOne()
    expect(user(account.userId)).toBeDefined()

    const result = await removeTenant(env, asTenantId(account.tenantId))
    expect(result.usersDeleted).toBe(1)
    expect(user(account.userId)).toBeUndefined()
    // And nothing of it is left behind in any shape: the row was the record.
    const left = db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE terms_version IS NOT NULL OR terms_accepted_at IS NOT NULL')
      .get() as { n: number }
    expect(left.n).toBe(0)
  })
})

describe('the privacy policy says it is kept', () => {
  const PRIVACY = read('frontend/privacy/index.html')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

  it('names the record, and that older accounts have none', () => {
    // The collection list is where a reader looks for what is held about them.
    // A column that stores a fact about a person and a page that does not say so
    // is the gap this closes, so the sentence goes if the record does.
    expect(PRIVACY).toContain('which version of the terms of service you agreed to and when')
    expect(PRIVACY).toContain('written once when your account is created')
    expect(PRIVACY).toContain('An account made before we began recording this has no such record.')
  })

})

describe('where it is written and where it is not', () => {
  const NAMES = /\b(termsVersion|termsAcceptedAt|terms_version|terms_accepted_at)\b/

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
      else if (/\.tsx?$/.test(name)) out.push(path)
    }
    return out
  }

  it('is named by the schema and the one writer, and by nothing else', () => {
    // A list route, the oversight surface or a screen that names either column
    // is a decision somebody has not made yet. The record is read by nothing,
    // so the allow-list is the table definition and `redeemInvite`. A later
    // prompt that reads it adds its own file here, on purpose.
    const files = [...sourceFiles('src'), ...sourceFiles('shared'), ...sourceFiles('frontend/src')]
    const naming = files
      .filter((file) => NAMES.test(withoutComments(read(file))))
      .map((file) => file.replace(/\\/g, '/'))
      .sort()
    expect(naming).toEqual(['src/db/schema.ts', 'src/lib/invites.ts'])
  })

  it('reaches neither the artists list nor the removal preview', () => {
    const admin = withoutComments(read('src/routes/admin.ts'))
    expect(admin).not.toMatch(NAMES)
    // The list builds each item field by field. A spread of the user row would
    // carry the new columns out without ever naming them.
    expect(admin).not.toMatch(/\.\.\.\s*(u|user|account|accounts?\[\d\])\b/)
  })

  it('is written after the passkey verifies, from the route’s own clock', () => {
    const route = withoutComments(read('src/routes/auth.ts'))
    const handler = route.slice(route.indexOf("'/join/verify'"))
    const verified = handler.indexOf('verifyRegistrationResponse(')
    const redeemed = handler.indexOf('redeemInvite(')
    expect(verified).toBeGreaterThan(-1)
    expect(redeemed).toBeGreaterThan(verified)
    // Handed an instant rather than left to default to the clock.
    expect(handler).toMatch(/redeemInvite\(c\.env, found\.invite, now\)/)
  })

  it('does not read the clock inside the redemption', () => {
    const source = withoutComments(read('src/lib/invites.ts'))
    const body = source.slice(source.indexOf('export async function redeemInvite('))
    // The default parameter is the only mention; the body works from `now`.
    expect(body.match(/new Date\(/g)?.length).toBe(1)
    const endOfSignature = body.indexOf('): Promise<RedeemedAccount>')
    expect(endOfSignature).toBeGreaterThan(-1)
    expect(body.indexOf('new Date(')).toBeLessThan(endOfSignature)
  })
})
