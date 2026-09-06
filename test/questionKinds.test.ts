import { describe, it, expect } from 'vitest'
import {
  QUESTION_KINDS,
  classifyQuestion,
  kindByKey,
  targetLength,
} from '../src/lib/questionKinds'

/**
 * The list is ordered, and that order is the whole design: the first kind whose
 * pattern matches wins, so a specific question has to sit above the general one
 * that would also swallow it. Nothing about that is visible from a single
 * entry, so the ambiguous labels are pinned here.
 */
describe('classifying a form field', () => {
  const cases: Array<[string, string]> = [
    // Each of these also matches a broader pattern further down the list.
    ['Why do you want to play our festival?', 'why_this_event'],
    ['Tell us about your band', 'bio'],
    ['What sets you apart from other applicants?', 'what_sets_you_apart'],
    ['Describe your act in one sentence', 'one_liner'],
    ['Link to a live video', 'youtube'],
    ['Spotify artist link', 'spotify'],
    ['Where have you performed recently?', 'previous_performances'],
    ['Technical requirements / stage plot', 'tech_requirements'],
    ['Artist or band name', 'artist_name'],
    ['Contact email', 'email'],
    ['Monthly listeners', 'streaming_stats'],
    ['How did you hear about us?', 'how_did_you_hear'],

    // Four that the self-classification check below caught being shadowed or
    // missed outright. 'Contact name' is the one with teeth: it contains the
    // letters of "act name", so the artist-name pattern claimed it and the
    // form would have been filled with the wrong name.
    ['Contact name', 'contact_name'],
    ['One-line description', 'one_liner'],
    ['Streaming numbers', 'streaming_stats'],
    ['How you heard about us', 'how_did_you_hear'],
  ]

  for (const [label, key] of cases) {
    it(`reads "${label}" as ${key}`, () => {
      expect(classifyQuestion({ label })?.key).toBe(key)
    })
  }

  it('reads the field key and help text, not just the visible label', () => {
    expect(classifyQuestion({ label: 'Link', fieldKey: 'bandcamp_url' })?.key).toBe('bandcamp')
    expect(
      classifyQuestion({ label: 'About', helpText: 'A short artist biography, 150 words' })?.key,
    ).toBe('bio')
  })

  it('never classifies a file upload — the answer is a file, not reusable text', () => {
    expect(classifyQuestion({ label: 'Artist bio', fieldType: 'file' })).toBeUndefined()
    expect(classifyQuestion({ label: 'Press photo', fieldType: 'file' })).toBeUndefined()
  })

  it('returns undefined rather than guessing at a question it does not know', () => {
    expect(classifyQuestion({ label: 'Do you have a valid passport?' })).toBeUndefined()
  })
})

describe('the kind list itself', () => {
  it('has unique keys', () => {
    const keys = QUESTION_KINDS.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('classifies each kind as itself from its own canonical label', () => {
    // A pattern that cannot match the label it is named for is a typo, and one
    // that gets shadowed by an earlier entry is an ordering mistake.
    const wrong = QUESTION_KINDS.filter((k) => classifyQuestion({ label: k.label })?.key !== k.key)
    expect(wrong.map((k) => k.key)).toEqual([])
  })

  it('marks answers that name their event as adapt rather than verbatim', () => {
    // Pasting last year's "why your festival" answer into the next application
    // is the specific mistake this flag exists to prevent.
    expect(kindByKey('why_this_event')?.reuse).toBe('adapt')
    expect(kindByKey('what_sets_you_apart')?.reuse).toBe('adapt')
    expect(kindByKey('bio')?.reuse).toBe('verbatim')
  })

  it('has no key that kindByKey cannot find', () => {
    expect(QUESTION_KINDS.every((k) => kindByKey(k.key) === k)).toBe(true)
  })
})

describe('target length', () => {
  it('takes a stated maximum over any guess', () => {
    expect(targetLength({ maxLength: 150, fieldType: 'textarea' })).toBe(150)
  })

  it('leaves a textarea with no stated limit open, so the fullest answer is used', () => {
    expect(targetLength({ fieldType: 'textarea' })).toBeNull()
  })

  it('assumes a single-line input is short even when it claims no limit', () => {
    expect(targetLength({ fieldType: 'text' })).toBe(300)
  })
})
