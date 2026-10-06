import { describe, it, expect } from 'vitest'
import { axisDollars, dateSpan, dollars, niceStep, pct, points, publishedOn, ticksBetween } from '../frontend/src/pages/survey/results/format'

/**
 * How the results page writes a number and a date. The date had a real bug:
 * asked for a day and a year with no month, the locale answers "2026 (day: 26)",
 * and the page printed it under the first figure.
 */

describe('dates', () => {
  it('writes one day, a span inside a month, across months and across years', () => {
    expect(dateSpan('2026-10-05', '2026-10-05')).toBe('Oct 5, 2026')
    expect(dateSpan('2026-10-05', '2026-10-26')).toBe('Oct 5 to 26, 2026')
    expect(dateSpan('2026-10-05', '2026-11-02')).toBe('Oct 5 to Nov 2, 2026')
    expect(dateSpan('2026-12-20', '2027-01-09')).toBe('Dec 20, 2026 to Jan 9, 2027')
  })

  it('spells the months out when it is going into a sentence', () => {
    expect(dateSpan('2026-10-05', '2026-10-26', true)).toBe('October 5 to 26, 2026')
    expect(dateSpan('2026-12-20', '2027-01-09', true)).toBe('December 20, 2026 to January 9, 2027')
    expect(dateSpan('2026-10-05', '2026-10-05', true)).toBe('October 5, 2026')
  })

  it('never prints the locale’s "day:" fallback, whatever the span', () => {
    for (const [a, b] of [['2026-10-05', '2026-10-26'], ['2026-01-01', '2026-01-02'], ['2026-03-31', '2026-04-01']]) {
      expect(dateSpan(a, b)).not.toMatch(/day:|\(/)
    }
  })

  it('reads a day as UTC, so the date does not move with the viewer’s time zone', () => {
    expect(dateSpan('2026-10-01', '2026-10-01')).toBe('Oct 1, 2026')
    expect(publishedOn('2026-10-06T04:32:31.979Z')).toBe('October 6, 2026')
  })
})

describe('numbers', () => {
  it('writes shares as whole percents', () => {
    expect(pct(0.264)).toBe('26%')
    expect(pct(0)).toBe('0%')
    expect(pct(1)).toBe('100%')
  })

  it('writes a score as signed points with a real minus sign, and zero as zero', () => {
    expect(points(0.43)).toBe('+43')
    expect(points(-0.38)).toBe('−38')
    expect(points(0)).toBe('0')
    expect(points(-0.004)).toBe('0')
  })

  it('writes dollars to the nearest ten, and a cost with a minus', () => {
    expect(dollars(1108)).toBe('$1,110')
    expect(dollars(-492)).toBe('−$490')
    expect(dollars(-3)).toBe('$0')
    expect(dollars(0)).toBe('$0')
  })
})

describe('axis labels', () => {
  it('are short enough to sit side by side on a phone', () => {
    expect(axisDollars(0)).toBe('$0')
    expect(axisDollars(500)).toBe('$500')
    expect(axisDollars(1000)).toBe('$1k')
    expect(axisDollars(1500)).toBe('$1.5k')
    expect(axisDollars(-1000)).toBe('−$1k')
    expect(axisDollars(-250)).toBe('−$250')
  })
})

describe('axes', () => {
  it('picks the first step that is big enough, or the last', () => {
    expect(niceStep(420, [50, 100, 200, 250, 500, 1000])).toBe(500)
    expect(niceStep(9999, [50, 100])).toBe(100)
    expect(niceStep(0.35, [0.2, 0.3, 0.4])).toBe(0.4)
  })

  it('lays ticks evenly from one end to the other, including both', () => {
    expect(ticksBetween(-1000, 1500, 500)).toEqual([-1000, -500, 0, 500, 1000, 1500])
    expect(ticksBetween(-0.4, 0.4, 0.2)).toEqual([-0.4, -0.2, 0, 0.2, 0.4])
  })
})
