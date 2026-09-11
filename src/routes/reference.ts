import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { referenceDocs } from '../db/schema'
import { scoped, withTenant } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'

const reference = new Hono<AppEnv>()

reference.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const rows = await db
    .select()
    .from(referenceDocs)
    .where(scoped(referenceDocs, tenantOf(c)))
    .orderBy(referenceDocs.id)
  return c.json(rows)
})

reference.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const row = await db
    .select()
    .from(referenceDocs)
    .where(scoped(referenceDocs, tenantOf(c), eq(referenceDocs.id, c.req.param('id'))))
    .get()

  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

reference.post(
  '/',
  zValidator(
    'json',
    z.object({ id: z.string().min(1), title: z.string().min(1), content: z.string() }),
  ),
  async (c) => {
    const db = getDb(c.env.DB)
    const b = c.req.valid('json')
    const ts = new Date().toISOString()

    const tenant = tenantOf(c)
    // The id is client-supplied and the primary key is global, so two artists
    // cannot both hold a doc called `bio`. That is a shape to fix when a second
    // tenant exists — a composite key, like the four constraints migration 0021
    // deferred — and not something to paper over by inventing an id here.
    await db
      .insert(referenceDocs)
      .values(withTenant(tenant, { id: b.id, title: b.title, content: b.content, updatedAt: ts }))

    const row = await db
      .select()
      .from(referenceDocs)
      .where(scoped(referenceDocs, tenant, eq(referenceDocs.id, b.id)))
      .get()
    return c.json(row, 201)
  },
)

reference.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  await db
    .delete(referenceDocs)
    .where(scoped(referenceDocs, tenantOf(c), eq(referenceDocs.id, c.req.param('id'))))
  return c.json({ ok: true })
})

reference.patch(
  '/:id',
  zValidator('json', z.object({ title: z.string().optional(), content: z.string().optional() })),
  async (c) => {
    const db = getDb(c.env.DB)
    const id = c.req.param('id')
    const b = c.req.valid('json')

    const tenant = tenantOf(c)
    await db
      .update(referenceDocs)
      .set({ ...b, updatedAt: new Date().toISOString() })
      .where(scoped(referenceDocs, tenant, eq(referenceDocs.id, id)))

    const row = await db
      .select()
      .from(referenceDocs)
      .where(scoped(referenceDocs, tenant, eq(referenceDocs.id, id)))
      .get()
    if (!row) return c.json({ error: 'not found' }, 404)
    return c.json(row)
  },
)

export default reference
