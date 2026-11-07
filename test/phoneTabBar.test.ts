import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The phone's navigation: five tabs along the bottom and a More tab.
 *
 * The behaviour is layout and a sheet that opens, which these tests cannot
 * render. What they pin is what would quietly break it: a page that exists on
 * a laptop and has no way to be reached on a phone, a bar that shows in admin
 * mode or over the page's last line, and a second menu button left in the
 * corner. It was looked at in the running app at 320px and 375px.
 */

const read = (f: string) => readFileSync(f, 'utf8')
const bar = read('frontend/src/components/PhoneTabBar.tsx')
const layout = read('frontend/src/components/Layout.tsx')

/** The `id`s in a `const NAME = [ ... ]` list of `{ id: '...' }` entries. */
function ids(src: string, name: string): string[] {
  const start = src.indexOf(`const ${name} = [`)
  expect(start, `${name} is declared`).toBeGreaterThanOrEqual(0)
  const body = src.slice(start, src.indexOf(']', start))
  return [...body.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1])
}

describe('every page can be reached on a phone', () => {
  const tabs = ids(bar, 'TAB_LINKS')
  const more = ids(bar, 'MORE_PAGES')
  const desktop = ids(layout, 'NAV_LINKS')
  const drawer = ids(layout, 'MORE_LINKS')

  it('puts the five daily pages on the bar, in the order they are on a laptop', () => {
    expect(tabs).toEqual(['overview', 'review', 'gigs', 'artist', 'sync'])
    expect(desktop.slice(0, 5)).toEqual(tabs)
  })

  it('leaves no page of the laptop\'s navigation without a place on the phone', () => {
    // A page added to the header and forgotten here is one a phone can never
    // open: the header's own menu is hidden on a phone.
    for (const id of [...desktop, ...drawer]) {
      expect([...tabs, ...more], id).toContain(id)
    }
  })
})

describe('the bar', () => {
  it('is for phones only, and is never printed', () => {
    const nav = bar.slice(bar.indexOf('<nav'), bar.indexOf('</nav>'))
    expect(nav).toContain('md:hidden')
    expect(nav).toContain('print:hidden')
  })

  it('is not drawn in admin mode, which has its own list of pages', () => {
    expect(layout).toMatch(/\{admin \? null : \(\s*<PhoneTabBar/)
  })

  it('leaves room under the page for it, and for a phone\'s home indicator', () => {
    expect(layout).toContain("admin ? '' : 'max-md:pb-[calc(5.5rem+env(safe-area-inset-bottom))]'")
    expect(bar).toContain('pb-[env(safe-area-inset-bottom)]')
  })

  it('hides the header\'s menu button on a phone, except in admin mode where it is the way out', () => {
    expect(layout).toContain("admin ? 'relative' : 'relative max-md:hidden'")
  })

  it('makes every tab a fingertip tall and names the current page', () => {
    expect(bar).toContain('min-h-14')
    expect(bar.match(/aria-current=\{here === /g)?.length).toBeGreaterThanOrEqual(2)
  })
})

describe('More', () => {
  it('is a button that says whether it is open, and puts the sheet away', () => {
    expect(bar).toContain('aria-expanded={open}')
    expect(bar).toContain('aria-controls="more-sheet"')
    // Going to a page, pressing Escape and tapping outside all close it: a
    // sheet left open over the page just chosen is the classic menu bug.
    expect(bar).toContain('useEffect(() => setOpen(false), [here])')
    expect(bar).toContain("e.key !== 'Escape'")
    expect(bar).toContain('onClick={close}')
  })

  it('carries what the header menu used to, with Sign out last and apart', () => {
    for (const label of ['Help', 'Send feedback', 'Answers at hand', 'Sign out', 'Signed in as']) {
      expect(bar, label).toContain(label)
    }
    const sheet = bar.slice(bar.indexOf('id="more-sheet"'), bar.indexOf('<nav'))
    expect(sheet.lastIndexOf('Sign out')).toBeGreaterThan(sheet.lastIndexOf('Send feedback'))
    expect(sheet).not.toMatch(/href="#sign/)
  })

  it('says nothing about the account until a name has been set', () => {
    expect(bar).toMatch(/\{accountName && \(/)
  })
})
