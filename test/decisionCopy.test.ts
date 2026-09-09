import { describe, it, expect } from 'vitest'
import { buildReviewQueue } from '../shared/reviewQueue'
import { GIG_STATUS_BY_INTENT } from '../shared/decisionCopy'
import { isGigTransitionAllowed, normaliseGigStatus } from '../shared/gigStatus'
import type { GigOpportunity, SyncTarget, PromoDraft } from '../shared/types'

function gig(o: Partial<GigOpportunity> & { id: number; name: string }): GigOpportunity {
  return {
    type: 'festival', organizer: null, submissionMethod: null, audienceSize: null,
    genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null,
    feeAmount: null, feeCurrency: 'USD', fee: null,
    paid: 0, fitNotes: null, fitRationale: null, url: null, status: 'approved',
    googleEventId: null, snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-07-01', updatedAt: '2026-08-01', ...o,
  }
}

function sync(o: Partial<SyncTarget> & { id: number; name: string }): SyncTarget {
  return {
    agencyType: null, contactEmail: null, contactRole: null, confirmationMethod: null,
    notes: null, pitchDraft: null, pitchSent: null, status: 'pitched',
    snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-06-21', updatedAt: '2026-06-29', reconciledAt: null, ...o,
  }
}

const promo = (o: Partial<PromoDraft> & { id: number }): PromoDraft => ({
  month: 'July 2026', title: 'A caption', content: 'Body.', status: 'approved',
  createdAt: '2026-07-02', ...o,
})

const first = (input: Parameters<typeof buildReviewQueue>[0]) => buildReviewQueue(input)[0]

/**
 * The date the invariant block below is written against, and `n` days from
 * it. Fixed rather than read off the clock: a fixture that counts from `now`
 * agrees with the queue only while both read the same UTC day, which is a
 * race the suite should not contain and a lesson `reviewQueue.test.ts` has
 * already had to learn twice.
 */
const INVARIANT_TODAY = '2026-08-25'
const fromToday = (n: number) =>
  new Date(Date.parse(`${INVARIANT_TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

describe('decision copy — the sentence names the decision', () => {
  it('asks whether it actually went out when status and note disagree', () => {
    const item = first({
      gigs: [gig({
        id: 1, name: 'Home Routes', status: 'submitted',
        fitNotes: 'Submission status: NOT submitted. Contact Phone: needs Doug, not on file.',
      })],
    })
    expect(item.decision.rationale).toContain('Marked submitted in the tracker')
    // No buttons. A conflict only arises once a gig claims to be sent, and the
    // pipeline has no route back from `submitted` — the old pair offered
    // "Not sent — reopen", which the PATCH route refused every single time.
    expect(item.decision.rationale).toMatch(/an edit rather than a decision/)
    expect(item.decision.actions).toEqual([])
  })

  it('still asks a sync target whether it went out — sync has no pipeline shape', () => {
    const item = first({
      sync: [sync({
        id: 30, name: 'Marmoset', status: 'pitched',
        fitNotes: undefined, notes: 'Submission status: NOT submitted.',
      })],
    })
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
    // Was ['Keep for next cycle', 'Archive']. The first set the status the row
    // already had — nothing was written and the identical card came straight
    // back — and `shortlisted → archived` is not a move the pipeline offers,
    // so the second returned a 400. `expired` is what actually happened.
    expect(item.decision.actions.map((a) => a.label)).toEqual(['Applied', 'Window closed'])
  })

  it('names the silence, and does not claim a sent application was never sent', () => {
    const item = first({
      gigs: [gig({
        id: 50, name: 'Home Routes', status: 'submitted',
        // A past deadline on a row you already submitted raises `overdue`,
        // whose copy reads "nothing was submitted" — false here, and the
        // reason `no_reply` outranks it in the precedence list.
        deadline: '2026-06-01', submittedAt: '2026-05-20',
      })],
    })
    expect(item.decision.rationale).toMatch(/^It went out \d+ days ago and nothing has come back\./)
    expect(item.decision.rationale).not.toContain('nothing was submitted')
    // Chasing is an email. The affirmative path off this card is the snooze
    // beside it, which is why the sentence names it rather than a button.
    expect(item.decision.rationale).toContain('snooze this')
    expect(item.decision.actions.map((a) => a.label)).toEqual(['Never heard back'])
  })

  it('says they confirmed receipt when that is what happened', () => {
    const item = first({
      gigs: [gig({ id: 51, name: 'CFMA', status: 'acknowledged', submittedAt: '2026-04-01' })],
    })
    expect(item.decision.rationale).toMatch(/^They confirmed they had it \d+ days ago/)
  })

  it('marks the count as approximate when the send date was never recorded', () => {
    const item = first({
      gigs: [gig({
        id: 52, name: 'Legacy row', status: 'submitted',
        submittedAt: null, updatedAt: '2026-05-01',
      })],
    })
    expect(item.decision.rationale).toMatch(/It went out about \d+ days ago/)
  })

  it('puts an unanswered invitation at the top and offers the two real outs', () => {
    const item = first({
      gigs: [gig({ id: 40, name: 'Winnipeg Folk Festival', status: 'invited' })],
    })
    expect(item.flags[0].id).toBe('reply_due')
    expect(item.decision.rationale).toContain('withdrawing, not them declining')
    // Never `declined`: turning down an invitation is your verb, not theirs.
    expect(item.decision.actions.map((a) => a.label)).toEqual(['Confirm the booking', 'Withdraw'])
  })

  it('tells you to answer a question rather than offering a button that cannot', () => {
    const item = first({
      gigs: [gig({ id: 41, name: 'Folk Alliance', status: 'info_requested' })],
    })
    expect(item.decision.rationale).toContain('nothing moves until you answer')
    // A lone red "Withdraw" under "they asked a question" is a hazard, and
    // there is no status that means "replied".
    expect(item.decision.actions).toEqual([])
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
    // The Overview deck builds its sentence from the same parsed prose the
    // Review pane shows, and went on naming him for a day after that pane was
    // fixed — which is why the rewrite moved into the parser.
    expect(item.decision.rationale).toMatch(/^Waiting on you: you should pick the video/)
    expect(item.decision.rationale).not.toMatch(/Doug/)
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
      // One row per phase, so the legality invariant is exercised against
      // every shape of `nextGigStatuses` rather than just the review phase.
      gig({ id: 21, name: 'Fresh', status: 'discovered' }),
      gig({ id: 22, name: 'Preparing', status: 'preparing', paid: 1, fee: '$40' }),
      gig({ id: 23, name: 'Acknowledged', status: 'acknowledged' }),
      gig({ id: 24, name: 'Asked', status: 'info_requested' }),
      gig({ id: 25, name: 'Invited', status: 'invited' }),
      gig({ id: 26, name: 'Booked', status: 'booked' }),
      gig({ id: 27, name: 'Declined', status: 'declined' }),
      gig({ id: 28, name: 'Expired out', status: 'expired', deadline: '2026-01-05' }),
      gig({ id: 29, name: 'Silent', status: 'submitted', submittedAt: '2026-01-10' }),
      // A show inside the P-2's ninety days, so the visa card is exercised by
      // the legality invariant alongside every other shape of row.
      gig({
        id: 30, name: 'Short lead', country: 'US', performanceKind: 'paid',
        performanceStart: fromToday(40),
      }),
      gig({ id: 31, name: 'Unsaid kind', country: 'US', performanceStart: fromToday(40) }),
      gig({
        id: 32, name: 'Short lead, already sent', status: 'submitted', submittedAt: '2026-01-10',
        country: 'US', performanceKind: 'paid', performanceStart: fromToday(40),
      }),
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
    today: INVARIANT_TODAY,
  })

  it('always produces a non-empty sentence', () => {
    for (const i of items) expect(i.decision.rationale.trim().length).toBeGreaterThan(0)
  })

  it('never offers a gig a move the pipeline would refuse', () => {
    // The invariant that replaced "always exactly two actions". Two was never
    // the property worth holding: the deck and the Review bar both rendered a
    // fixed pair regardless of status, and the PATCH route validates against
    // `nextGigStatuses`, so a card at `submitted` offered three buttons that
    // all returned 400. A card with one action, or none, is honest; a card
    // with two the API rejects is not.
    for (const i of items) {
      if (i.kind !== 'gig') continue
      for (const a of i.decision.actions) {
        const to = GIG_STATUS_BY_INTENT[a.intent]
        expect(
          isGigTransitionAllowed(i.status, to),
          `${i.title} (${normaliseGigStatus(i.status)}) offers "${a.label}" → ${to}`,
        ).toBe(true)
        // A move to the status the row already holds is legal but writes
        // nothing, so the card returns unchanged. That is the bug, not a fix.
        expect(to).not.toBe(normaliseGigStatus(i.status))
      }
    }
  })

  it('offers at most one affirmative and one negative', () => {
    for (const i of items) {
      // Promo drafts are the exception, and an old one: approving copy and
      // marking it published are both affirmative, and a promo draft has no
      // negative outcome — you do not reject your own caption.
      if (i.kind === 'promo') continue
      expect(i.decision.actions.filter((a) => a.tone === 'go').length).toBeLessThanOrEqual(1)
      expect(i.decision.actions.filter((a) => a.tone === 'no').length).toBeLessThanOrEqual(1)
    }
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

describe('decision copy — the visa lead time', () => {
  const TODAY = '2027-01-15'
  const inDays = (n: number) =>
    new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

  const at = (o: Partial<GigOpportunity>) =>
    buildReviewQueue({ gigs: [gig({ id: 1, name: 'Treefort', ...o })], today: TODAY })[0]

  it('names the permit rather than the deadline it sits beside', () => {
    const item = at({
      country: 'US', performanceKind: 'paid',
      deadline: inDays(-3), performanceStart: inDays(60),
    })
    // `overdue` is also flagged here. The card must not say "nothing was
    // submitted" when what is actually wrong is that the date is unreachable.
    expect(item.flags.some((f) => f.id === 'overdue')).toBe(true)
    expect(item.decision.rationale).toMatch(/P-2/)
    expect(item.decision.rationale).not.toMatch(/deadline passed/i)
  })

  it('asks the question instead of offering a decision, when the kind is unstated', () => {
    const item = at({ country: 'US', performanceStart: inDays(40) })
    expect(item.decision.rationale).toMatch(/showcase or a paid booking/)
    expect(item.decision.actions).toEqual([])
  })

  it('calls pulling out of a sent application withdrawing, not declining', () => {
    // Their verb, not yours. `submitted` offers `declined` as a legal move and
    // a negative button reaching for it would record that a festival turned
    // you down when what happened is that you could not get the paperwork.
    const item = at({
      status: 'submitted', submittedAt: `${TODAY}T09:00:00.000Z`,
      country: 'US', performanceKind: 'paid', performanceStart: inDays(60),
    })
    expect(item.decision.rationale).toMatch(/P-2/)
    expect(item.decision.actions.find((a) => a.tone === 'no')?.intent).toBe('withdraw')
  })

  it('offers passing, not withdrawing, before anything has gone in', () => {
    const item = at({ country: 'US', performanceKind: 'paid', performanceStart: inDays(60) })
    expect(item.decision.actions.find((a) => a.tone === 'no')?.intent).toBe('pass')
  })
})
