import { describe, it, expect } from 'vitest'
import {
  windowState,
  resolveApprovalStatus,
  plannedReminders,
  shouldPrepareNow,
  shiftDays,
  daysBetween,
} from '../src/lib/submissionWindow'

const TODAY = '2026-08-15'

describe('windowState', () => {
  it('is upcoming when the window opens in the future', () => {
    expect(windowState({ submissionOpensAt: '2026-11-01' }, TODAY)).toBe('upcoming')
  })

  it('is open once the opening date has arrived', () => {
    expect(windowState({ submissionOpensAt: '2026-08-15' }, TODAY)).toBe('open')
    expect(windowState({ submissionOpensAt: '2026-01-01', deadline: '2026-09-30' }, TODAY)).toBe(
      'open',
    )
  })

  it('falls back to the deadline as the closing date', () => {
    expect(windowState({ deadline: '2026-08-01' }, TODAY)).toBe('closed')
    expect(windowState({ deadline: '2026-09-01' }, TODAY)).toBe('open')
  })

  it('closed wins over a future opening date (stale data)', () => {
    expect(
      windowState({ submissionOpensAt: '2026-11-01', submissionClosesAt: '2026-07-01' }, TODAY),
    ).toBe('closed')
  })

  it('is unknown with no dates at all', () => {
    expect(windowState({}, TODAY)).toBe('unknown')
  })
})

describe('resolveApprovalStatus', () => {
  it('files a not-yet-open festival for submission later', () => {
    expect(resolveApprovalStatus({ submissionOpensAt: '2026-12-01' }, TODAY)).toBe(
      'awaiting_window',
    )
  })

  it('approves outright when the window is open or unknown', () => {
    expect(resolveApprovalStatus({ submissionOpensAt: '2026-08-01' }, TODAY)).toBe('approved')
    expect(resolveApprovalStatus({}, TODAY)).toBe('approved')
    expect(resolveApprovalStatus({ deadline: '2026-10-01' }, TODAY)).toBe('approved')
  })
})

describe('plannedReminders', () => {
  it('schedules a heads-up, an opening-day email, and a deadline nudge', () => {
    const planned = plannedReminders(
      { submissionOpensAt: '2026-10-01', deadline: '2026-12-01' },
      TODAY,
    )
    expect(planned).toEqual([
      { reminderType: 'window_soon', scheduledFor: '2026-09-24' },
      { reminderType: 'window_opens', scheduledFor: '2026-10-01' },
      { reminderType: 'pre_deadline', scheduledFor: '2026-11-24' },
    ])
  })

  it('drops the heads-up when the window opens within the lead time', () => {
    const planned = plannedReminders({ submissionOpensAt: '2026-08-18' }, TODAY)
    expect(planned).toEqual([{ reminderType: 'window_opens', scheduledFor: '2026-08-18' }])
  })

  it('nudges on the deadline itself when it is closer than the lead time', () => {
    const planned = plannedReminders({ deadline: '2026-08-18' }, TODAY)
    expect(planned).toEqual([{ reminderType: 'pre_deadline', scheduledFor: '2026-08-18' }])
  })

  it('schedules nothing for a deadline already past', () => {
    expect(plannedReminders({ deadline: '2026-08-01' }, TODAY)).toEqual([])
  })
})

describe('shouldPrepareNow', () => {
  it('waits until the window is within the lead time', () => {
    expect(shouldPrepareNow({ submissionOpensAt: '2027-03-01' }, TODAY)).toBe(false)
    expect(shouldPrepareNow({ submissionOpensAt: '2026-09-01' }, TODAY)).toBe(true)
  })

  it('skips login-gated forms and anything already resolved', () => {
    expect(shouldPrepareNow({ deadline: '2026-10-01', loginRequired: 1 }, TODAY)).toBe(false)
    expect(shouldPrepareNow({ deadline: '2026-10-01', prepStatus: 'ready' }, TODAY)).toBe(false)
    expect(shouldPrepareNow({ deadline: '2026-10-01', prepStatus: 'blocked' }, TODAY)).toBe(false)
  })

  it('skips windows that have already closed', () => {
    expect(shouldPrepareNow({ deadline: '2026-08-01' }, TODAY)).toBe(false)
  })
})

describe('date helpers', () => {
  it('shifts across month boundaries without timezone drift', () => {
    expect(shiftDays('2026-03-01', -7)).toBe('2026-02-22')
    expect(shiftDays('2026-12-28', 5)).toBe('2027-01-02')
  })

  it('counts days between dates', () => {
    expect(daysBetween('2026-08-15', '2026-08-22')).toBe(7)
    expect(daysBetween('2026-08-22', '2026-08-15')).toBe(-7)
  })
})
