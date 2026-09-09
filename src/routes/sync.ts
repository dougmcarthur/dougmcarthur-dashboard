import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { getDb } from '../db'
import { syncTargets, reminders } from '../db/schema'
import type { Env } from '../types'
import { syncNoteColumns } from '../../shared/noteColumns'

const sync = new Hono<{ Bindings: Env }>()

const SyncInsertSchema = z.object({
  name: z.string().min(1),
  agencyType: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactRole: z.string().optional(),
  confirmationMethod: z.string().optional(),
  notes: z.string().optional(),
  pitchDraft: z.string().optional(),
  status: z.string().optional(),
})

const SyncPatchSchema = SyncInsertSchema.partial()

sync.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const status = c.req.query('status')
  const agencyType = c.req.query('agencyType')

  const conditions = []
  if (status) conditions.push(eq(syncTargets.status, status))
  if (agencyType) conditions.push(eq(syncTargets.agencyType, agencyType))

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(syncTargets)
          .where(and(...conditions))
          .orderBy(desc(syncTargets.discoveredAt))
      : await db.select().from(syncTargets).orderBy(desc(syncTargets.discoveredAt))

  return c.json(rows)
})

sync.post('/', zValidator('json', SyncInsertSchema), async (c) => {
  const db = getDb(c.env.DB)
  const b = c.req.valid('json')
  const ts = new Date().toISOString()

  const result = await db.insert(syncTargets).values({
    name: b.name,
    agencyType: b.agencyType ?? null,
    contactEmail: b.contactEmail || null,
    contactRole: b.contactRole ?? null,
    // Derived from the note where the caller did not say — same reasoning as
    // the gig route. See shared/noteColumns.ts.
    confirmationMethod: b.confirmationMethod ?? syncNoteColumns({ notes: b.notes }).confirmationMethod,
    notes: b.notes ?? null,
    pitchDraft: b.pitchDraft ?? null,
    status: b.status ?? 'draft_ready',
    discoveredAt: ts,
    updatedAt: ts,
  }).returning({ id: syncTargets.id })

  return c.json({ id: result[0].id }, 201)
})

sync.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const row = await db
    .select()
    .from(syncTargets)
    .where(eq(syncTargets.id, Number(c.req.param('id'))))
    .get()

  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

sync.patch('/:id', zValidator('json', SyncPatchSchema), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const b = c.req.valid('json')

  await db
    .update(syncTargets)
    .set({ ...b, updatedAt: new Date().toISOString() })
    .where(eq(syncTargets.id, id))

  const row = await db.select().from(syncTargets).where(eq(syncTargets.id, id)).get()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

sync.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  // Same orphaning as gigs: reminders point at (entity_type, entity_id) with
  // no foreign key to enforce it, so the reminder has to go with the row.
  await db
    .delete(reminders)
    .where(and(eq(reminders.entityType, 'sync'), eq(reminders.entityId, id)))
  await db.delete(syncTargets).where(eq(syncTargets.id, id))
  return c.json({ ok: true })
})

export default sync
