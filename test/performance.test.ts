import { describe, it, expect } from 'vitest'
import {
  isPlainDate,
  performanceDateProblem,
  showSpan,
  formatPerformanceSpan,
} from '../shared/performance'

describe('isPlainDate', () => {
  it('accepts a real ISO date', () => {
    expect(isPlainDate('2027-07-10')).toBe(true)
  })

  it('rejects a date that matches the shape but does not exist', () => {
    // The regex is happy with this one; the calendar would not be.
    expect(isPlainDate('2027-02-30')).toBe(false)
    expect(isPlainDate('2027-13-01')).toBe(false)
  })

  it('rejects prose, a timestamp, and nothing at all', () => {
    expect(isPlainDate('Rolling intake')).toBe(false)
    expect(isPlainDate('2027-07-10T19:30:00Z')).toBe(false)
    expect(isPlainDate(null)).toBe(false)
    expect(isPlainDate('')).toBe(false)
  })
})

describe('what is wrong with a pair of performance dates', () => {
  it('is nothing, for an empty pair or a single day or a run', () => {
    expect(performanceDateProblem(null, null)).toBeNull()
    expect(performanceDateProblem('2027-07-10', null)).toBeNull()
    expect(performanceDateProblem('2027-07-10', '2027-07-10')).toBeNull()
    expect(performanceDateProblem('2027-07-10', '2027-07-12')).toBeNull()
  })

  it('catches an end before its start', () => {
    expect(performanceDateProblem('2027-07-12', '2027-07-10')).toMatch(/ends before it starts/)
  })

  it('catches an end with no start, which is a half-finished edit', () => {
    expect(performanceDateProblem(null, '2027-07-12')).toMatch(/needs a start/)
  })

  it('names the field that is not a date', () => {
    expect(performanceDateProblem('July 10th', null)).toMatch(/start must be a date/)
    expect(performanceDateProblem('2027-07-10', 'the 12th')).toMatch(/end must be a date/)
  })
})

describe('the span written to the calendar', () => {
  it('ends the day after a one-day show, because Google’s end is exclusive', () => {
    expect(showSpan('2027-07-10', null)).toEqual({
      start: '2027-07-10',
      endExclusive: '2027-07-11',
    })
  })

  it('ends the day after the last day of a run', () => {
    expect(showSpan('2027-07-10', '2027-07-12')).toEqual({
      start: '2027-07-10',
      endExclusive: '2027-07-13',
    })
  })

  it('crosses a month and a year end correctly', () => {
    expect(showSpan('2027-07-31', '2027-07-31')?.endExclusive).toBe('2027-08-01')
    expect(showSpan('2027-12-31', null)?.endExclusive).toBe('2028-01-01')
  })

  it('is nothing at all when the pair is unusable', () => {
    // The reconcile in gigCalendar treats null as "delete the entry", so a bad
    // edit removes a stale show rather than leaving a wrong one on the calendar.
    expect(showSpan(null, null)).toBeNull()
    expect(showSpan(null, '2027-07-12')).toBeNull()
    expect(showSpan('2027-07-12', '2027-07-10')).toBeNull()
    expect(showSpan('sometime in July', null)).toBeNull()
  })
})

describe('how a span reads', () => {
  it('states the month and year once when both ends share them', () => {
    expect(formatPerformanceSpan('2027-07-10', '2027-07-12')).toBe('10–12 July 2027')
  })

  it('repeats the month across a month boundary', () => {
    expect(formatPerformanceSpan('2027-07-31', '2027-08-02')).toBe('31 July – 2 August 2027')
  })

  it('repeats everything across a year boundary', () => {
    expect(formatPerformanceSpan('2027-12-30', '2028-01-02')).toBe(
      '30 December 2027 – 2 January 2028',
    )
  })

  it('reads a one-day show as one day, however the end is given', () => {
    expect(formatPerformanceSpan('2027-07-10', null)).toBe('10 July 2027')
    expect(formatPerformanceSpan('2027-07-10', '2027-07-10')).toBe('10 July 2027')
  })

  it('is null when there is no start to show', () => {
    expect(formatPerformanceSpan(null, '2027-07-12')).toBeNull()
  })
})
