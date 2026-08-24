import { describe, it, expect } from 'vitest'
import { buildReviewQueue } from '../shared/reviewQueue'
import type { GigOpportunity, SyncTarget, PromoDraft } from '../shared/types'

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

const promo = (o: Partial<PromoDraft> & { id: number }): PromoDraft => ({
  month: 'July 2026', title: 'A caption', content: 'Body.', status: 'approved',
  createdAt: '2026-07-02', ...o,
})

const first = (input: Parameters<typeof buildReviewQueue>[0]) => buildReviewQueue(input)[0]

describe('decision copy — the sentence names the decision', () => {
  it('asks whether it actually went out when status and note disagree', () => {
    const item = first({
      gigs: [gig({
        id: 1, name: 'Home Routes', status: 'submitted',
        fitNotes: 'Submission status: NOT submitted. Contact Phone: needs Doug, not on file.',
      })],
    })
    expect(item.decision.rationale).toContain('Marked submitted in the tracker')
    expect(item.decision.rationale).toMatch(/Did this go out\?$/)
    expect(item.decision.actions.map((a) => a.label)).toEqual(['It went out', 'Not sent — reopen'])
  })

  it('states the cost and that approving is approving the spend', () => {
    const item = first({
      gigs: [gig({ id: 2, name: 'CFMA', paid: 1, fee: '$85 CAD first entry' })],
    })
    expect(item.decision.rationale).toContain('Costs CAD 85 to enter')
    expect(item.decision.actions[0].label).toBe('Approve the spend')
  })

  it('counts the days on an overdue item and offers a close-out', () => {
    const item = first({
      gigs: [gig({ id: 3, name: 'Passed', deadline: '2026-01-01' })],
    })
    expect(item.decision.rationale).toMatch(/deadline passed \d+ days ago/)
    expect(item.decision.actions.map((a) => a.label)).toEqual(['Keep for next cycle', 'Archive'])
  })

  it('tells you to pick one when two pitches went to the same inbox', () => {
    const item = first({
      sync: [sync({
        id: 4, name: 'ThinkSync Music',
        notes: 'IMPORTANT: a separate ThinkSync Music row already exists in this table. Doug should pick one to actually send.',
      })],
    })
    expect(item.decision.rationale).toContain('Pick one to send.')
    expect(item.decision.rationale).not.toMatch(/^IMPORTANT:/)
    expect(item.decision.actions.map((a) => a.label)).toEqual(['Send this one', 'Drop it'])
  })

  it('names the missing fields rather than echoing their placeholder text', () => {
    const item = first({
      gigs: [gig({
        id: 20, name: 'Home Routes', status: 'submitted',
        fitNotes: "Submission status: NOT submitted. Drafted field values: Contact Phone: needs Doug, not on file; Mailing Address: needs Doug, only 'Winnipeg, MB' on file.",
      })],
    })
    expect(item.decision.rationale).toContain('It still needs your contact phone and mailing address.')
    expect(item.decision.rationale).not.toContain('needs needs')
  })

  it('names what it is waiting on when the blocker is the point', () => {
    const item = first({
      gigs: [gig({ id: 5, name: 'Sofar', fitNotes: 'Doug should pick the video and submit himself when ready.' })],
    })
    expect(item.decision.rationale).toMatch(/^Waiting on you: doug should pick the video/)
  })

  it('reads differently for an unapproved promo draft than an approved one', () => {
    const draft = first({ promo: [promo({ id: 6, status: 'draft' })] })
    const approved = first({ promo: [promo({ id: 7, status: 'approved' })] })
    expect(draft.decision.rationale).toContain('not been approved yet')
    expect(approved.decision.rationale).toContain('not been marked published')
  })
})

describe('decision copy — invariants that hold for every item', () => {
  const items = buildReviewQueue({
    gigs: [
      gig({ id: 10, name: 'Bare' }),
      gig({ id: 11, name: 'Conflicted', status: 'submitted', fitNotes: 'Submission status: NOT submitted.' }),
      gig({ id: 12, name: 'Paid', paid: 1, fee: '$55 + processing' }),
      gig({ id: 13, name: 'Overdue', deadline: '2026-02-02' }),
      gig({ id: 14, name: 'Vague', deadline: 'rolling, no deadline' }),
    ],
    sync: [
      sync({ id: 15, name: 'Plain agency', notes: 'Chicago-based boutique sync agency.' }),
      // The duplicate case strips an "IMPORTANT:" preamble, which used to leave
      // the sentence starting lowercase.
      sync({ id: 17, name: 'Dupe', notes: 'IMPORTANT: a separate row already exists in this table.' }),
      sync({
        id: 18, name: 'Missing fields', status: 'sent',
        notes: "Submission status: NOT submitted. Drafted values: Contact Phone: needs Doug, not on file; Mailing Address: needs Doug, only 'Winnipeg, MB' on file.",
      }),
    ],
    promo: [promo({ id: 16 })],
  })

  it('always produces a non-empty sentence', () => {
    for (const i of items) expect(i.decision.rationale.trim().length).toBeGreaterThan(0)
  })

  it('always produces exactly two actions', () => {
    for (const i of items) expect(i.decision.actions).toHaveLength(2)
  })

  it('never leaves a raw flag id or template hole in the copy', () => {
    for (const i of items) {
      expect(i.decision.rationale).not.toMatch(/undefined|null|NaN|\{\}|\$\{/)
      expect(i.decision.rationale).not.toMatch(/not_submitted|due_soon|vague_deadline/)
    }
  })

  it('starts every sentence with a capital and ends it with punctuation', () => {
    for (const i of items) {
      expect(i.decision.rationale[0]).toBe(i.decision.rationale[0].toUpperCase())
      expect(i.decision.rationale.trim()).toMatch(/[.?!]$/)
    }
  })
})
