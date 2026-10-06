import { cardVector, type Respondent } from '../../shared/surveyAnalysis'
import { buildPlan } from '../../shared/surveyDesign'
import { FACTORS } from '../../shared/surveyInstrument'
import { seeded, type Rng } from '../../shared/surveyRandom'
import type { AnswerMap } from '../../shared/surveyAnswers'

/**
 * Simulated survey respondents who choose according to preferences written
 * down here, so that the analysis can be tested against answers known in
 * advance. Shared by the analysis tests and the owner-route tests.
 */

// Thirteen utilities for the ranking, summing to zero as the model requires.
export const RANK_TRUTH = [1.2, 0.9, -0.6, 0.4, -0.3, 0.8, 0.5, 0.2, -0.1, -0.4, -0.7, -0.9, -1.0]
// The paired-choice model, in the order of CHOICE_FEATURES. Pay is per $1,000.
// An entry-fee dollar counts for 1.5 dollars of pay, a travel dollar for 1.
export const CHOICE_TRUTH = [1.0, -0.15, -0.1, 0.3, 0.8, 1.2, 0.4, 0.9, -0.2, -0.6, 0.5]

export function draw(utilities: number[], rng: Rng): number {
  const top = Math.max(...utilities)
  const e = utilities.map((u) => Math.exp(u - top))
  const total = e.reduce((s, v) => s + v, 0)
  let r = rng() * total
  for (let j = 0; j < e.length; j++) {
    r -= e[j]
    if (r <= 0) return j
  }
  return e.length - 1
}

/** A completed respondent whose answers are drawn from the preferences above. */
export function simulate(seed: number, opts: { failCheck?: boolean; seconds?: number } = {}): Respondent {
  const rng = seeded(seed * 31 + 7)
  const plan = buildPlan(seed)
  const answers: AnswerMap = { S1: { value: 'S1.artist' } }
  const util = (id: string) => RANK_TRUTH[FACTORS.findIndex((f) => f.id === id)]

  for (const t of plan.rank) {
    const best = draw(t.items.map(util), rng)
    const rest = t.items.map((_, i) => i).filter((i) => i !== best)
    const worst = rest[draw(rest.map((i) => -util(t.items[i])), rng)]
    answers[t.id] = { best: t.items[best], worst: t.items[worst] }
  }
  const none = new Array<number>(CHOICE_TRUTH.length).fill(0)
  none[CHOICE_TRUTH.length - 1] = 1
  for (const t of plan.choice) {
    if (t.check) {
      const better = t.dominant!
      answers[t.id] = { choice: opts.failCheck ? (better === 'a' ? 'b' : 'a') : better }
      continue
    }
    const u = [cardVector(t.a), cardVector(t.b), none].map((x) => x.reduce((s, v, k) => s + v * CHOICE_TRUTH[k], 0))
    answers[t.id] = { choice: (['a', 'b', 'none'] as const)[draw(u, rng)] }
  }
  answers.A1 = { value: seed % 3 === 0 ? 'A1.mb' : seed % 3 === 1 ? 'A1.on' : 'A1.bc' }
  answers.E5 = seed % 4 === 0 ? { text: `Note ${seed}, with a comma` } : { skipped: true }

  return {
    id: `r${seed}`,
    status: 'complete',
    source: seed % 2 ? 'newsletter' : 'social',
    device: 'computer',
    instrument: plan.v,
    plan,
    answers,
    seconds: { S1: opts.seconds ?? 600 },
    createdAt: '2026-10-05T00:00:00.000Z',
    completedAt: '2026-10-05T00:10:00.000Z',
  }
}


/**
 * The survey's switches as the owner's screen stores them. The survey is
 * configured in `app_settings`, never in the environment, so a test that wants
 * it open writes the rows the admin route would write.
 */
export interface StoredSurveySettings {
  open?: boolean
  contact?: string
  siteKey?: string
}

export function storeSurveySettings(
  db: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } },
  settings: StoredSurveySettings,
  at = '2026-01-01T00:00:00.000Z',
) {
  const put = db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  )
  if (settings.open !== undefined) put.run('survey.open', String(settings.open), at)
  if (settings.contact !== undefined) put.run('survey.contactEmail', settings.contact, at)
  if (settings.siteKey !== undefined) put.run('survey.turnstileSiteKey', settings.siteKey, at)
}

// ── A respondent who answers everything, for the public results ───────────────

/** What simulated artists say stopped them: the odds behind B4, so a test can say what a page should find. */
export const B4_TRUTH: Record<string, number> = {
  pay: 30, fit: 12, travel: 11, dates: 11, late: 9, effort: 6, time: 5, audience: 4, fee: 3, odds: 3, industry: 2, repute: 2, treat: 1, goals: 1,
}

function pickWeighted(weights: Record<string, number>, rng: Rng): string {
  const entries = Object.entries(weights)
  let r = rng() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [key, w] of entries) {
    r -= w
    if (r <= 0) return key
  }
  return entries[entries.length - 1][0]
}

/**
 * `simulate`, plus every question the public page describes or counts, and the
 * ones it must never repeat: age, community, income and a free-text answer
 * carrying a marker a test can look for. Separate from `simulate` so the tests
 * that count A1 and E5 are not disturbed.
 */
export function simulateFull(seed: number, opts: { failCheck?: boolean; seconds?: number } = {}): Respondent {
  const base = simulate(seed, opts)
  const rng = seeded(seed * 17 + 3)
  const A = (q: string, weights: Record<string, number>) => ({ value: `${q}.${pickWeighted(weights, rng)}` })

  const find: string[] = []
  for (const [key, w] of Object.entries({ peers: 70, assoc: 55, social: 45, search: 30, invited: 20, helper: 12, app: 6 })) {
    if (rng() * 100 < w) find.push(`B3.${key}`)
  }

  const answers: AnswerMap = {
    ...base.answers,
    A2: A('A2', { lt2: 5, '2to5': 20, '6to10': 30, '11to20': 30, gt20: 15 }),
    A3: A('A3', { solo: 40, duo: 15, group: 35, varies: 10 }),
    A5: A('A5', { main: 25, major: 30, side: 35, hobby: 10 }),
    B3: { value: find.length ? find : ['B3.nolook'] },
    B4: A('B4', B4_TRUTH),
    B5: A('B5', { pay: 20, fit: 22, audience: 10, industry: 12, goals: 14, recommended: 12, odds: 5, treat: 5 }),
    E1: A('E1', { '25to34': 25, '35to44': 30, '45to54': 25, '55to64': 15, '65p': 5 }),
    E3: { value: [seed % 5 === 0 ? 'E3.indigenous' : seed % 7 === 0 ? 'E3.newcomer' : 'E3.none'] },
    E4: A('E4', { lt2500: 20, '2500to9999': 30, '10kto24999': 30, '25kto49999': 15, '50kp': 5 }),
    E5: { text: `PRIVATE-NOTE-${seed}` },
  }
  return { ...base, answers }
}
