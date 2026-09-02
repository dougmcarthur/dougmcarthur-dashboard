import { describe, it, expect } from 'vitest'
import { depersonalise } from '../shared/reviewParse'

/**
 * The notes were written about one person by agents who knew his name, so they
 * read "pending Doug's review". Shown to Doug that is the app talking about him
 * in the third person; shown to anyone else it is a stranger's name.
 */
describe('depersonalise', () => {
  it('rewrites a possessive into the second person', () => {
    expect(depersonalise("do not submit without Doug's review.")).toBe(
      'do not submit without your review.',
    )
    expect(depersonalise("Application not filled — pending Doug's review.")).toBe(
      'Application not filled — pending your review.',
    )
  })

  it('rewrites the bare name, and recapitalises a sentence that started with it', () => {
    expect(depersonalise('Doug should pick the video.')).toBe('You should pick the video.')
    expect(depersonalise('best left to Doug')).toBe('best left to you')
  })

  it('handles the full name', () => {
    expect(depersonalise('Contact Name: Doug McArthur')).toBe('Contact Name: you')
  })

  it('covers the generic phrasing a non-Doug row would use', () => {
    expect(depersonalise("pending the artist's approval")).toBe('pending your approval')
  })

  it('does not mangle verb stems that end in e', () => {
    // "/e?s$/" turned these into "choos" and "decid".
    expect(depersonalise('Recommend Doug chooses the track.')).toBe(
      'Recommend you choose the track.',
    )
    expect(depersonalise('Doug decides on the fee.')).toBe('You decide on the fee.')
  })

  it('handles a typographic apostrophe, not just an ASCII one', () => {
    expect(depersonalise('pending Doug\u2019s review')).toBe('pending your review')
  })

  it('is case-insensitive on the bare name as well as the possessive', () => {
    expect(depersonalise('DOUG should pick the video.')).toBe('You should pick the video.')
  })

  it('capitalises every sentence it opens, not only the first', () => {
    expect(depersonalise('Fee waived. Doug should pick the video.')).toBe(
      'Fee waived. You should pick the video.',
    )
  })

  it('rewrites the pronouns that referred to him, in the same sentence', () => {
    expect(depersonalise('Doug should pick the video and submit himself when ready.')).toBe(
      'You should pick the video and submit yourself when ready.',
    )
    expect(depersonalise('Best left to Doug — his call.')).toBe('Best left to you — your call.')
  })

  it('leaves a third party\u2019s pronouns alone', () => {
    // "his" here is the organiser's, not the artist's. Rewriting it would put
    // words in a stranger's mouth.
    const other = 'The organiser confirmed his deadline is firm.'
    expect(depersonalise(other)).toBe(other)
  })

  it('only rewrites pronouns in sentences that named him', () => {
    expect(depersonalise('Doug applied. The promoter sent his rider.')).toBe(
      'You applied. The promoter sent his rider.',
    )
  })

  it('leaves ordinary prose completely alone', () => {
    const plain = 'Genre fits the festival well; audience includes agents and labels.'
    expect(depersonalise(plain)).toBe(plain)
  })

  it('does not mangle a word that merely contains the name', () => {
    expect(depersonalise('Dougal Street venue')).toBe('Dougal Street venue')
  })
})

describe('what must NOT be depersonalised', () => {
  it('turns a bare name into "You", which is why answers are exempt at the call site', () => {
    // Documented rather than guarded here: the function cannot tell an answer
    // from commentary, so ReviewPage only applies it to fields flagged as
    // waiting on the artist. "Contact Name: You" on a festival form would be
    // the wrong text on the clipboard.
    expect(depersonalise('Doug McArthur')).toBe('You')
  })
})
