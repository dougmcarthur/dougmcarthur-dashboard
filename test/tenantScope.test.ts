/**
 * The guard that makes tenant scoping a property rather than a habit.
 *
 * A missing `WHERE tenant_id = ?` typechecks, runs, returns rows and passes
 * every behavioural test in this suite — because with one artist in the
 * database the unscoped answer and the scoped answer are the same rows. It
 * stops being the same answer on the day a second artist exists, which is
 * exactly the day nobody is re-reading these queries.
 *
 * So this reads the source instead. Same move as `test/uiConsistency.test.ts`,
 * and for the same reason: some mistakes typecheck and render.
 *
 * The rule: every `.from` / `.insert` / `.update` / `.delete` naming one of the
 * fourteen scoped tables must pass through `scoped()` or `withTenant()` in the
 * same chain — or through a local whose value came from `scoped()`, which is
 * how a query builds an optional filter list.
 *
 * Exemptions are listed below with a reason each, because the only safe kind of
 * exemption is one somebody had to write a sentence about.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SCOPED_TABLES } from '../src/db/scope'

const SRC = join(__dirname, '..', 'src')

/**
 * Queries that name a scoped table and deliberately do not scope, keyed by
 * `file:function`. Each one is a claim that the query is about the *platform*
 * rather than about an artist.
 */
const EXEMPT: Array<{ file: string; contains: string; why: string }> = [
  {
    file: 'lib/notificationEvents.ts',
    contains: 'lt(notificationEvents.createdAt, cutoff)',
    why:
      'Retention is one platform rule — nothing older than thirty days — applied identically ' +
      'to every tenant. Expressing it as one delete per tenant would be N ways to get one ' +
      'policy wrong, and the cutoff is the whole predicate.',
  },
]

/**
 * Comments out, before anything else looks at the text.
 *
 * Two reasons, and the second is the important one. A comment between two
 * links of a chain would end the chain as far as the scanner is concerned, so
 * a query explaining itself would read as unscoped. And a comment *mentioning*
 * `scoped(` would read as scoping — a false pass, which is the failure mode
 * worth engineering against.
 *
 * Quotes and template literals are respected, or every `https://` in the tree
 * would eat the rest of its line.
 */
function stripComments(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      out += ch
      i++
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') {
          out += source[i] + (source[i + 1] ?? '')
          i += 2
          continue
        }
        out += source[i]
        i++
      }
      out += source[i] ?? ''
      i++
      continue
    }
    out += ch
    i++
  }
  return out
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

/**
 * The rest of a method chain, from an index inside it.
 *
 * This codebase writes no semicolons, so a chain ends at the first newline
 * whose next non-space character does not continue it — a `.`, or a closing
 * bracket while brackets opened inside the chain are still unbalanced.
 */
function chainFrom(source: string, start: number): string {
  let depth = 0
  let i = start
  for (; i < source.length; i++) {
    const ch = source[i]
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === '\n' && depth <= 0) {
      const next = /\S/.exec(source.slice(i))
      if (!next || next[0] !== '.') break
    }
    if (depth < 0) break
  }
  return source.slice(start, i)
}

/** Locals assigned from `scoped(...)`, which a `.where()` may then name. */
function scopedLocals(source: string): Set<string> {
  const names = new Set<string>()
  for (const m of source.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*scoped\(/g)) names.add(m[1])
  return names
}

describe('tenant scoping', () => {
  const files = sourceFiles(SRC)

  it('finds the source tree it is meant to be reading', () => {
    expect(files.length).toBeGreaterThan(15)
  })

  it('scopes every query against a tenant-owned table', () => {
    const tables = new Set<string>(SCOPED_TABLES)
    const unscoped: string[] = []

    for (const path of files) {
      const source = stripComments(readFileSync(path, 'utf8'))
      const relative = path.slice(SRC.length + 1)
      const locals = scopedLocals(source)

      for (const match of source.matchAll(/\.(from|insert|update|delete)\(\s*(\w+)\s*[,)]/g)) {
        const [, , table] = match
        if (!tables.has(table)) continue

        const chain = chainFrom(source, match.index)
        if (chain.includes('scoped(') || chain.includes('withTenant(')) continue
        if ([...locals].some((name) => chain.includes(`.where(${name})`))) continue
        if (EXEMPT.some((e) => relative === e.file && chain.includes(e.contains))) continue

        unscoped.push(`${relative}: .${match[1]}(${table}) — ${chain.split('\n')[0].trim()}`)
      }
    }

    expect(unscoped, `unscoped queries against tenant-owned tables:\n${unscoped.join('\n')}`).toEqual([])
  })

  it('keeps the exemption list honest', () => {
    // An exemption for a query that no longer exists is a rule nobody is
    // enforcing, dressed as one that is.
    for (const exemption of EXEMPT) {
      const source = readFileSync(join(SRC, exemption.file), 'utf8')
      expect(source, `stale exemption for ${exemption.file}`).toContain(exemption.contains)
      expect(exemption.why.length).toBeGreaterThan(40)
    }
  })

  /**
   * The blind spot, named and bounded.
   *
   * The rule above matches `.from(gigOpportunities)` — a table by its export
   * name. It cannot see `.from(table)` where `table` came from iterating
   * `DOMAIN_TABLES`, which is how the three jobs that must visit all fourteen
   * are written. Those are safe for their own reasons, but not because of the
   * check above, and a guard with an invisible gap is worse than one with a
   * named gap.
   *
   * So the gap is a list. A fourth file reaching for `DOMAIN_TABLES` fails here
   * until somebody writes down why it is allowed to.
   */
  it('names every file that reaches a domain table through the list', () => {
    const ALLOWED: Record<string, string> = {
      'db/scope.ts':
        'Declares the list, beside the names the rule above matches. The two are ' +
        'checked against each other below, so neither can quietly stop covering a ' +
        'table the other has.',
      'lib/usage.ts':
        'Counts a tenant\'s rows for the daily rollup. Runs as the tenant and goes ' +
        'through `scoped` on every count; it emits a number and never a row.',
      'lib/tenantRemoval.ts':
        'Counts and then deletes one tenant\'s rows. Scoped on every statement, and ' +
        'the tenant is an argument the caller checked against `tenants` first.',
      'lib/tenantHealth.ts':
        'Deliberately unscoped, and that is the job: it counts rows with **no** ' +
        'tenant, which a scoped query cannot find. A count, naming no column and ' +
        'returning no row — one of the preconditions migration 0024 names before ' +
        'the NOT NULL pass on the fourteen can be finished.',
    }

    const reaching = files
      .map((path) => path.slice(SRC.length + 1))
      .filter((rel) => stripComments(readFileSync(join(SRC, rel), 'utf8')).includes('DOMAIN_TABLES'))
      .sort()

    expect(reaching, 'a file reaches the fourteen through DOMAIN_TABLES without a written reason')
      .toEqual(Object.keys(ALLOWED).sort())

    for (const [file, why] of Object.entries(ALLOWED)) {
      expect(why.length, file).toBeGreaterThan(40)
    }
  })

  it('lists exactly the tables that carry a tenant column', () => {
    // `SCOPED_TABLES` and the schema have to agree, or a table added with a
    // `tenant_id` is one the guard above silently ignores.
    const schema = stripComments(readFileSync(join(SRC, 'db', 'schema.ts'), 'utf8'))
    const declared = new Set<string>()
    for (const m of schema.matchAll(/export const (\w+) = sqliteTable\(([\s\S]*?)\n\}\)/g)) {
      if (/\btext\('tenant_id'\)/.test(m[2])) declared.add(m[1])
    }
    // `users`, `usageDaily` and `agentTokens` carry the column without being
    // domain tables: an account row, a rollup and a credential. They are named
    // here rather than left to a comment, so adding a fifteenth domain table
    // and forgetting `SCOPED_TABLES` fails instead of passing.
    const notDomain = new Set(['users', 'usageDaily', 'agentTokens'])
    const expected = [...declared].filter((name) => !notDomain.has(name)).sort()

    expect(expected).toEqual([...SCOPED_TABLES].sort())
  })
})
