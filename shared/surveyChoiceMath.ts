/**
 * The arithmetic behind the paired-choice design, in one place so the script
 * that generates the design and the test that holds it to account use the same
 * definitions.
 *
 * A design is good when it can tell the attributes apart. For a main-effects
 * choice model with two alternatives, the information a task carries, at no
 * assumed preferences, is the outer product of the *difference* between the two
 * cards' effects-coded attribute levels. The D-criterion is the log of the
 * determinant of the sum over tasks: larger means every attribute's effect is
 * estimated more tightly and none is tangled up with another.
 */

import { ATTRIBUTES } from './surveyInstrument'

export type Card = number[] // level index per attribute, in ATTRIBUTES order
export type Pair = [Card, Card]

export const LEVEL_COUNTS = ATTRIBUTES.map((a) => a.levels.length)
/** Parameters in a main-effects model: one fewer than the levels, per attribute. */
export const PARAMS = LEVEL_COUNTS.reduce((n, l) => n + l - 1, 0)

/** Effects coding: the last level of each attribute is minus the sum of the others. */
export function effects(card: Card): number[] {
  const out: number[] = []
  card.forEach((level, a) => {
    const l = LEVEL_COUNTS[a]
    for (let k = 0; k < l - 1; k++) out.push(level === l - 1 ? -1 : level === k ? 1 : 0)
  })
  return out
}

export function difference([a, b]: Pair): number[] {
  const x = effects(a)
  const y = effects(b)
  return x.map((v, i) => v - y[i])
}

/** log det of a square matrix by Gaussian elimination, or -Infinity when singular. */
export function logDet(m: number[][]): number {
  const n = m.length
  const a = m.map((row) => [...row])
  let det = 0
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r
    if (Math.abs(a[pivot][c]) < 1e-10) return -Infinity
    if (pivot !== c) [a[pivot], a[c]] = [a[c], a[pivot]]
    det += Math.log(Math.abs(a[c][c]))
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c]
      for (let k = c; k < n; k++) a[r][k] -= f * a[c][k]
    }
  }
  return det
}

/** The D-criterion of a set of tasks: larger is a more informative design. */
export function designInformation(pairs: Pair[]): number {
  const m = Array.from({ length: PARAMS }, () => new Array<number>(PARAMS).fill(0))
  for (const pair of pairs) {
    const d = difference(pair)
    for (let i = 0; i < PARAMS; i++) {
      if (d[i] === 0) continue
      for (let j = 0; j < PARAMS; j++) m[i][j] += d[i] * d[j]
    }
  }
  return logDet(m)
}

/** How many of the six rows differ between the two cards. */
export function differingRows([a, b]: Pair): number {
  return a.reduce((n, level, i) => n + (level !== b[i] ? 1 : 0), 0)
}

/**
 * Whether one card is at least as good as the other on every row and better on
 * at least one. A pair like that has no trade-off in it, so nobody is asked to
 * trade anything — except the planted attention check, which is one on purpose.
 */
export function dominance(pair: Pair): 'a' | 'b' | null {
  const [a, b] = pair
  let aBetter = false
  let bBetter = false
  a.forEach((level, i) => {
    if (level === b[i]) return
    const aWins = ATTRIBUTES[i].better === 'higher' ? level > b[i] : level < b[i]
    if (aWins) aBetter = true
    else bBetter = true
  })
  if (aBetter && !bBetter) return 'a'
  if (bBetter && !aBetter) return 'b'
  return null
}

/** Times each level of each attribute appears across both cards of every task. */
export function levelCounts(pairs: Pair[]): number[][] {
  const counts = LEVEL_COUNTS.map((l) => new Array<number>(l).fill(0))
  for (const [a, b] of pairs) {
    a.forEach((level, i) => counts[i][level]++)
    b.forEach((level, i) => counts[i][level]++)
  }
  return counts
}

/** Sum of squared departures from perfectly even use of every level. */
export function imbalance(pairs: Pair[]): number {
  const counts = levelCounts(pairs)
  let total = 0
  counts.forEach((row, i) => {
    const expected = (pairs.length * 2) / LEVEL_COUNTS[i]
    for (const n of row) total += (n - expected) ** 2
  })
  return total
}
