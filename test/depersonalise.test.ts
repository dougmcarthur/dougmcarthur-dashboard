import { describe, it, expect } from 'vitest'
import { artistNames, depersonalise as depersonaliseFor, parseNote as parseNoteFor } from '../shared/reviewParse'

const JANE = artistNames('Jane Smith')
const depersonalise = (text: string) => depersonaliseFor(text, JANE)
const parseNote = (note: string | null | undefined) => parseNoteFor(note, JANE)

/**
 * The notes were written about one person by agents who knew his name, so they
 * read "pending Jane's review". Shown to Jane that is the app talking about him
 * in the third person; shown to anyone else it is a stranger's name.
 */
describe('depersonalise', () => {
  it('rewrites a possessive into the second person', () => {
    expect(depersonalise("do not submit without Jane's review.")).toBe(
      'do not submit without your review.',
    )
    expect(depersonalise("Application not filled — pending Jane's review.")).toBe(
      'Application not filled — pending your review.',
    )
  })

  it('rewrites the bare name, and recapitalises a sentence that started with it', () => {
    expect(depersonalise('Jane should pick the video.')).toBe('You should pick the video.')
    expect(depersonalise('best left to Jane')).toBe('best left to you')
  })

  it('handles the full name', () => {
    expect(depersonalise('Contact Name: Jane Smith')).toBe('Contact Name: you')
  })

  it('covers the generic phrasing a non-Jane row would use', () => {
    expect(depersonalise("pending the artist's approval")).toBe('pending your approval')
  })

  it('does not mangle verb stems that end in e', () => {
    // "/e?s$/" turned these into "choos" and "decid".
    expect(depersonalise('Recommend Jane chooses the track.')).toBe(
      'Recommend you choose the track.',
    )
    expect(depersonalise('Jane decides on the fee.')).toBe('You decide on the fee.')
  })

  it('handles a typographic apostrophe, not just an ASCII one', () => {
    expect(depersonalise('pending Jane\u2019s review')).toBe('pending your review')
  })

  it('is case-insensitive on the bare name as well as the possessive', () => {
    expect(depersonalise('JANE should pick the video.')).toBe('You should pick the video.')
  })

  it('capitalises every sentence it opens, not only the first', () => {
    expect(depersonalise('Fee waived. Jane should pick the video.')).toBe(
      'Fee waived. You should pick the video.',
    )
  })

  it('rewrites the pronouns that referred to him, in the same sentence', () => {
    expect(depersonalise('Jane should pick the video and submit himself when ready.')).toBe(
      'You should pick the video and submit yourself when ready.',
    )
    expect(depersonalise('Best left to Jane — his call.')).toBe('Best left to you — your call.')
  })

  it('leaves a third party\u2019s pronouns alone', () => {
    // "his" here is the organiser's, not the artist's. Rewriting it would put
    // words in a stranger's mouth.
    const other = 'The organiser confirmed his deadline is firm.'
    expect(depersonalise(other)).toBe(other)
  })

  it('only rewrites pronouns in sentences that named him', () => {
    expect(depersonalise('Jane applied. The promoter sent his rider.')).toBe(
      'You applied. The promoter sent his rider.',
    )
  })

  it('leaves ordinary prose completely alone', () => {
    const plain = 'Genre fits the festival well; audience includes agents and labels.'
    expect(depersonalise(plain)).toBe(plain)
  })

  it('does not mangle a word that merely contains the name', () => {
    expect(depersonalise('Janeal Street venue')).toBe('Janeal Street venue')
  })
})

describe('what must NOT be depersonalised', () => {
  it('turns a bare name into "You", which is why answers are exempt at the call site', () => {
    // Documented rather than guarded here: the function cannot tell an answer
    // from commentary, so ReviewPage only applies it to fields flagged as
    // waiting on the artist. "Contact Name: You" on a festival form would be
    // the wrong text on the clipboard.
    expect(depersonalise('Jane Smith')).toBe('You')
  })
})

describe('the rewrite happens at the parser, not at each screen', () => {
  // The real production note, verbatim: it carries both cases at once — a
  // Contact Name whose value *is* his name, and a Contact Phone whose value is
  // a placeholder saying he still has to supply it.
  const NOTE =
    'Submission status: NOT submitted. Single-page intake form at the URL. ' +
    'Drafted field values for Jane to copy in himself: Artist type: I am an artist; ' +
    'Contact Name: Jane Smith; Email: doug@dougmcarthur.net; ' +
    'Contact Phone: needs Jane, not on file; Country: Canada. ' +
    "Application not filled — pending Jane's review."

  const parsed = parseNote(NOTE)

  it('leaves no trace of the name in any prose field it returns', () => {
    // Fixing this per-screen is what let the Overview deck go on saying
    // "needs Jane's review" for a day after the Review pane was fixed.
    const prose = [
      parsed.summary,
      parsed.submissionNote ?? '',
      ...parsed.blockers,
      ...parsed.alerts.map((a) => a.text),
      ...parsed.requirements,
      ...parsed.timing,
      ...parsed.dealTerms,
      ...parsed.provenance,
    ].join(' | ')
    expect(prose).not.toMatch(/\bJane\b/)
  })

  it('keeps his name where it is the answer, not the app talking', () => {
    const contact = parsed.draftedFields.find((f) => f.label === 'Contact Name')
    expect(contact?.value).toBe('Jane Smith')
    expect(contact?.needsArtist).toBe(false)
  })

  it('rewrites a drafted value that is a placeholder rather than an answer', () => {
    const phone = parsed.draftedFields.find((f) => f.label === 'Contact Phone')
    expect(phone?.needsArtist).toBe(true)
    expect(phone?.value).not.toMatch(/\bJane\b/)
    expect(phone?.value).toBe('needs you, not on file')
  })
})

describe('whose name is rewritten', () => {
  it('is the account\'s, so a note about somebody else is left as it was', () => {
    // Written for another artist: this account's name is not in it, and a
    // stranger's name must not turn into "you".
    expect(depersonaliseFor("do not submit without Alex's review.", JANE)).toBe("do not submit without Alex's review.")
    expect(depersonaliseFor("do not submit without Alex's review.", artistNames('Alex Rivera'))).toBe(
      'do not submit without your review.',
    )
  })

  it('matches the whole name and the first name, longest first', () => {
    const names = artistNames('Alex Rivera')
    expect(depersonaliseFor('Alex Rivera should pick one. Alex picks again.', names)).toBe('You should pick one. You pick again.')
  })

  it('matches only "the artist" when the account has no name yet', () => {
    const none = artistNames(null)
    expect(depersonaliseFor('The artist should pick one.', none)).toBe('You should pick one.')
    expect(depersonaliseFor('Jane should pick one.', none)).toBe('Jane should pick one.')
    expect(artistNames('   ').blocker.test("pending Jane's review")).toBe(false)
  })

  it('does not take a first name that is a day or a month, which would rewrite "Sat/Sun"', () => {
    const band = artistNames('Sun Dogs')
    expect(depersonaliseFor('Sun Dogs should pick one. Plays Sat/Sun.', band)).toBe('You should pick one. Plays Sat/Sun.')
  })

  it('survives a name made of characters a pattern treats as syntax', () => {
    const odd = artistNames('Mx (Smith) +1')
    expect(() => depersonaliseFor('Mx (Smith) +1 should pick one.', odd)).not.toThrow()
    expect(depersonaliseFor('Mx (Smith) +1 should pick one.', odd)).toBe('You should pick one.')
  })

  it('finds the blocker only for the account whose note it is', () => {
    const note = "Application drafted. Pending Alex's review."
    expect(parseNoteFor(note, artistNames('Alex Rivera')).blockers).toHaveLength(1)
    expect(parseNoteFor(note, artistNames('Jane Smith')).blockers).toHaveLength(0)
  })
})
