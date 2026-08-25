import { describe, it, expect } from 'vitest'
import { snoozeOptions, addDays } from '../shared/snoozeOptions'
import type { ReviewItem } from '../shared/reviewQueue'
import { parseDeadline, parseNote } from '../shared/reviewParse'

const TODAY = '2026-08-25'

function item(o: { deadline?: string | null; note?: string | null }): Pick<ReviewItem, 'deadline' | 'parsed'> {
  return {
    deadline: parseDeadline(o.deadline ?? null),
    parsed: parseNote(o.note ?? null),
  }
}

const labels = (i: Parameters<typeof snoozeOptions>[0]) => snoozeOptions(i, TODAY).map((o) => o.label)

describe('addDays', () => {
  it('crosses a month end correctly', () => {
    expect(addDays('2026-08-25', 7)).toBe('2026-09-01')
  })

  it('goes backwards', () => {
    expect(addDays('2026-09-01', -7)).toBe('2026-08-25')
  })

  it('crosses a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('snoozeOptions', () => {
  it('offers the plain intervals on an item with no dates', () => {
    expect(labels(item({ deadline: 'rolling intake' }))).toEqual([
      'In a week', 'In a month', 'In three months',
    ])
  })

  it('offers the opening date when the item has one', () => {
    const opts = snoozeOptions(item({ deadline: 'Applications open October 1, 2026' }), TODAY)
    expect(opts).toContainEqual({ label: 'When it opens', date: '2026-10-01', derived: true })
  })

  it('never offers a date at or past a live deadline', () => {
    // Deadline in 40 days: a week and a month are fine, three months is not.
    const opts = snoozeOptions(item({ deadline: addDays(TODAY, 40) }), TODAY)
    expect(opts.every((o) => o.date < addDays(TODAY, 40))).toBe(true)
    expect(opts.map((o) => o.label)).not.toContain('In three months')
  })

  it('offers a week of warning before a distant deadline', () => {
    const opts = snoozeOptions(item({ deadline: '2026-12-01' }), TODAY)
    expect(opts).toContainEqual({ label: 'A week before the deadline', date: '2026-11-24', derived: true })
  })

  it('does not offer a week of warning when there is not a week to spare', () => {
    expect(labels(item({ deadline: addDays(TODAY, 4) }))).not.toContain('A week before the deadline')
  })

  it('offers nothing at all when the deadline is tomorrow', () => {
    // Correct: every date that could be picked is past the point of acting.
    // The UI still allows a typed date; it just stops suggesting one.
    expect(snoozeOptions(item({ deadline: addDays(TODAY, 1) }), TODAY)).toEqual([])
  })

  it('takes the date out of a "check back" note', () => {
    const opts = snoozeOptions(
      item({
        deadline: 'rolling',
        note: 'NOTE: submissions are not open yet — check back on September 15, 2026 to apply.',
      }),
      TODAY,
    )
    expect(opts).toContainEqual({
      label: 'When the note says to check back', date: '2026-09-15', derived: true,
    })
  })

  it('lets a derived option win a date a generic interval also lands on', () => {
    // Opens exactly 30 days out — "when it opens" is the reason, "in a month"
    // is a coincidence.
    const opens = addDays(TODAY, 30)
    const opts = snoozeOptions(item({ deadline: `Applications open ${opens}` }), TODAY)
    const atThatDate = opts.filter((o) => o.date === opens)
    expect(atThatDate).toHaveLength(1)
    expect(atThatDate[0].derived).toBe(true)
  })

  it('returns dates in order, all of them in the future', () => {
    const opts = snoozeOptions(item({ deadline: 'Applications open October 1, 2026' }), TODAY)
    expect(opts.map((o) => o.date)).toEqual([...opts.map((o) => o.date)].sort())
    expect(opts.every((o) => o.date > TODAY)).toBe(true)
  })

  it('ignores a check-back date that has already passed', () => {
    expect(labels(item({ deadline: 'rolling', note: 'NOTE: check back on January 5, 2026.' })))
      .not.toContain('When the note says to check back')
  })
})
