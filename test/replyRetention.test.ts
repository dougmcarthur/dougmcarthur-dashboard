import { readFileSync } from 'node:fs'
import { getTableColumns } from 'drizzle-orm'
import { describe, it, expect } from 'vitest'
import { gigReplies } from '../src/db/schema'
import { asTenantId } from '../src/db/scope'
import { FORGOTTEN_ON_DISMISS, KEPT_ON_DISMISS, pruneReplies } from '../src/lib/replyRetention'
import { MAX_WINDOW_DAYS } from '../src/lib/gmailReplies'
import { sqliteD1 } from './support/sqliteD1'

/**
 * A dismissed reply keeps the fact of the decision and nothing about the mail.
 *
 * The id has to stay — the scan skips a message whose id is already decided,
 * so deleting the row would bring it back on the next run — and everything
 * else that says what the mail said or who sent it goes. The sweep runs for
 * real against the production schema, because what it matches is the whole
 * question: a WHERE that missed a column would keep mail, and one that missed
 * the tenant would reach a stranger's rows.
 */

const TODAY = new Date('2026-09-26T12:00:00.000Z')
const OWNER = 'tnt_0001'
const OTHER = 'tnt_0002'

type Seed = { id: number; tenant?: string; resolution: string | null; received?: string; gigId?: number | null }

function database(rows: Seed[]) {
  const { d1, db } = sqliteD1()
  for (const r of rows) {
    db.prepare(
      `INSERT INTO gig_replies (id, tenant_id, gmail_message_id, gmail_thread_id, gig_id, from_address, from_name,
        subject, snippet, received_at, classification, evidence, match_signals, resolution, resolved_at, asks,
        unrecognised_asks, created_at)
       VALUES (?, ?, ?, ?, ?, 'someone@festival.example', 'A Person', 'Re: your application',
        'Thanks for applying — we loved it', ?, 'declined', 'We will not be moving forward', '["name"]', ?, ?,
        '[{"kind":"bio"}]', '["Could you send a rider?"]', '2026-09-01T00:00:00.000Z')`,
    ).run(
      r.id, r.tenant ?? OWNER, `msg-${r.id}`, `thr-${r.id}`, r.gigId ?? null,
      r.received ?? '2026-09-01T00:00:00.000Z', r.resolution, r.resolution ? '2026-09-02T00:00:00.000Z' : null,
    )
  }
  const read = (id: number) => db.prepare('SELECT * FROM gig_replies WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return { env: { DB: d1 } as never, read }
}

describe('what a dismissed reply keeps', () => {
  it('sorts every column into forgotten or kept, so a new one cannot be kept by default', () => {
    const columns = Object.keys(getTableColumns(gigReplies))
    const sorted = [...Object.keys(FORGOTTEN_ON_DISMISS), ...Object.keys(KEPT_ON_DISMISS)]
    expect(sorted.sort()).toEqual([...columns].sort())
  })

  it('forgets who wrote and what they said, and keeps the id that stops a re-proposal', () => {
    for (const column of ['fromAddress', 'fromName', 'subject', 'snippet', 'evidence', 'asks', 'unrecognisedAsks']) {
      expect(Object.keys(FORGOTTEN_ON_DISMISS), column).toContain(column)
    }
    expect(Object.keys(KEPT_ON_DISMISS)).toContain('gmailMessageId')
  })

  it('forgets in the same write that records the decision', () => {
    const route = readFileSync('src/routes/replies.ts', 'utf8')
    expect(route).toMatch(/resolution: 'dismissed', resolvedAt: new Date\(\)\.toISOString\(\), \.\.\.FORGOTTEN_ON_DISMISS/)
  })

  it('is swept nightly, for every tenant', () => {
    expect(readFileSync('src/index.ts', 'utf8')).toMatch(/for \(const tenant of tenants\) \{\s*const done = await pruneReplies\(env, tenant\)/)
  })
})

describe('the nightly sweep, run for real', () => {
  it('empties a dismissed reply and leaves the tombstone', async () => {
    const { env, read } = database([{ id: 1, resolution: 'dismissed', gigId: 3 }])
    const done = await pruneReplies(env, asTenantId(OWNER), TODAY)
    expect(done).toEqual({ forgotten: 1, deleted: 0 })
    const row = read(1)!
    for (const column of ['from_name', 'subject', 'snippet', 'evidence', 'match_signals', 'asks', 'unrecognised_asks']) {
      expect(row[column], column).toBeNull()
    }
    expect(row.from_address).toBe('')
    expect(row.gmail_message_id).toBe('msg-1')
    expect(row.resolution).toBe('dismissed')
  })

  it('leaves unresolved and accepted replies whole', async () => {
    // Unresolved is waiting on you; accepted is the record the reply draft
    // is composed from.
    const { env, read } = database([
      { id: 1, resolution: null },
      { id: 2, resolution: 'accepted', gigId: 3 },
    ])
    expect(await pruneReplies(env, asTenantId(OWNER), TODAY)).toEqual({ forgotten: 0, deleted: 0 })
    expect(read(1)!.snippet).toBe('Thanks for applying — we loved it')
    expect(read(2)!.subject).toBe('Re: your application')
  })

  it('deletes a tombstone once the scan can no longer reach back to it', async () => {
    const reach = (days: number) => new Date(TODAY.getTime() - days * 86_400_000).toISOString()
    const { env, read } = database([
      { id: 1, resolution: 'dismissed', received: reach(MAX_WINDOW_DAYS + 2) },
      { id: 2, resolution: 'dismissed', received: reach(MAX_WINDOW_DAYS - 2) },
    ])
    const done = await pruneReplies(env, asTenantId(OWNER), TODAY)
    expect(done.deleted).toBe(1)
    expect(read(1)).toBeUndefined()
    // Still inside the scan's reach, so the next scan could find it: the
    // tombstone is what stops it coming back.
    expect(read(2)!.gmail_message_id).toBe('msg-2')
  })

  it('touches only the tenant it was given', async () => {
    const { env, read } = database([
      { id: 1, resolution: 'dismissed' },
      { id: 2, resolution: 'dismissed', tenant: OTHER },
    ])
    await pruneReplies(env, asTenantId(OWNER), TODAY)
    expect(read(1)!.snippet).toBeNull()
    expect(read(2)!.snippet).toBe('Thanks for applying — we loved it')
  })

  it('finds nothing to do a second time', async () => {
    const { env } = database([{ id: 1, resolution: 'dismissed' }])
    await pruneReplies(env, asTenantId(OWNER), TODAY)
    expect(await pruneReplies(env, asTenantId(OWNER), TODAY)).toEqual({ forgotten: 0, deleted: 0 })
  })
})
