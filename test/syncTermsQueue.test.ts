import { describe, it, expect } from 'vitest'
import { buildReviewQueue, matchesFilter, awaitingDecision, deckItems } from '../shared/reviewQueue'
import { buildDigest } from '../shared/digest'
import type { SyncTarget } from '../shared/types'

/**
 * What the queue does with a target whose own site says no.
 *
 * The queue is the decision surface the Overview card, the Review screen and the
 * weekly email all read, so a refusal has to be the thing in front of you on all
 * three rather than a field on a page you would have to open.
 */

const TODAY = '2026-10-07'

function target(o: Partial<SyncTarget> = {}): SyncTarget {
  return {
    id: 1, name: 'Friends Music Partners', agencyType: 'library', contactEmail: 'beth@friends.example',
    contactRole: 'Founder', confirmationMethod: 'email', notes: 'LA library with a strong placement record.',
    pitchDraft: 'Hey Beth, ...', pitchSent: null, status: 'draft_ready', snoozedUntil: null, snoozedAt: null,
    discoveredAt: '2026-09-20', updatedAt: '2026-09-20', reconciledAt: null,
    website: null, submissionPolicy: null, policyEvidence: null, policyUrl: null,
    policyCheckedAt: '2026-10-01T00:00:00.000Z', policyOverriddenAt: null,
    ...o,
  }
}

const REFUSED = {
  submissionPolicy: 'closed',
  policyEvidence: 'NO unsolicited material please.',
  policyUrl: 'https://friends.example/about.html',
}

const build = (rows: SyncTarget[]) => buildReviewQueue({ sync: rows, today: TODAY })

describe('a target that takes no unsolicited pitches', () => {
  it('is flagged as a warning, in the words a chip carries', () => {
    const [item] = build([target(REFUSED)])
    expect(item.flags.find((f) => f.id === 'no_unsolicited')).toEqual({
      id: 'no_unsolicited',
      label: 'No unsolicited pitches',
      severity: 'danger',
      kind: 'warning',
    })
  })

  it('shows under "needs a decision", where the weekly email links', () => {
    const [item] = build([target(REFUSED)])
    expect(awaitingDecision(item)).toBe(true)
    expect(matchesFilter(item, 'needs')).toBe(true)
  })

  it('says it on the card, with their own words, and offers one button and it is not "pitch"', () => {
    const [item] = build([target(REFUSED)])
    expect(item.decision.badge).toBe('No pitches')
    expect(item.decision.rationale).toContain('“NO unsolicited material please”')
    expect(item.decision.rationale).toMatch(/Archive it/)
    expect(item.decision.actions).toEqual([{ label: 'Archive', intent: 'archive', tone: 'no' }])
    expect(item.decision.rationale).not.toContain('—')
  })

  it('does not double the full stop when the quote ends with one', () => {
    const [item] = build([target(REFUSED)])
    expect(item.decision.rationale).not.toMatch(/\.”\./)
    expect(item.decision.rationale).not.toMatch(/\.\./)
  })

  it('sorts above a deadline-driven row, because sending it is the mistake that cannot be undone', () => {
    const queue = build([target({ id: 2, name: 'Quiet one' }), target({ id: 1, ...REFUSED })])
    expect(queue[0].id).toBe(1)
  })

  it('is dealt on the Overview deck like anything new', () => {
    const items = build([target(REFUSED)])
    expect(deckItems(items).map((i) => i.id)).toEqual([1])
  })

  it('stops being flagged once the artist chooses to pitch anyway', () => {
    const [item] = build([target({ ...REFUSED, policyOverriddenAt: '2026-10-06T00:00:00.000Z' })])
    expect(item.flags.some((f) => f.id === 'no_unsolicited')).toBe(false)
    expect(item.decision.rationale).toMatch(/you decided to pitch anyway/)
  })

  it('is not flagged after the pitch has gone out, where there is nothing left to decide', () => {
    for (const status of ['pitched', 'sent', 'confirmed', 'declined']) {
      const [item] = build([target({ ...REFUSED, status })])
      expect(item.flags.some((f) => f.id === 'no_unsolicited'), status).toBe(false)
    }
  })

  it('never leaves the queue by being snoozed past its flag, since the filter hides the snoozed anyway', () => {
    const [item] = build([target({ ...REFUSED, snoozedUntil: '2026-11-01', snoozedAt: '2026-10-07T00:00:00.000Z', updatedAt: '2026-10-07T00:00:00.000Z' })])
    expect(matchesFilter(item, 'needs')).toBe(false)
    expect(matchesFilter(item, 'snoozed')).toBe(true)
  })
})

describe('what the card says about a target that has not refused', () => {
  const rationale = (o: Partial<SyncTarget>) => build([target(o)])[0].decision.rationale

  it('says nobody has checked, rather than asking "worth pitching?" of a company it knows nothing about', () => {
    expect(rationale({ policyCheckedAt: null })).toMatch(/Nobody has checked/)
  })

  it('says silence is not permission', () => {
    expect(rationale({})).toMatch(/not permission/)
  })

  it('says so when their site invites submissions', () => {
    expect(rationale({ submissionPolicy: 'open', policyEvidence: 'We welcome demos.' })).toMatch(/Their site says they take submissions/)
  })

  it('leaves the sentence alone for a row that has already been pitched', () => {
    expect(rationale({ status: 'pitched' })).not.toMatch(/Nobody has checked|not permission/)
  })
})

describe('the weekly email', () => {
  it('puts a refusal in what to act on, in the words of the card', () => {
    const digest = buildDigest({ items: build([target(REFUSED)]), today: TODAY, prior: [] })
    expect(digest.focus.map((line) => line.key)).toEqual(['sync-1'])
    expect(digest.focus[0].rationale).toMatch(/take no unsolicited pitches/)
  })

  it('counts several under one line when they pile up, and the line is on the filter that shows them', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((id) => target({ id, name: `Target ${id}`, ...REFUSED }))
    const digest = buildDigest({ items: build(rows), today: TODAY, prior: [] })
    const said = JSON.stringify(digest)
    expect(said).toContain('say they take no unsolicited pitches')
    expect(said).toContain('#review/needs')
  })
})
