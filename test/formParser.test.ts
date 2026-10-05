import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  chooseFormLink,
  findApplicationLinks,
  parseApplicationForm,
  parseFestivalProForm,
  parseHtmlForm,
  parseGoogleForm,
} from '../src/lib/formParser'

// Real pages, captured 2026-10-05, scripts and styles removed. The FestivalPro
// form is Canmore Folk Music Festival's artist application; the other is the
// festival's own artist page that links to it.
const FESTIVALPRO = readFileSync('test/fixtures/festivalpro-artist-form.html', 'utf8')
const ARTIST_INFO = readFileSync('test/fixtures/canmore-artist-info.html', 'utf8')
const FORM_URL = 'https://canmorefolkfest.festivalpro.com/form/59EFFCD97622A7A502E7/0'
const INFO_URL = 'https://www.canmorefolkfestival.com/get-involved/artist-info'

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

/**
 * The first read of this form filed twenty-seven questions called "765",
 * "3013", "2933": FestivalPro puts a question's text in a div beside its input,
 * with no <label for> between them, so the generic reader found no label and
 * fell back to the input's name — which is the field's number.
 */
describe('parseFestivalProForm', () => {
  const form = parseApplicationForm(FESTIVALPRO, FORM_URL)
  const field = (key: string) => form.fields.find((f) => f.fieldKey === key)!

  it('is chosen by its markup, and reads every question on the page', () => {
    expect(form.source).toBe('festivalpro')
    expect(form.blockedReason).toBeNull()
    expect(form.fields).toHaveLength(27)
    expect(parseFestivalProForm('<html><body><form><input name="x"></form></body></html>')).toBeNull()
  })

  it('labels each field with its question, never with its number', () => {
    expect(form.fields.filter((f) => /^\d+$/.test(f.label))).toEqual([])
    expect(field('765').label).toBe('Band/Artist Name')
    expect(field('2933').label).toBe('Artist Biography')
    expect(field('253').label).toBe('Why do you want to play at our festival?')
    expect(field('3003').label).toBe('EPK (Electronic Press Kit)')
  })

  it('keeps the field number as the key, so a re-read refreshes rows already stored', () => {
    expect(form.fields.map((f) => f.fieldKey).slice(0, 6)).toEqual(['3005', '495', '765', '767', '769', '771'])
  })

  it('takes requiredness from the row rather than guessing', () => {
    expect(field('765').required).toBe(true)
    expect(field('2933').required).toBe(true)
    expect(field('249').required).toBe(false) // Website
    expect(field('2997').required).toBe(false)
  })

  it('maps each kind of control to the type the dashboard renders', () => {
    expect(field('765').fieldType).toBe('text')
    expect(field('771').fieldType).toBe('email')
    expect(field('2933').fieldType).toBe('textarea')
    expect(field('3003').fieldType).toBe('file')
    expect(field('3005').fieldType).toBe('checkbox')
    expect(field('3005').options).toEqual([
      'The Warm Up (February 12-13, 2027)',
      'Canmore Folk Festival (July 31-August 2, 2027)',
    ])
  })

  it('reads a switch as the yes/no question it is', () => {
    expect(field('1357').fieldType).toBe('radio')
    expect(field('1357').options).toEqual(['Yes', 'No'])
  })

  it('drops the select prompt from the choices, and reads a list that allows several as a checkbox group', () => {
    expect(field('246').fieldType).toBe('select')
    expect(field('246').options).toEqual(['Solo', 'Group', 'Both/Either'])
    expect(field('951').fieldType).toBe('checkbox')
    expect(field('951').options).toContain('Folk')
    expect(field('951').options).toContain('R&B')
  })

  it('gives each hint to its own question, including the one that sits outside its row', () => {
    expect(field('493').helpText).toBe('Country, province/state, city/town')
    expect(field('2997').helpText).toBe('Please list recent notable performances including location and date')
    // "Select all that apply" is a div of its own that sits above the Genres
    // row, so it lands in the row before it unless its class is read.
    expect(field('951').helpText).toBe('Select all that apply')
    expect(field('2997').helpText).not.toContain('Select all')
    expect(field('3003').helpText).toBe('Maximum file size 5MB')
  })

  it('does not require a follow-up the form only shows when its switch is on', () => {
    // Both are `required` in the markup and hidden by script until the switch
    // above them is turned on. Required, they would stop the application ever
    // reading as ready for anyone who had not played there before.
    for (const key of ['1359', '3009']) {
      expect(field(key).required).toBe(false)
      expect(field(key).helpText).toMatch(/^Only asked if “.+” is switched on$/)
    }
    expect(field('1359').helpText).toContain('Have you performed at one of our festivals in the past?')
    expect(field('253').required).toBe(true)
  })

  it('leaves out what is not a question: the language picker, hidden inputs, the submit button', () => {
    const keys = form.fields.map((f) => f.fieldKey)
    expect(keys).not.toContain('LANGUAGE')
    expect(keys).not.toContain('REGISTER')
    expect(keys).not.toContain('COMPLETE')
    expect(keys.filter((k) => k.endsWith('-EXISTS'))).toEqual([])
  })
})

/**
 * The festival's footer carries a newsletter box, and the generic reader
 * counted any <input> on the page. A listing page therefore came back `ready`
 * with a single field — "Enter your email" — and the artist's address staged
 * against it, which is how the signup became the whole application.
 */
describe('a page that is not the application form', () => {
  it('does not read the newsletter box as an application', () => {
    const form = parseApplicationForm(ARTIST_INFO, INFO_URL)
    expect(form.fields).toEqual([])
    expect(form.blockedKind).toBe('no-fields')
  })

  it('skips a signup form by its tag, and still reads the real one beside it', () => {
    const form = parseHtmlForm(
      `<html><body>
        <form id="newsletter" action="/subscribe"><input type="email" name="e" required></form>
        <form action="/apply"><label for="n">Act name</label><input id="n" name="act" required>
          <label for="b">Bio</label><textarea id="b" name="bio"></textarea></form>
      </body></html>`,
      'https://example.com/apply',
    )
    expect(form.fields.map((f) => f.fieldKey)).toEqual(['act', 'bio'])
  })

  it('refuses a lone email box even when nothing in its markup says newsletter', () => {
    const form = parseHtmlForm(
      '<html><body><form action="/go"><input type="email" name="addr" placeholder="Your email"></form></body></html>',
      'https://example.com/',
    )
    expect(form.fields).toEqual([])
    expect(form.blockedKind).toBe('no-fields')
    expect(form.blockedReason).toMatch(/signup/i)
  })

  it('does not take "sign-up" as a reason to skip a form, since some festivals call the application that', () => {
    const form = parseHtmlForm(
      `<html><body><form action="/artist-signup">
        <label for="n">Act name</label><input id="n" name="act">
        <label for="e">Email</label><input id="e" type="email" name="email"></form></body></html>`,
      'https://example.com/',
    )
    expect(form.fields.map((f) => f.fieldKey)).toEqual(['act', 'email'])
  })

  it('names the blocked kind for a login wall and a JavaScript form too', () => {
    expect(parseHtmlForm('<html><body><input type="password" name="p"></body></html>', 'https://x.org/').blockedKind).toBe('login')
    expect(parseHtmlForm('<html><body></body></html>', 'https://x.typeform.com/to/a').blockedKind).toBe('javascript')
  })
})

describe('finding the form from the page that announces it', () => {
  it('picks out the Apply button on the festival’s artist page, on another host', () => {
    const links = findApplicationLinks(ARTIST_INFO, INFO_URL)
    expect(links[0]).toMatchObject({ url: FORM_URL, text: 'APPLY NOW!' })
    expect(chooseFormLink(links).link?.url).toBe(FORM_URL)
  })

  it('offers nothing on a page whose links only lead further into the site', () => {
    // The festival's home page: "Artists", "Vendors", "Volunteers" — a path to
    // the form, not the form, and not worth guessing along.
    const home = `<html><body><nav>
      <a href="/get-involved/artist-info">Artists</a><a href="/get-involved/vendors">Vendors</a>
      <a href="/get-involved/volunteers">Volunteers</a><a href="/festival/schedule">Schedule</a></nav></body></html>`
    expect(chooseFormLink(findApplicationLinks(home, 'https://www.canmorefolkfestival.com/')).link).toBeNull()
  })

  it('prefers the form for artists over the form for vendors', () => {
    const page = `<html><body>
      <a href="https://fest.festivalpro.com/form/AAA/0">Vendor application</a>
      <a href="https://fest.festivalpro.com/form/BBB/0">Artist application</a></body></html>`
    expect(chooseFormLink(findApplicationLinks(page, 'https://fest.example/')).link?.url).toBe(
      'https://fest.festivalpro.com/form/BBB/0',
    )
  })

  it('declines to choose between two buttons that read alike, and names both', () => {
    const page = `<html><body>
      <a href="https://fest.festivalpro.com/form/AAA/0">Apply now</a>
      <a href="https://fest.festivalpro.com/form/BBB/0">Apply now</a></body></html>`
    const { link, candidates } = chooseFormLink(findApplicationLinks(page, 'https://fest.example/'))
    expect(link).toBeNull()
    expect(candidates).toHaveLength(2)
  })

  it('counts a repeated link once, at its best score', () => {
    const page = `<html><body>
      <a href="https://fest.festivalpro.com/form/AAA/0">Apply now</a>
      <a href="https://fest.festivalpro.com/form/AAA/0"><img src="x.png"></a></body></html>`
    expect(findApplicationLinks(page, 'https://fest.example/')).toHaveLength(1)
  })

  it('ignores links that are not a page to read', () => {
    const page = `<html><body>
      <a href="mailto:apply@fest.example">Apply by email</a>
      <a href="javascript:void(0)">Apply</a>
      <a href="#apply">Apply</a>
      <a href="https://fest.example/apply">Apply</a></body></html>`
    // The last one is the page itself.
    expect(findApplicationLinks(page, 'https://fest.example/apply')).toEqual([])
  })

  it('resolves a relative link against the page it came from', () => {
    const links = findApplicationLinks('<a href="../submit/artists">Submit your music</a>', 'https://fest.example/about/team')
    expect(links[0].url).toBe('https://fest.example/submit/artists')
  })

  it('survives a malformed address in somebody’s markup', () => {
    expect(() => findApplicationLinks('<a href="/apply%E0%A4%A">Apply</a><a href="http://[bad">x</a>', 'https://fest.example/')).not.toThrow()
  })
})
