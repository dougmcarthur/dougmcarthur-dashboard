import { describe, it, expect } from 'vitest'
import { subjectFor, renderDigestEmail } from '../src/lib/digestMail'
import type { Digest, DigestLine } from '../shared/digest'

const BASE = 'https://dash.example.com'
const SCHEDULE = { day: 'mon' as const, hour: 8, timezone: 'America/Winnipeg' }
const IDENTITY = { siteUrl: BASE, postalAddress: 'PO Box 1, Winnipeg MB R3C 0A1' }

const line = (id: number, title: string, rationale = 'Do the thing.'): DigestLine => ({
  key: `gig-${id}`, kind: 'gig', id, title, rationale,
  href: '#review/all', fingerprint: 'status=approved',
})

const digest = (o: Partial<Digest> = {}): Digest => ({
  focus: [], rollups: [], groups: [], empty: false, marks: [], ...o,
})

const render = (d: Digest) => renderDigestEmail(d, { base: BASE, schedule: SCHEDULE, identity: IDENTITY })

describe('subjectFor', () => {
  it('names the size of the ask when there is a focus list', () => {
    expect(subjectFor(digest({ focus: [line(1, 'A'), line(2, 'B')] }))).toBe('2 to act on this week')
  })

  it('falls back to counting updates when nothing is actionable', () => {
    const d = digest({ groups: [{ id: 'changed', heading: 'Changed under you', lines: [line(1, 'A')] }] })
    expect(subjectFor(d)).toBe('1 update')
  })

  it('reaches the inbox with the product name in front', () => {
    expect(render(digest({ focus: [line(1, 'A')] })).subject).toBe('Sun Dogs Music Scout — 1 to act on this week')
  })
})

describe('the text body', () => {
  it('numbers the focus list', () => {
    const { text } = render(digest({ focus: [line(1, 'First'), line(2, 'Second')] }))
    expect(text).toContain('1. First')
    expect(text).toContain('2. Second')
  })

  it('always points at the dashboard for everything else', () => {
    expect(render(digest()).text).toContain(`${BASE}/#overview`)
  })
})

describe('the HTML body', () => {
  it('leads the preview pane with the top item rather than boilerplate', () => {
    const { html } = render(digest({ focus: [line(1, 'The urgent one')] }))
    const preview = html.slice(html.indexOf('<body'), html.indexOf('<table'))
    expect(preview).toContain('The urgent one')
  })

  it('escapes titles and rationales rather than trusting the database', () => {
    const { html } = render(digest({ focus: [line(1, '<script>x</script>', 'a & b')] }))
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
  })

  it('says when it is sent from the schedule, not from a sentence that went stale', () => {
    // The footer said "Sent Monday mornings" while the schedule lived in a
    // setting that could say Thursday.
    const { html, text } = renderDigestEmail(digest({ focus: [line(1, 'A')] }), {
      base: BASE,
      schedule: { day: 'thu', hour: 17, timezone: 'America/Winnipeg' },
      identity: IDENTITY,
    })
    for (const body of [html, text]) {
      expect(body).toContain('Thursdays at 17:00 Winnipeg time')
      expect(body).not.toMatch(/Monday/)
    }
  })
})

describe('the change section stays a summary', () => {
  it('counts a large group instead of printing it', () => {
    const lines = Array.from({ length: 60 }, (_, i) => line(i, `Item ${i}`))
    const { html } = render(digest({ groups: [{ id: 'new', heading: 'New since last time', lines }] }))
    expect(html).toContain('New since last time (60)')
    expect(html).toContain('and 56 more')
    // The regression this guards: sixty names in the email.
    expect((html.match(/Item \d+/g) ?? []).length).toBe(4)
  })
})
