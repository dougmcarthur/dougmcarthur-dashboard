import { Hono } from 'hono'
import { desc } from 'drizzle-orm'
import { getDb } from '../db'
import { gigOpportunities, syncTargets, promoDrafts } from '../db/schema'
import { buildReviewQueue, matchesFilter, type ReviewFilter } from '../../shared/reviewQueue'
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
 *   filter  needs | conflict | blocked | paid | timing | all   (default: all)
 *   limit   cap the number of items returned; counts always cover everything
 *
 * `counts` is computed over the whole queue regardless of `filter`/`limit`,
 * so a caller asking for four cards still learns how much is behind them.
 *
 * Day arithmetic (overdue, due-in-Nd) runs against the Worker's UTC clock
 * rather than the viewer's timezone, so a deadline can tick over up to a day
 * early or late relative to Winnipeg. Fine for triage; worth revisiting if
 * these numbers ever drive anything automated.
 */
const review = new Hono<{ Bindings: Env }>()

const FILTERS: ReviewFilter[] = ['needs', 'conflict', 'blocked', 'paid', 'timing', 'all']

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

  const filtered = requested ? items.filter((i) => matchesFilter(i, requested)) : items

  return c.json({
    items: limit ? filtered.slice(0, limit) : filtered,
    total: filtered.length,
    counts,
  })
})

export default review
