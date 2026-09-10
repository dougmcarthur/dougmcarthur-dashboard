/**
 * Admin mode: the parts that are a promise rather than a feature.
 *
 * The promise made to an invited artist is that their gig notes are theirs.
 * Every mechanism behind that is structural — the oversight router is typed
 * with a context carrying no tenant, so `scoped()` has nothing to be handed —
 * but "structural" is only true while nobody adds an import. These are the
 * checks that notice if somebody does, plus the small amount of behaviour that
 * is worth asserting directly.
 *
 * Source-level again, for the reason `test/tenantScope.test.ts` is: an admin
 * route that read a domain table would typecheck the moment it constructed a
 * `TenantId` of its own, and would pass every behavioural test in this suite
 * while there is one artist on the platform.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getTableName } from 'drizzle-orm'
import { readMode } from '../src/lib/auth'
import { SCOPED_TABLES, DOMAIN_TABLES } from '../src/db/scope'
import { MEASURED_FIELDS } from '../src/lib/usage'

const ADMIN_ROUTER = join('src', 'routes', 'admin.ts')
const ADMIN_SCREEN = join('frontend', 'src', 'pages', 'AdminPage.tsx')

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Comments out, so a rule about what the code *does* is not read off prose. */
function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('session mode', () => {
  it('reads anything that is not admin as artist', () => {
    // Null is the column's value on every session that predates migration 0023
    // and on every artist-mode session since, so it has to mean artist rather
    // than "unknown" — and an unrecognised value must not become a third mode.
    expect(readMode(null)).toBe('artist')
    expect(readMode(undefined)).toBe('artist')
    expect(readMode('artist')).toBe('artist')
    expect(readMode('ADMIN')).toBe('artist')
    expect(readMode('owner')).toBe('artist')
    expect(readMode('admin')).toBe('admin')
  })
})

describe('the oversight surface reads no domain table', () => {
  it('names none of the fourteen', () => {
    const src = withoutComments(source(ADMIN_ROUTER))
    const named = SCOPED_TABLES.filter((table) => new RegExp(`\\b${table}\\b`).test(src))
    expect(
      named,
      `src/routes/admin.ts names ${named.join(', ')}. Admin mode has no tenant to scope with, ` +
        'so a query here would either not compile or would have to invent a scope. ' +
        'Counting a tenant\'s rows for a removal preview goes through src/lib/tenantRemoval.ts, ' +
        'which takes the tenant as an argument and returns numbers.',
    ).toEqual([])
  })

  it('reaches a tenant only through the removal helpers', () => {
    const src = withoutComments(source(ADMIN_ROUTER))
    // `asTenantId` is the one constructor, and this router is allowed exactly
    // one use of it: turning a path segment into a tenant that exists, for the
    // one operation that crosses the line and is a write.
    const uses = [...src.matchAll(/asTenantId\(/g)].length
    expect(uses).toBe(1)
    expect(src).toContain('previewRemoval')
    expect(src).toContain('removeTenant')
  })
})

describe('the oversight screen offers nothing it cannot do', () => {
  const src = withoutComments(source(ADMIN_SCREEN))

  it('links to no artist-facing route', () => {
    // Every one of these 403s for an admin-mode session, so a link to one is a
    // promise the product breaks by printing it.
    const artistRoutes = ['#overview', '#review', '#gigs', '#artist', '#sync', '#promo', '#runs']
    const offered = artistRoutes.filter((route) => src.includes(route))
    expect(offered, `the admin screen links to ${offered.join(', ')}`).toEqual([])
  })

  it('never says it can open somebody else’s work', () => {
    // The words a support tool reaches for. There is no impersonation here on
    // purpose; offering the vocabulary is how it gets built by accident.
    expect(/\b(impersonate|act as|view as|sign in as)\b/i.test(src)).toBe(false)
  })

  it('names tables rather than printing identifiers', () => {
    // `taskLabel`'s rule, applied to a confirmation screen: a slug reads as a
    // leak in a product and as a bug in a screenshot.
    expect(src).toContain('tableLabel(')
    // A React key is not a rendering; a bare `{row.table}` in element content
    // is. Only the second is a slug on screen.
    expect(src).not.toMatch(/>\s*\{row\.table\}/)
  })
})

describe('the two lists of the fourteen agree', () => {
  it('has the same tables by name and by object', () => {
    // `SCOPED_TABLES` is what the source-level guard can match; `DOMAIN_TABLES`
    // is what a query can use. Two lists is two places to forget a table, so
    // they are checked against each other rather than trusted.
    const byObject = DOMAIN_TABLES.map((table) => getTableName(table)).sort()

    // The name list is camelCase exports; the object list carries SQL names.
    const asSql = [...SCOPED_TABLES]
      .map((name) => name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`))
      .sort()

    expect(byObject).toEqual(asSql)
  })
})

describe('the usage rollup says which figures are real', () => {
  it('names only the counters that have a writer', () => {
    // `usage_daily` has seven columns and four writers. A zero the screen
    // renders as "none" is worse than an absent figure, so the API reports
    // which fields mean something rather than shipping three silent zeroes.
    expect([...MEASURED_FIELDS]).toEqual(['domainRows', 'gigRows', 'promoRows', 'agentRuns'])

    const usage = withoutComments(source(join('src', 'lib', 'usage.ts')))
    for (const unmeasured of ['apiRequests', 'gmailDrafts', 'aiCalls']) {
      expect(MEASURED_FIELDS as readonly string[]).not.toContain(unmeasured)
      // Still written, as an explicit zero, so the row's shape is complete.
      expect(usage).toContain(`${unmeasured}: 0`)
    }
  })
})
