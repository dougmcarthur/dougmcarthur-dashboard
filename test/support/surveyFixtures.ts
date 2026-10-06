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

