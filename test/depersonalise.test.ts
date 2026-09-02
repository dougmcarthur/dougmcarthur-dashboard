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

  it('leaves ordinary prose completely alone', () => {
    const plain = 'Genre fits the festival well; audience includes agents and labels.'
    expect(depersonalise(plain)).toBe(plain)
  })

  it('does not mangle a word that merely contains the name', () => {
    expect(depersonalise('Dougal Street venue')).toBe('Dougal Street venue')
  })
})
