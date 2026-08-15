import { describe, it, expect } from 'vitest'
import { buildProfile, heuristicAnswers } from '../src/lib/answerEngine'
import type { ParsedField } from '../src/lib/formParser'

const DOCS = [
  {
    id: 'artist-profile',
    title: 'Doug McArthur — Artist Brief',
    content: `# Doug McArthur — Artist Brief

## Artist Name

**Doug McArthur**
Singer-songwriter · Winnipeg, MB, Canada

## Genre

Alt-pop / indie singer-songwriter

## Links

- Website: https://dougmcarthur.net
- Spotify: https://open.spotify.com/artist/abc123
- YouTube: https://www.youtube.com/@dougmcarthur
- Contact: doug@dougmcarthur.net
`,
  },
  {
    id: 'epk-bio',
    title: 'Doug McArthur — EPK Bio',
    content: `# Doug McArthur — EPK Bio

## Press Quote

"Hermit Phase transcends time and space." — Nicole Mendes

## Bio

Doug McArthur is a Winnipeg singer-songwriter whose soulful voice and hook-laden melodies have been drawing audiences in for over two decades. He fronted Broken Halo and Soapbox through the 2000s. His 2025 single "Magic" earned airplay across Canada.
`,
  },
]

function field(partial: Partial<ParsedField> & { label: string }): ParsedField {
  return {
    fieldKey: partial.fieldKey ?? partial.label.toLowerCase().replace(/\W+/g, '_'),
    label: partial.label,
    fieldType: partial.fieldType ?? 'text',
    required: partial.required ?? false,
    position: partial.position ?? 0,
    maxLength: partial.maxLength,
    options: partial.options,
    helpText: partial.helpText,
  }
}

describe('buildProfile', () => {
  const profile = buildProfile(DOCS)

  it('pulls the identity facts out of the reference docs', () => {
    expect(profile.facts.name).toBe('Doug McArthur')
    expect(profile.facts.email).toBe('doug@dougmcarthur.net')
    expect(profile.facts.location).toBe('Winnipeg, MB, Canada')
    expect(profile.facts.genre).toBe('Alt-pop / indie singer-songwriter')
  })

  it('categorises links by platform', () => {
    expect(profile.facts.website).toBe('https://dougmcarthur.net')
    expect(profile.facts.spotify).toContain('open.spotify.com')
    expect(profile.facts.youtube).toContain('youtube.com')
  })

  it('keeps both a full bio and a short version', () => {
    expect(profile.facts.bio).toMatch(/^Doug McArthur is a Winnipeg singer-songwriter/)
    expect(profile.facts.shortBio!.length).toBeLessThan(profile.facts.bio!.length)
    expect(profile.facts.pressQuote).toContain('Hermit Phase')
  })
})

describe('heuristicAnswers (no API key)', () => {
  const profile = buildProfile(DOCS)

  it('fills the boilerplate fields from the profile', () => {
    const answers = heuristicAnswers(
      [
        field({ label: 'Artist or band name' }),
        field({ label: 'Contact email', fieldType: 'email' }),
        field({ label: 'Spotify link', fieldType: 'url' }),
        field({ label: 'Genre' }),
        field({ label: 'City' }),
      ],
      profile,
    )

    expect(answers.map((a) => a.answer)).toEqual([
      'Doug McArthur',
      'doug@dougmcarthur.net',
      'https://open.spotify.com/artist/abc123',
      'Alt-pop / indie singer-songwriter',
      'Winnipeg, MB, Canada',
    ])
    expect(answers.every((a) => !a.needsInput)).toBe(true)
  })

  it('respects a short field’s character limit when using the bio', () => {
    const [short] = heuristicAnswers(
      [field({ label: 'Short bio', fieldType: 'textarea', maxLength: 200 })],
      profile,
    )
    expect(short.answer.length).toBeLessThanOrEqual(200)
    expect(short.confidence).toBe('medium')
  })

  it('only ever answers a choice field with one of its own options', () => {
    const [picked] = heuristicAnswers(
      [field({ label: 'Genre', fieldType: 'select', options: ['Folk', 'Alt-pop', 'Metal'] })],
      profile,
    )
    expect(picked.answer).toBe('Alt-pop')

    const [unmatched] = heuristicAnswers(
      [field({ label: 'Genre', fieldType: 'select', options: ['Jazz', 'Classical'] })],
      profile,
    )
    expect(unmatched.answer).toBe('')
    expect(unmatched.needsInput).toBe(true)
    expect(unmatched.note).toContain('Jazz')
  })

  it('flags uploads, fees, and anything the docs cannot answer', () => {
    const answers = heuristicAnswers(
      [
        field({ label: 'Upload your stage plot', fieldType: 'file' }),
        field({ label: 'Application fee' }),
        field({ label: 'What is your preferred set time?' }),
      ],
      profile,
    )
    expect(answers.every((a) => a.needsInput)).toBe(true)
    expect(answers.every((a) => a.answer === '')).toBe(true)
    expect(answers[0].note).toBeTruthy()
  })
})
