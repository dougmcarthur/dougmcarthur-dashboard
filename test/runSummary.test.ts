import { describe, it, expect } from 'vitest'
import { brief, isOkRun, parseRunSummary, runGist } from '../shared/runSummary'

/**
 * The reports are written by agents outside this repo, in whatever layout the
 * model chose that day, so the fixtures below are the layouts seen in the run
 * log: a list on separate lines, the same list run together into one paragraph,
 * and a report with no list at all.
 */

const INTRO =
  'Read the artist brief and checked the 28 existing sync targets to avoid duplicates. ' +
  'Researched and filed 3 new targets with drafted pitches, each under 150 words:'

const ENTRIES = [
  'Songtradr (#32) — open, non-exclusive sync marketplace, 600k+ artists, 17.5% commission on completed deals. Flagged that this is self-serve.',
  'Sync & Shiver (#33) — Bristol UK boutique agency run by Charlotte Eve. Could not confirm they take unsolicited pitches.',
  'Imaginary Friends Music Partners (#34) — LA one-stop pre-cleared catalog run by Beth Wernick.',
]

const CLOSING = 'Did not re-pitch anything already on file. All three pitches are drafts only, nothing was sent.'

const onLines = [INTRO, ...ENTRIES.map((e, i) => `${i + 1}. ${e}`), CLOSING].join('\n')
const runTogether = `${INTRO} ${ENTRIES.map((e, i) => `${i + 1}. ${e}`).join(' ')} ${CLOSING}`

describe('a list on separate lines', () => {
  const report = parseRunSummary(onLines)

  it('finds the entries and names each one', () => {
    expect(report.entries.map((e) => e.label)).toEqual([
      'Songtradr',
      'Sync & Shiver',
      'Imaginary Friends Music Partners',
    ])
  })

  it('keeps what was said about each, without the row number', () => {
    expect(report.entries[0].note).toMatch(/^open, non-exclusive sync marketplace/)
    // A database id is not for a screen.
    expect(JSON.stringify(report)).not.toContain('(#')
  })

  it('does not take 17.5% for the start of an entry', () => {
    expect(report.entries).toHaveLength(3)
    expect(report.entries[0].note).toContain('17.5% commission')
  })

  it('puts the opening before the list and the remarks after it', () => {
    expect(report.intro.join(' ')).toBe(INTRO)
    expect(report.closing.join(' ')).toBe(CLOSING)
  })
})

describe('a list run together into one paragraph', () => {
  const report = parseRunSummary(runTogether)

  it('finds the same entries', () => {
    expect(report.entries.map((e) => e.label)).toEqual([
      'Songtradr',
      'Sync & Shiver',
      'Imaginary Friends Music Partners',
    ])
  })

  it('gives the tail to the last entry rather than guessing where it stops', () => {
    // Nothing marks the end of the last entry. Saying which sentence stops
    // being about it would be inventing a structure the text does not have.
    expect(report.closing).toEqual([])
    expect(report.entries[2].note).toContain('All three pitches are drafts only')
  })

  it('needs the numbers to count up from 1', () => {
    // "2." with no "1." before it is a sentence, not a list.
    const report2 = parseRunSummary('Checked 28 targets. Of those, 2. Brisk Records stood out and 3. were closed to pitches.')
    expect(report2.entries).toEqual([])
  })

  it('needs at least two, so one stray "1." starts nothing', () => {
    expect(parseRunSummary('The answer came back as 1. Nothing else changed this week.').entries).toEqual([])
  })
})

describe('a report with no list', () => {
  it('hands the paragraphs back as written', () => {
    const r = parseRunSummary('Timed out fetching a listing page after 30s.\n\nWill retry on the next run.')
    expect(r.entries).toEqual([])
    expect(r.intro).toEqual(['Timed out fetching a listing page after 30s.', 'Will retry on the next run.'])
  })

  it('breaks one long paragraph at sentence ends, and only there', () => {
    const sentence = 'The deadlines page returned a refusal and I retried it twice before moving on.'
    const long = Array.from({ length: 9 }, () => sentence).join(' ')
    const r = parseRunSummary(long)
    expect(r.intro.length).toBeGreaterThan(1)
    for (const paragraph of r.intro) expect(paragraph.endsWith('.')).toBe(true)
    expect(r.intro.join(' ')).toBe(long)
  })

  it('does not break a sentence after an abbreviation', () => {
    const filler = 'Read the listings page and recorded what each one asked for.'
    const text = `${filler} ${filler} ${filler} ${filler} The agency is Imaginary Friends Inc. Their roster is curated and closed to cold pitches. ${filler} ${filler}`
    const joined = parseRunSummary(text).intro
    for (let i = 0; i < joined.length - 1; i++) expect(joined[i]).not.toMatch(/Inc\.$/)
  })

  it('returns nothing for nothing', () => {
    expect(parseRunSummary(null)).toEqual({ intro: [], entries: [], closing: [] })
    expect(parseRunSummary('   \n  ')).toEqual({ intro: [], entries: [], closing: [] })
  })
})

describe('bulleted lists and emphasis', () => {
  it('reads bullets as entries', () => {
    const r = parseRunSummary('Filed two grants:\n- **Canada Council** — rolling intake\n- Arts Manitoba: closes in March')
    expect(r.entries).toEqual([
      { label: 'Canada Council', note: 'rolling intake' },
      { label: 'Arts Manitoba', note: 'closes in March' },
    ])
  })

  it('treats an indented line as part of the entry above it', () => {
    const r = parseRunSummary('Filed:\n1. Alpha — first line\n   still about Alpha\n2. Beta — second')
    expect(r.entries[0].note).toBe('first line still about Alpha')
    expect(r.closing).toEqual([])
  })

  it('names an entry with no separator by the line itself', () => {
    expect(parseRunSummary('Filed:\n1. Songtradr\n2. Sync & Shiver').entries).toEqual([
      { label: 'Songtradr', note: '' },
      { label: 'Sync & Shiver', note: '' },
    ])
  })
})

describe('the one-line gist', () => {
  it('names what a good run filed', () => {
    expect(runGist(onLines, 'ok')).toBe('Songtradr, Sync & Shiver and Imaginary Friends Music Partners')
  })

  it('says how many more when there are many', () => {
    const many = ['Filed five:', ...['A', 'B', 'C', 'D', 'E'].map((n, i) => `${i + 1}. ${n} — note`)].join('\n')
    expect(runGist(many, 'ok')).toBe('A, B, C and 2 more')
  })

  it('leads with the reason when a run did not come back fine', () => {
    // "Gig research finished incomplete" without the reason is the title with
    // the interesting half cut off, even if the run filed something first.
    const text = 'Manitoba Music returned HTTP 403 to every fetch. Filed two grants:\n1. A — x\n2. B — y'
    expect(runGist(text, 'incomplete')).toBe('Manitoba Music returned HTTP 403 to every fetch.')
  })

  it('falls back to the first sentence for a run with no list', () => {
    expect(runGist('Swept the usual listings. Filed 2 new opportunities.', 'ok')).toBe('Swept the usual listings.')
  })

  it('is never longer than asked', () => {
    expect(runGist('word '.repeat(200), 'ok', 60).length).toBeLessThanOrEqual(60)
  })

  it('is empty for a run that said nothing', () => {
    expect(runGist(null, 'ok')).toBe('')
  })
})

describe('brief', () => {
  it('cuts at a word and says it cut', () => {
    expect(brief('one two three four five', 14)).toBe('one two three…')
  })

  it('leaves a short text alone', () => {
    expect(brief('short', 20)).toBe('short')
  })

  it('flattens line breaks, which a single line cannot hold', () => {
    expect(brief('one\n\ntwo', 20)).toBe('one two')
  })
})

describe('what counts as a run that came back fine', () => {
  it('is ok or success and nothing else', () => {
    expect(isOkRun('ok')).toBe(true)
    expect(isOkRun('success')).toBe(true)
    for (const s of ['failed', 'incomplete', 'partial', '']) expect(isOkRun(s)).toBe(false)
  })
})
