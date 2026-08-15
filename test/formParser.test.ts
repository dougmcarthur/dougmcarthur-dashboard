import { describe, it, expect } from 'vitest'
import { parseApplicationForm, parseHtmlForm, parseGoogleForm } from '../src/lib/formParser'

const FORM_HTML = `
<html><head><title>Apply — Sawdust City Music Festival</title></head>
<body>
  <h1>2027 Artist Application</h1>
  <form action="/submit" method="post">
    <input type="hidden" name="csrf_token" value="abc123">
    <label for="artist">Artist or band name</label>
    <input type="text" id="artist" name="artist_name" required maxlength="80">

    <label for="email">Contact email</label>
    <input type="email" id="email" name="email" required>

    <label for="bio">Short bio</label>
    <textarea id="bio" name="short_bio" maxlength="600"></textarea>

    <label for="genre">Genre</label>
    <select id="genre" name="genre">
      <option>Folk</option>
      <option>Indie rock</option>
      <option>Alt-pop</option>
    </select>

    <label for="epk">Press kit link</label>
    <input type="url" id="epk" name="epk_url">

    <fieldset>
      <input type="radio" name="performance_type" value="Solo">
      <input type="radio" name="performance_type" value="Full band">
    </fieldset>

    <input type="file" name="stage_plot">
    <button type="submit">Send</button>
  </form>
</body></html>
`

describe('parseHtmlForm', () => {
  const form = parseHtmlForm(FORM_HTML, 'https://www.sawdustcitymusicfestival.com/apply')

  it('reads the form title and reports no blockers', () => {
    expect(form.title).toBe('2027 Artist Application')
    expect(form.blockedReason).toBeNull()
    expect(form.loginRequired).toBe(false)
  })

  it('extracts one field per question, skipping hidden and submit inputs', () => {
    const keys = form.fields.map((f) => f.fieldKey)
    expect(keys).toEqual([
      'artist_name',
      'email',
      'short_bio',
      'genre',
      'epk_url',
      'performance_type',
      'stage_plot',
    ])
    expect(keys).not.toContain('csrf_token')
  })

  it('carries labels, types, requiredness and length limits', () => {
    const artist = form.fields.find((f) => f.fieldKey === 'artist_name')!
    expect(artist.label).toBe('Artist or band name')
    expect(artist.required).toBe(true)
    expect(artist.maxLength).toBe(80)

    const bio = form.fields.find((f) => f.fieldKey === 'short_bio')!
    expect(bio.fieldType).toBe('textarea')
    expect(bio.maxLength).toBe(600)

    expect(form.fields.find((f) => f.fieldKey === 'email')!.fieldType).toBe('email')
    expect(form.fields.find((f) => f.fieldKey === 'stage_plot')!.fieldType).toBe('file')
  })

  it('collapses select options and radio groups into choices', () => {
    expect(form.fields.find((f) => f.fieldKey === 'genre')!.options).toEqual([
      'Folk',
      'Indie rock',
      'Alt-pop',
    ])
    const radio = form.fields.find((f) => f.fieldKey === 'performance_type')!
    expect(radio.fieldType).toBe('radio')
    expect(radio.options).toEqual(['Solo', 'Full band'])
  })
})

describe('login and JavaScript detection', () => {
  it('flags a password field as login-gated', () => {
    const form = parseHtmlForm(
      '<html><body><form><input type="password" name="pw"></form></body></html>',
      'https://example.com/apply',
    )
    expect(form.loginRequired).toBe(true)
    expect(form.fields).toHaveLength(0)
    expect(form.blockedReason).toMatch(/login/i)
  })

  it('flags known account-gated portals by host', () => {
    const form = parseApplicationForm('<html><body>anything</body></html>', 'https://foo.submittable.com/submit')
    expect(form.loginRequired).toBe(true)
  })

  it('flags sign-in copy in the page body', () => {
    const form = parseHtmlForm(
      '<html><body><p>Please sign in to apply for this showcase.</p><input name="x"></body></html>',
      'https://example.com/apply',
    )
    expect(form.loginRequired).toBe(true)
  })

  it('explains JavaScript-rendered forms instead of returning nothing', () => {
    const form = parseHtmlForm('<html><body><div id="root"></div></body></html>', 'https://x.typeform.com/to/abc')
    expect(form.blockedReason).toMatch(/JavaScript/i)
  })

  it('reports a page with no fields rather than pretending it parsed', () => {
    const form = parseHtmlForm('<html><body><p>Applications open in March.</p></body></html>', 'https://example.com')
    expect(form.fields).toHaveLength(0)
    expect(form.blockedReason).toMatch(/No form fields/i)
  })
})

describe('parseGoogleForm', () => {
  // Trimmed shape of Google's public payload: [_, [_, items, ..., title]]
  const payload = [
    null,
    [
      null,
      [
        [111, 'Artist name', '', 0, [[1111, null, 1]]],
        [222, 'Tell us about your act', 'Two paragraphs max', 1, [[2222, null, 1]]],
        [333, 'Set length', '', 2, [[3333, [['30 minutes'], ['45 minutes']], 0]]],
        [444, 'Section header', '', 6, null],
      ],
      null,
      null,
      null,
      null,
      null,
      null,
      'Showcase Application 2027',
    ],
  ]

  const html = `<html><body><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(payload)};</script></body></html>`

  it('extracts questions with entry ids, types and options', () => {
    const form = parseGoogleForm(html)!
    expect(form.source).toBe('google-forms')
    expect(form.title).toBe('Showcase Application 2027')
    expect(form.fields.map((f) => f.fieldKey)).toEqual(['entry.1111', 'entry.2222', 'entry.3333'])
    expect(form.fields[0].required).toBe(true)
    expect(form.fields[1].fieldType).toBe('textarea')
    expect(form.fields[1].helpText).toBe('Two paragraphs max')
    expect(form.fields[2].options).toEqual(['30 minutes', '45 minutes'])
  })

  it('is preferred over HTML parsing for Google Forms pages', () => {
    const form = parseApplicationForm(html, 'https://docs.google.com/forms/d/e/abc/viewform')
    expect(form.source).toBe('google-forms')
  })
})
