import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb } from '../db'
import { reminders } from '../db/schema'
import type { Env } from '../types'

const remindersRouter = new Hono<{ Bindings: Env }>()

remindersRouter.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const status = c.req.query('status') ?? 'pending'

  const rows = await db
    .select()
    .from(reminders)
    .where(eq(reminders.status, status))
    .orderBy(reminders.scheduledFor)

  return c.json(rows)
})

remindersRouter.patch(
  '/:id',
  zValidator('json', z.object({ status: z.enum(['pending', 'sent', 'dismissed']) })),
  async (c) => {
    const db = getDb(c.env.DB)
    const id = Number(c.req.param('id'))
    const { status } = c.req.valid('json')

    await db.update(reminders).set({ status }).where(eq(reminders.id, id))

    const row = await db.select().from(reminders).where(eq(reminders.id, id)).get()
    if (!row) return c.json({ error: 'not found' }, 404)
    return c.json(row)
  },
)

// Dismiss all pending reminders for an entity (e.g. when a gig is submitted)
remindersRouter.post('/dismiss', zValidator('json', z.object({
  entityType: z.enum(['gig', 'sync']),
  entityId: z.number().int(),
})), async (c) => {
  const db = getDb(c.env.DB)
  const { entityType, entityId } = c.req.valid('json')

  await db
    .update(reminders)
    .set({ status: 'dismissed' })
    .where(
      and(
        eq(reminders.entityType, entityType),
        eq(reminders.entityId, entityId),
        eq(reminders.status, 'pending'),
      ),
    )

  return c.json({ ok: true })
})

export default remindersRouter
