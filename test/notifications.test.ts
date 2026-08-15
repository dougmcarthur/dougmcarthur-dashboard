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
  // One email per gig, once the window is open *and* the answers exist.
  it('leads with the answers being ready, not just the window opening', () => {
    const email = composeReminderEmail(
      'answers_ready',
      { ...gig, submissionOpensAt: TODAY },
      { total: 12, needsInput: 2, approved: 0 },
      'https://dashboard.dougmcarthur.net',
      TODAY,
    )
    expect(email.subject).toBe('Ready to review (2 need you) — Sawdust City Music Festival 2027')
    expect(email.body).toContain('opened today')
    expect(email.body).toContain('12 fields, 10 drafted')
    expect(email.body).toContain('2 that need you')
    expect(email.body).toContain('https://dashboard.dougmcarthur.net/#gigs/42')
    expect(email.body).toContain('https://www.sawdustcitymusicfestival.com/apply')
  })

  it('says so plainly when nothing needs you', () => {
    const email = composeReminderEmail(
      'answers_ready',
      gig,
      { total: 8, needsInput: 0, approved: 0 },
      undefined,
      TODAY,
    )
    expect(email.subject).toBe('Answers ready — Sawdust City Music Festival 2027')
    expect(email.body).toContain('8 fields, 8 drafted')
    expect(email.body).not.toContain('need you')
  })

  it('still reports an open window when the form could not be read', () => {
    const email = composeReminderEmail(
      'answers_ready',
      { ...gig, prepStatus: 'blocked', prepError: 'The form is behind a login.' },
      { total: 0, needsInput: 0, approved: 0 },
      undefined,
      TODAY,
    )
    expect(email.subject).toContain('needs doing by hand')
    expect(email.body).toContain('behind a login')
    expect(email.body).toContain('opened on 2026-09-01')
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
