import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db'
import { promoDrafts } from '../db/schema'
import type { Env } from '../types'

const promo = new Hono<{ Bindings: Env }>()

const PromoInsertSchema = z.object({
  month: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  status: z.string().optional(),
})

promo.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db.select().from(promoDrafts).orderBy(desc(promoDrafts.createdAt))
  return c.json(rows)
})

promo.post('/', zValidator('json', PromoInsertSchema), async (c) => {
  const db = getDb(c.env.DB)
  const b = c.req.valid('json')
  const ts = new Date().toISOString()

  const result = await db.insert(promoDrafts).values({
    month: b.month,
    title: b.title,
    content: b.content,
    status: b.status ?? 'draft',
    createdAt: ts,
  }).returning({ id: promoDrafts.id })

  return c.json({ id: result[0].id }, 201)
})

promo.patch('/:id', zValidator('json', PromoInsertSchema.partial()), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const b = c.req.valid('json')

  await db.update(promoDrafts).set(b).where(eq(promoDrafts.id, id))

  const row = await db.select().from(promoDrafts).where(eq(promoDrafts.id, id)).get()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

promo.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  await db.delete(promoDrafts).where(eq(promoDrafts.id, Number(c.req.param('id'))))
  return c.json({ ok: true })
})

export default promo
