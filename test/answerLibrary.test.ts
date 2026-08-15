import { describe, it, expect } from 'vitest'
import { classifyQuestion, targetLength } from '../src/lib/questionKinds'
import {
  selectLibraryAnswer,
  harvestCandidate,
  seedEntriesFromProfile,
  type LibraryEntryLike,
} from '../src/lib/answerLibrary'
import { applyLibrary } from '../src/lib/answerEngine'
import type { ParsedField } from '../src/lib/formParser'

function entry(partial: Partial<LibraryEntryLike> & { questionKey: string; content: string }): LibraryEntryLike {
  return {
    id: partial.id ?? 1,
    questionKey: partial.questionKey,
    label: partial.label ?? partial.questionKey,
    category: partial.category ?? 'story',
    content: partial.content,
    maxLength: partial.maxLength ?? null,
  }
}

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

describe('classifyQuestion', () => {
  it('recognises the same question across different wordings', () => {
    const cases: Array<[string, string]> = [
      ['Artist or band name', 'artist_name'],
      ['Name of the act', 'artist_name'],
      ['Contact email', 'email'],
      ['Short bio (150 words)', 'bio'],
      ['Tell us about your act', 'bio'],
      ['Please describe yourself', 'bio'],
      ['Spotify link', 'spotify'],
      ['Link to a live performance video', 'youtube'],
      ['Website', 'website'],
      ['What city are you based in?', 'hometown'],
      ['Genre', 'genre'],
      ['How long is your set?', 'set_length'],
      ['Technical requirements / rider', 'tech_requirements'],
      ['Where have you played recently?', 'previous_performances'],
      ['How did you hear about us?', 'how_did_you_hear'],
    ]
    for (const [label, expected] of cases) {
      expect(classifyQuestion({ label })?.key, label).toBe(expected)
    }
  })

  it('prefers the pitch question over the generic bio question', () => {
    expect(classifyQuestion({ label: 'Why do you want to play our festival?' })?.key).toBe(
      'why_this_event',
    )
    expect(classifyQuestion({ label: 'What makes your act unique?' })?.key).toBe(
      'what_sets_you_apart',
    )
  })

  it('never classifies a file upload', () => {
    expect(classifyQuestion({ label: 'Press photo', fieldType: 'file' })).toBeUndefined()
  })

  it('leaves genuinely unusual questions unclassified', () => {
    expect(classifyQuestion({ label: 'Which stage would suit you best?' })).toBeUndefined()
  })
})

describe('selectLibraryAnswer', () => {
  const bios = [
    entry({ id: 1, questionKey: 'bio', content: 'A'.repeat(600) }),
    entry({ id: 2, questionKey: 'bio', content: 'B'.repeat(280), maxLength: 300 }),
    entry({ id: 3, questionKey: 'bio', content: 'C'.repeat(120), maxLength: 150 }),
  ]

  it('uses the fullest variant that fits the field', () => {
    const match = selectLibraryAnswer(field({ label: 'Bio', fieldType: 'textarea', maxLength: 400 }), 'bio', bios)
    expect(match!.entry.id).toBe(2)
    expect(match!.fits).toBe(true)
  })

  it('uses the longest answer when the field states no limit', () => {
    const match = selectLibraryAnswer(field({ label: 'Bio', fieldType: 'textarea' }), 'bio', bios)
    expect(match!.entry.id).toBe(1)
  })

  it('reports a no-fit so the caller can condense rather than overflow', () => {
    const match = selectLibraryAnswer(
      field({ label: 'Bio', fieldType: 'textarea', maxLength: 100 }),
      'bio',
      bios,
    )
    expect(match!.fits).toBe(false)
    expect(match!.entry.id).toBe(3) // the shortest one to condense from
    expect(match!.limit).toBe(100)
  })

  it('returns nothing when the library has no answer for that question', () => {
    expect(selectLibraryAnswer(field({ label: 'Set length' }), 'set_length', bios)).toBeUndefined()
  })
})

describe('harvestCandidate', () => {
  it('keeps a length variant for length-sensitive questions', () => {
    const candidate = harvestCandidate(
      { label: 'Short bio', fieldType: 'textarea', maxLength: 250 },
      'A tight two-sentence bio.',
    )
    expect(candidate).toMatchObject({ questionKey: 'bio', maxLength: 250, category: 'story' })
  })

  it('stores one canonical answer for everything else', () => {
    const candidate = harvestCandidate(
      { label: 'Contact email', fieldType: 'email', maxLength: 120 },
      'doug@dougmcarthur.net',
    )
    expect(candidate).toMatchObject({ questionKey: 'email', maxLength: null })
  })

  it('skips answers that only make sense on one application', () => {
    expect(harvestCandidate({ label: 'How did you hear about us?' }, 'A friend')).toBeUndefined()
    expect(harvestCandidate({ label: 'Which dates are you available?' }, 'July 3')).toBeUndefined()
  })

  it('skips unclassified questions and empty answers', () => {
    expect(harvestCandidate({ label: 'Which stage suits you?' }, 'The barn')).toBeUndefined()
    expect(harvestCandidate({ label: 'Artist name' }, '   ')).toBeUndefined()
  })
})

describe('seedEntriesFromProfile', () => {
  const entries = seedEntriesFromProfile({
    name: 'Doug McArthur',
    email: 'doug@dougmcarthur.net',
    location: 'Winnipeg, MB',
    genre: 'Alt-pop',
    website: 'https://dougmcarthur.net',
    spotify: 'https://open.spotify.com/artist/abc',
    bio: 'A'.repeat(500),
    shortBio: 'A'.repeat(120),
  })

  it('creates one entry per known fact', () => {
    const keys = entries.map((e) => e.questionKey)
    expect(keys).toContain('artist_name')
    expect(keys).toContain('email')
    expect(keys).toContain('spotify')
    expect(entries.every((e) => e.content.length > 0)).toBe(true)
  })

  it('stores the short bio as its own length variant', () => {
    const bios = entries.filter((e) => e.questionKey === 'bio')
    expect(bios).toHaveLength(2)
    expect(bios.map((b) => b.maxLength).sort()).toEqual([300, null])
  })

  it('skips facts the docs did not provide', () => {
    expect(seedEntriesFromProfile({}).length).toBe(0)
  })
})

describe('applyLibrary', () => {
  const library = [
    entry({ id: 10, questionKey: 'artist_name', content: 'Doug McArthur' }),
    entry({ id: 11, questionKey: 'bio', content: 'B'.repeat(500) }),
  ]

  const fields = [
    field({ label: 'Artist name' }),
    field({ label: 'Short bio', fieldType: 'textarea', maxLength: 200 }),
    field({ label: 'Which stage suits you?', fieldType: 'textarea' }),
  ]

  const pass = applyLibrary(fields, library)

  it('answers matching fields outright from approved text', () => {
    const resolved = pass.resolved.get('artist_name')!
    expect(resolved.answer).toBe('Doug McArthur')
    expect(resolved.source).toBe('library')
    expect(resolved.libraryId).toBe(10)
    expect(resolved.confidence).toBe('high')
  })

  it('sends an over-long stored answer to be condensed rather than reusing it blind', () => {
    expect(pass.adapt.get('short_bio')?.entry.id).toBe(11)
    expect(pass.adapt.get('short_bio')?.limit).toBe(200)
    expect(pass.pending.map((f) => f.fieldKey)).toContain('short_bio')
  })

  it('leaves unrecognised questions to be drafted', () => {
    expect(pass.pending.map((f) => f.fieldKey)).toContain('which_stage_suits_you_')
    expect(pass.kinds.has('which_stage_suits_you_')).toBe(false)
  })

  it('never reuses an event-specific pitch verbatim, even when it fits', () => {
    const pitch = entry({
      id: 12,
      questionKey: 'why_this_event',
      content: 'Riverbend has exactly the listening-room atmosphere my songs live in.',
    })
    const pass = applyLibrary(
      [field({ label: 'Why do you want to play Prairie Sessions?', fieldType: 'textarea' })],
      [pitch],
    )

    const key = 'why_do_you_want_to_play_prairie_sessions_'
    expect(pass.resolved.has(key)).toBe(false)
    expect(pass.adapt.get(key)?.entry.id).toBe(12)
    expect(pass.pending.map((f) => f.fieldKey)).toEqual([key])
  })

  it('records the question kind even when the library has no answer yet', () => {
    const withoutLibrary = applyLibrary(fields, [])
    expect(withoutLibrary.kinds.get('artist_name')).toBe('artist_name')
    expect(withoutLibrary.pending).toHaveLength(3)
  })
})

describe('targetLength', () => {
  it('trusts a stated limit, assumes a modest one for single-line inputs', () => {
    expect(targetLength({ maxLength: 250 })).toBe(250)
    expect(targetLength({ fieldType: 'textarea' })).toBeNull()
    expect(targetLength({ fieldType: 'text' })).toBe(300)
  })
})
