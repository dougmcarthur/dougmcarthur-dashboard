import { describe, it, expect } from 'vitest'
import {
  alignedSentence,
  buildFindings,
  buildPublicResults,
  critical,
  FACTOR_LABELS,
  notableMove,
  ordinal,
  PUBLISH_FLOOR,
  publishBlockers,
  RATIO_NARROW,
  SAY_DO,
  SAY_DO_MIN,
  neitherSentence,
  timingSentence,
  VALUE_GROUPS,
  valueSentence,
  type PublicFactor,
  type PublicResults,
} from '../shared/surveyPublic'
import { analyseRanking, MIN_GROUP, type Respondent } from '../shared/surveyAnalysis'
import { FACTORS, questionOf, type ChoiceQuestion } from '../shared/surveyInstrument'
import { B4_TRUTH, CHOICE_TRUTH, RANK_TRUTH, simulateFull } from './support/surveyFixtures'

/**
 * The public page's numbers, checked three ways: against preferences planted in
 * simulated artists, against the rules the notice promised (nothing under ten,
 * nothing identifying), and by reading the sentences it writes.
 *
 * The sentences matter most. The headline on a results page is the one thing
 * everybody reads, so each rule here is a way it could be firmer than the data.
 */

const NOW = '2026-11-01T12:00:00.000Z'
const artists = (n: number, from = 1): Respondent[] => Array.from({ length: n }, (_, i) => simulateFull(from + i))
const ALL = artists(140)
const RESULTS = buildPublicResults(ALL, { now: NOW })

function spearman(a: number[], b: number[]): number {
  const ranks = (xs: number[]) => xs.map((x) => xs.filter((y) => y > x).length + 1)
  const ra = ranks(a)
  const rb = ranks(b)
  const n = a.length
  return 1 - (6 * ra.reduce((s, r, i) => s + (r - rb[i]) ** 2, 0)) / (n * (n * n - 1))
}

/** Replaces one answer on every respondent, to set up a group of exactly the size a rule is about. */
function withAnswers(rs: Respondent[], id: string, values: string[]): Respondent[] {
  return rs.map((r, i) => ({ ...r, answers: { ...r.answers, [id]: { value: values[i % values.length] } } }))
}
const repeat = (value: string, n: number) => Array.from({ length: n }, () => value)

describe('the ranking, against preferences planted in 140 simulated artists', () => {
  const rows = RESULTS.ranking!
  const byId = new Map(rows.map((r) => [r.id, r]))

  it('puts the factors in the order they were planted in, and names the extremes', () => {
    const truth = FACTORS.map((f) => RANK_TRUTH[FACTORS.indexOf(f)])
    const found = FACTORS.map((f) => byId.get(f.id)!.score)
    expect(spearman(truth, found)).toBeGreaterThan(0.95)
    expect(rows[0].id).toBe('f01')
    expect(rows[rows.length - 1].id).toBe('f13')
  })

  it('agrees with the owner’s model on the order, so the two pages cannot tell different stories', () => {
    const model = analyseRanking(ALL)!
    const share = FACTORS.map((f) => model.rows.find((r) => r.id === f.id)!.share)
    const score = FACTORS.map((f) => byId.get(f.id)!.score)
    expect(spearman(share, score)).toBeGreaterThan(0.95)
  })

  it('calls a factor above or below only when its whole interval is', () => {
    for (const r of rows) {
      expect(r.band, r.id).toBe(r.lo > 0 ? 'above' : r.hi < 0 ? 'below' : 'about')
      expect(r.lo).toBeLessThanOrEqual(r.score)
      expect(r.hi).toBeGreaterThanOrEqual(r.score)
    }
    expect(byId.get('f01')!.band).toBe('above')
    expect(byId.get('f13')!.band).toBe('below')
    expect(rows.some((r) => r.band === 'about')).toBe(true)
  })

  it('takes its spread from the artists, so fewer artists means a wider interval', () => {
    const width = (rs: Respondent[]) => {
      const r = buildPublicResults(rs, { now: NOW }).ranking!.find((x) => x.id === 'f01')!
      return r.hi - r.lo
    }
    expect(width(artists(40))).toBeGreaterThan(width(artists(140)))
  })

  it('reproduces one factor’s interval from the raw answers, by hand', () => {
    // Each artist scored once for the factor, over the screens they were shown it on.
    const xs: number[] = []
    for (const r of ALL) {
      let shown = 0
      let net = 0
      for (const t of r.plan.rank) {
        const a = r.answers[t.id] as { best: string; worst: string }
        if (t.items.includes('f01')) shown++
        if (a.best === 'f01') net++
        if (a.worst === 'f01') net--
      }
      if (shown) xs.push(net / shown)
    }
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / (xs.length - 1))
    const half = critical(xs.length - 1) * (sd / Math.sqrt(xs.length))
    const f01 = byId.get('f01')!
    expect(f01.artists).toBe(xs.length)
    expect(f01.score).toBeCloseTo(mean, 10)
    expect(f01.lo).toBeCloseTo(mean - half, 10)
    expect(f01.hi).toBeCloseTo(mean + half, 10)
  })

  it('has a short label for every factor, and none says "Scout"', () => {
    for (const f of FACTORS) expect(FACTOR_LABELS[f.id], f.id).toBeTruthy()
    expect(JSON.stringify(FACTOR_LABELS)).not.toMatch(/scout/i)
  })
})

describe('the critical value', () => {
  it('is the normal one for a large sample and larger for a small one', () => {
    expect(critical(1000)).toBeCloseTo(1.96, 2)
    expect(critical(29)).toBeGreaterThan(2.03)
    expect(critical(29)).toBeLessThan(2.06)
    expect(critical(9)).toBeGreaterThan(critical(29))
    expect(critical(0)).toBe(Infinity)
  })
})

describe('what it is worth in dollars, against what was planted', () => {
  const planted: Record<string, number> = {
    'audience 500 vs 100': (CHOICE_TRUTH[3] / CHOICE_TRUTH[0]) * 1000,
    'audience 2,000 vs 100': (CHOICE_TRUTH[4] / CHOICE_TRUTH[0]) * 1000,
    'audience 10,000 vs 100': (CHOICE_TRUTH[5] / CHOICE_TRUTH[0]) * 1000,
    'some industry vs few': (CHOICE_TRUTH[6] / CHOICE_TRUTH[0]) * 1000,
    'many industry vs few': (CHOICE_TRUTH[7] / CHOICE_TRUTH[0]) * 1000,
    'application 1 hour vs 15 minutes': (CHOICE_TRUTH[8] / CHOICE_TRUTH[0]) * 1000,
    'application 3 hours vs 15 minutes': (CHOICE_TRUTH[9] / CHOICE_TRUTH[0]) * 1000,
  }

  it('has a phrase for each value that can be the subject of a sentence: no comma to leave its verb dangling', () => {
    for (const v of RESULTS.choices!.values) {
      // A comma inside a number ("10,000") is fine; one between clauses is not.
      expect(v.phrase, v.key).not.toMatch(/,(?!\d{3})/)
      expect(v.phrase.length, v.key).toBeGreaterThan(10)
    }
  })

  it('carries every value, each range holding the planted figure', () => {
    const values = RESULTS.choices!.values
    expect(values).toHaveLength(7)
    for (const v of values) {
      expect(v.lo, v.key).toBeLessThanOrEqual(planted[v.key])
      expect(v.hi, v.key).toBeGreaterThanOrEqual(planted[v.key])
      expect(v.clear).toBe(v.lo > 0 || v.hi < 0)
      expect(Object.keys(VALUE_GROUPS)).toContain(v.group)
    }
  })

  it('does not call an entry fee "about a dollar" when the range runs from nothing to three dollars', () => {
    const fee = RESULTS.choices!.ratios.find((r) => r.key === 'fee')!
    expect(fee.hi - fee.lo).toBeGreaterThan(RATIO_NARROW)
    expect(fee.verdict).toBe('unclear')
    expect(RESULTS.findings.join(' ')).not.toMatch(/entry fee/i)
  })

  it('calls a travel dollar about a dollar when the range is narrow around one', () => {
    const travel = RESULTS.choices!.ratios.find((r) => r.key === 'travel')!
    expect(travel.hi - travel.lo).toBeLessThanOrEqual(RATIO_NARROW)
    expect(travel.verdict).toBe('same')
  })

  it('says nothing in dollars when pay cannot be told from zero', () => {
    // Everyone answers Neither: nothing separates pay from nothing.
    const flat = ALL.map((r) => ({
      ...r,
      answers: Object.fromEntries(Object.entries(r.answers).map(([k, v]) => [k, 'choice' in v ? { choice: 'none' as const } : v])),
    }))
    const out = buildPublicResults(flat, { now: NOW })
    expect(out.choices).toBeNull()
    expect(out.neither).not.toBeNull()
  })
})

describe('what may be named', () => {
  const tagged = artists(60).map((r, i) => ({ ...r, source: `zz-channel-${i}` }))
  const json = JSON.stringify(buildPublicResults(tagged, { now: NOW }))

  it('names no response, no channel and no free-text answer', () => {
    for (const r of tagged) expect(json).not.toContain(r.id)
    expect(json).not.toContain('zz-channel')
    expect(json).not.toContain('PRIVATE-NOTE')
  })

  it('describes nobody by age, gender, community or income', () => {
    for (const marker of ['Under 25', 'Prefer not to say', 'Indigenous', 'Newcomer', 'New to Canada', '$50,000', 'Woman', 'Non-binary', 'Francophone']) {
      expect(json, marker).not.toContain(marker)
    }
    const out = buildPublicResults(tagged, { now: NOW })
    expect(out.sample.map((q) => q.id)).toEqual(['A1', 'A2', 'A3', 'A5'])
    expect([out.stop?.id, out.apply?.id, out.find?.id]).toEqual(['B4', 'B5', 'B3'])
  })

  it('shows no group of fewer than ten, and says only that fewer than ten are combined', () => {
    // 40 artists: 20 and 10 are shown; 6 and 4 are not, and together they are exactly ten.
    const rs = withAnswers(artists(40), 'B4', [...repeat('B4.pay', 20), ...repeat('B4.fit', 10), ...repeat('B4.travel', 6), ...repeat('B4.dates', 4)])
    const stop = buildPublicResults(rs, { now: NOW }).stop!
    expect(stop.bars.map((b) => b.id)).toEqual(['B4.pay', 'B4.fit', 'B4.small'])
    expect(stop.bars.find((b) => b.id === 'B4.small')!.share).toBeCloseTo(10 / 40, 10)

    // Combined, still under ten: the row stays and its size does not.
    const fewer = withAnswers(artists(40), 'B4', [...repeat('B4.pay', 34), ...repeat('B4.fit', 4), ...repeat('B4.travel', 2)])
    const hidden = buildPublicResults(fewer, { now: NOW }).stop!
    expect(hidden.bars.find((b) => b.id === 'B4.small')!.share).toBeNull()
    expect(hidden.bars.map((b) => b.id)).not.toContain('B4.fit')
  })

  it('never shows a group under ten, in any question', () => {
    for (const q of [...RESULTS.sample, RESULTS.stop!, RESULTS.apply!, RESULTS.find!]) {
      for (const b of q.bars) if (b.share !== null) expect(Math.round(b.share * q.base), `${q.id} ${b.label}`).toBeGreaterThanOrEqual(MIN_GROUP)
    }
  })

  it('does not add up small options of a multiple-choice question, where one artist may be in several', () => {
    const find = RESULTS.find!
    expect(find.multi).toBe(true)
    expect(find.bars.some((b) => b.kind === 'small')).toBe(false)
    expect(find.hidden).toBeGreaterThan(0)
  })

  it('keeps ordered answers in the order they were asked, and the rest by size', () => {
    const years = RESULTS.sample.find((q) => q.id === 'A2')!
    const asked = (questionOf('A2') as ChoiceQuestion).options.map((o) => o.id)
    const order = years.bars.filter((b) => b.kind !== 'small').map((b) => asked.indexOf(b.id))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    const where = RESULTS.sample.find((q) => q.id === 'A1')!.bars.map((b) => b.share ?? 0)
    expect(where).toEqual([...where].sort((a, b) => b - a))
  })

  it('puts "other" and "none" answers last, whatever their size', () => {
    const rs = withAnswers(artists(40), 'B4', [...repeat('B4.other', 22), ...repeat('B4.pay', 18)])
    const bars = buildPublicResults(rs, { now: NOW }).stop!.bars
    expect(bars.map((b) => b.id)).toEqual(['B4.pay', 'B4.other'])
  })
})

describe('when it may be published at all', () => {
  it('needs thirty completed responses, and says how many are in', () => {
    expect(publishBlockers(artists(PUBLISH_FLOOR - 1))).toHaveLength(1)
    expect(publishBlockers(artists(PUBLISH_FLOOR - 1))[0]).toMatch(/Only 29 completed responses are in/)
    expect(publishBlockers(artists(PUBLISH_FLOOR))).toEqual([])
    expect(publishBlockers([])[0]).toMatch(/Only 0 completed responses are in/)
  })

  it('counts the artists who remain once the flagged are left out', () => {
    const flagged = (n: number) => Array.from({ length: n }, (_, i) => simulateFull(500 + i, { failCheck: true }))

    // Thirty in all, four of them flagged: enough while everybody counts, too few once they are left out.
    const short = [...artists(PUBLISH_FLOOR - 4), ...flagged(4)]
    expect(short).toHaveLength(PUBLISH_FLOOR)
    expect(publishBlockers(short, { failedCheck: false })).toEqual([])
    expect(publishBlockers(short, { failedCheck: true })).toHaveLength(1)
    expect(publishBlockers(short, { failedCheck: true })[0]).toMatch(/Only 26 completed responses are in/)

    // Thirty remain after three are left out.
    expect(publishBlockers([...artists(PUBLISH_FLOOR), ...flagged(3)], { failedCheck: true })).toEqual([])
  })

  it('counts only completed responses', () => {
    const unfinished = artists(PUBLISH_FLOOR).map((r) => ({ ...r, status: 'in_progress' }))
    expect(publishBlockers(unfinished)).toHaveLength(1)
  })
})

describe('the snapshot as a record', () => {
  it('says what it rests on, and that it is early below the target', () => {
    expect(RESULTS.n).toBe(140)
    expect(RESULTS.early).toBe(false)
    expect(RESULTS.leftOut).toEqual({ count: 0, failedCheck: false, speeders: false })
    expect(buildPublicResults(artists(60), { now: NOW }).early).toBe(true)
  })

  it('reports who was left out when it leaves anyone out', () => {
    const rs = [...artists(50), ...Array.from({ length: 4 }, (_, i) => simulateFull(700 + i, { failCheck: true }))]
    const out = buildPublicResults(rs, { now: NOW, exclusions: { failedCheck: true } })
    expect(out.n).toBe(50)
    expect(out.leftOut).toEqual({ count: 4, failedCheck: true, speeders: false })
  })

  it('is the same on a second build, apart from when it was built', () => {
    const again = buildPublicResults(ALL, { now: '2027-01-01T00:00:00.000Z' })
    const { publishedAt: a, ...rest } = RESULTS
    const { publishedAt: b, ...other } = again
    expect(a).not.toBe(b)
    expect(other).toEqual(rest)
  })

  it('is small enough to store in a settings row and read in one request', () => {
    expect(JSON.stringify(RESULTS).length).toBeLessThan(40_000)
  })

  it('writes its dates as days, from the responses and not from the clock', () => {
    expect(RESULTS.collected).toEqual({ from: '2026-10-05', to: '2026-10-05' })
  })
})

describe('what was said, against what was done', () => {
  const sd = RESULTS.sayDo!

  it('compares only the reasons that at least ten artists gave, and counts the rest', () => {
    expect(sd.rows.length).toBeGreaterThanOrEqual(SAY_DO_MIN)
    expect(sd.rows.length + sd.hidden).toBe(SAY_DO.length)
    for (const r of sd.rows) expect(Math.round(r.share * RESULTS.stop!.base)).toBeGreaterThanOrEqual(MIN_GROUP)
  })

  it('ranks both lists among the same items, one to n', () => {
    const n = sd.rows.length
    expect(sd.rows.map((r) => r.say).sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
    expect(sd.rows.map((r) => r.doing).sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
  })

  it('puts the most-cited reason first, the way B4 was planted', () => {
    const top = Object.entries(B4_TRUTH).sort((a, b) => b[1] - a[1])[0][0]
    expect(sd.rows.find((r) => r.doing === 1)!.id).toBe(SAY_DO.find(([, reason]) => reason === `B4.${top}`)![0])
  })

  it('is left out when fewer than three comparable reasons are visible', () => {
    const rs = withAnswers(artists(40), 'B4', [...repeat('B4.pay', 25), ...repeat('B4.fit', 15)])
    expect(buildPublicResults(rs, { now: NOW }).sayDo).toBeNull()
  })

  it('breaks a tie by what was said, so lines do not cross for nothing', () => {
    const rs = withAnswers(artists(30), 'B4', [...repeat('B4.pay', 10), ...repeat('B4.fit', 10), ...repeat('B4.travel', 10)])
    const rows = buildPublicResults(rs, { now: NOW }).sayDo!.rows
    expect(rows.map((r) => r.say)).toEqual([...rows.map((r) => r.say)].sort((a, b) => a - b))
  })
})

// ── The sentences ─────────────────────────────────────────────────────────────

const factor = (id: string, rank: number, score: number, lo: number, hi: number): PublicFactor => ({
  id,
  label: FACTOR_LABELS[id],
  text: id,
  score,
  lo,
  hi,
  rank,
  band: lo > 0 ? 'above' : hi < 0 ? 'below' : 'about',
  artists: 100,
})

function shell(over: Partial<Omit<PublicResults, 'findings'>>): Omit<PublicResults, 'findings'> {
  return {
    version: 1,
    instrument: 'x',
    publishedAt: NOW,
    collected: { from: '2026-10-01', to: '2026-10-20' },
    n: 100,
    target: 125,
    early: true,
    leftOut: { count: 0, failedCheck: false, speeders: false },
    ranking: null,
    neither: null,
    choices: null,
    sayDo: null,
    stop: null,
    apply: null,
    find: null,
    sample: [],
    ...over,
  }
}

describe('the headline about what matters most', () => {
  it('says so plainly when one thing is clear of the rest', () => {
    const ranking = [factor('f01', 1, 0.5, 0.4, 0.6), factor('f02', 2, 0.1, 0.0, 0.2), factor('f03', 3, -0.2, -0.3, -0.1)]
    expect(buildFindings(shell({ ranking }))[0]).toBe('Artists put pay if selected ahead of everything else.')
  })

  it('says the leaders cannot be separated when their ranges overlap', () => {
    const ranking = [factor('f01', 1, 0.5, 0.35, 0.65), factor('f08', 2, 0.45, 0.3, 0.6), factor('f13', 3, -0.5, -0.6, -0.4)]
    expect(buildFindings(shell({ ranking }))[0]).toBe('Artists put pay if selected and fit with the music at the top, and the answers cannot separate them.')
  })

  it('declines to name a winner when more than three are tied', () => {
    const ranking = ['f01', 'f02', 'f03', 'f04', 'f05'].map((id, i) => factor(id, i + 1, 0.3 - i * 0.01, -0.1, 0.5))
    const first = buildFindings(shell({ ranking }))[0]
    expect(first).toMatch(/No single thing stands clear/)
    expect(first).not.toMatch(/pay if selected/)
  })

  it('names what mattered least only when it is clearly below, and no more than three', () => {
    const clear = [factor('f01', 1, 0.5, 0.4, 0.6), factor('f13', 2, -0.4, -0.5, -0.3)]
    expect(buildFindings(shell({ ranking: clear }))[1]).toBe('A proper set mattered least.')

    const murky = [factor('f01', 1, 0.5, 0.4, 0.6), factor('f13', 2, -0.1, -0.3, 0.1)]
    expect(buildFindings(shell({ ranking: murky })).join(' ')).not.toMatch(/mattered least/)
  })
})

describe('the sentences about money', () => {
  const value = (key: string, group: 'audience' | 'industry' | 'effort', label: string, phrase: string, v: number, lo: number, hi: number) => ({
    key,
    group,
    label,
    phrase,
    value: v,
    lo,
    hi,
    clear: lo > 0 || hi < 0,
  })
  const ratio = (key: 'fee' | 'travel', v: number, lo: number, hi: number, verdict: 'more' | 'less' | 'same' | 'unclear') => ({
    key,
    label: key,
    value: v,
    lo,
    hi,
    verdict,
  })

  it('reports the biggest clear value, as worth something or as a cost', () => {
    const aud = value('a', 'audience', 'About 10,000', 'an audience of about 10,000 rather than about 100', 1108, 837, 1379)
    const eff = value('e', 'effort', 'About 3 hours', 'an application that takes 3 hours rather than 15 minutes', -1500, -1800, -1200)
    expect(valueSentence({ values: [aud], ratios: [] })).toBe(
      'An audience of about 10,000 rather than about 100 is worth about $1,110 of pay to the artists who answered.',
    )
    expect(valueSentence({ values: [aud, eff], ratios: [] })).toBe(
      'An application that takes 3 hours rather than 15 minutes costs the artists who answered about $1,500 of pay.',
    )
  })

  it('ignores a value whose range includes zero, however big', () => {
    const wobbly = value('a', 'audience', 'About 500', 'an audience of about 500 rather than about 100', 900, -200, 2000)
    expect(valueSentence({ values: [wobbly], ratios: [] })).toBeNull()
  })

  it('says each verdict on an entry fee in its own words, and nothing when it is unclear', () => {
    const say = (verdict: 'more' | 'less' | 'same' | 'unclear', v: number) =>
      buildFindings(shell({ choices: { values: [], ratios: [ratio('fee', v, 0, 1, verdict)] } }))[0]
    expect(say('more', 1.5)).toBe('A dollar of entry fee weighs as much as $1.50 of pay, so fees cost artists more than their face value.')
    expect(say('less', 0.5)).toBe('A dollar of entry fee weighs less than a dollar of pay ($0.50).')
    expect(say('same', 1)).toBe('Artists weigh a dollar of entry fee about the same as a dollar of pay.')
    expect(say('unclear', 0.5)).toBeUndefined()
  })

  it('reports the share who turned down both options', () => {
    expect(neitherSentence(0.234)).toBe('Shown two made-up opportunities, artists turned down both 23% of the time.')
    expect(neitherSentence(null)).toBeNull()
  })
})

describe('the sentence about saying and doing', () => {
  const rows = (pairs: Array<[string, number, number]>) => ({
    rows: pairs.map(([id, say, doing]) => ({ id, label: FACTOR_LABELS[id], say, doing, rank: say, share: 0.2 })),
    hidden: 0,
  })

  it('is written when something moved by a third of the list or more', () => {
    const sayDo = rows([['f01', 6, 1], ['f02', 1, 2], ['f03', 2, 3], ['f04', 3, 4], ['f05', 4, 5], ['f06', 5, 6]])
    expect(buildFindings(shell({ sayDo }))[0]).toBe(
      'Pay if selected ranks 6th of 6 when artists are asked what matters, but 1st of 6 among the reasons they actually passed on an opportunity.',
    )
  })

  it('is not written when nothing moved far, and the page says they line up instead', () => {
    const sayDo = rows([['f01', 1, 1], ['f02', 2, 2], ['f03', 3, 3], ['f04', 4, 4]])
    const found = buildFindings(shell({ sayDo }))
    expect(found.join(' ')).not.toMatch(/when artists are asked what matters, but/)
    expect(found).toEqual(['What artists say matters lines up with what actually stopped them, among the four reasons that enough artists gave.'])
  })

  it('treats a swap of neighbours as lining up, and says nothing of a list too short to judge', () => {
    // Six items with one pair of neighbours swapped: nothing is more than a place out.
    const swapped = rows([['f01', 1, 1], ['f02', 2, 3], ['f03', 3, 2], ['f04', 4, 4], ['f05', 5, 5], ['f06', 6, 6]])
    expect(buildFindings(shell({ sayDo: swapped }))).toHaveLength(1)
    // Three items is too few for "lines up" to mean anything, and a swap is not a mover.
    const short = rows([['f01', 1, 2], ['f02', 2, 1], ['f03', 3, 3]])
    expect(buildFindings(shell({ sayDo: short }))).toEqual([])
  })

  it('asks for a bigger move from a longer list, and never less than two', () => {
    expect(notableMove(3)).toBe(2)
    expect(notableMove(5)).toBe(2)
    expect(notableMove(6)).toBe(2)
    expect(notableMove(7)).toBe(3)
    expect(notableMove(11)).toBe(4)
  })
})

describe('the sentences about what artists did', () => {
  const bar = (id: string, label: string, share: number | null, kind?: 'other' | 'none' | 'small') => ({ id, label, share, ...(kind ? { kind } : {}) })
  const q = (id: string, bars: ReturnType<typeof bar>[]) => ({ id, title: id, question: id, base: 100, multi: false, bars, hidden: 0 })

  it('quotes the most common reason for passing, skipping "other" and the combined row', () => {
    const stop = q('B4', [bar('B4.pay', 'The pay was too low', 0.264), bar('B4.other', 'Other (please specify)', 0.3, 'other')])
    expect(buildFindings(shell({ stop }))[0]).toBe('When asked about the last opportunity they passed on, 26% of artists said “The pay was too low”, the most common reason.')
    expect(buildFindings(shell({ stop: q('B4', [bar('B4.small', 'Smaller groups, combined', 0.4, 'small')]) }))).toEqual([])
  })

  it('says how most artists find opportunities', () => {
    const find = q('B3', [bar('B3.peers', 'Other artists or friends', 0.7)])
    expect(buildFindings(shell({ find }))[0]).toBe('70% of artists find opportunities through other artists or friends, the most common route.')
  })
})

describe('the sentence about timing', () => {
  const bar = (id: string, label: string, share: number | null) => ({ id, label, share })
  const stop = (...bars: ReturnType<typeof bar>[]) => ({ id: 'B4', title: 'B4', question: 'B4', base: 100, multi: false, bars, hidden: 0 })

  it('adds the two reasons that are about timing, when both are big enough to show', () => {
    const s = timingSentence(stop(bar('B4.dates', 'dates', 0.16), bar('B4.late', 'late', 0.1)))
    expect(s).toBe('26% of artists passed on their last opportunity because of timing, not the opportunity itself: the dates did not work, or they heard about it too late.')
  })

  it('names the one reason it can see, and does not borrow a hidden group to make the sum', () => {
    expect(timingSentence(stop(bar('B4.dates', 'dates', 0.16), bar('B4.late', 'late', null)))).toBe(
      '16% of artists passed on their last opportunity because the dates did not work, which is about timing and not about the opportunity itself.',
    )
    expect(timingSentence(stop(bar('B4.late', 'late', 0.12)))).toMatch(/because they missed the deadline or heard about it too late/)
  })

  it('says nothing when neither is big enough to show', () => {
    expect(timingSentence(stop(bar('B4.pay', 'pay', 0.5)))).toBeNull()
    expect(timingSentence(null)).toBeNull()
  })

  it('is in the list of findings, after what leads and before the most common reason', () => {
    const f = RESULTS.findings
    const timing = f.findIndex((s) => /because of timing/.test(s) || /about timing/.test(s))
    const reason = f.findIndex((s) => /the most common reason/.test(s))
    expect(timing).toBeGreaterThan(-1)
    expect(timing).toBeLessThan(reason)
  })
})

describe('the sentence about saying and doing lining up', () => {
  const rows = (pairs: Array<[string, number, number]>) => ({
    rows: pairs.map(([id, say, doing]) => ({ id, label: FACTOR_LABELS[id], say, doing, rank: say, share: 0.2 })),
    hidden: 0,
  })

  it('is said when nothing is more than one place out, among at least four', () => {
    expect(alignedSentence(rows([['f01', 1, 1], ['f02', 2, 3], ['f03', 3, 2], ['f04', 4, 4]]))).toBe(
      'What artists say matters lines up with what actually stopped them, among the four reasons that enough artists gave.',
    )
  })

  it('is not said of a short list, or when anything is two places out', () => {
    expect(alignedSentence(rows([['f01', 1, 1], ['f02', 2, 2], ['f03', 3, 3]]))).toBeNull()
    expect(alignedSentence(rows([['f01', 1, 3], ['f02', 2, 2], ['f03', 3, 1], ['f04', 4, 4]]))).toBeNull()
    expect(alignedSentence(null)).toBeNull()
  })

  it('does not appear alongside a mover, which says the opposite', () => {
    const moved = rows([['f01', 4, 1], ['f02', 1, 2], ['f03', 2, 3], ['f04', 3, 4]])
    expect(alignedSentence(moved)).toBeNull()
  })
})

describe('every sentence', () => {
  const sentences = RESULTS.findings

  it('exists, and is a sentence', () => {
    expect(sentences.length).toBeGreaterThanOrEqual(4)
    expect(sentences.length).toBeLessThanOrEqual(8)
    for (const s of sentences) expect(s, s).toMatch(/^[A-Z0-9“].*[.”]$/)
  })

  it('has no placeholder, no NaN and no raw number from a failed calculation', () => {
    for (const s of sentences) expect(s, s).not.toMatch(/undefined|NaN|null|Infinity|\[object|\{|\}/)
  })

  it('reads as a sentence for every size of sample, with no em dash and no comma before the verb', () => {
    // 45 artists once produced "Many people there who could hire them again, rather than few is worth ...".
    for (const n of [30, 45, 60, 100, 140]) {
      const built = buildPublicResults(artists(n), { now: NOW })
      // The value and "turned down both" sentences are cards and headlines, not in the list, and they are the ones that broke.
      const all = [...built.findings, valueSentence(built.choices), neitherSentence(built.neither)].filter((x): x is string => x !== null)
      for (const s of all) {
        expect(s, `${n}: ${s}`).not.toContain('\u2014')
        expect(s, `${n}: ${s}`).not.toMatch(/, rather than \w+ (is|costs)\b/)
        expect(s, `${n}: ${s}`).not.toMatch(/\s{2,}|\s[,.]/)
      }
    }
  })

  it('never says "Scout" on its own, and never calls anybody by an id', () => {
    for (const s of sentences) {
      expect(s).not.toMatch(/scout/i)
      expect(s).not.toMatch(/\bf\d{2}\b|\bB\d\./)
    }
  })

  it('is built from the same bands as the chart, not apart from them', () => {
    const top = RESULTS.ranking!.filter((r) => r.hi >= RESULTS.ranking![0].lo)
    const sentence = sentences[0].toLowerCase()
    for (const r of top.slice(0, 3)) expect(sentence).toContain(r.label.toLowerCase())
  })
})

describe('ordinals', () => {
  it('are right through the teens and the twenties', () => {
    const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 101, 111].map(ordinal)
    expect(got).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '101st', '111th'])
  })
})
