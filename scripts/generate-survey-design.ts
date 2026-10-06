/**
 * Generates the paired-choice design for the artist survey and writes it to
 * `shared/surveyChoiceDesign.ts`.
 *
 *   npx tsx scripts/generate-survey-design.ts
 *
 * The output is committed, so what a respondent is shown is a file somebody can
 * read, and regenerating it is a deliberate act that shows up as a diff. A fixed
 * seed makes the run reproducible.
 *
 * What it searches for, and why, is in docs/artist-survey-questionnaire.md
 * (section 3, D). In short: 24 tasks, split into three versions of eight, that
 *
 * - use every level equally often,
 * - make every task ask somebody to trade something for something (the two cards
 *   differ on at least four of six rows) and never offer a card that is simply
 *   better (no dominated pair),
 * - and carry as much information about each attribute as a design of this size
 *   can (the D-criterion, by coordinate exchange from many random starts).
 *
 * It also writes six planted pairs for the attention check, each with one card
 * clearly better on three or more rows and no worse on any.
 */

import { writeFileSync } from 'node:fs'
import { ATTRIBUTES } from '../shared/surveyInstrument'
import {
  LEVEL_COUNTS,
  designInformation,
  differingRows,
  dominance,
  imbalance,
  levelCounts,
  type Card,
  type Pair,
} from '../shared/surveyChoiceMath'
import { int, seeded, type Rng } from '../shared/surveyRandom'

const TASKS = 24
const VERSIONS = 3
const PER_VERSION = TASKS / VERSIONS
const STARTS = 40
const BALANCE_WEIGHT = 0.05
const SEED = 20261005

const rng: Rng = seeded(SEED)

function randomCard(): Card {
  return LEVEL_COUNTS.map((l) => int(l, rng))
}

/** A pair that makes somebody trade: four or more rows differ, and neither card dominates. */
function allowed(pair: Pair): boolean {
  return differingRows(pair) >= 4 && dominance(pair) === null
}

function randomPair(): Pair {
  for (;;) {
    const pair: Pair = [randomCard(), randomCard()]
    if (allowed(pair)) return pair
  }
}

function score(pairs: Pair[]): number {
  return designInformation(pairs) - BALANCE_WEIGHT * imbalance(pairs)
}

/** Coordinate exchange: change one row of one card at a time, keep what helps, until nothing does. */
function optimise(start: Pair[]): { pairs: Pair[]; score: number } {
  const pairs = start.map(([a, b]) => [[...a], [...b]] as Pair)
  let best = score(pairs)
  for (let sweep = 0; sweep < 30; sweep++) {
    let improved = false
    for (let t = 0; t < pairs.length; t++) {
      for (const side of [0, 1] as const) {
        for (let row = 0; row < LEVEL_COUNTS.length; row++) {
          const was = pairs[t][side][row]
          let keep = was
          for (let level = 0; level < LEVEL_COUNTS[row]; level++) {
            if (level === was) continue
            pairs[t][side][row] = level
            if (!allowed(pairs[t])) continue
            const s = score(pairs)
            if (s > best + 1e-9) {
              best = s
              keep = level
              improved = true
            }
          }
          pairs[t][side][row] = keep
        }
      }
    }
    if (!improved) break
  }
  return { pairs, score: best }
}

// ── Search ────────────────────────────────────────────────────────────────────

let winner: { pairs: Pair[]; score: number } | null = null
const baseline: number[] = []
for (let s = 0; s < STARTS; s++) {
  const start = Array.from({ length: TASKS }, randomPair)
  baseline.push(designInformation(start))
  const result = optimise(start)
  if (!winner || result.score > winner.score) winner = result
  process.stdout.write(`start ${s + 1}/${STARTS}  best ${winner.score.toFixed(2)}\r`)
}
process.stdout.write('\n')
if (!winner) throw new Error('no design found')

// ── Three versions of eight tasks, each as balanced as the whole ──────────────

function versionImbalance(assign: number[]): number {
  let total = 0
  for (let v = 0; v < VERSIONS; v++) {
    total += imbalance(winner!.pairs.filter((_, i) => assign[i] === v))
  }
  return total
}

let assign = Array.from({ length: TASKS }, (_, i) => i % VERSIONS)
assign = assign.map((v) => v) // shuffled below
for (let i = assign.length - 1; i > 0; i--) {
  const j = int(i + 1, rng)
  ;[assign[i], assign[j]] = [assign[j], assign[i]]
}
let current = versionImbalance(assign)
for (let step = 0; step < 20000 && current > 0; step++) {
  const i = int(TASKS, rng)
  const j = int(TASKS, rng)
  if (assign[i] === assign[j]) continue
  ;[assign[i], assign[j]] = [assign[j], assign[i]]
  const next = versionImbalance(assign)
  if (next <= current) current = next
  else [assign[i], assign[j]] = [assign[j], assign[i]]
}

const versions: Pair[][] = Array.from({ length: VERSIONS }, (_, v) =>
  winner!.pairs.filter((_, i) => assign[i] === v),
)

// ── Planted attention checks: one card clearly better, none worse ─────────────

function plantedPair(): Pair {
  for (;;) {
    const worse = randomCard()
    const better = [...worse]
    const rows = Array.from({ length: LEVEL_COUNTS.length }, (_, i) => i)
    for (let i = rows.length - 1; i > 0; i--) {
      const j = int(i + 1, rng)
      ;[rows[i], rows[j]] = [rows[j], rows[i]]
    }
    const count = 3 + int(2, rng) // three or four rows improved
    let changed = 0
    for (const r of rows.slice(0, count)) {
      const better_is_higher = ATTRIBUTES[r].better === 'higher'
      const room = better_is_higher ? LEVEL_COUNTS[r] - 1 - worse[r] : worse[r]
      if (room < 1) continue
      const step = 1 + int(room, rng)
      better[r] = worse[r] + (better_is_higher ? step : -step)
      changed++
    }
    const pair: Pair = [better, worse]
    if (changed >= 3 && dominance(pair) === 'a') return pair
  }
}
const checks = Array.from({ length: 6 }, plantedPair)

// ── Write it ──────────────────────────────────────────────────────────────────

const meanBaseline = baseline.reduce((a, b) => a + b, 0) / baseline.length
const counts = levelCounts(winner.pairs)
const header = `/**
 * GENERATED by scripts/generate-survey-design.ts, seed ${SEED}. Do not edit by hand.
 *
 * The paired-choice design for the artist survey: ${TASKS} tasks in ${VERSIONS} versions of
 * ${PER_VERSION}, and ${checks.length} planted pairs for the attention check. Each card is a level
 * index per attribute, in the order of ATTRIBUTES in shared/surveyInstrument.ts.
 *
 * Information (log determinant, larger is better): ${winner.pairs.length ? designInformation(winner.pairs).toFixed(2) : 'n/a'}, against a mean of
 * ${meanBaseline.toFixed(2)} for ${baseline.length} random designs that obey the same rules.
 * Level counts per attribute across all tasks: ${JSON.stringify(counts)}.
 */
`

const fmt = (c: Card) => `[${c.join(', ')}]`
const fmtPair = ([a, b]: Pair) => `[${fmt(a)}, ${fmt(b)}]`

const body = `import type { Pair } from './surveyChoiceMath'

export const CHOICE_VERSIONS: Pair[][] = [
${versions.map((v) => `  [\n${v.map((p) => `    ${fmtPair(p)},`).join('\n')}\n  ],`).join('\n')}
]

/** The first card of each is better on three or more rows and no worse on any. */
export const CHECK_PAIRS: Pair[] = [
${checks.map((p) => `  ${fmtPair(p)},`).join('\n')}
]
`

writeFileSync(new URL('../shared/surveyChoiceDesign.ts', import.meta.url), header + '\n' + body)
console.log(`wrote shared/surveyChoiceDesign.ts  information ${designInformation(winner.pairs).toFixed(2)} vs baseline ${meanBaseline.toFixed(2)}, imbalance ${imbalance(winner.pairs).toFixed(2)}`)
