import { describe, it, expect } from 'vitest'
import { subjectFor, renderText, renderHtml } from '../src/lib/digestMail'
import type { Digest, DigestLine } from '../shared/digest'

const BASE = 'https://dash.example.com'

const line = (id: number, title: string, rationale = 'Do the thing.'): DigestLine => ({
  key: `gig-${id}`, kind: 'gig', id, title, rationale,
  href: '#review/all', fingerprint: 'status=approved',
})

const digest = (o: Partial<Digest> = {}): Digest => ({
  focus: [], rollups: [], groups: [], empty: false, marks: [], ...o,
})

/** Comments hold the Outlook-only ghost table, which the rules below exempt. */
const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

describe('subjectFor', () => {
  it('names the size of the ask when there is a focus list', () => {
    expect(subjectFor(digest({ focus: [line(1, 'A'), line(2, 'B')] }))).toBe('2 to act on this week')
  })

  it('falls back to counting updates when nothing is actionable', () => {
    const d = digest({ groups: [{ id: 'changed', heading: 'Changed under you', lines: [line(1, 'A')] }] })
    expect(subjectFor(d)).toBe('1 update')
  })
})

describe('renderText', () => {
  it('numbers the focus list', () => {
    const text = renderText(digest({ focus: [line(1, 'First'), line(2, 'Second')] }), BASE)
    expect(text).toContain('1. First')
    expect(text).toContain('2. Second')
  })

  it('always points at the dashboard for everything else', () => {
    expect(renderText(digest(), BASE)).toContain(`${BASE}/#overview`)
  })
})

describe('renderHtml — client compatibility', () => {
  const full = () =>
    renderHtml(
      digest({
        focus: [line(1, 'One'), line(2, 'Two')],
        rollups: [{ id: 'paid', label: 'cost money to enter', count: 4, href: '#review/paid' }],
        groups: [{ id: 'new', heading: 'New since last time', lines: [line(9, 'Fresh')] }],
      }),
      BASE,
    )

  it('is a complete document, so the client is not left to invent a head', () => {
    expect(full()).toMatch(/^<!doctype html>/)
    expect(full()).toContain('<meta name="color-scheme" content="light">')
  })

  it('never uses the CSS font shorthand, which Outlook drops', () => {
    // `font-family:` and friends are fine; a bare `font:` is what breaks.
    expect(stripComments(full())).not.toMatch(/[^-]font:\s/)
  })

  it('sets border-collapse on every rendered table', () => {
    const html = stripComments(full())
    const tables = html.match(/<table\b/g) ?? []
    const collapsed = html.match(/border-collapse:collapse/g) ?? []
    expect(tables.length).toBeGreaterThan(0)
    expect(collapsed.length).toBe(tables.length)
  })

  it('repeats every coloured surface as a bgcolor attribute for Outlook', () => {
    // Each background-color on a cell has a matching bgcolor attribute.
    const html = stripComments(full())
    const backgrounds = html.match(/background-color:#[0-9a-f]{6}/gi) ?? []
    const attrs = html.match(/bgcolor="#[0-9a-f]{6}"/gi) ?? []
    expect(attrs.length).toBeGreaterThanOrEqual(backgrounds.length - 1) // body has no cell
  })

  it('leads the preview pane with the top item rather than boilerplate', () => {
    const html = renderHtml(digest({ focus: [line(1, 'The urgent one')] }), BASE)
    const preview = html.slice(html.indexOf('<body'), html.indexOf('<table'))
    expect(preview).toContain('The urgent one')
  })

  it('escapes titles and rationales rather than trusting the database', () => {
    const html = renderHtml(digest({ focus: [line(1, '<script>x</script>', 'a & b')] }), BASE)
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
  })
})

describe('renderHtml — the change section stays a summary', () => {
  it('counts a large group instead of printing it', () => {
    const lines = Array.from({ length: 60 }, (_, i) => line(i, `Item ${i}`))
    const html = renderHtml(digest({ groups: [{ id: 'new', heading: 'New since last time', lines }] }), BASE)
    expect(html).toContain('New since last time (60)')
    expect(html).toContain('and 56 more')
    // The regression this guards: sixty names in the email.
    expect((html.match(/Item \d+/g) ?? []).length).toBe(4)
  })
})
