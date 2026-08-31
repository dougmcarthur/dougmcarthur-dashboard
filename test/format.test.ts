import { describe, it, expect } from 'vitest'
import { shortDate, relativeTime } from '../frontend/src/format'

const now = new Date('2026-08-24T12:00:00Z')

describe('shortDate', () => {
  it('drops the year for dates in the current year', () => {
    expect(shortDate('2026-08-12', now)).toBe('Aug 12')
    expect(shortDate('2026-07-31', now)).toBe('Jul 31')
  })

  it('keeps the year once it is not the current one', () => {
    expect(shortDate('2025-08-12', now)).toBe('Aug 12, 2025')
  })

  it('handles a full ISO timestamp, not just a date', () => {
    expect(shortDate('2026-08-05T09:30:00Z', now)).toBe('Aug 5')
  })

  it('passes an unparseable value through rather than rendering Invalid Date', () => {
    expect(shortDate('not a date', now)).toBe('not a date')
    expect(shortDate('', now)).toBe('')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-08-25T12:00:00.000Z')
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR

  it('reads the coarsest unit that is still true', () => {
    expect(relativeTime(ago(20 * SEC), now)).toBe('Just now')
    expect(relativeTime(ago(9 * MIN), now)).toBe('9m ago')
    expect(relativeTime(ago(3 * HOUR), now)).toBe('3h ago')
    expect(relativeTime(ago(1 * DAY), now)).toBe('Yesterday')
    expect(relativeTime(ago(4 * DAY), now)).toBe('4 days ago')
  })

  it('falls back to a date once "N days ago" stops being placeable', () => {
    expect(relativeTime(ago(23 * DAY), now)).toBe('Aug 2')
  })

  it('never reads as the future when the Worker clock runs ahead', () => {
    expect(relativeTime(new Date(now.getTime() + 3 * SEC).toISOString(), now)).toBe('Just now')
  })

  it('passes an unparseable value through rather than rendering Invalid Date', () => {
    expect(relativeTime('rolling intake', now)).toBe('rolling intake')
  })
})
