import { describe, it, expect } from 'vitest'
import {
  advanceIntake,
  dayText,
  moveSentence,
  planIntakes,
  reofferSentence,
  type IntakeEntry,
  type IntakeRow,
} from '../shared/intakes'

/**
 * A programme that comes round again.
 *
 * Two decisions are under every test. Pass means this intake and nothing about
 * the programme, so a passed or missed intake is offered again when the
 * programme opens; and a row nobody decided on is the same decision with a
 * newer date, so it moves. Everything else, an application in flight, a call
 * they applied to and lost, a row archived with no outcome, is left alone.
 */

const TODAY = '2027-01-15'
const day = (n: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

const entry = (o: Partial<IntakeEntry> = {}): IntakeEntry => ({
  id: 1, name: 'Touring Fund', deadline: day(40), deadlineNote: null, opensAt: null,
  firstSeenAt: day(-200), reopenedAt: null, delivery: null, ...o,
})

let n = 0
const row = (o: Partial<IntakeRow> = {}): IntakeRow => ({
  id: ++n, opportunityId: 1, status: 'passed', deadline: day(-30), ...o,
})

const plan = (entries: IntakeEntry[], rows: IntakeRow[]) => planIntakes({ entries, rows, today: TODAY })

describe('when a programme\'s own deadline moves forward', () => {
  const was = { deadline: day(-30), deadlineNote: 'old note', opensAt: null }

  it('takes a later date once the one it holds has gone', () => {
    expect(advanceIntake(was, { deadline: day(60), deadlineNote: null, opensAt: day(30) }, TODAY)).toEqual({
      deadline: day(60), deadlineNote: null, opensAt: day(30),
    })
  })

  it('does not move a deadline that is still ahead, since a later date may be another stream', () => {
    expect(advanceIntake({ ...was, deadline: day(5) }, { deadline: day(60), deadlineNote: null, opensAt: null }, TODAY)).toBeNull()
  })

  it('does not move backwards or sideways, or to a date that has also gone', () => {
    expect(advanceIntake(was, { deadline: day(-60), deadlineNote: null, opensAt: null }, TODAY)).toBeNull()
    expect(advanceIntake(was, { deadline: day(-30), deadlineNote: null, opensAt: null }, TODAY)).toBeNull()
    expect(advanceIntake(was, { deadline: day(-2), deadlineNote: null, opensAt: null }, TODAY)).toBeNull()
  })

  it('does not turn an open-ended entry into a dated one, or the reverse', () => {
    expect(advanceIntake({ ...was, deadline: null }, { deadline: day(60), deadlineNote: null, opensAt: null }, TODAY)).toBeNull()
    expect(advanceIntake(was, { deadline: null, deadlineNote: 'Rolling', opensAt: null }, TODAY)).toBeNull()
  })
})

describe('a New row follows its programme', () => {
  it('moves to the newer date when its own has gone', () => {
    const r = row({ status: 'discovered', deadline: day(-30) })
    expect(plan([entry({ deadline: day(40), deadlineNote: 'Earliest of several', opensAt: day(10) })], [r])).toEqual([
      { kind: 'advance', rowId: r.id, entryId: 1, name: 'Touring Fund', from: day(-30), to: day(40), opensAt: day(10), note: 'Earliest of several' },
    ])
  })

  it('moves only the newest when there are two', () => {
    const older = row({ status: 'discovered', deadline: day(-60) })
    const newer = row({ status: 'discovered', deadline: day(-30) })
    const moves = plan([entry()], [older, newer])
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ kind: 'advance', rowId: newer.id })
  })

  it('leaves a New row whose own date is still ahead', () => {
    expect(plan([entry({ deadline: day(60) })], [row({ status: 'discovered', deadline: day(10) })])).toEqual([])
  })
})

describe('what was passed or missed is offered again', () => {
  it('re-offers a passed intake, with what it was', () => {
    const r = row({ status: 'passed', deadline: day(-30) })
    expect(plan([entry()], [r])).toEqual([
      { kind: 'reoffer', entryId: 1, name: 'Touring Fund', last: day(-30), to: day(40), because: 'passed' },
    ])
  })

  it('re-offers a missed one', () => {
    expect(plan([entry()], [row({ status: 'expired' })])[0]).toMatchObject({ kind: 'reoffer', because: 'missed' })
  })

  it.each([
    ['they applied and lost', 'declined'],
    ['they won it', 'booked'],
    ['they withdrew after applying', 'withdrawn'],
    ['they archived it, which is how somebody says never', 'archived'],
  ])('does not re-offer one where %s', (_why, status) => {
    expect(plan([entry()], [row({ status })])).toEqual([])
  })

  it.each(['shortlisted', 'preparing', 'submitted', 'acknowledged', 'info_requested', 'invited'])(
    'does not touch an application in flight (%s)',
    (status) => {
      expect(plan([entry()], [row({ status })])).toEqual([])
    },
  )

  it('lets the most recent intake decide', () => {
    const lost = row({ status: 'declined', deadline: day(-20) })
    const passedEarlier = row({ status: 'passed', deadline: day(-200) })
    expect(plan([entry()], [passedEarlier, lost])).toEqual([])

    const passedLater = row({ status: 'passed', deadline: day(-10) })
    const lostEarlier = row({ status: 'declined', deadline: day(-200) })
    expect(plan([entry()], [lostEarlier, passedLater])[0]).toMatchObject({ kind: 'reoffer', last: day(-10) })
  })

  it('does not replace an intake that has not closed yet', () => {
    expect(plan([entry({ deadline: day(60) })], [row({ status: 'passed', deadline: day(10) })])).toEqual([])
  })
})

describe('what leaves it alone', () => {
  it('finds nothing the second time, because they now hold the entry\'s date', () => {
    const first = plan([entry()], [row({ status: 'passed' })])
    expect(first).toHaveLength(1)
    const filed = row({ status: 'discovered', deadline: day(40) })
    expect(plan([entry()], [row({ status: 'passed' }), filed])).toEqual([])
  })

  it('finds nothing once they have passed on this intake too, until the programme moves again', () => {
    const rows = [row({ status: 'passed', deadline: day(-30) }), row({ status: 'passed', deadline: day(40) })]
    expect(plan([entry({ deadline: day(40) })], rows)).toEqual([])
    // Fifty days on, both intakes have closed and the programme has moved again.
    const later = planIntakes({ entries: [entry({ deadline: day(200) })], rows, today: day(50) })
    expect(later[0]).toMatchObject({ kind: 'reoffer', last: day(40) })
  })

  it('finds nothing for a programme that has no date, or one that has closed', () => {
    expect(plan([entry({ deadline: null })], [row()])).toEqual([])
    expect(plan([entry({ deadline: day(-2) })], [row()])).toEqual([])
  })

  it('finds nothing for a row whose date is prose, since there is nothing to compare', () => {
    expect(plan([entry()], [row({ deadline: 'None, rolling intake' })])).toEqual([])
    expect(plan([entry()], [row({ deadline: null })])).toEqual([])
  })

  it('waits out the holding period for a new intake, and respects a block', () => {
    expect(plan([entry({ reopenedAt: `${day(-1)}T00:00:00.000Z` })], [row()])).toEqual([])
    expect(plan([entry({ reopenedAt: `${day(-5)}T00:00:00.000Z` })], [row()])).toHaveLength(1)
    expect(plan([entry({ reopenedAt: `${day(-1)}T00:00:00.000Z`, delivery: 'approved' })], [row()])).toHaveLength(1)
    expect(plan([entry({ delivery: 'blocked' })], [row()])).toEqual([])
  })

  it('does nothing for a row linked to no entry, or an entry nobody has a row for', () => {
    expect(plan([entry()], [row({ opportunityId: null })])).toEqual([])
    expect(plan([entry({ id: 99 })], [row()])).toEqual([])
  })
})

describe('what is said about it', () => {
  it('says which intake it was and when this one closes', () => {
    const passed = plan([entry()], [row({ status: 'passed', deadline: '2026-10-01' })])[0]
    if (passed.kind !== 'reoffer') throw new Error('expected a re-offer')
    expect(reofferSentence(passed, TODAY)).toBe(
      'This programme is open again. You passed on the last intake, which closed Oct 1, 2026. This one closes Feb 24.',
    )
    expect(reofferSentence({ ...passed, because: 'missed' }, TODAY)).toMatch(/You missed the last intake/)
  })

  it('names a moved deadline and an opened programme in the bell\'s words', () => {
    const [advance] = plan([entry()], [row({ status: 'discovered', deadline: day(-30) })])
    expect(moveSentence(advance, TODAY)).toBe('Touring Fund: the deadline moved from Dec 16, 2026 to Feb 24.')
    const [reoffer] = plan([entry()], [row({ status: 'passed' })])
    expect(moveSentence(reoffer, TODAY)).toBe('Touring Fund: open again, closes Feb 24.')
  })

  it('writes dates without a dash standing in for a comma', () => {
    expect(dayText('2027-03-01', TODAY)).toBe('Mar 1')
    expect(dayText('2028-03-01', TODAY)).toBe('Mar 1, 2028')
    const move = plan([entry()], [row({ status: 'passed' })])[0]
    if (move.kind !== 'reoffer') throw new Error('expected a re-offer')
    expect(reofferSentence(move, TODAY)).not.toMatch(/—|–/)
  })
})
