import { describe, it, expect } from 'vitest'
import {
  windowState,
  resolveApprovalStatus,
  plannedReminders,
  shouldPrepareNow,
  isPrepTerminal,
  isPrepRetryDue,
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
  // The window-opening email is raised by the prep run once there are answers
  // to review, not scheduled up front for a date when nothing exists yet.
  it('schedules only the deadline nudge at approval time', () => {
    const planned = plannedReminders(
      { submissionOpensAt: '2026-10-01', deadline: '2026-12-01' },
      TODAY,
    )
    expect(planned).toEqual([{ reminderType: 'pre_deadline', scheduledFor: '2026-11-24' }])
  })

  it('schedules nothing for a future window with no deadline yet', () => {
    expect(plannedReminders({ submissionOpensAt: '2026-08-18' }, TODAY)).toEqual([])
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
  // Forms are published when submissions open — reading one earlier parses a
  // placeholder page and prepares answers to questions that aren't asked.
  it('waits for the window to actually open', () => {
    expect(shouldPrepareNow({ submissionOpensAt: '2027-03-01' }, TODAY)).toBe(false)
    expect(shouldPrepareNow({ submissionOpensAt: '2026-09-01' }, TODAY)).toBe(false)
    expect(shouldPrepareNow({ submissionOpensAt: '2026-08-16' }, TODAY)).toBe(false)
    expect(shouldPrepareNow({ submissionOpensAt: '2026-08-15' }, TODAY)).toBe(true)
    expect(shouldPrepareNow({ submissionOpensAt: '2026-08-01' }, TODAY)).toBe(true)
  })

  it('prepares straight away when no opening date is tracked', () => {
    expect(shouldPrepareNow({}, TODAY)).toBe(true)
    expect(shouldPrepareNow({ deadline: '2026-10-01' }, TODAY)).toBe(true)
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

describe('prep completion', () => {
  it('is terminal once there are answers, or a form that needs doing by hand', () => {
    expect(isPrepTerminal('ready', 1)).toBe(true)
    expect(isPrepTerminal('blocked', 1)).toBe(true)
    expect(isPrepTerminal('queued', 0)).toBe(false)
    expect(isPrepTerminal('none', 0)).toBe(false)
  })

  it('keeps retrying a transient failure, then gives up and reports it', () => {
    expect(isPrepTerminal('failed', 1)).toBe(false)
    expect(isPrepTerminal('failed', 2)).toBe(false)
    expect(isPrepTerminal('failed', 3)).toBe(true)
  })

  it('retries a failed run the next day, not the same one', () => {
    expect(isPrepRetryDue({ prepStatus: 'failed', prepUpdatedAt: TODAY, prepAttempts: 1 }, TODAY)).toBe(false)
    expect(
      isPrepRetryDue({ prepStatus: 'failed', prepUpdatedAt: '2026-08-14', prepAttempts: 1 }, TODAY),
    ).toBe(true)
    expect(
      isPrepRetryDue({ prepStatus: 'failed', prepUpdatedAt: '2026-08-01', prepAttempts: 3 }, TODAY),
    ).toBe(false)
    expect(isPrepRetryDue({ prepStatus: 'ready', prepAttempts: 1 }, TODAY)).toBe(false)
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
