import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db'
import { syncTargets, reminders } from '../db/schema'
import { scoped, withTenant } from '../db/scope'
import { tenantOf, type AppEnv } from '../context'
import { syncNoteColumns } from '../../shared/noteColumns'
import { foldFinding, normaliseWebsite, readSubmissionPolicy, startingTerms, type TermsColumns } from '../../shared/syncTerms'
import { linkSync } from '../lib/catalog'
import { agentWrite } from '../lib/agentWrites'
import { decisionActor, recordSyncDecision } from '../lib/decisionLog'
import { checkTarget } from '../lib/syncTerms'

const sync = new Hono<AppEnv>()

// `nullish` rather than `optional` because that is what the forms send: both
// build their body with `field || null`, so a blank field arrives as null, and
// a schema that only allowed "absent" answered 400 to saving any target with
// a field left empty.
const SyncFields = z.object({
  name: z.string().min(1),
  agencyType: z.string().nullish(),
  contactEmail: z.string().email().nullish().or(z.literal('')),
  contactRole: z.string().nullish(),
  confirmationMethod: z.string().nullish(),
  notes: z.string().nullish(),
  pitchDraft: z.string().nullish(),
  status: z.string().nullish(),
  // Their own site, which the terms check reads. Validated in the handler, not
  // here, so the answer can say what was wrong with it.
  website: z.string().max(2048).nullish(),
})

const SyncInsertSchema = SyncFields.extend({
  // What the writer found out about their rules. `open` has to come with the
  // sentence that says so; `startingTerms` is where that is enforced.
  submissionPolicy: z.enum(['open', 'closed', 'unknown']).optional(),
  policyQuote: z.string().max(500).optional(),
  policyUrl: z.string().max(2048).optional(),
})

// The policy columns are deliberately not patchable. A person can say "pitch
// anyway" and can correct the address the check reads; what the sites say is
// written by the check, and a free-text edit of it is how a refusal gets
// quietly erased.
const SyncPatchSchema = SyncFields.partial().extend({
  overrideTerms: z.boolean().optional(),
})

/**
 * Read the target's site after the response, so filing never waits on somebody
 * else's web server. Nothing runs without an execution context, which is every
 * request in a unit test and no request in production.
 */
function checkAfterResponse(c: Context<AppEnv>, id: number): void {
  let ctx: Context<AppEnv>['executionCtx']
  try {
    ctx = c.executionCtx
  } catch {
    return
  }
  const tenant = tenantOf(c)
  ctx.waitUntil(
    checkTarget(c.env, tenant, id, { announce: true }).catch((err) => console.error('terms check failed:', err)),
  )
}

sync.get('/', async (c) => {
  const db = getDb(c.env.DB)
  const status = c.req.query('status')
  const agencyType = c.req.query('agencyType')

  const conditions = []
  if (status) conditions.push(eq(syncTargets.status, status))
  if (agencyType) conditions.push(eq(syncTargets.agencyType, agencyType))

  // One branch rather than two. The unfiltered case used to skip `.where()`
  // entirely, which is exactly the shape that quietly returns everybody's rows
  // once a tenant exists — `scoped` makes the filter unconditional and the
  // optional conditions the variable part.
  const rows = await db
    .select()
    .from(syncTargets)
    .where(scoped(syncTargets, tenantOf(c), ...conditions))
    .orderBy(desc(syncTargets.discoveredAt))

  return c.json(rows)
})

sync.post('/', agentWrite('sync'), zValidator('json', SyncInsertSchema), async (c) => {
  const db = getDb(c.env.DB)
  const b = c.req.valid('json')
  const ts = new Date().toISOString()

  const website = b.website ? normaliseWebsite(b.website) : null
  if (b.website && !website) return c.json({ error: 'The website is not a web address.' }, 400)

  const terms = startingTerms(b, b.notes, ts)
  if (!terms.ok) return c.json({ error: terms.error }, 400)

  const result = await db.insert(syncTargets).values(withTenant(tenantOf(c), {
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
    website,
    ...terms.columns,
    discoveredAt: ts,
    updatedAt: ts,
  })).returning({ id: syncTargets.id })

  // Organisations go into the shared catalog; a person does not. See
  // src/lib/catalog.ts.
  await linkSync(c.env, tenantOf(c), { id: result[0].id, name: b.name, agencyType: b.agencyType }, ts, c.get('actor').kind === 'agent')

  // Whatever the writer said about their rules, the Worker reads the site
  // itself: an agent that did not look is how a refusal got filed as a pitch.
  checkAfterResponse(c, result[0].id)

  return c.json({ id: result[0].id }, 201)
})

sync.get('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const row = await db
    .select()
    .from(syncTargets)
    .where(scoped(syncTargets, tenantOf(c), eq(syncTargets.id, Number(c.req.param('id')))))
    .get()

  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

/**
 * Read this target's site now, for the button. The nightly pass does the same
 * for everything nobody has read, and neither needs a passkey touch: it
 * changes nothing about who can get in, and the worst it can do is report what
 * the site says.
 */
sync.post('/:id/check-terms', async (c) => {
  const result = await checkTarget(c.env, tenantOf(c), Number(c.req.param('id')))
  if (!result) return c.json({ error: 'not found' }, 404)
  return c.json(result.row)
})

sync.patch('/:id', zValidator('json', SyncPatchSchema), async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  const { overrideTerms, website, ...fields } = c.req.valid('json')

  const tenant = tenantOf(c)
  const existing = await db.select().from(syncTargets).where(scoped(syncTargets, tenant, eq(syncTargets.id, id))).get()
  if (!existing) return c.json({ error: 'not found' }, 404)

  const ts = new Date().toISOString()
  const set: Partial<typeof syncTargets.$inferInsert> = { ...fields, updatedAt: ts }
  // A blank field clears it. A status is not a field a person blanks: a null
  // would leave a row in no state at all, so it means "unchanged".
  if (set.status == null) delete set.status

  let siteChanged = false
  if (website !== undefined) {
    const next = website ? normaliseWebsite(website) : null
    if (website && !next) return c.json({ error: 'The website is not a web address.' }, 400)
    set.website = next
    siteChanged = next !== existing.website
  }

  // Pitch anyway, or take that back. Its own column, so a re-check never undoes it.
  if (overrideTerms !== undefined) set.policyOverriddenAt = overrideTerms ? ts : null

  // A note that now says they refuse pitches closes the target, the same as a
  // note written that way on the way in. Only toward caution, and only by
  // adding: it never clears a policy.
  if (fields.notes) {
    const refusal = readSubmissionPolicy(fields.notes, { only: 'closed' })
    if (refusal && existing.submissionPolicy !== 'closed') {
      const current: TermsColumns = {
        submissionPolicy: existing.submissionPolicy,
        policyEvidence: existing.policyEvidence,
        policyUrl: existing.policyUrl,
        policyCheckedAt: existing.policyCheckedAt,
        policyOverriddenAt: existing.policyOverriddenAt,
      }
      const folded = foldFinding(current, { policy: 'closed', quote: refusal.quote, url: null, note: '' }, ts)
      set.submissionPolicy = folded.submissionPolicy
      set.policyEvidence = folded.policyEvidence
      set.policyUrl = folded.policyUrl
      set.policyCheckedAt = folded.policyCheckedAt
    }
  }

  await db.update(syncTargets).set(set).where(scoped(syncTargets, tenant, eq(syncTargets.id, id)))

  // Logged against the row as it was, and only for the status that was actually
  // written: a blank status means "unchanged", so it is not a move.
  if (set.status != null && set.status !== existing.status) {
    await recordSyncDecision(c.env, tenant, existing, {
      action: 'move',
      from: existing.status,
      to: set.status,
      via: 'sync_patch',
      actor: decisionActor(c.get('actor')),
      at: ts,
    })
  }

  const row = await db.select().from(syncTargets).where(scoped(syncTargets, tenant, eq(syncTargets.id, id))).get()
  if (!row) return c.json({ error: 'not found' }, 404)

  // A new address is a new place to read.
  if (siteChanged && row.website) checkAfterResponse(c, id)
  return c.json(row)
})

sync.delete('/:id', async (c) => {
  const db = getDb(c.env.DB)
  const id = Number(c.req.param('id'))
  // Same orphaning as gigs: reminders point at (entity_type, entity_id) with
  // no foreign key to enforce it, so the reminder has to go with the row.
  const tenant = tenantOf(c)
  await db
    .delete(reminders)
    .where(scoped(reminders, tenant, eq(reminders.entityType, 'sync'), eq(reminders.entityId, id)))
  await db.delete(syncTargets).where(scoped(syncTargets, tenant, eq(syncTargets.id, id)))
  return c.json({ ok: true })
})

export default sync
