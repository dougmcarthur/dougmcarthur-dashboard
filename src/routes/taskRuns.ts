import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc, eq, sql, type SQL } from 'drizzle-orm'
import { getDb } from '../db'
import { taskRuns } from '../db/schema'
import { scoped, withTenant } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import { recordEvent } from '../lib/notificationEvents'
import { runEventKey, runTier, runTitle } from '../../shared/runEvents'
import { agentWrite } from '../lib/agentWrites'

// `runTier` and `runTitle` live in `shared/runEvents.ts` now: the History page
// builds the same title from the same run, and a second copy of user-facing
// prose with branches is how the two would stop agreeing.

const taskRunsRouter = new Hono<AppEnv>()

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

  const tenant = tenantOf(c)
  const where: SQL[] = []
  if (task) where.push(eq(taskRuns.taskId, task))
  if (status) where.push(eq(taskRuns.status, status))
  const filter = scoped(taskRuns, tenant, ...where)

  const [rows, [total], tasks, statuses] = await Promise.all([
    db.select().from(taskRuns).where(filter).orderBy(desc(taskRuns.runAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(taskRuns).where(filter),
    // Facets cover this artist's whole log, not the current filter — otherwise
    // choosing one task would remove every other task from the menu that chose
    // it. Scoped all the same: the menu is a list of what *you* run, and a
    // stranger's task id appearing in it would be a leak wearing a dropdown.
    db
      .selectDistinct({ v: taskRuns.taskId })
      .from(taskRuns)
      .where(scoped(taskRuns, tenant))
      .orderBy(taskRuns.taskId),
    db
      .selectDistinct({ v: taskRuns.status })
      .from(taskRuns)
      .where(scoped(taskRuns, tenant))
      .orderBy(taskRuns.status),
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
  agentWrite('taskRun'),
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

    // A machine credential never chooses the timestamp. Cadence is measured
    // from the newest `run_at`, so a run stamped in the future would make a
    // stopped schedule read as alive until that date; neither runner sends one,
    // and a person correcting the log by hand still can.
    const runAt = c.get('actor').kind === 'agent' ? new Date().toISOString() : (b.run_at ?? new Date().toISOString())
    const added = b.items_added ?? 0

    const tenant = tenantOf(c)
    const result = await db
      .insert(taskRuns)
      .values(withTenant(tenant, {
        taskId: b.task_id,
        runAt,
        status: b.status,
        summary: b.summary ?? null,
        itemsAdded: added,
      }))
      .returning({ id: taskRuns.id })

    // Nobody is watching when a scheduled agent posts here, which is exactly
    // what makes this an event rather than something the History page covers.
    // Keyed on the run's own timestamp so a retried POST does not report twice.
    await recordEvent(c.env, tenant, {
      kind: 'automation',
      tier: runTier(b.status),
      title: runTitle(b.task_id, b.status, added),
      body: b.summary ?? null,
      href: '#runs/automation',
      action: 'See report',
      dedupeKey: runEventKey(b.task_id, runAt),
      createdAt: runAt,
    })

    return c.json({ id: result[0].id }, 201)
  },
)

export default taskRunsRouter
