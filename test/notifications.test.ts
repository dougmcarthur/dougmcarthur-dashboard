import { describe, it, expect } from 'vitest'
import { composeReminderEmail, type ReminderGig } from '../src/lib/notifications'

const TODAY = '2026-08-15'

const gig: ReminderGig = {
  id: 42,
  name: 'Sawdust City Music Festival 2027',
  type: 'festival',
  organizer: 'Sawdust City',
  status: 'awaiting_window',
  deadline: '2026-10-15',
  submissionOpensAt: '2026-09-01',
  applicationUrl: 'https://www.sawdustcitymusicfestival.com/apply',
  url: null,
  prepStatus: 'ready',
  prepError: null,
}

describe('composeReminderEmail', () => {
  it('says how many answers are waiting when the window opens', () => {
    const email = composeReminderEmail(
      'window_opens',
      gig,
      { total: 12, needsInput: 2, approved: 3 },
      'https://dashboard.dougmcarthur.net',
      TODAY,
    )
    expect(email.subject).toBe('Submissions open today — Sawdust City Music Festival 2027')
    expect(email.body).toContain('12 fields drafted')
    expect(email.body).toContain('2 still need you')
    expect(email.body).toContain('https://dashboard.dougmcarthur.net/#gigs/42')
    expect(email.body).toContain('https://www.sawdustcitymusicfestival.com/apply')
  })

  it('counts down in the heads-up email', () => {
    const email = composeReminderEmail(
      'window_soon',
      gig,
      { total: 12, needsInput: 0, approved: 0 },
      undefined,
      TODAY,
    )
    expect(email.subject).toContain('in 17 days')
  })

  it('explains a blocked form instead of promising answers', () => {
    const email = composeReminderEmail(
      'window_opens',
      { ...gig, prepStatus: 'blocked', prepError: 'The form is behind a login.' },
      { total: 0, needsInput: 0, approved: 0 },
      undefined,
      TODAY,
    )
    expect(email.body).toContain('behind a login')
  })

  it('nudges before a deadline and reports how overdue it is', () => {
    const soon = composeReminderEmail(
      'pre_deadline',
      { ...gig, status: 'approved', deadline: '2026-08-22' },
      { total: 5, needsInput: 0, approved: 5 },
      undefined,
      TODAY,
    )
    expect(soon.subject).toBe('Deadline in 7 days — Sawdust City Music Festival 2027')

    const late = composeReminderEmail(
      'pre_deadline',
      { ...gig, status: 'approved', deadline: '2026-08-10' },
      { total: 5, needsInput: 0, approved: 5 },
      undefined,
      TODAY,
    )
    expect(late.subject).toContain('Deadline passed 5 days ago')
  })
})
