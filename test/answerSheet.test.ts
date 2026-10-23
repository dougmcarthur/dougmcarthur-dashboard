import { describe, expect, it } from 'vitest'
import { copiedNote, copyableText, firstCopyable, overBy, stepTo, type SheetField } from '../shared/answerSheet'

const text = (answer: string | null, maxLength: number | null = null): SheetField => ({
  fieldType: 'textarea',
  answer,
  maxLength,
})
const upload: SheetField = { fieldType: 'file', answer: null, maxLength: null }

describe('what there is to copy', () => {
  it('is the answer, untouched', () => {
    expect(copyableText(text('  Two spaces in front.\n'))).toBe('  Two spaces in front.\n')
  })

  it('is nothing for a blank answer, however it is blank', () => {
    expect(copyableText(text(null))).toBeNull()
    expect(copyableText(text(''))).toBeNull()
    expect(copyableText(text(' \n\t '))).toBeNull()
  })

  it('is nothing for an upload, even one that somehow holds text', () => {
    expect(copyableText(upload)).toBeNull()
    expect(copyableText({ ...upload, answer: 'press-photo.jpg' })).toBeNull()
  })
})

describe('moving the highlight', () => {
  const fields = [text('bio'), upload, text(null), text('links'), text('genre')]

  it('steps over rows with nothing to copy', () => {
    expect(stepTo(fields, 0, 1)).toBe(3)
    expect(stepTo(fields, 3, -1)).toBe(0)
  })

  it('stays where it is at either end', () => {
    expect(stepTo(fields, 4, 1)).toBe(4)
    expect(stepTo(fields, 0, -1)).toBe(0)
  })

  it('stays put when nothing further has an answer', () => {
    expect(stepTo([text('only'), upload, text('')], 0, 1)).toBe(0)
  })

  it('starts on the first answer, not on a question with none', () => {
    expect(firstCopyable([text(null), upload, text('first')])).toBe(2)
  })

  it('starts at the top when there is nothing to copy at all', () => {
    expect(firstCopyable([text(null), upload])).toBe(0)
    expect(firstCopyable([])).toBe(0)
  })
})

describe('an answer that will not fit', () => {
  it('counts the characters past the limit', () => {
    expect(overBy(text('a'.repeat(160), 150))).toBe(10)
    expect(overBy(text('a'.repeat(150), 150))).toBe(0)
  })

  it('is not over a limit that is not there', () => {
    expect(overBy(text('a'.repeat(5000), null))).toBe(0)
  })

  it('is still copied, and the sentence says it will be cut off', () => {
    const note = copiedNote('Short bio', text('a'.repeat(160), 150), false)
    expect(note).toContain('Copied Short bio.')
    expect(note).toContain('10 over the 150-character limit')
    expect(note).toContain('cut off')
  })

  it('says nothing extra about one that fits', () => {
    expect(copiedNote('Genre', text('folk', 50), false)).toBe('Copied Genre.')
  })

  it('says when that was the last one', () => {
    expect(copiedNote('Genre', text('folk'), true)).toBe('Copied Genre. That was the last answer.')
  })
})
