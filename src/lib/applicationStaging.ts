import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../db'
import { applicationFields, artistAssets, gigOpportunities } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import { readGig, gigStatusColumns } from '../db/gigRows'
import { normaliseAnswerState, stageAnswer } from '../../shared/application'
import { normaliseGigStatus, isGigTransitionAllowed } from '../../shared/gigStatus'
import { readApplicationForm, isReadableFormUrl, type PrepOutcome } from './applicationPrep'
import type { ArtistAsset } from '../../shared/artistAssets'
import type { Env } from '../types'

/**
 * Read a gig's application form and stage what the artist database can answer.
 *
 * It was the body of `POST /api/gigs/:id/application/prepare`, and moved here
 * when a second caller appeared: the nightly revisit that goes back to a gig
 * whose window has opened (`src/lib/formRevisit.ts`). Two callers that each
 * carried their own copy would be two answers to "what does reading a form
 * change", and the rules below are the ones that must not differ between them.
 *
 * Re-runnable on purpose — a form changes, and the second read has to be an
 * update rather than a second copy of every question beside your answers. What
 * it will never do is overwrite something you wrote: a row whose answer you
 * edited or approved keeps it, and only its label, type and limits are
 * refreshed. That is also why fields that vanish from the form are dropped
 * only when nothing is staged against them.
 */

export type PrepareResult =
  | { ok: false; reason: 'not_found' | 'no_address' }
  | {
      ok: true
      outcome: PrepOutcome
      /** The stored `prep_status` before this read, as the row held it. */
      previous: { status: string | null; note: string | null }
    }

export interface PrepareOptions {
  /** Where the form is, when it is not the address already on the row. */
  url?: string | null
  /**
   * True when the artist pressed the button, false for the nightly revisit.
   *
   * It decides two things, for one reason. A requested read may move a
   * `shortlisted` gig to `preparing` — staging answers is starting the
   * application, and that is the whole meaning of the state — and it counts as
   * an edit to the gig. A revisit does neither: the artist said yes but did not
   * start, a status changing under them because a form went live overnight is
   * Scout deciding something that is theirs, and touching `updated_at` would
   * wake every snooze in the table, the rule the notes backfill and the
   * reminder reconcile already keep.
   */
  requested: boolean
  /** Injectable so the revisit can be tested without a network. */
  read?: typeof readApplicationForm
  /** ISO datetime to stamp the read with. The clock, unless a test says otherwise. */
  now?: string
}

export async function prepareApplication(
  env: Env,
  tenant: TenantId,
  gigId: number,
  options: PrepareOptions,
): Promise<PrepareResult> {
  const db = getDb(env.DB)
  const now = options.now ?? new Date().toISOString()

  const gig = readGig(
    await db
      .select()
      .from(gigOpportunities)
      .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gigId)))
      .get(),
  )
  if (!gig) return { ok: false, reason: 'not_found' }

  const url = options.url ?? gig.applicationUrl ?? gig.url
  if (!url || !isReadableFormUrl(url)) return { ok: false, reason: 'no_address' }

  const outcome = await (options.read ?? readApplicationForm)(url)
  const assets = (await db
    .select()
    .from(artistAssets)
    .where(scoped(artistAssets, tenant))) as ArtistAsset[]
  const live = assets.filter((a) => !a.archived && a.value)

  const existing = (await db
    .select()
    .from(applicationFields)
    .where(scoped(applicationFields, tenant, eq(applicationFields.gigId, gigId)))) as Array<
    typeof applicationFields.$inferSelect
  >
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

  // Only from `shortlisted`, and only when the read produced something: a form
  // nobody could open has not been started. Every other status is left alone —
  // a submitted application does not go backwards because you re-read the form
  // to check what you sent.
  if (
    options.requested &&
    outcome.status === 'ready' &&
    normaliseGigStatus(gig.status) === 'shortlisted' &&
    isGigTransitionAllowed(gig.status, 'preparing')
  ) {
    Object.assign(updates, gigStatusColumns('preparing'))
  }

  if (!options.requested) delete updates.updatedAt

  await db
    .update(gigOpportunities)
    .set(updates)
    .where(scoped(gigOpportunities, tenant, eq(gigOpportunities.id, gigId)))

  return { ok: true, outcome, previous: { status: gig.prepStatus ?? null, note: gig.prepNote ?? null } }
}
