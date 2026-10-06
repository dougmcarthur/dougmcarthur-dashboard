/**
 * The artist survey's public routes. Public — under `PUBLIC_API_PREFIXES` — so
 * each is written as if the whole internet is calling it, because it is. The
 * questionnaire and the reasoning behind every rule here are in
 * docs/artist-survey-questionnaire.md.
 *
 * Four properties the notice a respondent reads depends on, each pinned by
 * `test/surveyRoutes.test.ts`:
 *
 * - **No address is read, stored or hashed.** Nothing in this file touches
 *   `CF-Connecting-IP` or any other header that names a visitor, and the
 *   Turnstile check does not forward one. The rate limits are global instead of
 *   per sender, because a per-sender limit needs something that recognises the
 *   sender.
 * - **The response id never appears in a path.** It is the only credential for
 *   its response, and the request logger prints paths. It travels in the body.
 * - **The browser is trusted with nothing.** The server builds the plan, checks
 *   every answer against it (`checkAnswer`), and stores what was shown beside
 *   what was answered.
 * - **It is closed until it can say who to ask.** The notice promises a contact
 *   address, so no response starts without one.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { count, eq, gte } from 'drizzle-orm'
import { getDb } from '../db'
import { surveyResponses, type SurveyResponseRow } from '../db/schema'
import type { RootEnv } from '../context'
import type { Env } from '../types'
import { buildPlan, type Plan } from '../../shared/surveyDesign'
import { checkAnswer, isScreenedOut, type AnswerMap } from '../../shared/surveyAnswers'
import { INSTRUMENT_VERSION } from '../../shared/surveyInstrument'
import { verifyTurnstile } from '../lib/turnstile'
import { readSurveyConfig } from '../lib/surveySettings'

export const SURVEY_LIMITS = {
  /** New responses an hour, across everybody. Past this the survey asks people to come back. */
  startsPerHour: 600,
  /** Responses in all. A stuck loop or a flood cannot fill the database. */
  total: 20_000,
  /** Writes to one response. A person answers ~50 screens; this is a ceiling for a script. */
  savesPerResponse: 300,
  /** Request bodies. The largest honest one is a 500-character answer. */
  bodyBytes: 8_192,
}

const survey = new Hono<RootEnv>()

// ── Configuration ─────────────────────────────────────────────────────────────
//
// Read from `app_settings` on every call (src/lib/surveySettings.ts), so the
// owner's switch takes effect on the next request rather than the next deploy.

const configFor = (c: { env: Env; req: { url: string } }) =>
  readSurveyConfig(c.env, new URL(c.req.url).origin)

survey.get('/survey/status', async (c) => {
  const cfg = await configFor(c)
  c.header('Cache-Control', 'no-store')
  return c.json({
    open: cfg.open,
    contact: cfg.contact,
    resultsUrl: cfg.resultsUrl,
    siteKey: cfg.botCheck ? cfg.siteKey : null,
    instrument: INSTRUMENT_VERSION,
  })
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

const ID = z.string().regex(/^[0-9a-f]{32}$/)

function parse<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as T) : fallback
  } catch {
    return fallback
  }
}

async function loadRow(env: Env, id: string): Promise<SurveyResponseRow | undefined> {
  return getDb(env.DB).select().from(surveyResponses).where(eq(surveyResponses.id, id)).get()
}

const tooBig = (c: { req: { header: (n: string) => string | undefined } }) =>
  Number(c.req.header('content-length') ?? 0) > SURVEY_LIMITS.bodyBytes

// ── Start ─────────────────────────────────────────────────────────────────────

const StartSchema = z.object({
  /** The channel the link came from, `?src=manitoba-music-newsletter`. Never a person. */
  source: z.string().max(40).regex(/^[a-zA-Z0-9._-]*$/).optional(),
  device: z.enum(['phone', 'computer']).optional(),
  language: z.literal('en').optional(),
  /** Turnstile's token, when the page has one. */
  token: z.string().max(2048).optional(),
  /** A field a person never sees. Anything in it is a form-filling bot. */
  website: z.string().max(200).optional(),
})

survey.post('/survey/start', zValidator('json', StartSchema), async (c) => {
  if (tooBig(c)) return c.json({ error: 'That request is too large.' }, 413)
  const body = c.req.valid('json')
  const cfg = await configFor(c)

  // A bot gets the same shape of answer as a person and a plan that goes
  // nowhere, so it learns nothing to adapt to. Nothing is stored.
  if (body.website) return c.json({ id: randomHex(16), plan: buildPlan(randomSeed()) })

  if (!cfg.open) return c.json({ error: 'This survey is not open right now.', closed: true }, 403)

  if (cfg.botCheck) {
    const verdict = await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY!, body.token)
    if (verdict === 'failed') return c.json({ error: 'The spam check did not pass. Please reload the page and try again.' }, 400)
  }

  const db = getDb(c.env.DB)
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const [recent, all] = await Promise.all([
    db.select({ n: count() }).from(surveyResponses).where(gte(surveyResponses.createdAt, hourAgo)).get(),
    db.select({ n: count() }).from(surveyResponses).get(),
  ])
  if ((recent?.n ?? 0) >= SURVEY_LIMITS.startsPerHour) {
    return c.json({ error: 'A lot of people are taking the survey right now. Please try again in a little while.' }, 429)
  }
  if ((all?.n ?? 0) >= SURVEY_LIMITS.total) {
    return c.json({ error: 'This survey has reached its limit and is now closed. Thank you.' }, 429)
  }

  const plan = buildPlan(randomSeed())
  const id = randomHex(16)
  await db.insert(surveyResponses).values({
    id,
    instrument: INSTRUMENT_VERSION,
    language: 'en',
    source: body.source || null,
    device: body.device ?? null,
    plan: JSON.stringify(plan),
    answers: '{}',
    seconds: '{}',
    status: 'in_progress',
    saves: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    completedAt: null,
  })

  c.header('Cache-Control', 'no-store')
  return c.json({ id, plan })
})

// ── Everything after the start carries the id in the body ─────────────────────

const IdSchema = z.object({ id: ID })

/** Where a returning respondent left off. */
survey.post('/survey/resume', zValidator('json', IdSchema), async (c) => {
  const row = await loadRow(c.env, c.req.valid('json').id)
  if (!row) return c.json({ error: 'not found' }, 404)
  c.header('Cache-Control', 'no-store')
  return c.json({
    status: row.status,
    plan: parse<Plan>(row.plan, {} as Plan),
    answers: parse<AnswerMap>(row.answers, {}),
  })
})

const AnswerSchema = z.object({
  id: ID,
  screen: z.string().min(1).max(16),
  answer: z.unknown(),
  /** Seconds on the screen, as measured by the page. Used to spot speeding, never to remove anybody. */
  seconds: z.number().min(0).max(3600).optional(),
})

survey.post('/survey/answer', zValidator('json', AnswerSchema), async (c) => {
  if (tooBig(c)) return c.json({ error: 'That request is too large.' }, 413)
  const body = c.req.valid('json')
  const row = await loadRow(c.env, body.id)
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.status === 'complete') return c.json({ error: 'This survey is already finished.' }, 409)
  if (row.saves >= SURVEY_LIMITS.savesPerResponse) return c.json({ error: 'Too many changes to one response.' }, 429)

  const plan = parse<Plan>(row.plan, {} as Plan)
  const checked = checkAnswer(plan, body.screen, body.answer)
  if (!checked.ok) return c.json({ error: checked.error }, 400)

  const answers = parse<AnswerMap>(row.answers, {})
  const seconds = parse<Record<string, number>>(row.seconds, {})
  answers[body.screen] = checked.answer
  if (body.seconds !== undefined) seconds[body.screen] = Math.round(body.seconds)

  // Whoever is not the artist is thanked and stopped, and what they said is
  // kept as the one answer that explains why the response is so short.
  const screenedOut = isScreenedOut(answers)
  const now = new Date().toISOString()
  await getDb(c.env.DB)
    .update(surveyResponses)
    .set({
      answers: JSON.stringify(answers),
      seconds: JSON.stringify(seconds),
      status: screenedOut ? 'screened_out' : row.status,
      saves: row.saves + 1,
      updatedAt: now,
      completedAt: screenedOut ? now : row.completedAt,
    })
    .where(eq(surveyResponses.id, body.id))

  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true, status: screenedOut ? 'screened_out' : row.status })
})

/** The respondent reached the end. Only a response that got to the last question can be finished. */
survey.post('/survey/complete', zValidator('json', IdSchema), async (c) => {
  const row = await loadRow(c.env, c.req.valid('json').id)
  if (!row) return c.json({ error: 'not found' }, 404)
  if (row.status === 'complete') return c.json({ ok: true, status: 'complete' })
  if (row.status === 'screened_out') return c.json({ error: 'This survey is already finished.' }, 409)

  const answers = parse<AnswerMap>(row.answers, {})
  if (!('E5' in answers)) return c.json({ error: 'There are questions still to answer.' }, 409)

  const now = new Date().toISOString()
  await getDb(c.env.DB)
    .update(surveyResponses)
    .set({ status: 'complete', updatedAt: now, completedAt: now })
    .where(eq(surveyResponses.id, row.id))
  c.header('Cache-Control', 'no-store')
  return c.json({ ok: true, status: 'complete' })
})

/**
 * Close without saving: the notice's promise that stopping lets you take it
 * back. Only before the end — a finished response cannot be found again by
 * anyone but the browser that holds the id, and the notice says it cannot be
 * taken back after that.
 */
survey.post('/survey/discard', zValidator('json', IdSchema), async (c) => {
  const row = await loadRow(c.env, c.req.valid('json').id)
  if (!row) return c.json({ ok: true }) // gone already, which is what was asked
  if (row.status === 'complete') return c.json({ error: 'A finished survey cannot be taken back.' }, 409)
  await getDb(c.env.DB).delete(surveyResponses).where(eq(surveyResponses.id, row.id))
  return c.json({ ok: true })
})

export default survey
