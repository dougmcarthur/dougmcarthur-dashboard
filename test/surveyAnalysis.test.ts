import { describe, it, expect } from 'vitest'
import {
  CHOICE_FEATURES,
  MIN_GROUP,
  analyseChoices,
  analyseRanking,
  applyExclusions,
  bootstrap,
  cardVector,
  choiceSets,
  composition,
  csvCell,
  rankSets,
  speeders,
  summarise,
  suppress,
  toCsv,
  toRespondent,
  type Respondent,
} from '../shared/surveyAnalysis'
import { buildPlan } from '../shared/surveyDesign'
import { FACTORS } from '../shared/surveyInstrument'
import { seeded, type Rng } from '../shared/surveyRandom'
import type { AnswerMap } from '../shared/surveyAnswers'

/**
 * The analysis, checked by planting preferences and seeing whether it finds
 * them. A survey's method fails silently — a wrong estimator still returns
 * tidy numbers — so the only convincing test is one where the right answer is
 * known in advance: simulate respondents who choose according to preferences
 * written down here, run the real code, and compare.
 */

import { CHOICE_TRUTH, RANK_TRUTH, simulate } from './support/surveyFixtures'

const crowd = Array.from({ length: 500 }, (_, i) => simulate(i + 1))

describe('the ranking recovers the preferences that were planted', () => {
  const result = analyseRanking(crowd)!

  it('sees every respondent and every screen', () => {
    expect(result.respondents).toBe(500)
    expect(result.screens).toBe(500 * 9)
    expect(result.converged).toBe(true)
  })

  it('puts the factors in the right order by simple counting', () => {
    // The plain best-minus-worst score is what a person would work out by hand.
    const byScore = [...result.rows].sort((a, b) => b.score - a.score).map((r) => r.id)
    const byTruth = FACTORS.map((f, i) => ({ id: f.id, u: RANK_TRUTH[i] })).sort((a, b) => b.u - a.u).map((r) => r.id)
    expect(byScore.slice(0, 3)).toEqual(byTruth.slice(0, 3))
    expect(byScore.slice(-3).sort()).toEqual(byTruth.slice(-3).sort())
  })

  it('recovers each utility within three standard errors', () => {
    result.rows.forEach((row, i) => {
      expect(Math.abs(row.utility - RANK_TRUTH[i]) / row.se, row.id).toBeLessThan(3)
    })
  })

  it('shows every factor about equally often, and gives shares that sum to one', () => {
    const shown = result.rows.map((r) => r.shown)
    expect(Math.max(...shown) / Math.min(...shown)).toBeLessThan(1.1)
    expect(result.rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 9)
  })

  it('turns each answered screen into two choices, the second with the sign flipped', () => {
    const one = rankSets([crowd[0]])
    expect(one).toHaveLength(9 * 2)
    expect(one[0].x).toHaveLength(4)
    expect(one[1].x).toHaveLength(3)
  })

  it('has nothing to say about nobody', () => {
    expect(analyseRanking([])).toBeNull()
  })
})

describe('the paired choices recover the preferences that were planted', () => {
  const result = analyseChoices(crowd)!

  it('sees every screen but the attention check', () => {
    expect(result.tasks).toBe(500 * 8)
    expect(choiceSets([crowd[0]])).toHaveLength(8)
    expect(result.converged).toBe(true)
  })

  it('recovers each coefficient within three standard errors', () => {
    result.coefficients.forEach((c, k) => {
      expect(Math.abs(c.theta - CHOICE_TRUTH[k]) / c.se, CHOICE_FEATURES[k]).toBeLessThan(3)
    })
  })

  it('turns them into dollars of pay, with the true value inside the interval', () => {
    expect(result.reliable).toBe(true)
    // An audience of 2,000 instead of 100 is worth 1000 * 0.8 / 1.0 = $800.
    const audience = result.values.find((v) => v.key === CHOICE_FEATURES[4])!
    expect(audience.value).toBeGreaterThan(audience.lo)
    expect(800).toBeGreaterThan(audience.value - 3 * audience.se)
    expect(800).toBeLessThan(audience.value + 3 * audience.se)
    // Three hours of application costs 1000 * -0.6 / 1.0 = -$600.
    const effort = result.values.find((v) => v.key === CHOICE_FEATURES[9])!
    expect(effort.value).toBeLessThan(0)
    expect(-600).toBeGreaterThan(effort.value - 3 * effort.se)
    expect(-600).toBeLessThan(effort.value + 3 * effort.se)
  })

  it('says how many dollars of pay a dollar of cost counts for', () => {
    const fee = result.costRatios.find((r) => r.key === 'fee')!
    const travel = result.costRatios.find((r) => r.key === 'travel')!
    expect(Math.abs(fee.value - 1.5)).toBeLessThan(3 * fee.se)
    expect(Math.abs(travel.value - 1)).toBeLessThan(3 * travel.se)
  })

  it('reports how often people chose Neither', () => {
    expect(result.neither).toBeGreaterThan(0)
    expect(result.neither).toBeLessThan(1)
  })

  it('declines to give dollars when it cannot tell pay from nothing', () => {
    // Four respondents: far too little to separate pay from noise.
    const small = analyseChoices(crowd.slice(0, 4))!
    expect(small.reliable).toBe(false)
    expect(small.values).toEqual([])
    expect(small.costRatios).toEqual([])
  })

  it('declines when pay appears to matter in the wrong direction', () => {
    // Everyone takes the lower pay: the pay effect comes out negative.
    const backwards = crowd.slice(0, 200).map((r) => {
      const answers: AnswerMap = { ...r.answers }
      for (const t of r.plan.choice) {
        if (t.check) continue
        const pa = cardVector(t.a)[0]
        const pb = cardVector(t.b)[0]
        answers[t.id] = { choice: pa === pb ? 'a' : pa < pb ? 'a' : 'b' }
      }
      return { ...r, answers }
    })
    const result2 = analyseChoices(backwards)!
    expect(result2.reliable).toBe(false)
    expect(result2.values).toEqual([])
  })
})

describe('flagging, not removing', () => {
  const withBad = [...crowd.slice(0, 20), simulate(901, { failCheck: true }), simulate(902, { seconds: 20 })]

  it('counts the attention check as passed, failed or not reached', () => {
    const s = summarise(withBad)
    expect(s.quality).toEqual({ attentionPassed: 21, attentionFailed: 1, attentionUnanswered: 0 })
  })

  it('flags a respondent who took under a third of the median time', () => {
    expect([...speeders(withBad)]).toEqual(['r902'])
    expect(summarise(withBad).timing.speeders).toBe(1)
  })

  it('keeps both in the results unless asked, and leaves them out when asked', () => {
    expect(applyExclusions(withBad, {})).toHaveLength(22)
    expect(applyExclusions(withBad, { failedCheck: true }).map((r) => r.id)).not.toContain('r901')
    expect(applyExclusions(withBad, { speeders: true }).map((r) => r.id)).not.toContain('r902')
    expect(summarise(withBad, { failedCheck: true, speeders: true }).excluding).toEqual({ failedCheck: true, speeders: true })
  })
})

describe('who answered, and never a group of fewer than ten', () => {
  it('merges small groups, and hides the merge when it is still small', () => {
    const merged = suppress(new Map([['Big', 40], ['A', 4], ['B', 3]]))
    expect(merged).toEqual([
      { label: 'Big', n: 40 },
      { label: 'Smaller groups, combined', n: null, grouped: true },
    ])
    const bigEnough = suppress(new Map([['Big', 40], ['A', 6], ['B', 8]]))
    expect(bigEnough.find((t) => t.grouped)).toEqual({ label: 'Smaller groups, combined', n: 14, grouped: true })
    expect(MIN_GROUP).toBe(10)
  })

  it('reports no group under ten, whatever the question', () => {
    for (const q of ['A1', 'E1', 'E3']) {
      for (const t of composition(crowd.slice(0, 40), q)) expect(t.n === null || t.n >= MIN_GROUP, `${q} ${t.label}`).toBe(true)
    }
  })

  it('describes nobody until there are ten completed responses', () => {
    expect(summarise(crowd.slice(0, 9)).composition).toBeNull()
    expect(summarise(crowd.slice(0, 10)).composition).not.toBeNull()
  })

  it('counts the channels, suppressing small ones, and every screen-out separately from an abandonment', () => {
    const started: Respondent[] = [
      ...crowd.slice(0, 30),
      { ...simulate(950), status: 'screened_out' },
      { ...simulate(951), status: 'in_progress' },
    ]
    const s = summarise(started)
    expect(s.counts).toMatchObject({ started: 32, complete: 30, screenedOut: 1, inProgress: 1 })
    // 30 of the 31 who were the artist finished: the screen-out is not an abandonment.
    expect(s.counts.completionRate).toBeCloseTo(30 / 31, 9)
    expect(s.target).toEqual({ completes: 125, reached: false })
  })

  it('reads the open answers in full, for the owner', () => {
    expect(summarise(crowd.slice(0, 20)).openAnswers.length).toBe(5)
  })
})

describe('the export', () => {
  const rows = [crowd[0], crowd[1]]
  const csv = toCsv(rows)
  const lines = csv.trim().split('\n')

  it('has a row per response and a header', () => {
    expect(lines).toHaveLength(3)
    expect(lines[0].startsWith('id,status,source,device,instrument,created_at')).toBe(true)
  })

  it('carries each ranking screen with the items shown, so a set can be rebuilt', () => {
    expect(lines[0]).toContain('R1_items,R1_best,R1_worst')
    expect(lines[0]).toContain('P1_check,P1_a,P1_b,P1_choice')
    expect(lines[1]).toContain(crowd[0].plan.rank[0].items.join('|'))
  })

  it('quotes a comma and a quote and a line break', () => {
    const r = simulate(4)
    r.answers.E5 = { text: 'a, "b"\nc' }
    expect(toCsv([r])).toContain('"a, ""b""\nc"')
  })

  it('stops a typed answer from being read as a formula in a spreadsheet', () => {
    // A cell starting with = + - or @ is a formula to a spreadsheet, and free
    // text typed by a stranger is exactly where one would arrive.
    for (const evil of ['=1+1', '+1', '-1', '@SUM(A1)', '\t=1']) expect(csvCell(evil), evil).toBe(`'${evil}`)
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    // An honest answer is untouched.
    expect(csvCell('Gas money')).toBe('Gas money')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(null)).toBe('')
  })

  it('tells reached-and-declined from never-reached', () => {
    const r = simulate(4)
    r.answers.A2 = { skipped: true }
    delete r.answers.A3
    const header = toCsv([r]).split('\n')[0].split(',')
    const row = toCsv([r]).split('\n')[1].split(',')
    expect(row[header.indexOf('A2')]).toBe('skipped')
    expect(row[header.indexOf('A3')]).toBe('')
  })
})

describe('reading stored rows', () => {
  it('turns a row into a respondent, and skips one whose plan cannot be read', () => {
    const base = { id: 'x', instrument: 'v', source: null, device: null, answers: '{}', seconds: '{}', status: 'complete', createdAt: 'c', completedAt: null }
    expect(toRespondent({ ...base, plan: JSON.stringify(buildPlan(1)) })!.plan.screens[0]).toBe('S1')
    expect(toRespondent({ ...base, plan: 'not json' })).toBeNull()
    expect(toRespondent({ ...base, plan: '{}' })).toBeNull()
  })
})

describe('resampling respondents', () => {
  // A cheap statistic: the share who came through one channel. The function is
  // generic, so what is being tested is the resampling, not the model, and a
  // test that refits thirteen factors eighty times is one that times out when
  // the whole suite runs at once.
  const share = (rs: Respondent[]) => [rs.filter((r) => r.source === 'newsletter').length / rs.length]

  it('is the same for the same seed, and brackets the point estimate', () => {
    const a = bootstrap(crowd, share, 200, 5)!
    const b = bootstrap(crowd, share, 200, 5)!
    expect(a).toEqual(b)
    const point = share(crowd)[0]
    expect(a.lo[0]).toBeLessThanOrEqual(point)
    expect(a.hi[0]).toBeGreaterThanOrEqual(point)
  })

  it('gives an interval about as wide as theory says for a share of one half', () => {
    // With 500 respondents the standard error of a proportion near 0.5 is
    // about 0.022, so a 95% interval is about 0.088 wide.
    const { lo, hi } = bootstrap(crowd, share, 400, 9)!
    expect(hi[0] - lo[0]).toBeGreaterThan(0.06)
    expect(hi[0] - lo[0]).toBeLessThan(0.12)
  })

  it('has no interval to offer from almost no data', () => {
    expect(bootstrap(crowd.slice(0, 1), share, 40)).toBeNull()
  })
})
