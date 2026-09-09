import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import { getDb } from '../db'
import { taskRuns } from '../db/schema'
import { recordEvent } from '../lib/notificationEvents'
import type { Tier } from '../../shared/notifications'
import type { Env } from '../types'
import { taskLabel } from '../../shared/taskLabels'

/**
 * What a run is worth telling you about.
 *
 * `attention` rather than `critical` for a failure, deliberately. Critical is
 * reserved for plumbing that is broken *now* and costing you something
 * silently — a disconnected Calendar drops an event you believe was created.
 * A research run that failed is retried on its next schedule and costs you
 * nothing today. Colouring both the same makes neither mean anything.
 */
function runTier(status: string): Tier {
  return status === 'ok' || status === 'success' ? 'info' : 'attention'
}

/** Exported so the copy is testable — it is user-facing prose with branches. */
export function runTitle(taskId: string, status: string, added: number): string {
  // `taskLabel`, never the raw id. The id is what the agent POSTs — an
  // internal handle — and it had reached three screens before anybody
  // noticed it reading as developer-speak.
  const name = taskLabel(taskId)
  if (status !== 'ok' && status !== 'success') return `${name} ${status === 'failed' ? 'failed' : `finished ${status}`}`
  if (added > 0) return `${name} added ${added} ${added === 1 ? 'item' : 'items'}`
  return `${name} ran, nothing new`
}

const taskRunsRouter = new Hono<{ Bindings: Env }>()

/**
 * The run log, filtered server-side.
 *
 * Filtering has to happen here rather than in the browser because the list is
 * paginated: narrowing a page of fifty to the three failures on it would hide
 * every other failure in the log and call it a filter.
 *
 * `facets` ships with the page so the filter controls can only ever offer
 * values that exist. An empty option is a dead click.
 */
taskRunsRouter.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200)
  const offset = parseInt(c.req.query('offset') ?? '0')
  const task = c.req.query('task')
  const status = c.req.query('status')

  const where: SQL[] = []
  if (task) where.push(eq(taskRuns.taskId, task))
  if (status) where.push(eq(taskRuns.status, status))
  const filter = where.length > 0 ? and(...where) : undefined

  const [rows, [total], tasks, statuses] = await Promise.all([
    db.select().from(taskRuns).where(filter).orderBy(desc(taskRuns.runAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(taskRuns).where(filter),
    // Facets cover the whole log, not the current filter — otherwise choosing
    // one task would remove every other task from the menu that chose it.
    db.selectDistinct({ v: taskRuns.taskId }).from(taskRuns).orderBy(taskRuns.taskId),
    db.selectDistinct({ v: taskRuns.status }).from(taskRuns).orderBy(taskRuns.status),
  ])

  return c.json({
    runs: rows,
    total: total.count,
    facets: {
      tasks: tasks.map((r) => r.v),
      statuses: statuses.map((r) => r.v),
    },
  })
})

taskRunsRouter.post(
  '/',
  zValidator(
    'json',
    z.object({
      task_id: z.string().min(1),
      status: z.string().min(1),
      run_at: z.string().optional(),
      summary: z.string().optional(),
      items_added: z.number().int().optional(),
    }),
  ),
  async (c) => {
    const db = getDb(c.env.DB)
    const b = c.req.valid('json')

    const runAt = b.run_at ?? new Date().toISOString()
    const added = b.items_added ?? 0

    const result = await db
      .insert(taskRuns)
      .values({
        taskId: b.task_id,
        runAt,
        status: b.status,
        summary: b.summary ?? null,
        itemsAdded: added,
      })
      .returning({ id: taskRuns.id })

    // Nobody is watching when a scheduled agent posts here, which is exactly
    // what makes this an event rather than something the History page covers.
    // Keyed on the run's own timestamp so a retried POST does not report twice.
    await recordEvent(c.env, {
      kind: 'automation',
      tier: runTier(b.status),
      title: runTitle(b.task_id, b.status, added),
      body: b.summary ?? null,
      href: '#runs',
      action: 'View run',
      dedupeKey: `automation:${b.task_id}:${runAt}`,
      createdAt: runAt,
    })

    return c.json({ id: result[0].id }, 201)
  },
)

export default taskRunsRouter
