import { describe, it, expect } from 'vitest'
import { shortDate, relativeTime, localDay, dayHeading } from '../frontend/src/format'

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

describe('localDay and dayHeading', () => {
  it('files an instant under the day on the reader\'s own calendar', () => {
    // Built from local parts so it means the same on every machine: noon on the
    // fifth is the fifth wherever the suite runs, and half past midnight on the
    // sixth is the sixth. `TZ=Pacific/Auckland npm test` is the check.
    expect(localDay(new Date(2026, 9, 5, 12, 0).toISOString())).toBe('2026-10-05')
    expect(localDay(new Date(2026, 9, 6, 0, 30).toISOString())).toBe('2026-10-06')
  })

  it('passes something unparseable through rather than throwing', () => {
    expect(localDay('not a date')).toBe('not a date')
  })

  it('calls today and yesterday by name', () => {
    expect(dayHeading('2026-10-07', '2026-10-07')).toBe('Today')
    expect(dayHeading('2026-10-06', '2026-10-07')).toBe('Yesterday')
  })

  it('finds yesterday across a month and a year boundary', () => {
    expect(dayHeading('2026-09-30', '2026-10-01')).toBe('Yesterday')
    expect(dayHeading('2025-12-31', '2026-01-01')).toBe('Yesterday')
  })

  it('gives the weekday and date, and the year only when it is not this one', () => {
    expect(dayHeading('2026-10-02', '2026-10-07')).toBe('Friday, October 2')
    expect(dayHeading('2025-10-02', '2026-10-07')).toBe('Thursday, October 2, 2025')
  })
})
