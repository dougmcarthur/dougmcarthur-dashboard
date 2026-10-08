import { describe, it, expect } from 'vitest'
import { asTenantId } from '../src/db/scope'
import { countHistory, readHistoryPage } from '../src/lib/history'
import { runEventKey } from '../shared/runEvents'
import { sqliteD1 } from './support/sqliteD1'

/**
 * The History queries, run for real against the production schema.
 *
 * `buildHistory` is covered without a database in `history.test.ts`. What it
 * cannot cover is the part that decides what it is handed: which rows the WHERE
 * lets through, whose they are, and where a page ends. A filter that missed the
 * tenant would put a stranger's run on this artist's timeline, and one that
 * missed the echo exclusion would list every run twice.
 */

const NOW = new Date('2026-10-07T13:00:00.000Z')
const OWNER = asTenantId('tnt_0001')
const OTHER = asTenantId('tnt_0002')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

function database() {
  const { d1, db } = sqliteD1()

  const run = (o: { tenant?: string; task?: string; at: string; status?: string; summary?: string | null; added?: number }) =>
    db
      .prepare(`INSERT INTO task_runs (tenant_id, task_id, run_at, status, summary, items_added) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(o.tenant ?? OWNER, o.task ?? 'gig-festival-scan', o.at, o.status ?? 'ok', o.summary ?? null, o.added ?? 0)

  const event = (o: {
    tenant?: string
    kind?: string
    title?: string
    at: string
    key?: string | null
    readAt?: string | null
    dismissedAt?: string | null
    body?: string | null
  }) =>
    db
      .prepare(
        `INSERT INTO notification_events (tenant_id, kind, tier, title, body, dedupe_key, created_at, read_at, dismissed_at)
         VALUES (?, ?, 'info', ?, ?, ?, ?, ?, ?)`,
      )
      .run(o.tenant ?? OWNER, o.kind ?? 'digest', o.title ?? 'Weekly digest sent', o.body ?? null, o.key ?? null, o.at, o.readAt ?? null, o.dismissedAt ?? null)

  /** What `POST /api/task-runs` writes beside the run. */
  const echo = (o: { tenant?: string; task?: string; at: string; readAt?: string | null }) =>
    event({ tenant: o.tenant, kind: 'automation', title: 'Gig research ran, nothing new', at: o.at, key: runEventKey(o.task ?? 'gig-festival-scan', o.at), readAt: o.readAt })

  return { env: { DB: d1 } as never, run, event, echo }
}

const page = (env: never, opts: Partial<{ kind: 'digest' | 'automation' | null; before: string | null; limit: number; tenant: typeof OWNER }> = {}) =>
  readHistoryPage(env, opts.tenant ?? OWNER, { kind: opts.kind ?? null, before: opts.before ?? null, limit: opts.limit ?? 30, now: NOW })

describe('one page of the timeline', () => {
  it('merges runs and events, newest first', async () => {
    const t = database()
    t.run({ at: hoursAgo(5) })
    t.event({ at: hoursAgo(3), title: 'Middle' })
    t.run({ at: hoursAgo(1) })
    const { entries } = await page(t.env)
    expect(entries.map((e) => e.at)).toEqual([hoursAgo(1), hoursAgo(3), hoursAgo(5)])
    expect(entries[1].title).toBe('Middle')
  })

  it('shows one artist\'s history and nobody else\'s', async () => {
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.run({ tenant: OTHER, at: hoursAgo(2), summary: 'a stranger\'s report' })
    t.event({ at: hoursAgo(3) })
    t.event({ tenant: OTHER, at: hoursAgo(4), title: 'a stranger\'s digest' })
    const { entries } = await page(t.env)
    expect(entries).toHaveLength(2)
    expect(JSON.stringify(entries)).not.toContain('stranger')
  })

  it('lists a run once, not once as itself and once as its echo', async () => {
    const t = database()
    t.run({ at: hoursAgo(2) })
    t.echo({ at: hoursAgo(2) })
    expect((await page(t.env)).entries).toHaveLength(1)
  })

  it('does not let the echoes fill the page and crowd out the events', async () => {
    // Runs far outnumber everything else. If the echoes were read as events, a
    // page of two would be two echoes and the digest would never appear.
    const t = database()
    for (const h of [1, 2, 3]) {
      t.run({ at: hoursAgo(h) })
      t.echo({ at: hoursAgo(h) })
    }
    t.event({ at: hoursAgo(2.5), title: 'The digest' })
    const { entries } = await page(t.env, { limit: 4 })
    expect(entries.map((e) => e.title)).toContain('The digest')
  })

  it('lists an event that was dismissed in the bell', async () => {
    const t = database()
    t.event({ at: hoursAgo(1), dismissedAt: hoursAgo(0.5), readAt: hoursAgo(0.5) })
    expect((await page(t.env)).entries).toHaveLength(1)
  })

  it('reads a run as unread exactly when its echo is', async () => {
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.echo({ at: hoursAgo(1) })
    t.run({ at: hoursAgo(2) })
    t.echo({ at: hoursAgo(2), readAt: hoursAgo(1) })
    t.run({ at: hoursAgo(24 * 40) })
    const { entries } = await page(t.env)
    expect(entries.map((e) => e.read)).toEqual([false, true, true])
    expect(entries[0].readKey).toMatch(/^event:automation:\d+$/)
    expect(entries[2].readKey).toBeNull()
  })

  it('keeps a run of its own task from borrowing another artist\'s echo', async () => {
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.echo({ tenant: OTHER, at: hoursAgo(1), readAt: hoursAgo(0.5) })
    expect((await page(t.env)).entries[0].read).toBe(true)
    // No echo of its own, so nothing to be unread. The point is that the other
    // artist's did not decide it: with the same key, it would have read the
    // same, so the case that matters is the unread one.
    const u = database()
    u.run({ at: hoursAgo(1) })
    u.echo({ tenant: OTHER, at: hoursAgo(1) })
    expect((await page(u.env)).entries[0].readKey).toBeNull()
  })

  it('leaves out events past the thirty days they are kept, and keeps every run', async () => {
    const t = database()
    t.event({ at: hoursAgo(24 * 31), title: 'Too old' })
    t.run({ at: hoursAgo(24 * 90) })
    const { entries } = await page(t.env)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('automation')
  })
})

describe('filtering by type', () => {
  it('shows only that type', async () => {
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.event({ at: hoursAgo(2), kind: 'digest' })
    t.event({ at: hoursAgo(3), kind: 'reconcile', title: 'Replies found' })
    const { entries } = await page(t.env, { kind: 'digest' })
    expect(entries.map((e) => e.kind)).toEqual(['digest'])
  })

  it('reads the run log only for automation', async () => {
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.event({ at: hoursAgo(2), kind: 'automation', title: 'Application form read', key: 'form-read:4' })
    t.event({ at: hoursAgo(3), kind: 'digest' })
    const { entries } = await page(t.env, { kind: 'automation' })
    expect(entries.map((e) => e.title)).toEqual(['Gig research ran, nothing new', 'Application form read'])
  })
})

describe('paging', () => {
  it('walks the whole timeline once, with nothing skipped and nothing twice', async () => {
    const t = database()
    for (const h of [1, 3, 5, 7]) t.run({ at: hoursAgo(h) })
    for (const h of [2, 4, 6]) t.event({ at: hoursAgo(h), title: `event ${h}` })

    const seen: string[] = []
    let before: string | null = null
    for (let i = 0; i < 10; i++) {
      const got = await page(t.env, { limit: 3, before })
      seen.push(...got.entries.map((e) => e.at))
      if (!got.next) break
      before = got.next
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7].map(hoursAgo))
  })

  it('does not strand two entries that share a timestamp on the line between pages', async () => {
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.event({ at: hoursAgo(2), title: 'one of two' })
    t.run({ at: hoursAgo(2), task: 'other-task' })
    t.run({ at: hoursAgo(3) })

    const seen: string[] = []
    let before: string | null = null
    for (let i = 0; i < 10; i++) {
      const got = await page(t.env, { limit: 2, before })
      seen.push(...got.entries.map((e) => e.key))
      if (!got.next) break
      before = got.next
    }
    expect(seen).toHaveLength(4)
    expect(new Set(seen).size).toBe(4)
  })
})

describe('the count behind each chip', () => {
  it('counts events by type and adds the run log to automation', async () => {
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.run({ at: hoursAgo(2) })
    t.echo({ at: hoursAgo(1) })
    t.echo({ at: hoursAgo(2) })
    t.event({ at: hoursAgo(3), kind: 'automation', key: 'form-read:4' })
    t.event({ at: hoursAgo(4), kind: 'digest' })
    t.event({ at: hoursAgo(5), kind: 'digest', dismissedAt: hoursAgo(4) })
    t.event({ at: hoursAgo(24 * 31), kind: 'digest' })
    // Two runs, one other automation event; the echoes are the runs again.
    expect(await countHistory(t.env, OWNER, NOW)).toEqual({ automation: 3, digest: 2 })
  })

  it('counts nobody else\'s', async () => {
    const t = database()
    t.run({ tenant: OTHER, at: hoursAgo(1) })
    t.event({ tenant: OTHER, at: hoursAgo(1) })
    expect(await countHistory(t.env, OWNER, NOW)).toEqual({})
  })

  it('agrees with what the timeline can reach', async () => {
    // A chip that says 3 over a list that holds 2 is the worst kind of wrong.
    const t = database()
    t.run({ at: hoursAgo(1) })
    t.echo({ at: hoursAgo(1) })
    t.event({ at: hoursAgo(2), kind: 'digest' })
    t.event({ at: hoursAgo(3), kind: 'digest', dismissedAt: hoursAgo(1) })
    const counts = await countHistory(t.env, OWNER, NOW)
    const { entries } = await page(t.env)
    expect(Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)).toBe(entries.length)
  })
})
