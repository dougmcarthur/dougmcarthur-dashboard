import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { setupCodeEmail } from '../src/lib/authMail'
import { renderDigestEmail } from '../src/lib/digestMail'
import { NO_UNSUBSCRIBE, PRODUCT_NAME, type RenderedEmail } from '../src/lib/emailTemplate'
import type { Digest } from '../shared/digest'

/**
 * Every outgoing email, held to the same rules.
 *
 * The rules are the reason the template exists: an email that forgets its
 * footer, leaks a code onto a lock screen, or breaks in Outlook typechecks and
 * sends. So each is checked against *every* email in ALL below — adding a new
 * email means adding it there, and it inherits the lot.
 */

const BASE = 'https://scout.example'
const IDENTITY = { siteUrl: BASE, postalAddress: 'PO Box 1, Winnipeg MB R3C 0A1' }
const CODE = '482913'

const digest: Digest = {
  focus: [{ key: 'gig-1', kind: 'gig', id: 1, title: 'Folk Fest', rationale: 'Due Friday.', href: '#review/all', fingerprint: 'x' }],
  rollups: [{ id: 'paid', label: 'cost money to enter', count: 4, href: '#review/paid' }],
  groups: [],
  empty: false,
  marks: [],
}

const setup = () => setupCodeEmail({ code: CODE, ttlMinutes: 15, identity: IDENTITY })
const weekly = () =>
  renderDigestEmail(digest, { base: BASE, schedule: { day: 'mon', hour: 8, timezone: 'America/Winnipeg' }, identity: IDENTITY })

const ALL: Array<[string, () => RenderedEmail]> = [
  ['setup code', setup],
  ['weekly digest', weekly],
]

/** Comments hold the Outlook-only ghost table, which the markup rules exempt. */
const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
const preheaderOf = (html: string) => html.slice(html.indexOf('<body'), html.indexOf('<table'))
const visibleText = (html: string) =>
  stripComments(html)
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&[lr]dquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

describe.each(ALL)('%s — who it is from and why it came', (_name, render) => {
  it('puts the product name, not "Scout" alone, at the front of the subject', () => {
    expect(render().subject.startsWith(`${PRODUCT_NAME} — `)).toBe(true)
  })

  it('identifies the sender with a name, a mailing address and a web address, in both bodies', () => {
    const { html, text } = render()
    for (const body of [visibleText(html), text]) {
      expect(body).toContain('Sun Dogs Music')
      expect(body).toContain(IDENTITY.postalAddress)
      expect(body).toContain('scout.example')
    }
  })

  it('says why it arrived', () => {
    expect(render().text).toMatch(/You received this because/)
  })

  it('is a complete document that asks clients not to invert it', () => {
    const { html } = render()
    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<meta name="color-scheme" content="light">')
  })
})

describe('what each kind of footer promises', () => {
  it('a transactional email says, in words, that it has no unsubscribe', () => {
    const { html, text } = setup()
    expect(text).toContain(NO_UNSUBSCRIBE)
    expect(visibleText(html)).toContain(NO_UNSUBSCRIBE)
  })

  it('a notification links to where it is switched off, and does not claim to be transactional', () => {
    const { html, text } = weekly()
    expect(html).toContain(`href="${BASE}/#settings"`)
    expect(text).toContain(`${BASE}/#settings`)
    expect(text).not.toContain(NO_UNSUBSCRIBE)
    expect(text).toContain('not marketing')
  })
})

describe.each(ALL)('%s — survives the trip through a mail client', (_name, render) => {
  it('never uses the CSS font shorthand, which Outlook drops', () => {
    // `font-family:` and friends are fine; a bare `font:` is what breaks.
    expect(stripComments(render().html)).not.toMatch(/[^-]font:\s/)
  })

  it('states the border model on every rendered table', () => {
    const html = stripComments(render().html)
    const tables = html.match(/<table\b/g) ?? []
    expect(tables.length).toBeGreaterThan(0)
    // Collapsed, or separate with zero spacing — never the browser default,
    // which is where Outlook's gaps between cells come from.
    const stated = html.match(/border-collapse:(collapse|separate;border-spacing:0)/g) ?? []
    expect(stated.length).toBe(tables.length)
  })

  it('repeats every coloured cell as a bgcolor attribute', () => {
    const html = stripComments(render().html)
    const backgrounds = html.match(/background-color:#[0-9a-f]{6}/gi) ?? []
    const attrs = html.match(/bgcolor="#[0-9a-f]{6}"/gi) ?? []
    expect(attrs.length).toBeGreaterThanOrEqual(backgrounds.length - 1) // <body> has no cell
  })

  it('never relies on inherited type, which clients reset', () => {
    expect(render().html).not.toContain('inherit')
  })
})

describe('the setup code stays off a locked screen', () => {
  it('is not in the subject', () => {
    expect(setup().subject).not.toContain(CODE)
    expect(setup().subject).not.toMatch(/\d{4,}/)
  })

  it('is not in the preheader a notification previews', () => {
    expect(preheaderOf(setup().html)).not.toContain(CODE)
  })

  it('is not in the first lines of the text body, which some clients preview instead', () => {
    const [first] = setup().text.split('\n\n')
    expect(first).not.toContain(CODE)
    expect(setup().text).toContain(`Your code: ${CODE}`)
  })

  it('appears in the HTML body', () => {
    expect(setup().html).toContain(`>${CODE}</div>`)
  })
})

describe('the setup code email tells the truth about the code', () => {
  it('says whoever enters it can add a passkey', () => {
    for (const body of [setup().text, visibleText(setup().html)]) {
      expect(body).toMatch(/Don.t share this code/)
      expect(body).toContain('Whoever enters it can add a passkey to your account')
    }
  })

  it('no longer claims the code is harmless on its own', () => {
    // It said "the code does nothing on its own, and adding a passkey still
    // needs your device to approve it" — the device being whichever one the
    // code is typed into.
    for (const body of [setup().text, setup().html]) {
      expect(body).not.toMatch(/does nothing on its own/)
      expect(body).not.toMatch(/needs your device to approve/)
    }
  })

  it('says what happened if you did not ask', () => {
    expect(setup().text).toMatch(/Didn't ask for this\? Somebody pressed "Email me a setup code"/)
  })
})

describe('every send goes through the template', () => {
  const SRC = fileURLToPath(new URL('../src', import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : []
    })

  it('writes no subject line by hand', () => {
    // The two subjects that existed were `Scout — …`, typed at the call site.
    for (const file of files(SRC)) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/subject:\s*`Scout/)
      expect(src, file).not.toMatch(/subject:\s*['"`][^'"`]*Scout/)
    }
  })

  it('the deployment prints a mailing address in every footer', () => {
    const toml = readFileSync(fileURLToPath(new URL('../wrangler.toml', import.meta.url)), 'utf8')
    expect(toml).toMatch(/^MAIL_POSTAL_ADDRESS\s*=\s*"[^"]{10,}"/m)
  })
})
