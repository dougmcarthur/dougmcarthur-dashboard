import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { desc } from 'drizzle-orm'
import { getDb } from '../db'
import { taskRuns } from '../db/schema'
import type { Env } from '../types'

const taskRunsRouter = new Hono<{ Bindings: Env }>()

taskRunsRouter.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200)
  const offset = parseInt(c.req.query('offset') ?? '0')

  const rows = await db
    .select()
    .from(taskRuns)
    .orderBy(desc(taskRuns.runAt))
    .limit(limit)
    .offset(offset)

  return c.json(rows)
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

    const result = await db
      .insert(taskRuns)
      .values({
        taskId: b.task_id,
        runAt: b.run_at ?? new Date().toISOString(),
        status: b.status,
        summary: b.summary ?? null,
        itemsAdded: b.items_added ?? 0,
      })
      .returning({ id: taskRuns.id })

    return c.json({ id: result[0].id }, 201)
  },
)

export default taskRunsRouter
