import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'

/**
 * A real SQLite behind the D1 interface, for tests where the WHERE is the point.
 *
 * `fakeD1` answers with whatever rows it was handed and ignores every filter,
 * which is right for letting a request through the door and useless for
 * asserting what a query touches. This is the other tool: `node:sqlite`, with
 * the production schema built the way production got it — `schema.sql`, then
 * every migration in order — wrapped in just enough of D1's shape for
 * drizzle's D1 driver to run against it.
 *
 * `createRequire`, so the bundler in front of vitest does not try to resolve a
 * builtin it may not know about.
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

type Value = string | number | null | bigint | Uint8Array

export function sqliteD1(): { d1: D1Database; db: InstanceType<typeof DatabaseSync> } {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync('schema.sql', 'utf8'))
  for (const file of readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(`migrations/${file}`, 'utf8'))
  }

  const prepare = (sql: string) => {
    let args: Value[] = []
    const statement = {
      bind: (...values: unknown[]) => {
        args = values.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v as Value)))
        return statement
      },
      async all() {
        return { results: db.prepare(sql).all(...args), success: true, meta: {} }
      },
      // drizzle reads a select with field metadata positionally; object values
      // come back in the order the SQL names its columns.
      async raw() {
        return db.prepare(sql).all(...args).map((row) => Object.values(row as object))
      },
      async first() {
        return db.prepare(sql).get(...args) ?? null
      },
      async run() {
        const r = db.prepare(sql).run(...args)
        return { results: [], success: true, meta: { changes: Number(r.changes) } }
      },
    }
    return statement
  }

  const d1 = {
    prepare,
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return Promise.all(statements.map((s) => s.run()))
    },
    async exec(sql: string) {
      db.exec(sql)
      return { count: 0, duration: 0 }
    },
  } as unknown as D1Database

  return { d1, db }
}
