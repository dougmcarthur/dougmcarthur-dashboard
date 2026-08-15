// Fetches an application form, splits it into fields, drafts an answer for each
// one, and stores the result for review. Runs once the submission window is
// open — see submissionWindow.ts for why waiting is the right call.

import { eq, and, inArray, sql } from 'drizzle-orm'
import { getDb, type DB } from '../db'
import { gigOpportunities, applicationFields, referenceDocs, answerLibrary } from '../db/schema'
import { parseApplicationForm, type ParsedField } from './formParser'
import { buildProfile, draftAnswers, type DraftedAnswer } from './answerEngine'
import type { Env } from '../types'

export type PrepStatus = 'ready' | 'blocked' | 'failed'

export interface PrepResult {
  gigId: number
  status: PrepStatus
  fieldCount: number
  usedLlm: boolean
  /** Fields answered outright from the answer library. */
  libraryHits: number
  /** How many times prep has been attempted for the current window. */
  attempts: number
  formTitle: string | null
  loginRequired: boolean
  error?: string
}

const FETCH_TIMEOUT_MS = 20_000
const USER_AGENT =
  'Mozilla/5.0 (compatible; DougMcArthurDashboard/1.0; +https://dougmcarthur.net)'

async function fetchForm(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`The form returned ${res.status} — it looks gated.`), {
      gated: true,
    })
  }
  if (!res.ok) throw new Error(`Fetching the form returned ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''
  if (!/html|text/i.test(contentType)) {
    throw new Error(`The application link is ${contentType || 'not a web page'} — open it manually.`)
  }

  return res.text()
}

async function markGig(
  db: DB,
  gigId: number,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(gigOpportunities)
    .set({ ...patch, prepUpdatedAt: new Date().toISOString() })
    .where(eq(gigOpportunities.id, gigId))
}

/**
 * Writes drafts without clobbering review work: an existing field keeps the
 * answer Doug typed and its approved flag, and only its draft is refreshed.
 */
async function storeFields(
  db: DB,
  gigId: number,
  fields: ParsedField[],
  drafts: Map<string, DraftedAnswer>,
): Promise<void> {
  const ts = new Date().toISOString()
  const existing = await db
    .select()
    .from(applicationFields)
    .where(eq(applicationFields.gigId, gigId))
  const byKey = new Map(existing.map((f) => [f.fieldKey, f]))

  // Library entries used on this gig for the first time — counted once per gig,
  // so re-running prep doesn't inflate the usage figures.
  const newlyUsed = new Set<number>()

  for (const field of fields) {
    const draft = drafts.get(field.fieldKey)
    const prior = byKey.get(field.fieldKey)

    if (draft?.libraryId && prior?.libraryId !== draft.libraryId) {
      newlyUsed.add(draft.libraryId)
    }

    const values = {
      label: field.label,
      fieldType: field.fieldType,
      options: field.options ? JSON.stringify(field.options) : null,
      required: field.required ? 1 : 0,
      maxLength: field.maxLength ?? null,
      helpText: field.helpText ?? null,
      position: field.position,
      draftAnswer: draft?.answer ?? null,
      answerSource: draft?.source ?? null,
      confidence: draft?.confidence ?? null,
      needsInput: draft?.needsInput ? 1 : 0,
      note: draft?.note ?? null,
      questionKind: draft?.questionKind ?? null,
      libraryId: draft?.libraryId ?? null,
      updatedAt: ts,
    }

    if (prior) {
      await db.update(applicationFields).set(values).where(eq(applicationFields.id, prior.id))
    } else {
      await db.insert(applicationFields).values({
        gigId,
        fieldKey: field.fieldKey,
        ...values,
        answer: null,
        approved: 0,
        createdAt: ts,
      })
    }
  }

  // Drop fields the form no longer has, unless they carry review work.
  const liveKeys = new Set(fields.map((f) => f.fieldKey))
  const stale = existing.filter(
    (f) => !liveKeys.has(f.fieldKey) && !f.answer && f.answerSource !== 'manual',
  )
  if (stale.length > 0) {
    await db.delete(applicationFields).where(
      and(
        eq(applicationFields.gigId, gigId),
        inArray(
          applicationFields.id,
          stale.map((f) => f.id),
        ),
      ),
    )
  }

  if (newlyUsed.size > 0) {
    await db
      .update(answerLibrary)
      .set({ usageCount: sql`usage_count + 1`, lastUsedAt: ts })
      .where(inArray(answerLibrary.id, [...newlyUsed]))
  }
}

export async function prepareApplication(env: Env, gigId: number): Promise<PrepResult> {
  const db = getDb(env.DB)

  const gig = await db
    .select()
    .from(gigOpportunities)
    .where(eq(gigOpportunities.id, gigId))
    .get()

  if (!gig) throw new Error(`Gig ${gigId} not found`)

  const priorAttempts = gig.prepAttempts ?? 0
  const base: Omit<PrepResult, 'status' | 'fieldCount' | 'usedLlm' | 'libraryHits' | 'attempts'> = {
    gigId,
    formTitle: gig.formTitle ?? null,
    loginRequired: Boolean(gig.loginRequired),
  }

  const url = gig.applicationUrl || gig.url
  if (!url) {
    const error = 'No application URL on this gig — add one and prep will run.'
    await markGig(db, gigId, { prepStatus: 'blocked', prepError: error })
    return {
      ...base,
      status: 'blocked',
      fieldCount: 0,
      usedLlm: false,
      libraryHits: 0,
      attempts: priorAttempts,
      error,
    }
  }

  if (gig.loginRequired) {
    const error = 'Marked as login-gated — the form can’t be read automatically.'
    await markGig(db, gigId, { prepStatus: 'blocked', prepError: error })
    return {
      ...base,
      status: 'blocked',
      fieldCount: 0,
      usedLlm: false,
      libraryHits: 0,
      attempts: priorAttempts,
      error,
    }
  }

  let html: string
  try {
    html = await fetchForm(url)
  } catch (err) {
    const gated = typeof err === 'object' && err !== null && 'gated' in err
    const error = err instanceof Error ? err.message : String(err)
    const attempts = priorAttempts + 1
    await markGig(db, gigId, {
      prepStatus: gated ? 'blocked' : 'failed',
      prepError: error,
      prepAttempts: attempts,
      ...(gated ? { loginRequired: 1 } : {}),
    })
    return {
      ...base,
      status: gated ? 'blocked' : 'failed',
      fieldCount: 0,
      usedLlm: false,
      libraryHits: 0,
      attempts,
      loginRequired: gated ? true : base.loginRequired,
      error,
    }
  }

  const form = parseApplicationForm(html, url)

  if (form.blockedReason || form.fields.length === 0) {
    const error = form.blockedReason ?? 'No fields found on the form.'
    await markGig(db, gigId, {
      prepStatus: 'blocked',
      prepError: error,
      formTitle: form.title ?? null,
      prepAttempts: priorAttempts + 1,
      loginRequired: form.loginRequired ? 1 : (gig.loginRequired ?? 0),
    })
    return {
      ...base,
      status: 'blocked',
      fieldCount: 0,
      usedLlm: false,
      libraryHits: 0,
      attempts: priorAttempts + 1,
      formTitle: form.title ?? null,
      loginRequired: form.loginRequired || base.loginRequired,
      error,
    }
  }

  const [docs, library] = await Promise.all([
    db.select().from(referenceDocs),
    db.select().from(answerLibrary),
  ])
  const profile = buildProfile(docs)

  const { answers, usedLlm, libraryHits, llmError } = await draftAnswers(
    env.ANTHROPIC_API_KEY,
    {
      name: gig.name,
      type: gig.type,
      organizer: gig.organizer,
      url,
      deadline: gig.deadline,
      fitRationale: gig.fitRationale ?? gig.fitNotes,
    },
    form.title,
    form.fields,
    profile,
    library,
  )

  await storeFields(
    db,
    gigId,
    form.fields,
    new Map(answers.map((a) => [a.fieldKey, a])),
  )

  await markGig(db, gigId, {
    prepStatus: 'ready',
    prepError: llmError ? `Drafted from the profile only — Claude call failed: ${llmError}` : null,
    formTitle: form.title ?? null,
    prepAttempts: priorAttempts + 1,
    applicationUrl: gig.applicationUrl ?? url,
  })

  return {
    ...base,
    status: 'ready',
    fieldCount: form.fields.length,
    usedLlm,
    libraryHits,
    attempts: priorAttempts + 1,
    formTitle: form.title ?? null,
    error: llmError,
  }
}
