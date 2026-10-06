import { describe, it, expect } from 'vitest'
import { buildPublicResults, numberWord, type PublicResults, type PublicValue } from '../shared/surveyPublic'
import { heroLines, sentence } from '../frontend/src/pages/survey/results/hero'
import { simulateFull } from './support/surveyFixtures'

/**
 * The three cards at the top of the results page. Each is one whole sentence that
 * starts with a figure, because a figure with a caption under it reads, said
 * aloud, as the end of a sentence whose beginning is a number on another line.
 */

const NOW = '2026-11-01T12:00:00.000Z'
const BASE = buildPublicResults(Array.from({ length: 140 }, (_, i) => simulateFull(i + 1)), { now: NOW })
const with_ = (over: Partial<PublicResults>): PublicResults => ({ ...BASE, ...over })

const value = (label: string, phrase: string, v: number): PublicValue => ({
  key: label,
  group: 'effort',
  label,
  phrase,
  value: v,
  lo: v - 100,
  hi: v + 100,
  clear: true,
})

describe('the three cards', () => {
  it('say who took part and when, as a sentence', () => {
    expect(heroLines(with_({ collected: { from: '2026-10-05', to: '2026-10-26' } }))[0]).toEqual({
      figure: '140',
      rest: 'artists took part from October 5 to 26, 2026.',
    })
  })

  it('say "on" for one day, "from" for a span across months, and "artist" for one', () => {
    expect(sentence(heroLines(with_({ n: 1, collected: { from: '2026-10-05', to: '2026-10-05' } }))[0])).toBe('1 artist took part on October 5, 2026.')
    expect(sentence(heroLines(with_({ collected: { from: '2026-10-28', to: '2026-11-03' } }))[0])).toBe('140 artists took part from October 28 to November 3, 2026.')
  })

  it('say how often they turned down both options, as a sentence with its subject and verb', () => {
    expect(sentence(heroLines(with_({ neither: 0.234 }))[1])).toBe('23% of the time, artists shown two made-up opportunities turned down both.')
  })

  it('say what the biggest trade-off is worth, as something it is worth or costs', () => {
    const gain = value('About 10,000', 'an audience of about 10,000 rather than about 100', 1108)
    expect(sentence(heroLines(with_({ neither: null, choices: { values: [gain], ratios: [] } }))[1])).toBe(
      '$1,110 of pay is roughly what an audience of about 10,000 rather than about 100 is worth to these artists.',
    )

    const cost = value('About 3 hours', 'an application that takes 3 hours rather than 15 minutes', -492)
    expect(sentence(heroLines(with_({ neither: null, choices: { values: [cost], ratios: [] } }))[1])).toBe(
      '$490 of pay is roughly what an application that takes 3 hours rather than 15 minutes costs these artists.',
    )
  })

  it('are one, two or three cards, never one with nothing in it', () => {
    expect(heroLines(with_({ neither: null, choices: null }))).toHaveLength(1)
    expect(heroLines(with_({ neither: 0.2, choices: null }))).toHaveLength(2)
    expect(heroLines(BASE)).toHaveLength(3)
  })
})

describe('every card', () => {
  const lines = heroLines(BASE)

  it('is one sentence: it opens with its figure, carries on in lower case, and ends with a full stop', () => {
    for (const l of lines) {
      expect(l.figure, l.rest).toMatch(/^[\d$][\d,.$%]*$/)
      expect(l.rest, l.figure).toMatch(/^[a-z].*\.$/)
      expect(l.rest, l.figure).not.toMatch(/\.\s*\S.*\./)
      expect(sentence(l), l.figure).toMatch(/^[\d$].*\.$/)
    }
  })

  it('has a verb of its own, so it still reads as a sentence with the figure taken away', () => {
    for (const l of lines) expect(l.rest, l.figure).toMatch(/\b(took part|turned down|is roughly|is worth|costs)\b/)
  })

  it('has no em dash and never says "Scout"', () => {
    for (const l of lines) {
      expect(sentence(l)).not.toContain('\u2014')
      expect(sentence(l)).not.toMatch(/scout/i)
    }
  })
})

describe('small numbers in words', () => {
  it('spells out zero to ten and leaves the rest as digits, so no sentence opens on a numeral', () => {
    expect([0, 1, 2, 4, 7, 10, 11, 25].map(numberWord)).toEqual(['no', 'one', 'two', 'four', 'seven', 'ten', '11', '25'])
  })
})
