import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { applicationFields, artistAssets, gigOpportunities } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import {
  buildApplication,
  normaliseAnswerState,
  stageAnswer,
  type ApplicationField,
} from '../../shared/application'
import { composeApplicationEmail } from '../../shared/applicationEmail'
import { normaliseGigStatus, isGigTransitionAllowed } from '../../shared/gigStatus'
import { readApplicationForm, isReadableFormUrl } from '../lib/applicationPrep'
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

  const gig = await db
    .select()
    .from(gigOpportunities)
    .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gigId)))
    .get()
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
 * Read the form and stage what the artist database can answer.
 *
 * Re-runnable on purpose — a form changes, and the second read has to be an
 * update rather than a second copy of every question beside your answers. What
 * it will never do is overwrite something you wrote: a row whose answer you
 * edited or approved keeps it, and only its label, type and limits are
 * refreshed. That is also why fields that vanish from the form are dropped
 * only when nothing is staged against them.
 */
application.post('/prepare', zValidator('json', PrepareSchema), async (c) => {
  const gigId = gigIdOf(c.req.param('id'))
  if (gigId === null) return c.json({ error: 'A gig id is required.' }, 400)

  const body = c.req.valid('json')
  const db = getDb(c.env.DB)
  const tenant = tenantOf(c)
  const now = new Date().toISOString()

  const gig = await db
    .select()
    .from(gigOpportunities)
    .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gigId)))
    .get()
  if (!gig) return c.json({ error: 'not found' }, 404)

  const url = body.url ?? gig.applicationUrl ?? gig.url
  if (!url || !isReadableFormUrl(url)) {
    return c.json(
      {
        error:
          'No form address for this one. Add the URL of the application form — the listing link is often an announcement rather than the form.',
      },
      400,
    )
  }

  const outcome = await readApplicationForm(url)
  const assets = (await db
    .select()
    .from(artistAssets)
    .where(scoped(artistAssets, tenant))) as ArtistAsset[]
  const live = assets.filter((a) => !a.archived && a.value)

  const existing = (await db
    .select()
    .from(applicationFields)
    .where(scoped(applicationFields, tenant, eq(applicationFields.gigId, gigId)))) as FieldRow[]
  const byKey = new Map(existing.map((r) => [r.fieldKey, r]))

  for (const field of outcome.fields) {
    const options = field.options?.length ? JSON.stringify(field.options) : null
    const prior = byKey.get(field.fieldKey)

    if (!prior) {
      const staged = stageAnswer(field, live)
      await db.insert(applicationFields).values(withTenant(tenant, {
        gigId,
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        options,
        required: field.required ? 1 : 0,
        maxLength: field.maxLength ?? null,
        helpText: field.helpText ?? null,
        position: field.position,
        questionKind: staged.questionKind,
        answer: staged.answer,
        answerAssetId: staged.answerAssetId,
        answerState: staged.answerState,
        createdAt: now,
        updatedAt: now,
      }))
      continue
    }

    const shape = {
      label: field.label,
      fieldType: field.fieldType,
      options,
      required: field.required ? 1 : 0,
      maxLength: field.maxLength ?? null,
      helpText: field.helpText ?? null,
      position: field.position,
      updatedAt: now,
    }

    // Your text is never replaced by a re-read. Only an answer nobody has
    // looked at is re-staged, because the artist database may have gained a
    // better one since.
    const state = normaliseAnswerState(prior.answerState)
    const restage = state === 'empty' || state === 'suggested'
    const staged = restage ? stageAnswer(field, live) : null

    await db
      .update(applicationFields)
      .set(
        staged
          ? {
              ...shape,
              questionKind: staged.questionKind,
              answer: staged.answer,
              answerAssetId: staged.answerAssetId,
              answerState: staged.answerState,
            }
          : shape,
      )
      .where(scoped(applicationFields, tenant, eq(applicationFields.id, prior.id)))
  }

  // Gone from the form, and nothing staged against it: a question that is no
  // longer asked. One you answered is kept — deleting your writing because
  // somebody edited their form is not a trade worth making.
  const seen = new Set(outcome.fields.map((f) => f.fieldKey))
  const stale = existing.filter((r) => !seen.has(r.fieldKey) && !r.answer).map((r) => r.id)
  if (outcome.status === 'ready' && stale.length > 0) {
    await db
      .delete(applicationFields)
      .where(scoped(applicationFields, tenant, inArray(applicationFields.id, stale)))
  }

  const updates: Record<string, unknown> = {
    applicationUrl: outcome.url,
    prepStatus: outcome.status,
    prepNote: outcome.note,
    prepCheckedAt: now,
    updatedAt: now,
  }

  // Staging answers *is* starting the application, which is the entire meaning
  // of `preparing`. Only from `shortlisted`, and only when the read produced
  // something: a form nobody could open has not been started. Every other
  // status is left alone — a submitted application does not go backwards
  // because you re-read the form to check what you sent.
  if (outcome.status === 'ready' && normaliseGigStatus(gig.status) === 'shortlisted') {
    if (isGigTransitionAllowed(gig.status, 'preparing')) updates.status = 'preparing'
  }

  await db
    .update(gigOpportunities)
    .set(updates)
    .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gigId)))

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
