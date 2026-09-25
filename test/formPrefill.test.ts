import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PREFILL_BUDGET, buildPrefillLink, googleFormBase, type PrefillField } from '../shared/formPrefill'
import { parseGoogleForm } from '../src/lib/formParser'

const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSabc_DEF-123/viewform'

function field(over: Partial<PrefillField> & { fieldKey: string }): PrefillField {
  return {
    label: over.fieldKey,
    fieldType: 'text',
    options: null,
    answer: 'An answer',
    state: 'approved',
    problems: [],
    ...over,
  }
}

function params(href: string | undefined): [string, string][] {
  return [...new URL(href!).searchParams.entries()]
}

describe('which addresses are Google Forms', () => {
  it('normalises the shapes a reader can end up holding to /viewform', () => {
    for (const url of [
      FORM,
      'https://docs.google.com/forms/d/e/1FAIpQLSabc_DEF-123/formResponse',
      'https://docs.google.com/forms/u/0/d/e/1FAIpQLSabc_DEF-123/viewform?usp=sf_link',
      'https://docs.google.com/forms/d/e/1FAIpQLSabc_DEF-123/viewform?entry.1=stale',
    ]) {
      expect(googleFormBase(url)).toBe(FORM)
    }
  })

  it('keeps an unpublished-style id without the /e/ segment', () => {
    expect(googleFormBase('https://docs.google.com/forms/d/abc123/viewform')).toBe(
      'https://docs.google.com/forms/d/abc123/viewform',
    )
  })

  it('refuses everything else, including a short link it cannot resolve', () => {
    expect(googleFormBase('https://forms.gle/xyz')).toBeNull()
    expect(googleFormBase('https://example.com/forms/d/e/abc/viewform')).toBeNull()
    expect(googleFormBase('https://docs.google.com/document/d/abc/edit')).toBeNull()
    expect(googleFormBase('not a url')).toBeNull()
    expect(googleFormBase(null)).toBeNull()
    expect(buildPrefillLink('https://jotform.com/123', [field({ fieldKey: 'entry.1' })])).toBeNull()
  })
})

describe('what goes in the link', () => {
  it('carries read answers against their entry ids, in form order', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1111', label: 'Artist name', answer: 'Doug McArthur', state: 'approved' }),
      field({ fieldKey: 'entry.2222', label: 'Bio', answer: 'Line one\nLine two', state: 'edited' }),
    ])!
    expect(link.href!.startsWith(`${FORM}?usp=pp_url&`)).toBe(true)
    expect(params(link.href)).toEqual([
      ['usp', 'pp_url'],
      ['entry.1111', 'Doug McArthur'],
      ['entry.2222', 'Line one\nLine two'],
    ])
    expect(link.included).toEqual(['Artist name', 'Bio'])
    expect(link.skipped).toEqual([])
  })

  it('leaves a suggestion out, because nobody has read it', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Name' }),
      field({ fieldKey: 'entry.2', label: 'Bio', state: 'suggested' }),
    ])!
    expect(link.included).toEqual(['Name'])
    expect(link.skipped).toEqual([{ label: 'Bio', reason: 'unread' }])
  })

  it('names uploads and over-long answers rather than dropping them', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Name' }),
      field({ fieldKey: 'entry.2', label: 'Press photo', fieldType: 'file', answer: null }),
      field({ fieldKey: 'entry.3', label: 'Short bio', problems: [{ id: 'over_length' }] }),
    ])!
    expect(link.skipped).toEqual([
      { label: 'Press photo', reason: 'upload' },
      { label: 'Short bio', reason: 'over_length' },
    ])
  })

  it('does not list questions with no answer at all', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Name' }),
      field({ fieldKey: 'entry.2', label: 'Website', answer: '  ', state: 'empty' }),
    ])!
    expect(link.skipped).toEqual([])
  })

  it('refuses a key the form did not give it', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Name' }),
      field({ fieldKey: 'artist_name', label: 'Stage name' }),
    ])!
    expect(link.skipped).toEqual([{ label: 'Stage name', reason: 'no_field_id' }])
  })

  it('encodes the characters a pasted link tends to break on', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', answer: "Rock & roll (mostly) — it's 100% live!" }),
    ])!
    expect(link.href!.split('?')[1]).not.toMatch(/[ '()!]/)
    expect(params(link.href)[1][1]).toBe("Rock & roll (mostly) — it's 100% live!")
  })
})

describe('choices must be ones the form offers', () => {
  const options = ['30 minutes', '45 minutes', 'Folk, roots']

  it('matches case and spacing to the option’s own spelling', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', fieldType: 'radio', options, answer: '  45   MINUTES ' }),
    ])!
    expect(params(link.href)[1]).toEqual(['entry.1', '45 minutes'])
  })

  it('skips a value Google would silently ignore', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Name' }),
      field({ fieldKey: 'entry.2', label: 'Set length', fieldType: 'select', options, answer: 'An hour' }),
    ])!
    expect(link.skipped).toEqual([{ label: 'Set length', reason: 'not_an_option' }])
  })

  it('repeats the parameter for each box ticked, splitting on lines and semicolons only', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.9', fieldType: 'checkbox', options, answer: 'folk, roots\n30 minutes; 45 minutes' }),
    ])!
    expect(params(link.href).slice(1)).toEqual([
      ['entry.9', 'Folk, roots'],
      ['entry.9', '30 minutes'],
      ['entry.9', '45 minutes'],
    ])
  })

  it('skips the whole checkbox question if any one value is not offered', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Name' }),
      field({ fieldKey: 'entry.9', label: 'Genres', fieldType: 'checkbox', options, answer: '30 minutes\nJazz' }),
    ])!
    expect(link.skipped).toEqual([{ label: 'Genres', reason: 'not_an_option' }])
  })
})

describe('dates', () => {
  it('passes an ISO date and refuses prose', () => {
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Available from', fieldType: 'date', answer: '2027-06-01' }),
      field({ fieldKey: 'entry.2', label: 'Available to', fieldType: 'date', answer: 'Late June' }),
    ])!
    expect(params(link.href)[1]).toEqual(['entry.1', '2027-06-01'])
    expect(link.skipped).toEqual([{ label: 'Available to', reason: 'not_a_date' }])
  })
})

describe('length', () => {
  it('stays inside the budget and names what did not fit', () => {
    const long = 'x'.repeat(2500)
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'One', answer: long }),
      field({ fieldKey: 'entry.2', label: 'Two', answer: long }),
      field({ fieldKey: 'entry.3', label: 'Three', answer: long }),
      field({ fieldKey: 'entry.4', label: 'Four', answer: 'short' }),
    ])!
    expect(link.length).toBeLessThanOrEqual(PREFILL_BUDGET)
    expect(link.href!.length).toBe(link.length)
    expect(link.included).toEqual(['One', 'Two', 'Four'])
    expect(link.skipped).toEqual([{ label: 'Three', reason: 'too_long_for_link' }])
  })

  it('measures after encoding, not before', () => {
    // Each non-ASCII character is several bytes once percent-encoded, so a
    // limit checked on the raw text would let this through.
    const link = buildPrefillLink(FORM, [
      field({ fieldKey: 'entry.1', label: 'Long', answer: 'é'.repeat(1500) }),
    ])!
    expect(link.skipped).toEqual([{ label: 'Long', reason: 'too_long_for_link' }])
  })
})

it('offers no href when nothing could go in, but still says why', () => {
  const link = buildPrefillLink(FORM, [field({ fieldKey: 'entry.1', label: 'Bio', state: 'suggested' })])!
  expect(link.href).toBeUndefined()
  expect(link.skipped).toEqual([{ label: 'Bio', reason: 'unread' }])
})

it('uses the keys the form reader actually produces', () => {
  const payload = [
    null,
    [null, [[111, 'Artist name', '', 0, [[1111, null, 1]]]], null, null, null, null, null, null, 'Form'],
  ]
  const form = parseGoogleForm(`<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(payload)};</script>`)!
  const link = buildPrefillLink(FORM, [field({ fieldKey: form.fields[0].fieldKey, label: 'Artist name' })])!
  expect(params(link.href)[1][0]).toBe('entry.1111')
})

describe('the pre-filled link on screen', () => {
  // Read off the source for the same reason as the application panel's guard:
  // a button that claims to send is a promise this app does not keep, and it
  // typechecks and renders perfectly.
  const src = readFileSync('frontend/src/pages/gigs/PrefillLink.tsx', 'utf8')

  it('opens the form and claims nothing more', () => {
    const offenders = [...src.matchAll(/(?:>|label=")\s*(Submit|Send|Apply now)\b/g)].map((m) => m[1])
    expect(offenders).toEqual([])
  })

  it('sends no Referer, and says the answers are in the address', () => {
    expect(src).toContain('rel="noreferrer"')
    expect(src).toContain('browser history')
  })
})
