import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { applicationFields, artistAssets, gigOpportunities } from '../db/schema'
import { scoped, type TenantId } from '../db/scope'
import { readGig } from '../db/gigRows'
import { tenantOf, type AppEnv } from '../context'
import { buildApplication, type ApplicationField } from '../../shared/application'
import { composeApplicationEmail } from '../../shared/applicationEmail'
import { normaliseGigStatus } from '../../shared/gigStatus'
import { prepareApplication } from '../lib/applicationStaging'
import type { ArtistAsset } from '../../shared/artistAssets'
import type { Env } from '../types'

/**
 * Phase 3 — apply & track, mounted at `/api/gigs/:id/application`.
 *
 * Registered ahead of the gigs router in src/index.ts. It reads `:id` from the
 * mount path, which Hono resolves against the full matched route.
 *
 * Nothing here submits anything. Every route is either reading a form, staging
 * an answer from the artist database, or recording that you approved one — the
 * application itself is copied out by hand, on purpose. See
 * shared/application.ts.
 */
const application = new Hono<AppEnv>()

const PrepareSchema = z.object({
  /** Where the form is, when it is not the listing URL already on the row. */
  url: z.string().url().optional(),
})

const FieldPatchSchema = z
  .object({
    answer: z.string().nullable().optional(),
    answerState: z.enum(['empty', 'suggested', 'edited', 'approved']).optional(),
    /** Swap in a different asset's text — the alternatives beside a field. */
    useAssetId: z.number().int().positive().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' })

function todayOf(c: { req: { query: (k: string) => string | undefined } }): string {
  const q = c.req.query('today')
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10)
}

/** 400 before touching D1, so a bad id never becomes a query. */
function gigIdOf(raw: string | undefined): number | null {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

/** Options are stored as JSON text; a malformed one reads as no options. */
function parseOptions(raw: string | null): string[] | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((o): o is string => typeof o === 'string') : null
  } catch {
    return null
  }
}

type FieldRow = typeof applicationFields.$inferSelect

function toWire(row: FieldRow): ApplicationField {
  return {
    id: row.id,
    gigId: row.gigId,
    fieldKey: row.fieldKey,
    label: row.label,
    fieldType: row.fieldType,
    options: parseOptions(row.options),
    required: row.required === 1,
    maxLength: row.maxLength,
    helpText: row.helpText,
    position: row.position ?? 0,
    questionKind: row.questionKind,
    answer: row.answer,
    answerAssetId: row.answerAssetId,
    answerState: row.answerState,
    updatedAt: row.updatedAt,
  }
}

async function loadPacket(env: Env, tenant: TenantId, gigId: number, today: string) {
  const db = getDb(env.DB)

  const gig = readGig(
    await db
      .select()
      .from(gigOpportunities)
      .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gigId)))
      .get(),
  )
  if (!gig) return null

  const [rows, assets] = await Promise.all([
    db
      .select()
      .from(applicationFields)
      .where(scoped(applicationFields, tenant, eq(applicationFields.gigId, gigId))),
    db.select().from(artistAssets).where(scoped(artistAssets, tenant)),
  ])

  const packet = buildApplication({
    gigId,
    prepStatus: gig.prepStatus,
    prepNote: gig.prepNote,
    prepCheckedAt: gig.prepCheckedAt,
    fields: (rows as FieldRow[]).map(toWire),
    assets: assets as ArtistAsset[],
    today,
  })

  // Drafted only where it is the way in. A submission portal does not want an
  // email, and offering one there is an invitation to send it anyway.
  const email =
    gig.submissionMethod === 'email'
      ? composeApplicationEmail({
          gig: { name: gig.name, type: gig.type, organizer: gig.organizer, url: gig.url },
          assets: assets as ArtistAsset[],
        })
      : null

  return {
    ...packet,
    gig: {
      id: gig.id,
      name: gig.name,
      status: normaliseGigStatus(gig.status),
      submissionMethod: gig.submissionMethod,
      url: gig.url,
      applicationUrl: gig.applicationUrl,
      deadline: gig.deadline,
    },
    email,
  }
}

application.get('/', async (c) => {
  const gigId = gigIdOf(c.req.param('id'))
  if (gigId === null) return c.json({ error: 'A gig id is required.' }, 400)

  const packet = await loadPacket(c.env, tenantOf(c), gigId, todayOf(c))
  if (!packet) return c.json({ error: 'not found' }, 404)
  return c.json(packet)
})

/**
 * Read the form and stage what the artist database can answer, on request.
 *
 * What reading a form changes lives in `prepareApplication`, which the nightly
 * revisit calls too. The difference is `requested`: this one may start the
 * application, because you asked.
 */
application.post('/prepare', zValidator('json', PrepareSchema), async (c) => {
  const gigId = gigIdOf(c.req.param('id'))
  if (gigId === null) return c.json({ error: 'A gig id is required.' }, 400)

  const tenant = tenantOf(c)
  const result = await prepareApplication(c.env, tenant, gigId, {
    url: c.req.valid('json').url,
    requested: true,
  })

  if (!result.ok) {
    if (result.reason === 'not_found') return c.json({ error: 'not found' }, 404)
    return c.json(
      {
        error:
          'No form address for this one. Add the URL of the application form — the listing link is often an announcement rather than the form.',
      },
      400,
    )
  }

  const { outcome } = result
  const packet = await loadPacket(c.env, tenant, gigId, todayOf(c))
  return c.json({ ...packet, read: { status: outcome.status, note: outcome.note, fields: outcome.fields.length } })
})

application.patch('/fields/:fieldId', zValidator('json', FieldPatchSchema), async (c) => {
  const gigId = gigIdOf(c.req.param('id'))
  const fieldId = gigIdOf(c.req.param('fieldId'))
  if (gigId === null || fieldId === null) return c.json({ error: 'A gig id and a field id are required.' }, 400)

  const db = getDb(c.env.DB)
  const tenant = tenantOf(c)
  const b = c.req.valid('json')

  const row = await db
    .select()
    .from(applicationFields)
    .where(
      scoped(
        applicationFields,
        tenant,
        eq(applicationFields.id, fieldId),
        eq(applicationFields.gigId, gigId),
      ),
    )
    .get()
  if (!row) return c.json({ error: 'not found' }, 404)

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() }

  if (b.useAssetId !== undefined) {
    if (b.useAssetId === null) {
      updates.answer = null
      updates.answerAssetId = null
      updates.answerState = 'empty'
    } else {
      const asset = await db
        .select()
        .from(artistAssets)
        .where(scoped(artistAssets, tenant, eq(artistAssets.id, b.useAssetId)))
        .get()
      if (!asset?.value) return c.json({ error: 'That asset has nothing to say.' }, 400)
      updates.answer = asset.value
      updates.answerAssetId = asset.id
      // Picking which asset is not the same as reading what it says, so this
      // stays a suggestion until it is approved.
      updates.answerState = 'suggested'
    }
  }

  if (b.answer !== undefined) {
    updates.answer = b.answer
    // Text you typed is no longer the asset's — the link is dropped so a
    // stale-source warning cannot be attached to words the asset never said.
    updates.answerAssetId = null
    updates.answerState = b.answer ? 'edited' : 'empty'
  }

  // An explicit state wins over the one inferred above: approving an untouched
  // suggestion is the common case and must not read as an edit.
  if (b.answerState !== undefined) updates.answerState = b.answerState

  await db
    .update(applicationFields)
    .set(updates)
    .where(scoped(applicationFields, tenant, eq(applicationFields.id, fieldId)))

  const packet = await loadPacket(c.env, tenant, gigId, todayOf(c))
  return c.json(packet)
})

export default application
