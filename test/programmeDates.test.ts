import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { htmlToText } from '../src/lib/syncTerms'
import { readNextDeadline } from '../shared/programmeDates'

/**
 * The next closing date a programme's own page states.
 *
 * The rule under every test: a date is taken only from a line that says
 * deadline, closes or due, a year is required, and "any time before you travel"
 * is not a date. The fixture is a real capture of Canada Council's Arts Across
 * Canada and Abroad page (2026-10-14): ten funding opportunities, two of them
 * rolling, one with a season, and seven listing several dates each.
 */

const PAGE = htmlToText(readFileSync('test/fixtures/programmes/canadacouncil-aaca.html', 'utf8'))

describe('a real programme page with ten streams', () => {
  it('finds the earliest date still ahead, and says the page lists more than one', () => {
    const found = readNextDeadline(PAGE, '2026-10-15', null)
    expect(found).toMatchObject({ date: '2026-10-21', count: 2 })
    expect(found?.quote).toMatch(/^Next deadline\s*:/)
  })

  it('counts a date that falls today, which is still ahead', () => {
    expect(readNextDeadline(PAGE, '2026-10-14', null)?.date).toBe('2026-10-14')
  })

  it('finds nothing once every listed date has gone, and "Summer 2028" is not one', () => {
    expect(readNextDeadline(PAGE, '2026-11-05', null)).toBeNull()
  })

  it('finds nothing newer than the date the entry already holds', () => {
    expect(readNextDeadline(PAGE, '2026-10-15', '2026-10-21')?.date).toBe('2026-11-04')
    expect(readNextDeadline(PAGE, '2026-10-15', '2026-11-04')).toBeNull()
  })

  it('does not read a rolling stream as a date', () => {
    const rolling = htmlToText('<p><strong>Next deadline</strong>: Any time before your departure date</p>')
    expect(readNextDeadline(rolling, '2026-10-15', null)).toBeNull()
  })
})

describe('what is a deadline line and what is not', () => {
  const read = (text: string, today = '2027-01-10', after: string | null = null) =>
    readNextDeadline(text, today, after)?.date ?? null

  it.each([
    ['Deadline: March 1, 2027', '2027-03-01'],
    ['Application deadline - 2027-03-15', '2027-03-15'],
    ['Next deadlines: Feb 15, 2027 | Jun 15, 2027', '2027-02-15'],
    ['Closes: April 30, 2027', '2027-04-30'],
    ['Closing date: May 1, 2027', '2027-05-01'],
    ['Due date: 2027-06-01', '2027-06-01'],
    ['Applications close on March 31, 2027.', '2027-03-31'],
    ['Submissions are due by April 2, 2027', '2027-04-02'],
  ])('reads %j', (line, expected) => {
    expect(read(line)).toBe(expected)
  })

  it.each([
    // Not a closing line at all.
    ['The festival runs July 10, 2027 to July 12, 2027.'],
    ['Posted: January 5, 2027'],
    ['Annual report 2026-2027'],
    // A year is required.
    ['Deadline: November 20'],
    ['Next deadline: March 1'],
    // History.
    ['Previous deadline: October 1, 2026'],
    ['Previous applications closed on October 1, 2026'],
    ['The 2026 deadline was October 17, 2026'],
    // An opening is not a closing.
    ['Deadline: opens September 1, 2027'],
    // Prose, however many dates it holds.
    ['We opened the call in the fall and the deadline for the whole round, as discussed with the board and described at length in the guidelines that follow, is March 1, 2027, though we may extend it, and everything else in this paragraph is context that a reader would skim past on the way to the form. '.repeat(3)],
  ])('does not read %j', (line) => {
    expect(read(line)).toBeNull()
  })

  it('takes the closing half of "opens ...; closes ..."', () => {
    expect(read('Deadlines: opens September 1, 2027; closes November 30, 2027', '2027-01-10')).toBe('2027-11-30')
  })

  it('ignores a date that has passed and takes the one after it', () => {
    expect(read('Next deadline: December 1, 2026 | March 1, 2027', '2027-01-10')).toBe('2027-03-01')
  })

  it('reads nothing from nothing', () => {
    expect(readNextDeadline(null, '2027-01-10', null)).toBeNull()
    expect(readNextDeadline('', '2027-01-10', null)).toBeNull()
  })
})
