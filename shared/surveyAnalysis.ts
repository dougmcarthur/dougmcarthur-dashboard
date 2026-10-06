/**
 * From stored responses to results. The method is written down in section 6 of
 * docs/artist-survey-questionnaire.md before there was any data; this is that
 * section as code, and `test/surveyAnalysis.test.ts` checks it by simulating
 * respondents with known preferences and seeing whether it recovers them.
 *
 * Four things it deliberately does, because each is how a survey result goes
 * wrong without anybody noticing:
 *
 * - **Describes who answered before anything else**, and says plainly that the
 *   sample is whoever the link reached.
 * - **Never reports a group of fewer than ten.** A small group is merged with
 *   the other small ones, and if even that is under ten it is hidden. The raw
 *   export is the owner's and is not suppressed; the summary is the thing that
 *   gets read aloud, screenshotted and published.
 * - **Gives every estimate an error bar**, and declines to turn a result into
 *   dollars when the pay effect it would be measured against is not
 *   distinguishable from zero. A dollar value that is a ratio to nothing is the
 *   most confident-looking wrong number a survey can produce.
 * - **Flags rather than removes.** Speeding and a failed attention check are
 *   counted and can be excluded, and both numbers are reported, but nobody is
 *   dropped silently.
 */

import { attentionFailed, isSkipped, type AnswerMap } from './surveyAnswers'
import type { Plan } from './surveyDesign'
import { fitLogit, type ChoiceSet, type LogitFit } from './surveyLogit'
import { ATTRIBUTES, FACTORS, QUESTIONS, questionOf, tx, type ChoiceQuestion } from './surveyInstrument'
import { seeded } from './surveyRandom'

/** Fewer than this in a group and it is not reported. */
export const MIN_GROUP = 10
/** The completed responses the paired-choice design needs for an overall result. */
export const TARGET_COMPLETES = 125

// ── Respondents ───────────────────────────────────────────────────────────────

export interface Respondent {
  id: string
  status: string
  source: string | null
  device: string | null
  instrument: string
  plan: Plan
  answers: AnswerMap
  seconds: Record<string, number>
  createdAt: string
  completedAt: string | null
}

export interface StoredRow {
  id: string
  instrument: string
  source: string | null
  device: string | null
  plan: string
  answers: string
  seconds: string
  status: string
  createdAt: string
  completedAt: string | null
}

function json<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw)
    return v && typeof v === 'object' ? (v as T) : fallback
  } catch {
    return fallback
  }
}

/** A stored row as a respondent, or null when its plan cannot be read: without it nothing it says can be interpreted. */
export function toRespondent(row: StoredRow): Respondent | null {
  const plan = json<Plan | null>(row.plan, null)
  if (!plan || !Array.isArray(plan.screens)) return null
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    device: row.device,
    instrument: row.instrument,
    plan,
    answers: json<AnswerMap>(row.answers, {}),
    seconds: json<Record<string, number>>(row.seconds, {}),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }
}

export const completes = (rs: Respondent[]) => rs.filter((r) => r.status === 'complete')

export function totalSeconds(r: Respondent): number {
  return Object.values(r.seconds).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Respondents who took under a third of the median time. Flagged, never removed. */
export function speeders(rs: Respondent[]): Set<string> {
  const done = completes(rs)
  const m = median(done.map(totalSeconds))
  if (m === null) return new Set()
  return new Set(done.filter((r) => totalSeconds(r) < m / 3).map((r) => r.id))
}

export interface Exclusions {
  /** Leave out anybody who failed the attention check. */
  failedCheck?: boolean
  /** Leave out the speeders. */
  speeders?: boolean
}

export function applyExclusions(rs: Respondent[], ex: Exclusions): Respondent[] {
  const fast = ex.speeders ? speeders(rs) : new Set<string>()
  return rs.filter((r) => !(ex.failedCheck && attentionFailed(r.plan, r.answers) === true) && !fast.has(r.id))
}

// ── The ranking ───────────────────────────────────────────────────────────────

const K = FACTORS.length
const FACTOR_INDEX = new Map(FACTORS.map((f, i) => [f.id, i]))

/** Effects coding: the last factor is minus the sum of the others, so the thirteen utilities sum to zero. */
function itemVector(i: number): number[] {
  const v = new Array<number>(K - 1).fill(0)
  if (i < K - 1) v[i] = 1
  else v.fill(-1)
  return v
}

/** Each answered ranking screen is two choices: the best of four, then the worst of the other three. */
export function rankSets(rs: Respondent[]): ChoiceSet[] {
  const out: ChoiceSet[] = []
  for (const r of rs) {
    for (const task of r.plan.rank ?? []) {
      const a = r.answers[task.id]
      if (!a || !('best' in a)) continue
      const idx = task.items.map((id) => FACTOR_INDEX.get(id))
      if (idx.some((i) => i === undefined)) continue
      const bestPos = task.items.indexOf(a.best)
      const worstPos = task.items.indexOf(a.worst)
      if (bestPos < 0 || worstPos < 0 || bestPos === worstPos) continue
      out.push({ x: idx.map((i) => itemVector(i!)), chosen: bestPos })
      const rest = task.items.map((_, p) => p).filter((p) => p !== bestPos)
      out.push({ x: rest.map((p) => itemVector(idx[p]!).map((v) => -v)), chosen: rest.indexOf(worstPos) })
    }
  }
  return out
}

export interface RankingRow {
  id: string
  text: string
  shown: number
  best: number
  worst: number
  /** Best minus worst, over times shown: -1 to 1, and the plain-counting answer. */
  score: number
  /** From the model: the factor's utility, and its share of preference across all thirteen. */
  utility: number
  se: number
  share: number
}

export interface RankingResult {
  respondents: number
  screens: number
  rows: RankingRow[]
  converged: boolean
}

export function analyseRanking(rs: Respondent[]): RankingResult | null {
  const sets = rankSets(rs)
  if (sets.length === 0) return null

  const counts = FACTORS.map(() => ({ shown: 0, best: 0, worst: 0 }))
  const who = new Set<string>()
  let screens = 0
  for (const r of rs) {
    for (const task of r.plan.rank ?? []) {
      const a = r.answers[task.id]
      if (!a || !('best' in a)) continue
      who.add(r.id)
      screens++
      for (const id of task.items) {
        const i = FACTOR_INDEX.get(id)
        if (i !== undefined) counts[i].shown++
      }
      const b = FACTOR_INDEX.get(a.best)
      const w = FACTOR_INDEX.get(a.worst)
      if (b !== undefined) counts[b].best++
      if (w !== undefined) counts[w].worst++
    }
  }

  const fit = fitLogit(sets, K - 1)
  const utilities = FACTORS.map((_, i) => itemVector(i).reduce((s, v, k) => s + v * fit.theta[k], 0))
  const ses = FACTORS.map((_, i) => {
    const x = itemVector(i)
    let v = 0
    for (let a = 0; a < K - 1; a++) for (let b = 0; b < K - 1; b++) v += x[a] * fit.cov[a][b] * x[b]
    return Math.sqrt(Math.max(v, 0))
  })
  const expSum = utilities.reduce((s, u) => s + Math.exp(u), 0)

  return {
    respondents: who.size,
    screens,
    converged: fit.converged,
    rows: FACTORS.map((f, i) => ({
      id: f.id,
      text: tx(f.text),
      shown: counts[i].shown,
      best: counts[i].best,
      worst: counts[i].worst,
      score: counts[i].shown ? (counts[i].best - counts[i].worst) / counts[i].shown : 0,
      utility: utilities[i],
      se: ses[i],
      share: Math.exp(utilities[i]) / expSum,
    })),
  }
}

// ── The paired choices ────────────────────────────────────────────────────────

/** In the order of the columns of the design matrix. Dollars for the first three, the rest are levels against the first. */
export const CHOICE_FEATURES = [
  'pay (per $1,000)',
  'cost to apply (per $100)',
  'out-of-pocket cost (per $100)',
  'audience 500 vs 100',
  'audience 2,000 vs 100',
  'audience 10,000 vs 100',
  'some industry vs few',
  'many industry vs few',
  'application 1 hour vs 15 minutes',
  'application 3 hours vs 15 minutes',
  'Neither',
] as const
const P = CHOICE_FEATURES.length
const NEITHER = P - 1

/** The feature vector of one card, from its level indices in ATTRIBUTES order. */
export function cardVector(card: number[]): number[] {
  const f = new Array<number>(P).fill(0)
  f[0] = (ATTRIBUTES[0].levels[card[0]].dollars ?? 0) / 1000
  f[1] = (ATTRIBUTES[1].levels[card[1]].dollars ?? 0) / 100
  f[2] = (ATTRIBUTES[2].levels[card[2]].dollars ?? 0) / 100
  if (card[3] > 0) f[2 + card[3]] = 1
  if (card[4] > 0) f[5 + card[4]] = 1
  if (card[5] > 0) f[7 + card[5]] = 1
  return f
}

/** One choice of three per answered paired screen: A, B or Neither. The planted check is not part of the design and is left out. */
export function choiceSets(rs: Respondent[]): ChoiceSet[] {
  const none = new Array<number>(P).fill(0)
  none[NEITHER] = 1
  const out: ChoiceSet[] = []
  for (const r of rs) {
    for (const task of r.plan.choice ?? []) {
      if (task.check) continue
      const a = r.answers[task.id]
      if (!a || !('choice' in a)) continue
      out.push({ x: [cardVector(task.a), cardVector(task.b), none], chosen: a.choice === 'a' ? 0 : a.choice === 'b' ? 1 : 2 })
    }
  }
  return out
}

export interface Estimate {
  key: string
  label: string
  value: number
  se: number
  lo: number
  hi: number
}

export interface ChoiceResult {
  respondents: number
  tasks: number
  /** Share of screens answered Neither. */
  neither: number
  coefficients: { name: string; theta: number; se: number }[]
  /** False when the effect of pay cannot be told from zero, so nothing is turned into dollars. */
  reliable: boolean
  /** What each thing is worth, in dollars of pay. Empty unless `reliable`. */
  values: Estimate[]
  /** How many dollars of pay one dollar of cost counts for. About 1 means a dollar is a dollar. */
  costRatios: Estimate[]
  converged: boolean
}

/** Delta-method estimate of scale · theta[k] / theta[0], with its standard error. */
function ratio(fit: LogitFit, k: number, scale: number): { value: number; se: number } {
  const num = fit.theta[k]
  const den = fit.theta[0]
  const g = new Array<number>(fit.theta.length).fill(0)
  g[k] = scale / den
  g[0] = (-scale * num) / (den * den)
  let v = 0
  for (let a = 0; a < g.length; a++) for (let b = 0; b < g.length; b++) v += g[a] * fit.cov[a][b] * g[b]
  return { value: (scale * num) / den, se: Math.sqrt(Math.max(v, 0)) }
}

const estimate = (key: string, label: string, r: { value: number; se: number }): Estimate => ({
  key,
  label,
  value: r.value,
  se: r.se,
  lo: r.value - 1.96 * r.se,
  hi: r.value + 1.96 * r.se,
})

export function analyseChoices(rs: Respondent[]): ChoiceResult | null {
  const sets = choiceSets(rs)
  if (sets.length === 0) return null
  const who = new Set<string>()
  for (const r of rs) if (r.plan.choice?.some((t) => !t.check && r.answers[t.id] && 'choice' in r.answers[t.id])) who.add(r.id)

  const fit = fitLogit(sets, P)
  const reliable = fit.converged && fit.theta[0] > 0 && fit.theta[0] / fit.se[0] >= 2
  const values: Estimate[] = []
  const costRatios: Estimate[] = []

  if (reliable) {
    // Dollars of pay: a change worth theta[k] utility, in units of the utility of $1,000 of pay.
    const worth = (k: number, label: string) => estimate(CHOICE_FEATURES[k], label, ratio(fit, k, 1000))
    values.push(
      worth(3, 'An audience of about 500 instead of 100'),
      worth(4, 'An audience of about 2,000 instead of 100'),
      worth(5, 'An audience of about 10,000 instead of 100'),
      worth(6, 'Some people there who could hire you again, instead of few'),
      worth(7, 'Many people there who could hire you again, instead of few'),
      worth(8, 'An application that takes an hour, instead of 15 minutes'),
      worth(9, 'An application that takes 3 hours, instead of 15 minutes'),
    )
    costRatios.push(
      estimate('fee', 'An entry-fee dollar, in dollars of pay', ratio(fit, 1, -10)),
      estimate('travel', 'An out-of-pocket travel dollar, in dollars of pay', ratio(fit, 2, -10)),
    )
  }

  return {
    respondents: who.size,
    tasks: sets.length,
    neither: sets.filter((s) => s.chosen === 2).length / sets.length,
    coefficients: CHOICE_FEATURES.map((name, i) => ({ name, theta: fit.theta[i], se: fit.se[i] })),
    reliable,
    values,
    costRatios,
    converged: fit.converged,
  }
}

/** Percentile intervals by resampling respondents, for any statistic that is a vector of numbers. */
export function bootstrap(
  rs: Respondent[],
  stat: (sample: Respondent[]) => number[] | null,
  draws: number,
  seed = 1,
): { lo: number[]; hi: number[] } | null {
  if (rs.length < 2 || draws < 2) return null
  const rng = seeded(seed)
  const all: number[][] = []
  for (let d = 0; d < draws; d++) {
    const sample = Array.from({ length: rs.length }, () => rs[Math.floor(rng() * rs.length)])
    const s = stat(sample)
    if (s && s.every(Number.isFinite)) all.push(s)
  }
  if (all.length < draws / 2) return null
  const width = all[0].length
  const lo: number[] = []
  const hi: number[] = []
  for (let k = 0; k < width; k++) {
    const col = all.map((row) => row[k]).sort((a, b) => a - b)
    lo.push(col[Math.floor(0.025 * (col.length - 1))])
    hi.push(col[Math.ceil(0.975 * (col.length - 1))])
  }
  return { lo, hi }
}

// ── Who answered ──────────────────────────────────────────────────────────────

export interface Tally {
  label: string
  /** Null when the group was too small to report. */
  n: number | null
  grouped?: boolean
}

/** Counts by label, with every group under the minimum merged, and the merge hidden if it is still under it. */
export function suppress(counts: Map<string, number>, min = MIN_GROUP): Tally[] {
  const shown: Tally[] = []
  let small = 0
  let smallGroups = 0
  for (const [label, n] of counts) {
    if (n >= min) shown.push({ label, n })
    else {
      small += n
      smallGroups++
    }
  }
  shown.sort((a, b) => (b.n ?? 0) - (a.n ?? 0))
  if (smallGroups > 0) shown.push({ label: 'Smaller groups, combined', n: small >= min ? small : null, grouped: true })
  return shown
}

function optionLabel(qid: string, optionId: string): string {
  const q = questionOf(qid) as ChoiceQuestion | undefined
  return q?.options.find((o) => o.id === optionId) ? tx(q!.options.find((o) => o.id === optionId)!.text) : optionId
}

/** How the completed responses answered a choice question, with small groups suppressed. A multiple-choice question counts each option. */
export function composition(rs: Respondent[], qid: string): Tally[] {
  const counts = new Map<string, number>()
  for (const r of completes(rs)) {
    const a = r.answers[qid]
    if (isSkipped(a) || !a || !('value' in a)) {
      counts.set('Skipped', (counts.get('Skipped') ?? 0) + 1)
      continue
    }
    for (const v of Array.isArray(a.value) ? a.value : [a.value]) {
      const label = optionLabel(qid, v)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  return suppress(counts)
}

export function channels(rs: Respondent[]): Tally[] {
  const counts = new Map<string, number>()
  for (const r of rs) counts.set(r.source || 'no tag', (counts.get(r.source || 'no tag') ?? 0) + 1)
  return suppress(counts)
}

// ── The summary ───────────────────────────────────────────────────────────────

/** The questions the sample is described by. */
export const COMPOSITION_QUESTIONS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'E1', 'E3', 'E4'] as const

export interface Summary {
  counts: { started: number; inProgress: number; screenedOut: number; complete: number; completionRate: number | null }
  target: { completes: number; reached: boolean }
  timing: { medianSeconds: number | null; speeders: number }
  quality: { attentionPassed: number; attentionFailed: number; attentionUnanswered: number }
  order: { rankFirst: number; choiceFirst: number }
  channels: Tally[]
  /** Null below ten completes: nothing can be described without naming somebody. */
  composition: Record<string, Tally[]> | null
  ranking: RankingResult | null
  choices: ChoiceResult | null
  /** Free-text answers to the open question, for the owner to read in full. */
  openAnswers: string[]
  /** What the ranking and choices were fitted to. */
  excluding: Exclusions
}

export function summarise(all: Respondent[], ex: Exclusions = {}): Summary {
  const done = completes(all)
  const used = applyExclusions(done, ex)
  const started = all.length
  const screenedOut = all.filter((r) => r.status === 'screened_out').length
  const inProgress = all.filter((r) => r.status === 'in_progress').length
  // Completion is out of everyone who was the artist and began, so a screen-out is not an abandoned survey.
  const eligible = started - screenedOut

  const checks = done.map((r) => attentionFailed(r.plan, r.answers))

  return {
    counts: {
      started,
      inProgress,
      screenedOut,
      complete: done.length,
      completionRate: eligible > 0 ? done.length / eligible : null,
    },
    target: { completes: TARGET_COMPLETES, reached: done.length >= TARGET_COMPLETES },
    timing: { medianSeconds: median(done.map(totalSeconds)), speeders: speeders(all).size },
    quality: {
      attentionPassed: checks.filter((c) => c === false).length,
      attentionFailed: checks.filter((c) => c === true).length,
      attentionUnanswered: checks.filter((c) => c === null).length,
    },
    order: {
      rankFirst: done.filter((r) => r.plan.order === 'rank_first').length,
      choiceFirst: done.filter((r) => r.plan.order === 'choice_first').length,
    },
    channels: channels(all),
    composition:
      done.length >= MIN_GROUP ? Object.fromEntries(COMPOSITION_QUESTIONS.map((q) => [q, composition(all, q)])) : null,
    ranking: analyseRanking(used),
    choices: analyseChoices(used),
    openAnswers: done
      .map((r) => r.answers.E5)
      .filter((a): a is { text: string } => !!a && 'text' in a)
      .map((a) => a.text),
    excluding: ex,
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * A spreadsheet reads a cell starting with = + - or @ as a formula, and a cell
 * of free text typed by a stranger is exactly where one would arrive. Prefixing
 * a quote makes it text, and costs nothing for any honest answer.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per response. The raw export is the owner's and is not suppressed. */
export function toCsv(rs: Respondent[]): string {
  const rankSlots = Math.max(0, ...rs.map((r) => r.plan.rank?.length ?? 0))
  const choiceSlots = Math.max(0, ...rs.map((r) => r.plan.choice?.length ?? 0))

  const header = [
    'id', 'status', 'source', 'device', 'instrument', 'created_at', 'completed_at', 'seconds', 'order', 'design_version', 'attention_failed',
    ...QUESTIONS.flatMap((q) => (q.kind === 'text' || !(q as ChoiceQuestion).options.some((o) => o.other) ? [q.id] : [q.id, `${q.id}_other`])),
    ...Array.from({ length: rankSlots }, (_, i) => [`R${i + 1}_items`, `R${i + 1}_best`, `R${i + 1}_worst`]).flat(),
    ...Array.from({ length: choiceSlots }, (_, i) => [`P${i + 1}_check`, `P${i + 1}_a`, `P${i + 1}_b`, `P${i + 1}_choice`]).flat(),
  ]

  const lines = rs.map((r) => {
    const fields: unknown[] = [
      r.id, r.status, r.source, r.device, r.instrument, r.createdAt, r.completedAt, Math.round(totalSeconds(r)), r.plan.order, r.plan.version,
      attentionFailed(r.plan, r.answers) ?? '',
    ]
    for (const q of QUESTIONS) {
      const a = r.answers[q.id]
      const withOther = q.kind !== 'text' && (q as ChoiceQuestion).options.some((o) => o.other)
      // Blank means never reached, "skipped" means reached and declined: different facts.
      if (!a) fields.push('')
      else if ('skipped' in a) fields.push('skipped')
      else if ('text' in a) fields.push(a.text)
      else if ('value' in a) fields.push(Array.isArray(a.value) ? a.value.join('|') : a.value)
      else fields.push('')
      if (withOther) fields.push(a && 'other' in a ? a.other : '')
    }
    for (let i = 0; i < rankSlots; i++) {
      const t = r.plan.rank?.[i]
      const a = t ? r.answers[t.id] : undefined
      fields.push(t ? t.items.join('|') : '', a && 'best' in a ? a.best : '', a && 'best' in a ? a.worst : '')
    }
    for (let i = 0; i < choiceSlots; i++) {
      const t = r.plan.choice?.[i]
      const a = t ? r.answers[t.id] : undefined
      fields.push(t ? (t.check ? t.dominant : '') : '', t ? t.a.join('-') : '', t ? t.b.join('-') : '', a && 'choice' in a ? a.choice : '')
    }
    return fields.map(csvCell).join(',')
  })

  return [header.map(csvCell).join(','), ...lines].join('\n') + '\n'
}
