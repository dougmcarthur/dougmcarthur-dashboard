import { describe, it, expect } from 'vitest'
import { buildReviewQueue as buildQueue } from '../shared/reviewQueue'
import { artistNames, parseNote } from '../shared/reviewParse'
import { settleWindowProse, windowState } from '../shared/windowProse'
import type { GigOpportunity } from '../shared/types'

const JANE = artistNames('Jane Smith')

// Fixtures name their own date, never the clock: the whole question here is
// which side of `TODAY` the opening falls on.
const TODAY = '2026-10-22'

function gig(o: Partial<GigOpportunity> & { id: number; name: string }): GigOpportunity {
  return {
    type: 'festival', organizer: null, submissionMethod: null, audienceSize: null,
    genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null,
    feeAmount: null, feeCurrency: 'USD', fee: null,
    paid: 0, fitNotes: null, fitRationale: null, url: null, status: 'preparing',
    googleEventId: null, snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-07-01', updatedAt: '2026-08-01', ...o,
  }
}

const first = (row: GigOpportunity) => buildQueue({ gigs: [row], today: TODAY, artist: JANE })[0]

/** The row from the Review screen: a note written while the window was shut. */
const DEFERRED = "Not submitted; needs Jane's review once the window opens."

describe('windowState', () => {
  const state = (opensAt: string | null, opensInDays: number | null) =>
    windowState({ opensAt, opensInDays })

  it('is shut before the opening day, and open on it and after', () => {
    expect(state('2026-10-30', 8)).toBe('shut')
    expect(state('2026-10-22', 0)).toBe('open')
    expect(state('2026-10-01', -21)).toBe('open')
  })

  it('is unknown without a date, which is not the same as open', () => {
    expect(state(null, null)).toBe('unknown')
  })
})

describe('a note that was waiting on a window which has since opened', () => {
  const row = (opensAt: string | null) =>
    gig({ id: 1, name: 'Edmonton Folk Music Festival', fitNotes: DEFERRED, opensAt, deadline: '2026-11-30' })

  it('stops saying it is waiting for the opening', () => {
    // "Waiting on you: not submitted; needs your review once the window opens",
    // read out three weeks after the column said October 1.
    const item = first(row('2026-10-01'))
    expect(item.parsed.blockers).toEqual(['Not submitted; needs your review.'])
    expect(item.decision.rationale).toBe('Waiting on you: not submitted; needs your review.')
    expect(item.decision.rationale).not.toMatch(/window opens/i)
  })

  it('still asks for the review, since that is what the sentence was waiting to become', () => {
    const item = first(row('2026-10-01'))
    expect(item.flags.some((f) => f.id === 'blocked')).toBe(true)
  })

  it('settles the submission note with it, or the pane prints the sentence twice', () => {
    // `Detail` hides the note when it equals a blocker, and compares the text.
    const { parsed } = first(row('2026-10-01'))
    expect(parsed.submissionNote).toBe('Not submitted; needs your review.')
    expect(parsed.submissionNote).toBe(parsed.blockers[0])
  })

  it('counts the day it opens as open', () => {
    expect(first(row(TODAY)).parsed.blockers).toEqual(['Not submitted; needs your review.'])
  })

  it('leaves the stored note alone', () => {
    expect(first(row('2026-10-01')).note).toBe(DEFERRED)
  })

  it('does not touch the sentence while the window is still shut', () => {
    // Still true of a window that has not opened yet.
    const item = first(row('2026-11-05'))
    expect(item.parsed.blockers).toEqual(['Not submitted; needs your review once the window opens.'])
  })

  it('does not touch it when nothing says when the window opens', () => {
    const item = first(row(null))
    expect(item.parsed.blockers).toEqual(['Not submitted; needs your review once the window opens.'])
  })
})

describe('what is taken off a sentence, and what is not', () => {
  const open = { opensAt: '2026-10-01', opensInDays: -21 }
  const blockersOf = (...blockers: string[]) => settleWindowProse({ ...parseNote(null), blockers }, open).blockers

  it('takes the deferral off the front as well as the back', () => {
    expect(blockersOf('When the window opens, you should pick the video.')).toEqual(['You should pick the video.'])
  })

  it('reads the wordings the agents use', () => {
    expect(blockersOf('Needs your review as soon as submissions open.')).toEqual(['Needs your review.'])
    expect(blockersOf('Needs your review when the submission window opens!')).toEqual(['Needs your review!'])
    expect(blockersOf('Pending your review once the portal goes live')).toEqual(['Pending your review'])
  })

  it('drops a sentence that was nothing but the deferral', () => {
    expect(blockersOf('Once the window opens.')).toEqual([])
  })

  it('leaves a hold alone, because taking "until" off would reverse it', () => {
    // "Do not submit until the window opens" has nothing left to say once it
    // has; "do not submit" is the opposite of what it said.
    expect(blockersOf('Needs your review; do not submit until the window opens.')).toEqual([
      'Needs your review; do not submit until the window opens.',
    ])
  })

  it('leaves a clause in the middle of a sentence where it is', () => {
    expect(blockersOf('Needs your review once the window opens, then the video.')).toEqual([
      'Needs your review once the window opens, then the video.',
    ])
  })

  it('does not mistake any other opening for the window', () => {
    expect(blockersOf('Needs your review once the venue opens its doors.')).toEqual([
      'Needs your review once the venue opens its doors.',
    ])
  })
})

describe('the "window opens later" flag', () => {
  const NOT_OPEN = "Submission window isn't open yet. Needs Jane's review."
  const flagged = (opensAt: string | null) =>
    first(gig({ id: 2, name: 'Reopening', fitNotes: NOT_OPEN, opensAt })).flags.some((f) => f.id === 'window')

  it('is raised while the note and the column agree the window is shut', () => {
    expect(flagged('2026-11-05')).toBe(true)
  })

  it('is raised when the note says so and the column has nothing to add', () => {
    expect(flagged(null)).toBe(true)
  })

  it('goes when the column says the window opened, and so does the note that said it had not', () => {
    expect(flagged('2026-10-01')).toBe(false)
    expect(first(gig({ id: 3, name: 'Reopened', fitNotes: NOT_OPEN, opensAt: '2026-10-01' })).parsed.timing).toEqual([])
  })

  it('keeps a timing note that is not about whether it is open', () => {
    const note = 'Not open to non-residents. Submissions typically open in October.'
    const { parsed } = first(gig({ id: 4, name: 'Residents', fitNotes: note, opensAt: '2026-10-01' }))
    expect(parsed.timing.length).toBeGreaterThan(0)
  })
})
