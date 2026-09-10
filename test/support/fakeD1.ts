/**
 * The smallest D1 that the auth middleware needs.
 *
 * There is no D1 in the test environment, which is why the route tests only
 * ever assert what a handler does *before* it touches the database. That was
 * enough while the middleware was a string compare against `API_TOKEN`. It is
 * not enough now: a request resolves to a **tenant** before any route sees it,
 * and resolving one is a read (src/lib/actor.ts). Without a binding, every
 * route test 500s in the middleware and stops testing what it was written to
 * test.
 *
 * So this is a fake, and it is deliberately a bad database: it answers with the
 * rows it was handed and ignores every `WHERE`. That is fine for the one job it
 * has — letting a request through the door — and it is *not* fine for asserting
 * that scoping works, which is why nothing here pretends to filter. A test that
 * wanted to prove a route returns only one artist's rows would need a real
 * SQLite, and would be lying if it used this.
 *
 * The shape is dictated by drizzle's D1 driver rather than by taste. A select
 * carrying field metadata is read through `raw()` and mapped **positionally**,
 * so a row has to come back as an array in the order the SQL names its columns
 * — hence the column parsing below.
 */

type Row = Record<string, unknown>

/** Every quoted identifier in the select list, in order. */
function selectedColumns(sql: string): string[] {
  const match = /^\s*select\s+(.+?)\s+from\s/is.exec(sql)
  if (!match) return []
  return match[1].split(',').map((part) => {
    const quoted = [...part.matchAll(/"([^"]+)"/g)].map((m) => m[1])
    // The last one, so `"users"."id"` and `"id"` both answer `id`.
    return quoted[quoted.length - 1] ?? part.trim()
  })
}

function tableOf(sql: string): string | null {
  const match = /\b(?:from|into|update|delete\s+from)\s+"([^"]+)"/i.exec(sql)
  return match?.[1] ?? null
}

/**
 * @param tables rows keyed by table name, as the database would spell it.
 *   Anything not listed reads as empty.
 */
export function fakeD1(tables: Record<string, Row[]>): D1Database {
  const rowsFor = (sql: string): Row[] => {
    const table = tableOf(sql)
    return table ? (tables[table] ?? []) : []
  }

  const prepare = (sql: string) => {
    const statement = {
      bind: () => statement,
      async all() {
        return { results: rowsFor(sql), success: true, meta: {} }
      },
      async raw() {
        const columns = selectedColumns(sql)
        return rowsFor(sql).map((row) => columns.map((c) => row[c] ?? null))
      },
      async first() {
        return rowsFor(sql)[0] ?? null
      },
      async run() {
        return { results: [], success: true, meta: { changes: 0 } }
      },
    }
    return statement
  }

  return {
    prepare,
    async batch(statements: unknown[]) {
      return statements.map(() => ({ results: [], success: true, meta: {} }))
    },
    async exec() {
      return { count: 0, duration: 0 }
    },
    async dump() {
      return new ArrayBuffer(0)
    },
    withSession() {
      throw new Error('fakeD1: sessions are not implemented')
    },
  } as unknown as D1Database
}

/** The bootstrap owner from migration 0021 — what a signed-in request resolves to. */
export const OWNER_USER: Row = {
  id: 'usr_0001',
  role: 'owner',
  tenant_id: 'tnt_0001',
  display_name: null,
  email: null,
  created_at: '2026-01-01T00:00:00.000Z',
}

/** A database holding nothing but the one account, which is what the door needs. */
export function ownerOnlyD1(): D1Database {
  return fakeD1({ users: [OWNER_USER] })
}
