import { describe, it, expect } from 'vitest'
import { EMPTY_EXCLUSIVITY, foldExclusivity, readExclusivity } from '../shared/syncExclusivity'

/**
 * Whether a sync organisation asks an artist for exclusivity.
 *
 * The rule under every row: only a stated term is a finding, caution beats
 * reassurance, and a sentence about what a *customer* gets is not about the
 * artist. Most libraries call their licence to customers non-exclusive, and
 * a reader that took the word without asking whose it was would call nearly
 * every library non-exclusive for the artist, which is the wrong way to be wrong.
 */

const NOW = '2027-01-15T12:00:00.000Z'

describe('a term the artist is offered', () => {
  const nonExclusive = [
    'All of our agreements with artists are non-exclusive, so you are free to place your music elsewhere.',
    'We work with songwriters on a non-exclusive basis.',
    'Our sync representation is non-exclusive and you keep your masters.',
    'We do not require exclusivity from the artists we represent.',
    'We never ask for exclusive rights to your music.',
    'There is no exclusivity requirement for artists who submit to the library.',
    'Exclusivity is not required, and you can submit the same songs to other libraries.',
    'Artists keep ownership and sign a non-exclusive agreement.',
  ]
  it.each(nonExclusive)('reads %j as non-exclusive', (text) => {
    expect(readExclusivity(text)?.kind).toBe('non_exclusive')
  })

  const exclusive = [
    'We sign artists to an exclusive representation agreement for a term of three years.',
    'Songs accepted into the catalogue are placed on an exclusive basis.',
    'Submitted tracks must be exclusive to us for the length of the contract.',
    'We require exclusivity for the first twelve months of the agreement.',
    'The writer grants the company the sole and exclusive right to license the composition.',
    'Our contract includes an exclusivity period of two years for every artist.',
    'We exclusively represent a small roster of composers.',
  ]
  it.each(exclusive)('reads %j as exclusive', (text) => {
    expect(readExclusivity(text)?.kind).toBe('exclusive')
  })
})

describe('what is not a finding', () => {
  const nothing = [
    // The library's licence to its customers, which is the commonest sentence on these sites.
    'Customers receive a non-exclusive, royalty-free licence to use the music in their projects.',
    'Every licence is non-exclusive and perpetual for your project.',
    'Exclusive licences are available to clients for an additional fee.',
    'Subscribers get a non-exclusive worldwide licence to every track.',
    // Marketing, not terms.
    'Join today for exclusive access to new releases.',
    'Members receive exclusive offers and early access to the catalogue.',
    // Neither side named.
    'The licence is non-exclusive.',
    // A doubt is not a statement.
    'We could not confirm whether the agreement is exclusive.',
    'Is the deal exclusive?',
    // Nothing at all.
    'We are always looking for new songwriters and composers.',
    '',
  ]
  it.each(nothing)('reads %j as nothing', (text) => {
    expect(readExclusivity(text)).toBeNull()
  })

  it('takes the subject from the sentence before when the second one names nobody', () => {
    const text = 'How it works for artists. We work on a non-exclusive basis.'
    expect(readExclusivity(text)?.kind).toBe('non_exclusive')
  })

  it('does not take it from a sentence about customers', () => {
    const text = 'What customers get. We work on a non-exclusive basis.'
    expect(readExclusivity(text)).toBeNull()
  })
})

describe('caution beats reassurance', () => {
  it('reads a page that says both as exclusive', () => {
    const text = [
      'Our standard artist agreement is non-exclusive.',
      'Some songwriters sign an exclusive representation agreement with us instead.',
    ].join('\n')
    const found = readExclusivity(text)
    expect(found?.kind).toBe('exclusive')
    expect(found?.quote).toMatch(/exclusive representation/)
  })

  it('reads one sentence that reassures and asks as exclusive', () => {
    const text = 'Agreements with artists are non-exclusive, though exclusive representation is available on request.'
    expect(readExclusivity(text)?.kind).toBe('exclusive')
  })

  it('does not read a negated ask as an ask', () => {
    expect(readExclusivity('We do not require exclusive rights from any artist.')?.kind).toBe('non_exclusive')
  })

  it('quotes the sentence it read, as it was worded', () => {
    const said = 'All of our agreements with artists are non-exclusive.'
    expect(readExclusivity(`Welcome.\n${said}`)?.quote).toBe(said)
  })
})

describe('writing it down', () => {
  const url = 'https://example.test/artists'

  it('records a finding with its sentence and the page it was on', () => {
    const folded = foldExclusivity(EMPTY_EXCLUSIVITY, { kind: 'non_exclusive', quote: 'We are non-exclusive.', url }, NOW)
    expect(folded).toEqual({
      exclusivity: 'non_exclusive',
      exclusivityEvidence: 'We are non-exclusive.',
      exclusivityUrl: url,
      termsReadAt: NOW,
    })
  })

  it('lets an exclusive reading replace a non-exclusive one, and never the other way', () => {
    const had = foldExclusivity(EMPTY_EXCLUSIVITY, { kind: 'non_exclusive', quote: 'Non-exclusive.', url }, NOW)
    const worse = foldExclusivity(had, { kind: 'exclusive', quote: 'Exclusive for three years.', url }, NOW)
    expect(worse.exclusivity).toBe('exclusive')
    const better = foldExclusivity(worse, { kind: 'non_exclusive', quote: 'Non-exclusive.', url }, NOW)
    expect(better.exclusivity).toBe('exclusive')
    expect(better.exclusivityEvidence).toBe('Exclusive for three years.')
  })

  it('tells "never looked" from "looked and found nothing"', () => {
    expect(EMPTY_EXCLUSIVITY.termsReadAt).toBeNull()
    const looked = foldExclusivity(EMPTY_EXCLUSIVITY, null, NOW)
    expect(looked.exclusivity).toBeNull()
    expect(looked.termsReadAt).toBe(NOW)
  })

  it('does not erase a finding because a later read found nothing', () => {
    const had = foldExclusivity(EMPTY_EXCLUSIVITY, { kind: 'non_exclusive', quote: 'Non-exclusive.', url }, NOW)
    const later = foldExclusivity(had, null, '2027-03-01T00:00:00.000Z')
    expect(later.exclusivity).toBe('non_exclusive')
    expect(later.termsReadAt).toBe('2027-03-01T00:00:00.000Z')
  })
})
