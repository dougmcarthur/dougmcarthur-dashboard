import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db'
import { promoDrafts } from '../db/schema'
import { scoped, withTenant } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'

const promo = new Hono<AppEnv>()

const PromoInsertSchema = z.object({
  month: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
  status: z.string().optional(),
})

promo.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const tenant = tenantOf(c)
  const rows = await db
    .select()
    .from(promoDrafts)
    .where(scoped(promoDrafts, tenant))
    .orderBy(desc(promoDrafts.createdAt))
  return c.json(rows)
})

promo.post('/', zValidator('json', PromoInsertSchema), async (c) => {
  const db = getDb(c.env.DB)
  const b = c.req.valid('json')
  const ts = new Date().toISOString()

  const result = await db.insert(promoDrafts).values(withTenant(tenantOf(c), {
    month: b.month,
    title: b.title,
    content: b.content,
    status: b.status ?? 'draft',
    createdAt: ts,
  })).returning({ id: promoDrafts.id })

  return c.json({ id: result[0].id }, 201)
})

promo.patch('/:id', zValidator('json', PromoInsertSchema.partial()), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const b = c.req.valid('json')

  const tenant = tenantOf(c)

  await db.update(promoDrafts).set(b).where(scoped(promoDrafts, tenant, eq(promoDrafts.id, id)))

  const row = await db.select().from(promoDrafts).where(scoped(promoDrafts, tenant, eq(promoDrafts.id, id))).get()
  // Somebody else's row answers 404, which is also what a row that does not
  // exist answers — the two are the same fact from here.
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

promo.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  await db
    .delete(promoDrafts)
    .where(scoped(promoDrafts, tenantOf(c), eq(promoDrafts.id, Number(c.req.param('id')))))
  return c.json({ ok: true })
})

export default promo
