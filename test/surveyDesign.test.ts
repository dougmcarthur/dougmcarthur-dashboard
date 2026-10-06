import { describe, it, expect } from 'vitest'
import {
  CHOICE_TASKS,
  RANK_SCREENS,
  buildPlan,
  partOf,
  rankBlocks,
  screenKind,
} from '../shared/surveyDesign'
import { ATTRIBUTES, FACTORS, QUESTIONS, questionOf, type ChoiceQuestion } from '../shared/surveyInstrument'
import { CHECK_PAIRS, CHOICE_VERSIONS } from '../shared/surveyChoiceDesign'
import {
  LEVEL_COUNTS,
  PARAMS,
  designInformation,
  differingRows,
  dominance,
  levelCounts,
  type Card,
  type Pair,
} from '../shared/surveyChoiceMath'
import { seeded, shuffled } from '../shared/surveyRandom'

/**
 * The design is where a survey becomes fair or does not, and none of it can be
 * seen by looking at a screen. So it is held to arithmetic: a ranking whose
 * blocks cover every pair exactly once, choice tasks that make somebody trade,
 * and randomisation that is demonstrably even over thousands of respondents.
 */

describe('the ranking blocks', () => {
  const blocks = rankBlocks()

  it('are thirteen screens of four', () => {
    expect(blocks).toHaveLength(13)
    for (const b of blocks) expect(new Set(b).size).toBe(4)
  })

  it('show every factor exactly four times', () => {
    const counts = new Array<number>(13).fill(0)
    for (const b of blocks) for (const p of b) counts[p]++
    expect(new Set(counts)).toEqual(new Set([4]))
  })

  it('put every pair of factors together exactly once, so none is favoured by where it lands', () => {
    const together = new Map<string, number>()
    for (const b of blocks) {
      for (const x of b) for (const y of b) if (x < y) together.set(`${x}-${y}`, (together.get(`${x}-${y}`) ?? 0) + 1)
    }
    expect(together.size).toBe(78)
    expect(new Set(together.values())).toEqual(new Set([1]))
  })
})

describe('a plan', () => {
  it('is the same for the same seed and different for another', () => {
    expect(buildPlan(1234)).toEqual(buildPlan(1234))
    expect(buildPlan(1234)).not.toEqual(buildPlan(1235))
  })

  it('shows nine ranking screens of four distinct factors, and eight choices plus a check', () => {
    const plan = buildPlan(7)
    expect(RANK_SCREENS).toBe(9)
    expect(plan.rank).toHaveLength(9)
    for (const t of plan.rank) {
      expect(new Set(t.items).size).toBe(4)
      for (const id of t.items) expect(FACTORS.map((f) => f.id)).toContain(id)
    }
    expect(plan.choice).toHaveLength(CHOICE_TASKS + 1)
    expect(plan.choice.filter((t) => t.check)).toHaveLength(1)
  })

  it('keeps the balance of the full thirteen under the shuffle', () => {
    const plan = buildPlan(99, { rankScreens: 13 })
    const seen = new Map<string, number>()
    const pairs = new Map<string, number>()
    for (const t of plan.rank) {
      for (const x of t.items) {
        seen.set(x, (seen.get(x) ?? 0) + 1)
        for (const y of t.items) if (x < y) pairs.set(`${x}-${y}`, (pairs.get(`${x}-${y}`) ?? 0) + 1)
      }
    }
    expect(new Set(seen.values())).toEqual(new Set([4]))
    expect(pairs.size).toBe(78)
    expect(new Set(pairs.values())).toEqual(new Set([1]))
  })

  it('shows the screens in order, once each, from the screen-out question to the last', () => {
    const plan = buildPlan(5)
    expect(new Set(plan.screens).size).toBe(plan.screens.length)
    expect(plan.screens[0]).toBe('S1')
    for (const q of QUESTIONS) expect(plan.screens, q.id).toContain(q.id)
    expect(plan.screens[plan.screens.length - 1]).toBe('E5')
    // Facts, then what they did, before any preference question.
    expect(plan.screens.indexOf('A8')).toBeLessThan(plan.screens.indexOf('B1'))
    expect(plan.screens.indexOf('B5')).toBeLessThan(plan.screens.indexOf('R1'))
    expect(plan.screens.indexOf('B5')).toBeLessThan(plan.screens.indexOf('P1'))
    // And the personal questions last.
    expect(plan.screens.indexOf('R9')).toBeLessThan(plan.screens.indexOf('E1'))
    expect(plan.screens.indexOf('P9')).toBeLessThan(plan.screens.indexOf('E1'))
  })

  it('puts the part its order flag names first', () => {
    for (let seed = 0; seed < 40; seed++) {
      const plan = buildPlan(seed)
      const rankFirst = plan.screens.indexOf('R1') < plan.screens.indexOf('P1')
      expect(plan.order === 'rank_first').toBe(rankFirst)
    }
  })

  it('numbers the parts one to five in the order they appear', () => {
    for (const seed of [3, 4]) {
      const plan = buildPlan(seed)
      const numbers = plan.screens.map((s) => partOf(plan, s)?.number)
      expect(numbers[0]).toBeUndefined() // the screen-out question belongs to no part
      const real = numbers.filter((n): n is number => n !== undefined)
      expect([...real].sort((a, b) => a - b)).toEqual(real)
      expect(new Set(real)).toEqual(new Set([1, 2, 3, 4, 5]))
      expect(partOf(plan, 'E5')).toMatchObject({ part: 'about', number: 5, of: 5 })
    }
  })

  it('reads screen ids by kind', () => {
    expect(screenKind('intro:C')).toBe('intro')
    expect(screenKind('R3')).toBe('rank')
    expect(screenKind('P9')).toBe('choice')
    expect(screenKind('B4')).toBe('question')
  })

  it('puts Other, None and Prefer not to say last, and leaves ordered lists as written', () => {
    const plan = buildPlan(11)
    for (const q of QUESTIONS) {
      if (q.kind === 'text') continue
      const shown = plan.options[q.id]
      expect([...shown].sort(), q.id).toEqual(q.options.map((o) => o.id).sort())
      const anchored = q.options.filter((o) => o.anchor).map((o) => o.id)
      if (anchored.length) expect(shown.slice(-anchored.length), q.id).toEqual(anchored)
      if (!q.shuffle) expect(shown, q.id).toEqual(q.options.map((o) => o.id))
    }
  })

  it('shows the six attributes in one shuffled order, every one exactly once', () => {
    const plan = buildPlan(2)
    expect([...plan.attributeOrder].sort()).toEqual(ATTRIBUTES.map((a) => a.id).sort())
  })
})

describe('the randomisation is even', () => {
  // Enough respondents that a real bias shows and an honest one does not.
  const N = 3000
  const plans = Array.from({ length: N }, (_, i) => buildPlan(i * 7919 + 13))

  it('puts each of the two preference parts first about half the time', () => {
    const first = plans.filter((p) => p.order === 'rank_first').length / N
    expect(first).toBeGreaterThan(0.46)
    expect(first).toBeLessThan(0.54)
  })

  it('uses the three choice versions about equally', () => {
    for (const v of [1, 2, 3]) {
      const share = plans.filter((p) => p.version === v).length / N
      expect(share, `version ${v}`).toBeGreaterThan(0.3)
      expect(share, `version ${v}`).toBeLessThan(0.37)
    }
  })

  it('shows every factor on about the same number of ranking screens', () => {
    const shown = new Map<string, number>()
    for (const p of plans) for (const t of p.rank) for (const id of t.items) shown.set(id, (shown.get(id) ?? 0) + 1)
    const expected = (N * 9 * 4) / 13
    for (const f of FACTORS) {
      const n = shown.get(f.id) ?? 0
      expect(n / expected, f.id).toBeGreaterThan(0.95)
      expect(n / expected, f.id).toBeLessThan(1.05)
    }
  })

  it('does not favour a factor for the first or last position on a screen', () => {
    for (const slot of [0, 3]) {
      const counts = new Map<string, number>()
      for (const p of plans) for (const t of p.rank) counts.set(t.items[slot], (counts.get(t.items[slot]) ?? 0) + 1)
      const expected = (N * 9) / 13
      for (const f of FACTORS) {
        const ratio = (counts.get(f.id) ?? 0) / expected
        expect(ratio, `${f.id} in slot ${slot}`).toBeGreaterThan(0.9)
        expect(ratio, `${f.id} in slot ${slot}`).toBeLessThan(1.1)
      }
    }
  })

  it('puts the attention check in each of slots three to seven, and never outside them', () => {
    const slots = new Map<number, number>()
    for (const p of plans) slots.set(p.choice.findIndex((t) => t.check), (slots.get(p.choice.findIndex((t) => t.check)) ?? 0) + 1)
    expect([...slots.keys()].sort()).toEqual([2, 3, 4, 5, 6])
    for (const n of slots.values()) expect(n / N).toBeGreaterThan(0.17)
  })

  it('swaps the two cards, and the better card of the check, about half the time', () => {
    const dominantA = plans.filter((p) => p.choice.find((t) => t.check)!.dominant === 'a').length / N
    expect(dominantA).toBeGreaterThan(0.46)
    expect(dominantA).toBeLessThan(0.54)
  })

  it('shuffles the options of a list with no order, so no answer is always first', () => {
    const firsts = new Map<string, number>()
    for (const p of plans) firsts.set(p.options.B4[0], (firsts.get(p.options.B4[0]) ?? 0) + 1)
    const free = (questionOf('B4') as ChoiceQuestion).options.filter((o) => !o.anchor).length
    expect(firsts.size).toBe(free)
    for (const n of firsts.values()) expect(n / N).toBeGreaterThan((1 / free) * 0.8)
  })
})

describe('the paired-choice design', () => {
  const all: Pair[] = CHOICE_VERSIONS.flat()

  it('is three versions of eight tasks', () => {
    expect(CHOICE_VERSIONS).toHaveLength(3)
    for (const v of CHOICE_VERSIONS) expect(v).toHaveLength(8)
  })

  it('names only levels that exist', () => {
    for (const [a, b] of [...all, ...CHECK_PAIRS]) {
      for (const card of [a, b]) {
        expect(card).toHaveLength(ATTRIBUTES.length)
        card.forEach((level, i) => {
          expect(Number.isInteger(level)).toBe(true)
          expect(level).toBeGreaterThanOrEqual(0)
          expect(level).toBeLessThan(LEVEL_COUNTS[i])
        })
      }
    }
  })

  it('makes every task a trade: four or more rows differ and neither card is simply better', () => {
    for (const pair of all) {
      expect(differingRows(pair)).toBeGreaterThanOrEqual(4)
      expect(dominance(pair)).toBeNull()
    }
  })

  it('uses every level equally often across the whole design', () => {
    const counts = levelCounts(all)
    counts.forEach((row, i) => expect(new Set(row), ATTRIBUTES[i].id).toEqual(new Set([(all.length * 2) / LEVEL_COUNTS[i]])))
  })

  it('keeps each version close to balanced too, since a respondent sees only one', () => {
    for (const v of CHOICE_VERSIONS) {
      levelCounts(v).forEach((row, i) => {
        const expected = (v.length * 2) / LEVEL_COUNTS[i]
        for (const n of row) expect(Math.abs(n - expected), `${ATTRIBUTES[i].id}`).toBeLessThanOrEqual(2)
      })
    }
  })

  it('carries far more information than a random design that obeys the same rules', () => {
    const rng = seeded(424242)
    const card = (): Card => LEVEL_COUNTS.map((l) => Math.floor(rng() * l))
    const baseline: number[] = []
    for (let d = 0; d < 60; d++) {
      const design: Pair[] = []
      while (design.length < all.length) {
        const pair: Pair = [card(), card()]
        if (differingRows(pair) >= 4 && dominance(pair) === null) design.push(pair)
      }
      baseline.push(designInformation(design))
    }
    const best = Math.max(...baseline)
    const ours = designInformation(all)
    expect(ours).toBeGreaterThan(best)
    expect(Number.isFinite(ours)).toBe(true)
    expect(PARAMS).toBe(16)
  })

  it('plants six attention checks, each clearly better on three or more rows and worse on none', () => {
    expect(CHECK_PAIRS).toHaveLength(6)
    for (const pair of CHECK_PAIRS) {
      expect(dominance(pair)).toBe('a')
      expect(differingRows(pair)).toBeGreaterThanOrEqual(3)
    }
  })

  it('does not repeat a task, so nobody sees the same pair twice', () => {
    const seen = new Set(all.map(([a, b]) => JSON.stringify([a, b])))
    expect(seen.size).toBe(all.length)
  })
})

describe('the seeded generator', () => {
  it('shuffles without losing or repeating anything', () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    const out = shuffled(items, seeded(1))
    expect([...out].sort((a, b) => a - b)).toEqual(items)
    expect(out).not.toEqual(items)
  })
})
