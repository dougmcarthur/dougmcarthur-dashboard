/**
 * What one respondent is shown, decided once from one seed.
 *
 * A response stores its plan, so what was displayed is a record rather than
 * something rebuilt from code that may have changed. The plan is built here and
 * only here, on the server at the moment a response starts; the browser renders
 * it and invents nothing, so it cannot drift from what the analysis assumes.
 *
 * Four things are randomised per respondent, each from its own stream so that
 * changing one cannot reshuffle the others:
 *
 * - **Which of the two preference parts comes first** (ranking or paired
 *   choices), 50/50, and recorded, so an order effect can be measured.
 * - **The ranking screens**: thirteen factors in thirteen blocks of four, from a
 *   difference set that makes every factor appear four times and every pair of
 *   factors together exactly once. The factors are shuffled onto the blocks,
 *   the blocks are shuffled, and nine of them are shown (all thirteen when
 *   `rankScreens` says so).
 * - **The paired choices**: one of three design versions, its tasks shuffled,
 *   the two cards swapped at random, the six rows shown in a shuffled order that
 *   holds for the whole survey, and one planted attention check.
 * - **The options of every list with no natural order**, with Other, None and
 *   Prefer not to say always last.
 */

import { seeded, shuffled, int, type Rng } from './surveyRandom'
import {
  ATTRIBUTES,
  FACTORS,
  INSTRUMENT_VERSION,
  QUESTIONS,
  type ChoiceQuestion,
  type PartId,
} from './surveyInstrument'
import { CHECK_PAIRS, CHOICE_VERSIONS } from './surveyChoiceDesign'

export const RANK_SCREENS = 9
export const CHOICE_TASKS = 8
const POINTS = 13
/** {0, 1, 3, 9} is a perfect difference set modulo 13: its rotations are the thirteen blocks. */
const DIFFERENCE_SET = [0, 1, 3, 9]

export function rankBlocks(): number[][] {
  return Array.from({ length: POINTS }, (_, i) => DIFFERENCE_SET.map((d) => (d + i) % POINTS))
}

export interface RankTask {
  id: string
  /** Factor ids, in the order they are shown. */
  items: string[]
}

export interface ChoiceTask {
  id: string
  /** A level index per attribute, in the order of ATTRIBUTES. */
  a: number[]
  b: number[]
  /** The planted attention check. */
  check: boolean
  /** On the check, which card is clearly better. */
  dominant: 'a' | 'b' | null
}

export interface Plan {
  /** The instrument version this plan was built for. */
  v: string
  seed: number
  order: 'rank_first' | 'choice_first'
  /** Which of the three choice-design versions this respondent got, 1 to 3. */
  version: number
  /** Attribute ids in the order they are shown, fixed for the whole survey. */
  attributeOrder: string[]
  rank: RankTask[]
  choice: ChoiceTask[]
  /** The displayed order of every question's options, by question id. */
  options: Record<string, string[]>
  /** Every screen in order, from S1 to the last question. */
  screens: string[]
  /** Where each part starts, for the "Part 3 of 5" at the top of a screen. */
  parts: { part: PartId; first: string }[]
}

/** An independent stream per concern, from the seed and a label. */
function stream(seed: number, label: string): Rng {
  let h = seed >>> 0
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0
  return seeded(h)
}

function swapCards<T>(a: T, b: T, rng: Rng): [T, T, boolean] {
  return rng() < 0.5 ? [b, a, true] : [a, b, false]
}

export function buildPlan(seed: number, opts: { rankScreens?: number } = {}): Plan {
  const rankScreens = Math.min(Math.max(opts.rankScreens ?? RANK_SCREENS, 1), POINTS)

  // Which preference part is first.
  const order = stream(seed, 'order')() < 0.5 ? 'rank_first' : 'choice_first'

  // Ranking.
  const rankRng = stream(seed, 'rank')
  const factorAtPoint = shuffled(FACTORS.map((f) => f.id), rankRng)
  const rank: RankTask[] = shuffled(rankBlocks(), rankRng)
    .slice(0, rankScreens)
    .map((block, i) => ({
      id: `R${i + 1}`,
      items: shuffled(block.map((point) => factorAtPoint[point]), rankRng),
    }))

  // Paired choices.
  const choiceRng = stream(seed, 'choice')
  const version = 1 + int(CHOICE_VERSIONS.length, choiceRng)
  const attributeOrder = shuffled(ATTRIBUTES.map((a) => a.id), choiceRng)
  const tasks: ChoiceTask[] = shuffled(CHOICE_VERSIONS[version - 1], choiceRng).map((pair) => {
    const [a, b] = swapCards(pair[0], pair[1], choiceRng)
    return { id: '', a: [...a], b: [...b], check: false, dominant: null }
  })
  // The planted check goes in a slot from the third to the seventh of nine.
  const planted = CHECK_PAIRS[int(CHECK_PAIRS.length, choiceRng)]
  const [pa, pb, swapped] = swapCards(planted[0], planted[1], choiceRng)
  const slot = 2 + int(5, choiceRng)
  tasks.splice(slot, 0, { id: '', a: [...pa], b: [...pb], check: true, dominant: swapped ? 'b' : 'a' })
  const choice = tasks.map((t, i) => ({ ...t, id: `P${i + 1}` }))

  // Option order, for the lists with no natural order.
  const optionRng = stream(seed, 'options')
  const options: Record<string, string[]> = {}
  for (const q of QUESTIONS) {
    if (q.kind === 'text') continue
    const choiceQuestion = q as ChoiceQuestion
    const free = choiceQuestion.options.filter((o) => !o.anchor)
    const anchored = choiceQuestion.options.filter((o) => o.anchor)
    options[q.id] = [
      ...(choiceQuestion.shuffle ? shuffled(free, optionRng) : free).map((o) => o.id),
      ...anchored.map((o) => o.id),
    ]
  }

  // Screens, in order.
  const ids = (section: string) => QUESTIONS.filter((q) => q.section === section).map((q) => q.id)
  const rankScreensIds = ['intro:C', ...rank.map((t) => t.id)]
  const choiceScreensIds = ['intro:D', ...choice.map((t) => t.id)]
  const first = order === 'rank_first' ? rankScreensIds : choiceScreensIds
  const second = order === 'rank_first' ? choiceScreensIds : rankScreensIds
  const screens = [
    ...ids('screen'),
    ...ids('music'),
    'intro:B',
    ...ids('recent'),
    ...first,
    ...second,
    'intro:E',
    ...ids('about'),
  ]

  const firstPart: PartId = order === 'rank_first' ? 'rank' : 'choice'
  const secondPart: PartId = order === 'rank_first' ? 'choice' : 'rank'
  const parts: Plan['parts'] = [
    { part: 'music', first: ids('music')[0] },
    { part: 'recent', first: 'intro:B' },
    { part: firstPart, first: first[0] },
    { part: secondPart, first: second[0] },
    { part: 'about', first: 'intro:E' },
  ]

  return { v: INSTRUMENT_VERSION, seed, order, version, attributeOrder, rank, choice, options, screens, parts }
}

// ── Reading a plan ────────────────────────────────────────────────────────────

export type ScreenKind = 'question' | 'intro' | 'rank' | 'choice'

export function screenKind(screenId: string): ScreenKind {
  if (screenId.startsWith('intro:')) return 'intro'
  if (/^R\d+$/.test(screenId)) return 'rank'
  if (/^P\d+$/.test(screenId)) return 'choice'
  return 'question'
}

/** Which part a screen is in, and where that falls in the survey, for "Part 3 of 5". */
export function partOf(plan: Plan, screenId: string): { part: PartId; number: number; of: number } | null {
  const index = plan.screens.indexOf(screenId)
  if (index < 0) return null
  let found: { part: PartId; number: number } | null = null
  for (let i = 0; i < plan.parts.length; i++) {
    if (plan.screens.indexOf(plan.parts[i].first) <= index) found = { part: plan.parts[i].part, number: i + 1 }
  }
  return found ? { ...found, of: plan.parts.length } : null
}
