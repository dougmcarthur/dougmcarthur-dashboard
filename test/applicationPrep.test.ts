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

  it('reports a page with no fields as blocked rather than as an empty form', async () => {
    const out = await readApplicationForm(
      'https://example.com/news',
      respond('<html><body><h1>Applications open in March</h1></body></html>'),
    )
    expect(out.status).toBe('blocked')
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
