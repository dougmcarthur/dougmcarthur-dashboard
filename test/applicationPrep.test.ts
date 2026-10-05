import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { readApplicationForm, isReadableFormUrl } from '../src/lib/applicationPrep'

/**
 * The one part of phase 3 that touches the network, so `fetch` is injected.
 *
 * The distinction the tests are really about: a form behind a login is
 * `blocked` — a fact about the opportunity, and one that means "set aside an
 * hour and an account" — while a timeout is `failed`, which means try again.
 * Collapsing the two into one error is how a login wall becomes something the
 * app retries forever.
 */
function respond(body: string, init: ResponseInit & { url?: string } = {}): typeof fetch {
  return (async () => {
    const res = new Response(body, { status: init.status ?? 200, statusText: init.statusText })
    if (init.url) Object.defineProperty(res, 'url', { value: init.url })
    return res
  }) as unknown as typeof fetch
}

const FORM = `
  <html><head><title>Apply — Riverbend Folk Festival</title></head><body>
    <form>
      <label for="name">Artist or band name</label>
      <input id="name" name="artist_name" required maxlength="80">
      <label for="bio">Artist bio</label>
      <textarea id="bio" name="bio" maxlength="600"></textarea>
      <label for="photo">Press photo</label>
      <input id="photo" name="photo" type="file">
      <input type="hidden" name="csrf_token" value="x">
    </form>
  </body></html>`

describe('reading an application form', () => {
  it('refuses anything that is not a web address before making a request', async () => {
    expect(isReadableFormUrl('mailto:apply@example.com')).toBe(false)
    const out = await readApplicationForm('not a url', respond(''))
    expect(out.status).toBe('failed')
    expect(out.fields).toEqual([])
  })

  it('reads the fields out of an ordinary HTML form', async () => {
    const out = await readApplicationForm('https://example.com/apply', respond(FORM))
    expect(out.status).toBe('ready')
    expect(out.note).toBeNull()
    expect(out.fields.map((f) => f.fieldKey)).toEqual(['artist_name', 'bio', 'photo'])
    expect(out.fields[0].required).toBe(true)
    expect(out.fields[0].maxLength).toBe(80)
    expect(out.fields[2].fieldType).toBe('file')
  })

  it('calls a login wall blocked, and keeps the reason to show verbatim', async () => {
    const out = await readApplicationForm(
      'https://festival.submittable.com/submit',
      respond('<html><body>Nothing useful</body></html>'),
    )
    expect(out.status).toBe('blocked')
    expect(out.note).toContain('behind a login')
  })

  it('keeps the HTTP status, because 403 and 404 are different stories', async () => {
    const out = await readApplicationForm(
      'https://example.com/apply',
      respond('', { status: 403, statusText: 'Forbidden' }),
    )
    expect(out.status).toBe('failed')
    expect(out.note).toContain('403')
  })

  it('reports a page with no fields as not found, not as an empty form and not as a wall', async () => {
    // "Blocked" says nothing will happen and it is filled in by hand. A page
    // with no application on it says the opposite: it may not have opened yet.
    const out = await readApplicationForm(
      'https://example.com/news',
      respond('<html><body><h1>Applications open in March</h1></body></html>'),
    )
    expect(out.status).toBe('not_found')
    expect(out.fields).toEqual([])
  })

  it('treats a network failure as worth retrying, and says why it failed', async () => {
    const boom = (async () => {
      throw new Error('The operation was aborted due to timeout')
    }) as unknown as typeof fetch
    const out = await readApplicationForm('https://example.com/apply', boom)
    expect(out.status).toBe('failed')
    expect(out.note).toContain('timeout')
  })

  it('remembers the URL it actually landed on, after a redirect', async () => {
    const out = await readApplicationForm(
      'https://example.com/apply',
      respond(FORM, { url: 'https://forms.example.com/2027' }),
    )
    expect(out.url).toBe('https://forms.example.com/2027')
  })
})

/**
 * The address a listing carries is usually the festival's artist page, and the
 * form is an Apply button away — on another host. Reading that page used to
 * report either "no fields" or, worse, the newsletter box in its footer as the
 * whole application.
 */
describe('finding the form behind the page it was given', () => {
  const ARTIST_INFO = readFileSync('test/fixtures/canmore-artist-info.html', 'utf8')
  const FESTIVALPRO = readFileSync('test/fixtures/festivalpro-artist-form.html', 'utf8')
  const INFO_URL = 'https://www.canmorefolkfestival.com/get-involved/artist-info'
  const FORM_URL = 'https://canmorefolkfest.festivalpro.com/form/59EFFCD97622A7A502E7/0'

  /** Answers by address, and keeps count — the number of requests is part of the behaviour. */
  function site(pages: Record<string, string>) {
    const seen: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input)
      seen.push(url)
      const body = pages[url]
      const res = new Response(body ?? 'not here', { status: body === undefined ? 404 : 200 })
      Object.defineProperty(res, 'url', { value: url })
      return res
    }) as unknown as typeof fetch
    return { fetchImpl, seen }
  }

  it('follows the Apply button to the form, and saves the form’s address rather than the listing’s', async () => {
    const { fetchImpl, seen } = site({ [INFO_URL]: ARTIST_INFO, [FORM_URL]: FESTIVALPRO })
    const out = await readApplicationForm(INFO_URL, fetchImpl)

    expect(out.status).toBe('ready')
    expect(out.url).toBe(FORM_URL)
    expect(out.fields).toHaveLength(27)
    expect(out.fields.find((f) => f.fieldKey === '2933')!.label).toBe('Artist Biography')
    expect(seen).toEqual([INFO_URL, FORM_URL])
  })

  it('reads the form directly when given its address, without looking for a link', async () => {
    const { fetchImpl, seen } = site({ [FORM_URL]: FESTIVALPRO })
    const out = await readApplicationForm(FORM_URL, fetchImpl)
    expect(out.status).toBe('ready')
    expect(seen).toEqual([FORM_URL])
  })

  it('goes one hop and no further', async () => {
    // The button leads to another page with its own Apply link: not followed.
    const hop = 'https://fest.example/apply-here'
    const { fetchImpl, seen } = site({
      'https://fest.example/artists': `<a href="${hop}">Apply now</a>`,
      [hop]: '<a href="https://fest.example/really-apply">Apply now</a><p>Applications open in March.</p>',
    })
    const out = await readApplicationForm('https://fest.example/artists', fetchImpl)
    expect(out.status).toBe('not_found')
    expect(seen).toEqual(['https://fest.example/artists', hop])
  })

  it('keeps the page it was given and says where the link went, when the link was not a form', async () => {
    const dead = 'https://fest.example/apply-soon'
    const { fetchImpl } = site({
      'https://fest.example/artists': `<a href="${dead}">Apply now</a>`,
      [dead]: '<html><body><p>Applications open in March.</p></body></html>',
    })
    const out = await readApplicationForm('https://fest.example/artists', fetchImpl)
    expect(out.status).toBe('not_found')
    expect(out.url).toBe('https://fest.example/artists')
    expect(out.note).toContain('No form fields were found')
    expect(out.note).toContain(dead)
  })

  it('records a form behind a login as the answer, with its address', async () => {
    const portal = 'https://fest.submittable.com/submit/12345/artists'
    const { fetchImpl } = site({
      'https://fest.example/artists': `<a href="${portal}">Submit your music</a>`,
      [portal]: '<html><body>Sign in</body></html>',
    })
    const out = await readApplicationForm('https://fest.example/artists', fetchImpl)
    expect(out.status).toBe('blocked')
    expect(out.blockedKind).toBe('login')
    expect(out.url).toBe(portal)
  })

  it('asks rather than picks when the page links to two forms that read alike', async () => {
    const { fetchImpl, seen } = site({
      'https://fest.example/artists': `
        <a href="https://fest.festivalpro.com/form/AAA/0">Apply now</a>
        <a href="https://other.festivalpro.com/form/BBB/0">Apply now</a>`,
    })
    const out = await readApplicationForm('https://fest.example/artists', fetchImpl)
    expect(out.status).toBe('not_found')
    expect(out.note).toContain('more than one possible form')
    expect(out.note).toContain('fest.festivalpro.com')
    expect(out.note).toContain('other.festivalpro.com')
    expect(seen).toEqual(['https://fest.example/artists']) // chose neither
  })

  it('does not go looking when the page is a login wall or a JavaScript form', async () => {
    const { fetchImpl, seen } = site({
      'https://fest.submittable.com/submit/1': '<a href="https://elsewhere.example/apply">Apply now</a>',
    })
    const out = await readApplicationForm('https://fest.submittable.com/submit/1', fetchImpl)
    expect(out.blockedKind).toBe('login')
    expect(seen).toHaveLength(1)
  })

  it('reports the original page, not a follow-up failure, when the link cannot be opened', async () => {
    const { fetchImpl } = site({
      'https://fest.example/artists': '<a href="https://forms.example/missing">Apply now</a>',
    })
    const out = await readApplicationForm('https://fest.example/artists', fetchImpl)
    expect(out.status).toBe('not_found')
    expect(out.url).toBe('https://fest.example/artists')
    expect(out.note).toContain('404')
  })
})
