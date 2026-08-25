import { describe, it, expect } from 'vitest'
import { shortDate } from '../frontend/src/format'

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
