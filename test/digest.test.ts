import { describe, it, expect } from 'vitest'
import { buildDigest, fingerprint, type PriorReport } from '../shared/digest'
import { buildReviewQueue } from '../shared/reviewQueue'
import type { GigOpportunity, SyncTarget } from '../shared/types'

const TODAY = '2026-08-25'

function gig(o: Partial<GigOpportunity> & { id: number; name: string }): GigOpportunity {
  return {
    type: 'festival', organizer: null, submissionMethod: null, audienceSize: null,
    genreFitScore: null, deadline: null, deadlineNote: null, opensAt: null,
    feeAmount: null, feeCurrency: 'USD', fee: null, paid: 0, fitNotes: null,
    fitRationale: null, url: null, status: 'approved', googleEventId: null,
    snoozedUntil: null, snoozedAt: null,
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

const queue = (input: { gigs?: GigOpportunity[]; sync?: SyncTarget[] }) =>
  buildReviewQueue({ ...input, today: TODAY })

const digest = (input: { gigs?: GigOpportunity[]; sync?: SyncTarget[] }, prior: PriorReport[] = []) =>
  buildDigest({ items: queue(input), prior, today: TODAY })

/** A prior mention `daysAgo` days before TODAY. */
const daysAgo = (n: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString()
}

const groupIds = (d: ReturnType<typeof digest>) => d.groups.map((g) => g.id)
const titlesIn = (d: ReturnType<typeof digest>, id: string) =>
  d.groups.find((g) => g.id === id)?.lines.map((l) => l.title) ?? []

describe('fingerprint', () => {
  it('is stable across rebuilds of an unchanged row', () => {
    const a = queue({ gigs: [gig({ id: 1, name: 'Same', deadline: '2026-12-01' })] })[0]
    const b = queue({ gigs: [gig({ id: 1, name: 'Same', deadline: '2026-12-01' })] })[0]
    expect(fingerprint(a)).toBe(fingerprint(b))
  })

  it('ignores a note rewrite that changes nothing material', () => {
    // A research run rewording a note must not resurface the item.
    const before = queue({ gigs: [gig({ id: 2, name: 'X', fitNotes: 'A festival in Manitoba.' })] })[0]
    const after = queue({ gigs: [gig({ id: 2, name: 'X', fitNotes: 'A folk festival, Manitoba.', updatedAt: '2026-08-24' })] })[0]
    expect(fingerprint(after)).toBe(fingerprint(before))
  })

  it('changes when a deadline appears', () => {
    const before = queue({ gigs: [gig({ id: 3, name: 'X' })] })[0]
    const after = queue({ gigs: [gig({ id: 3, name: 'X', deadline: '2026-12-01' })] })[0]
    expect(fingerprint(after)).not.toBe(fingerprint(before))
  })

  it('changes when a fee appears', () => {
    const before = queue({ gigs: [gig({ id: 4, name: 'X' })] })[0]
    const after = queue({ gigs: [gig({ id: 4, name: 'X', paid: 1, fee: '$45 entry' })] })[0]
    expect(fingerprint(after)).not.toBe(fingerprint(before))
  })

  it('names its fields, so inserting one cannot shift the others', () => {
    const fp = fingerprint(queue({ gigs: [gig({ id: 5, name: 'X', deadline: '2026-12-01' })] })[0])
    expect(fp).toContain('deadline=2026-12-01')
    expect(fp).toContain('status=approved')
  })
})

describe('buildDigest — what earns a mention', () => {
  it('reports an item never mentioned before as new', () => {
    const d = digest({ gigs: [gig({ id: 10, name: 'Fresh', deadline: '2026-12-01' })] })
    expect(groupIds(d)).toContain('new')
    expect(titlesIn(d, 'new')).toEqual(['Fresh'])
  })

  it('says nothing at all about an unchanged item', () => {
    const item = queue({ gigs: [gig({ id: 11, name: 'Same', deadline: '2026-12-01' })] })[0]
    const d = digest({ gigs: [gig({ id: 11, name: 'Same', deadline: '2026-12-01' })] }, [
      { entityType: 'gig', entityId: 11, grp: 'new', fingerprint: fingerprint(item), reportedAt: daysAgo(7) },
    ])
    expect(d.empty).toBe(true)
    expect(d.groups).toEqual([])
  })

  it('reports a changed item under "changed under you"', () => {
    const before = queue({ gigs: [gig({ id: 12, name: 'Moved' })] })[0]
    const d = digest({ gigs: [gig({ id: 12, name: 'Moved', paid: 1, fee: '$45 entry' })] }, [
      { entityType: 'gig', entityId: 12, grp: 'new', fingerprint: fingerprint(before), reportedAt: daysAgo(7) },
    ])
    expect(titlesIn(d, 'changed')).toEqual(['Moved'])
  })

  it('promotes a lapsed snooze to "now actionable"', () => {
    // Regression: this branch was originally written against the stored
    // fingerprint, which can never record a snooze — snoozed items are never
    // reported, so no mark exists to carry one. Every lapsed snooze arrived
    // under "changed under you", burying the one group the email exists for.
    const before = queue({ gigs: [gig({ id: 70, name: 'Lapsed' })] })[0]

    const d = digest({
      gigs: [gig({
        id: 70, name: 'Lapsed', snoozedUntil: '2026-08-20',
        snoozedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      })],
    }, [{ entityType: 'gig', entityId: 70, grp: 'new', fingerprint: fingerprint(before), reportedAt: daysAgo(20) }])

    expect(titlesIn(d, 'actionable')).toEqual(['Lapsed'])
  })

  it('does not announce the same wake twice', () => {
    // Once the wake has been reported the mark carries its date, so a later
    // edit is an ordinary change rather than a second awakening.
    const woken = queue({
      gigs: [gig({
        id: 71, name: 'Already back', snoozedUntil: '2026-08-20',
        snoozedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      })],
    })[0]

    const d = digest({
      gigs: [gig({
        id: 71, name: 'Already back', paid: 1, fee: '$45', snoozedUntil: '2026-08-20',
        snoozedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      })],
    }, [{ entityType: 'gig', entityId: 71, grp: 'actionable', fingerprint: fingerprint(woken), reportedAt: daysAgo(5) }])

    expect(titlesIn(d, 'changed')).toEqual(['Already back'])
    expect(titlesIn(d, 'actionable')).toEqual([])
  })

  it('promotes a woken snooze to "now actionable"', () => {
    // The group that earns the email: the app decided you were needed, rather
    // than a research run having touched something.
    const before = queue({
      gigs: [gig({
        id: 13, name: 'Back', snoozedUntil: '2026-09-15',
        snoozedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      })],
    })[0]
    expect(before.snooze.active).toBe(true)

    // Snooze lapsed.
    const d = digest({
      gigs: [gig({
        id: 13, name: 'Back', snoozedUntil: '2026-08-20',
        snoozedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
      })],
    }, [{ entityType: 'gig', entityId: 13, grp: 'new', fingerprint: fingerprint(before), reportedAt: daysAgo(7) }])

    expect(titlesIn(d, 'actionable')).toEqual(['Back'])
  })

  it('promotes an item whose deadline came into range', () => {
    const before = queue({ gigs: [gig({ id: 14, name: 'Due now', deadline: '2027-06-01' })] })[0]
    const d = digest({ gigs: [gig({ id: 14, name: 'Due now', deadline: '2026-08-28' })] }, [
      { entityType: 'gig', entityId: 14, grp: 'new', fingerprint: fingerprint(before), reportedAt: daysAgo(7) },
    ])
    expect(titlesIn(d, 'actionable')).toEqual(['Due now'])
  })

  it('never mentions a snoozed item, however much it changed', () => {
    // Reporting something you told the app to stop asking about is the fastest
    // way to make the email unwelcome.
    const before = queue({ gigs: [gig({ id: 15, name: 'Quiet' })] })[0]
    const d = digest({
      gigs: [gig({
        id: 15, name: 'Quiet', paid: 1, fee: '$45',
        snoozedUntil: '2026-09-15', snoozedAt: '2026-08-20T10:00:00.000Z', updatedAt: '2026-08-20T10:00:00.000Z',
      })],
    }, [{ entityType: 'gig', entityId: 15, grp: 'new', fingerprint: fingerprint(before), reportedAt: daysAgo(7) }])
    expect(d.empty).toBe(true)
  })
})

describe('buildDigest — going stale', () => {
  const undated = (id: number, discoveredAt: string) =>
    gig({ id, name: `Rotting ${id}`, deadline: 'rolling intake', discoveredAt })

  /** A prior mention of `g`, `ago` days back. */
  const reported = (g: GigOpportunity, ago: number): PriorReport => ({
    entityType: 'gig', entityId: g.id, grp: 'stale',
    fingerprint: fingerprint(queue({ gigs: [g] })[0]), reportedAt: daysAgo(ago),
  })

  it('does not repeat an item already named in another group', () => {
    const d = digest({ gigs: [undated(25, '2026-01-05')] })
    expect(titlesIn(d, 'new')).toEqual(['Rotting 25'])
    expect(titlesIn(d, 'stale')).toEqual([])
  })

  it('goes quiet for a month after naming an item, then speaks again', () => {
    // The bug this covers shipped past the first round of unit tests and only
    // showed up against a live database: stale was picked by age alone, so the
    // same three rotting names went out every week until they were dealt with.
    // The fix is a cooldown rather than a never-repeat rule — these items never
    // change, so never-repeat would mention each one once and then hide the
    // whole pile forever, which is the failure the group exists to prevent.
    const item = undated(50, '2026-01-05')

    const justSaid = digest({ gigs: [item] }, [reported(item, 7)])
    expect(justSaid.empty).toBe(true)

    const longEnough = digest({ gigs: [item] }, [reported(item, 30)])
    expect(titlesIn(longEnough, 'stale')).toEqual(['Rotting 50'])
  })

  it('lets the next-oldest through while the last batch is still cooling', () => {
    const items = [
      undated(51, '2026-01-05'), undated(52, '2026-02-05'),
      undated(53, '2026-03-05'), undated(54, '2026-04-05'),
    ]
    // 51 and 52 were named last week; 53 and 54 have never been mentioned, so
    // they are "new" rather than stale — which is right, they are new to you.
    const d = digest({ gigs: items }, [reported(items[0], 7), reported(items[1], 7)])
    expect(titlesIn(d, 'stale')).toEqual([])
    expect(titlesIn(d, 'new')).toEqual(['Rotting 53', 'Rotting 54'])
  })

  it('names only the oldest few when a whole pile comes off cooldown', () => {
    const items = [
      undated(55, '2026-01-05'), undated(56, '2026-02-05'), undated(57, '2026-03-05'),
      undated(58, '2026-04-05'), undated(59, '2026-05-05'),
    ]
    const d = digest({ gigs: items }, items.map((g) => reported(g, 40)))
    expect(titlesIn(d, 'stale')).toEqual(['Rotting 55', 'Rotting 56', 'Rotting 57'])
  })
})

describe('buildDigest — "now actionable" means it became actionable', () => {
  it('files an already-due item that merely changed under "changed"', () => {
    // Second bug the live run caught: a gig nine days from its deadline picked
    // up a fee and was promoted to "now actionable", even though its deadline
    // had been in range all along. If everything lands in the group that earns
    // the email, the group stops earning it.
    const before = queue({ gigs: [gig({ id: 60, name: 'Already due', deadline: '2026-09-03' })] })[0]
    expect(before.flags.some((f) => f.id === 'due_soon')).toBe(true)

    const d = digest({ gigs: [gig({ id: 60, name: 'Already due', deadline: '2026-09-03', paid: 1, fee: '$45' })] }, [
      { entityType: 'gig', entityId: 60, grp: 'new', fingerprint: fingerprint(before), reportedAt: daysAgo(7) },
    ])
    expect(titlesIn(d, 'changed')).toEqual(['Already due'])
    expect(titlesIn(d, 'actionable')).toEqual([])
  })

  it('still promotes an item whose deadline only now came into range', () => {
    const before = queue({ gigs: [gig({ id: 61, name: 'Newly due', deadline: '2027-06-01' })] })[0]
    expect(before.flags.some((f) => f.id === 'due_soon')).toBe(false)

    const d = digest({ gigs: [gig({ id: 61, name: 'Newly due', deadline: '2026-08-28' })] }, [
      { entityType: 'gig', entityId: 61, grp: 'new', fingerprint: fingerprint(before), reportedAt: daysAgo(7) },
    ])
    expect(titlesIn(d, 'actionable')).toEqual(['Newly due'])
  })
})

describe('buildDigest — the contract with the caller', () => {
  it('orders groups new, actionable, changed, stale', () => {
    const beforeChanged = queue({ gigs: [gig({ id: 30, name: 'Changed' })] })[0]
    const beforeDue = queue({ gigs: [gig({ id: 31, name: 'Due', deadline: '2027-06-01' })] })[0]
    const d = digest({
      gigs: [
        gig({ id: 30, name: 'Changed', paid: 1, fee: '$45' }),
        gig({ id: 31, name: 'Due', deadline: '2026-08-28' }),
        gig({ id: 32, name: 'Brand new' }),
      ],
    }, [
      { entityType: 'gig', entityId: 30, grp: 'new', fingerprint: fingerprint(beforeChanged), reportedAt: daysAgo(7) },
      { entityType: 'gig', entityId: 31, grp: 'new', fingerprint: fingerprint(beforeDue), reportedAt: daysAgo(7) },
    ])
    expect(groupIds(d)).toEqual(['new', 'actionable', 'changed'])
  })

  it('drops empty groups instead of rendering empty headings', () => {
    const d = digest({ gigs: [gig({ id: 33, name: 'Only new' })] })
    expect(groupIds(d)).toEqual(['new'])
  })

  it('reports empty when there is nothing to say, so nothing is sent', () => {
    expect(digest({}).empty).toBe(true)
  })

  it('returns a mark for every line, so nothing is reported twice', () => {
    const d = digest({ gigs: [gig({ id: 34, name: 'A' }), gig({ id: 35, name: 'B' })] })
    const lines = d.groups.flatMap((g) => g.lines)
    expect(d.marks).toHaveLength(lines.length)
    for (const l of lines) {
      expect(d.marks).toContainEqual(
        expect.objectContaining({ entityId: l.id, fingerprint: l.fingerprint }),
      )
    }
  })

  it('carries the same sentence the card shows', () => {
    const items = queue({ gigs: [gig({ id: 36, name: 'Sentence', paid: 1, fee: '$85 CAD' })] })
    const d = buildDigest({ items, prior: [] })
    expect(d.groups[0].lines[0].rationale).toBe(items[0].decision.rationale)
  })

  it('covers sync targets, not just gigs', () => {
    const d = digest({ sync: [sync({ id: 40, name: 'Agency', notes: 'Submission status: NOT submitted.' })] })
    expect(titlesIn(d, 'new')).toEqual(['Agency'])
  })
})
