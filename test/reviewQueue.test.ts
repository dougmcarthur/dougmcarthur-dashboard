import { describe, it, expect } from 'vitest'
import { buildReviewQueue, matchesFilter } from '../shared/reviewQueue'
import type { GigOpportunity, SyncTarget } from '../shared/types'

// Minimal rows in the shape the API returns. Notes are trimmed from real
// production values so the flags under test are the ones the data produces.

function gig(o: Partial<GigOpportunity> & { id: number; name: string }): GigOpportunity {
  return {
    type: 'festival', organizer: null, submissionMethod: null, audienceSize: null,
    genreFitScore: null, deadline: null, feeAmount: null, feeCurrency: 'USD', fee: null,
    paid: 0, fitNotes: null, fitRationale: null, url: null, status: 'approved',
    googleEventId: null, discoveredAt: '2026-07-01', updatedAt: '2026-08-01', ...o,
  }
}

function sync(o: Partial<SyncTarget> & { id: number; name: string }): SyncTarget {
  return {
    agencyType: null, contactEmail: null, contactRole: null, confirmationMethod: null,
    notes: null, pitchDraft: null, pitchSent: null, status: 'pitched',
    discoveredAt: '2026-06-21', updatedAt: '2026-06-29', reconciledAt: null, ...o,
  }
}

describe('buildReviewQueue — status/note conflicts', () => {
  it('flags a gig marked submitted whose note says it was not', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({
        id: 1, name: 'Home Routes', status: 'submitted',
        fitNotes: 'Submission status: NOT submitted. Single-page intake form at the URL.',
      })],
    })

    const conflict = item.flags.find((f) => f.id === 'conflict')
    expect(conflict).toBeDefined()
    expect(conflict?.severity).toBe('danger')
    expect(item.flags.find((f) => f.id === 'not_submitted')).toBeUndefined()
  })

  it('flags a sync target marked sent whose note says submission must go via a portal', () => {
    const [item] = buildReviewQueue({
      sync: [sync({
        id: 18, name: 'Crucial Music', status: 'sent',
        notes: 'Submission status: NOT submitted. Actual submission must go through their portal.',
      })],
    })
    expect(item.flags.some((f) => f.id === 'conflict')).toBe(true)
  })

  it('does not manufacture a conflict when the workflow agrees with the note', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({
        id: 2, name: 'Open Application', status: 'approved',
        fitNotes: 'Submission status: NOT submitted. Waiting on the window to open.',
      })],
    })
    expect(item.flags.some((f) => f.id === 'conflict')).toBe(false)
    expect(item.flags.some((f) => f.id === 'not_submitted')).toBe(true)
  })
})

describe('buildReviewQueue — flags from the note and columns', () => {
  it('reads a paid entry off the fee column', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({ id: 3, name: 'CFMA 2027', paid: 1, fee: '$85 CAD first entry' })],
    })
    const paid = item.flags.find((f) => f.id === 'paid')
    expect(paid?.label).toBe('Costs CAD 85')
  })

  it('marks a prose deadline as not a real date', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({ id: 4, name: 'Rolling intake', deadline: 'None — rolling artist roster intake' })],
    })
    expect(item.flags.some((f) => f.id === 'vague_deadline')).toBe(true)
    expect(item.deadline.date).toBeNull()
  })

  it('surfaces a blocker waiting on a person', () => {
    const [item] = buildReviewQueue({
      gigs: [gig({ id: 5, name: 'Sofar', fitNotes: 'Doug should pick the video and submit himself when ready.' })],
    })
    expect(item.flags.some((f) => f.id === 'blocked')).toBe(true)
  })
})

describe('buildReviewQueue — ordering and scope', () => {
  it('sorts the most severe item first', () => {
    const items = buildReviewQueue({
      gigs: [
        gig({ id: 10, name: 'Quiet one' }),
        gig({ id: 11, name: 'Conflicted', status: 'submitted', fitNotes: 'Submission status: NOT submitted.' }),
      ],
    })
    expect(items[0].title).toBe('Conflicted')
  })

  it('leaves archived rows out of the queue entirely', () => {
    const items = buildReviewQueue({
      gigs: [gig({ id: 12, name: 'Done with it', status: 'archived' })],
      sync: [sync({ id: 13, name: 'Also done', status: 'archived' })],
    })
    expect(items).toHaveLength(0)
  })

  it('keys items by kind and id so the two entity tables cannot collide', () => {
    const items = buildReviewQueue({
      gigs: [gig({ id: 1, name: 'A gig' })],
      sync: [sync({ id: 1, name: 'A sync target' })],
    })
    expect(new Set(items.map((i) => i.key)).size).toBe(2)
  })
})

describe('matchesFilter', () => {
  const [conflicted] = buildReviewQueue({
    gigs: [gig({
      id: 20, name: 'Conflicted', status: 'submitted',
      fitNotes: 'Submission status: NOT submitted.',
    })],
  })

  it('includes a conflict under both "needs" and "conflict"', () => {
    expect(matchesFilter(conflicted, 'needs')).toBe(true)
    expect(matchesFilter(conflicted, 'conflict')).toBe(true)
  })

  it('excludes it from unrelated filters', () => {
    expect(matchesFilter(conflicted, 'paid')).toBe(false)
  })

  it('"all" takes everything, including an item with no flags at all', () => {
    const [quiet] = buildReviewQueue({ gigs: [gig({ id: 21, name: 'Quiet' })] })
    expect(quiet.flags).toHaveLength(0)
    expect(matchesFilter(quiet, 'all')).toBe(true)
    expect(matchesFilter(quiet, 'needs')).toBe(false)
  })
})
