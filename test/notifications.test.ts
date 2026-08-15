import { describe, it, expect } from 'vitest'
import { buildDigest, type DigestGig } from '../src/lib/notifications'

const TODAY = '2026-08-15'

const gig: DigestGig = {
  id: 42,
  name: 'Sawdust City Music Festival 2027',
  type: 'festival',
  organizer: 'Sawdust City',
  status: 'approved',
  deadline: '2026-10-15',
  submissionOpensAt: '2026-08-15',
  applicationUrl: 'https://www.sawdustcitymusicfestival.com/apply',
  url: null,
  prepStatus: 'ready',
  prepError: null,
}

const empty = { discovered: [], answersReady: [], needsAttention: [], deadlines: [] }

describe('buildDigest', () => {
  // The digest exists to pull you in when something changed. Silence otherwise.
  it('sends nothing when nothing happened', () => {
    expect(buildDigest({ ...empty, todayStr: TODAY })).toBeNull()
  })

  it('leads with applications ready to review', () => {
    const digest = buildDigest({
      ...empty,
      answersReady: [{ gig, prep: { total: 12, needsInput: 2, approved: 0 } }],
      todayStr: TODAY,
    })!
    expect(digest.subject).toBe('Music HQ — 1 application ready')
    expect(digest.body).toContain('READY TO REVIEW')
    expect(digest.body).toContain('12 fields, 10 drafted, 2 need you')
    expect(digest.body).toContain('/#gigs/42')
  })

  it('lists new finds with their fit and a review link', () => {
    const digest = buildDigest({
      ...empty,
      discovered: [
        {
          id: 7,
          name: 'Northern Lights Festival',
          kind: 'gigs',
          detail: 'festival · opens 2026-11-01',
          url: 'https://northernlights.ca',
          fitScore: 4,
        },
      ],
      todayStr: TODAY,
    })!
    expect(digest.subject).toBe('Music HQ — 1 new opportunity')
    expect(digest.body).toContain('NEW OPPORTUNITIES')
    expect(digest.body).toContain('Northern Lights Festival  (fit 4/5)')
    expect(digest.body).toContain('opens 2026-11-01')
    expect(digest.body).toContain('/#gigs/7')
  })

  it('combines everything from one run into a single email', () => {
    const digest = buildDigest({
      discovered: [
        { id: 7, name: 'Northern Lights', kind: 'gigs', detail: 'festival', url: 'https://nl.ca', fitScore: 4 },
        { id: 8, name: 'Sync Co', kind: 'sync', detail: 'library', url: 'https://sync.co', fitScore: 3 },
      ],
      answersReady: [{ gig, prep: { total: 8, needsInput: 0, approved: 0 } }],
      needsAttention: [
        { ...gig, id: 43, name: 'Locked Fest', prepStatus: 'blocked', prepError: 'The form is behind a login.' },
      ],
      deadlines: [{ gig: { ...gig, id: 44, name: 'Closing Soon', deadline: '2026-08-22' }, days: 7 }],
      todayStr: TODAY,
    })!

    expect(digest.subject).toBe('Music HQ — 1 application ready, 2 new opportunities, 1 deadline')
    for (const section of ['READY TO REVIEW', 'NEW OPPORTUNITIES', 'NEEDS DOING BY HAND', 'DEADLINES']) {
      expect(digest.body).toContain(section)
    }
    expect(digest.body).toContain('behind a login')
    expect(digest.body).toContain('due in 7 days')
  })

  it('reports an overdue deadline as overdue', () => {
    const digest = buildDigest({
      ...empty,
      deadlines: [{ gig: { ...gig, deadline: '2026-08-10' }, days: -5 }],
      todayStr: TODAY,
    })!
    expect(digest.body).toContain('due 5 days ago')
  })

  it('does not leave sync finds pointing at a gig page', () => {
    const digest = buildDigest({
      ...empty,
      discovered: [
        { id: 8, name: 'Sync Co', kind: 'sync', detail: 'library', url: 'https://sync.co', fitScore: 5 },
      ],
      todayStr: TODAY,
    })!
    expect(digest.body).not.toContain('#gigs/8')
    expect(digest.body).toContain('https://sync.co')
  })
})
