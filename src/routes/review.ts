import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, syncTargets, promoDrafts } from '../db/schema'
import { buildReviewQueue, matchesFilter, summariseQueue, type ReviewFilter } from '../../shared/reviewQueue'
import type { GigOpportunity, SyncTarget, PromoDraft } from '../../shared/types'
import type { Env } from '../types'

/**
 * GET /api/review — the decision queue.
 *
 * The definition of "needs a decision" lives here, server-side, so every
 * screen that asks the question gets the same answer. Before this, the Review
 * page built the queue client-side while `/api/overview` selected on statuses
 * no production row carries, and the two could not agree.
 *
 * Query params:
 *   filter  needs | conflict | blocked | paid | timing | snoozed | all  (default: all)
 *   limit   cap the number of items returned; counts always cover everything
 *
 * `counts` and `summary` are computed over the whole queue regardless of
 * `filter`/`limit`, so a caller asking for four cards still learns how much is
 * behind them, and the Overview gets its time-critical strip and backlog row
 * out of the same request that fills the deck.
 *
 * Day arithmetic (overdue, due-in-Nd) runs against the Worker's UTC clock
 * rather than the viewer's timezone, so a deadline can tick over up to a day
 * early or late relative to Winnipeg. Fine for triage; worth revisiting if
 * these numbers ever drive anything automated.
 */
const review = new Hono<{ Bindings: Env }>()

const FILTERS: ReviewFilter[] = ['needs', 'conflict', 'blocked', 'paid', 'timing', 'snoozed', 'all']

function isFilter(value: string | undefined): value is ReviewFilter {
  return value !== undefined && (FILTERS as string[]).includes(value)
}

review.get('/', async (c) => {
  // Validate before touching the database — a bad request should not cost
  // three table scans, and it keeps this path testable without a binding.
  const requested = c.req.query('filter')
  if (requested !== undefined && !isFilter(requested)) {
    return c.json({ error: `unknown filter "${requested}"`, allowed: FILTERS }, 400)
  }

  const rawLimit = c.req.query('limit')
  const limit = rawLimit === undefined ? undefined : Number(rawLimit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return c.json({ error: 'limit must be a positive integer' }, 400)
  }

  const db = getDb(c.env.DB)

  const [gigs, sync, promo] = await Promise.all([
    db.select().from(gigOpportunities).orderBy(desc(gigOpportunities.discoveredAt)),
    db.select().from(syncTargets).orderBy(desc(syncTargets.discoveredAt)),
    db.select().from(promoDrafts).orderBy(desc(promoDrafts.createdAt)),
  ])

  const items = buildReviewQueue({
    gigs: gigs as GigOpportunity[],
    sync: sync as SyncTarget[],
    promo: promo as PromoDraft[],
  })

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f, items.filter((i) => matchesFilter(i, f)).length]),
  ) as Record<ReviewFilter, number>

  // Default to `all` rather than skipping the filter entirely. Both used to
  // mean the same thing; since snoozed items are excluded inside
  // matchesFilter(), skipping it would quietly leak them into an unfiltered
  // request — the one place the rule could be forgotten.
  const filtered = items.filter((i) => matchesFilter(i, requested ?? 'all'))

  return c.json({
    items: limit ? filtered.slice(0, limit) : filtered,
    total: filtered.length,
    counts,
    summary: summariseQueue(items),
  })
})

/**
 * POST /api/review/snooze — defer an item, or bring it back.
 *
 * A dedicated endpoint rather than a field on PATCH /api/gigs, because
 * `snoozed_until` and `snoozed_at` are only meaningful together: the wake rule
 * compares `updated_at` against `snoozed_at`, so a caller that set the date
 * without the stamp would create a snooze that breaks on the very write that
 * created it. Both are written here, from one timestamp, and there is no path
 * that can set one without the other.
 *
 * `until: null` clears the snooze. Clearing also clears `snoozed_at` — leaving
 * it behind would mean a later snooze inherits an older stamp and wakes
 * immediately.
 */
const SnoozeSchema = z.object({
  kind: z.enum(['gig', 'sync']),
  id: z.number().int().positive(),
  /** ISO date (YYYY-MM-DD) to resurface on, or null to wake it now. */
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

review.post('/snooze', zValidator('json', SnoozeSchema), async (c) => {
  const { kind, id, until } = c.req.valid('json')

  // A snooze into the past is almost certainly a timezone or picker bug, and
  // it would silently do nothing — which is worse than refusing it.
  const today = new Date().toISOString().slice(0, 10)
  if (until !== null && until <= today) {
    return c.json({ error: `snooze date must be after ${today}` }, 400)
  }

  const db = getDb(c.env.DB)
  const ts = new Date().toISOString()

  // updated_at gets the same value as snoozed_at, not a later one: they are
  // the same event, and any gap would read as "changed since the snooze".
  const values = until === null
    ? { snoozedUntil: null, snoozedAt: null, updatedAt: ts }
    : { snoozedUntil: until, snoozedAt: ts, updatedAt: ts }

  const table = kind === 'gig' ? gigOpportunities : syncTargets
  const [row] = await db.update(table).set(values).where(eq(table.id, id)).returning({ id: table.id })

  if (!row) return c.json({ error: `no ${kind} with id ${id}` }, 404)
  return c.json({ kind, id, snoozedUntil: until })
})

export default review
