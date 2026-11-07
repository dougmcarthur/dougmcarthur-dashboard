import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Two things a person feels on every page and nobody sees in a diff: the
 * headings that change size and weight as you move between screens, and the
 * controls on a phone that are a fingertip smaller than the fingertip.
 *
 * Both were measured in the running app at 375px. The pages' headings were
 * three treatments (`text-xl`, `text-2xl`, and one `font-bold`); the shared
 * buttons, fields and tabs were 24 to 36px tall. These pin the shared pieces,
 * so a screen that uses them inherits the fix and a new one cannot quietly
 * opt out.
 */

const read = (f: string) => readFileSync(f, 'utf8')

describe('page headings', () => {
  const PAGES = [
    'frontend/src/pages/OverviewPage.tsx',
    'frontend/src/pages/ReviewPage.tsx',
    'frontend/src/pages/GigsPage.tsx',
    'frontend/src/pages/SyncPage.tsx',
    'frontend/src/pages/PromoDraftsPage.tsx',
    'frontend/src/pages/HistoryPage.tsx',
    'frontend/src/pages/HelpPage.tsx',
  ]

  it('has one class, and the pages take it rather than restating it', () => {
    expect(read('frontend/src/components/ui/Surface.tsx')).toContain(
      "export const PAGE_TITLE = 'text-2xl font-semibold text-ink tracking-tight'",
    )
    for (const file of PAGES) {
      const src = read(file)
      expect(src, file).not.toMatch(/<h1 className=/)
      expect(src, file).toMatch(/<PageTitle>|<PageHeading /)
    }
  })

  it('is the heading of the shells and the Artist page too', () => {
    expect(read('frontend/src/components/ui/SidebarShell.tsx')).toContain('<PageTitle>{title}</PageTitle>')
    expect(read('frontend/src/components/ui/SectionHeader.tsx')).toContain('titleClassName={PAGE_TITLE}')
    expect(read('frontend/src/pages/ArtistPage.tsx')).toContain('<PageHeading page="artist"')
    // The heading that carries a page's first-visit line is the same class.
    expect(read('frontend/src/components/PageHeading.tsx').match(/PAGE_TITLE/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps what a page is for behind the info button, the History page included', () => {
    const history = read('frontend/src/pages/HistoryPage.tsx')
    expect(history).toContain('<PageHeading page="runs" title="History"')
    expect(history).not.toMatch(/<p[^>]*>Everything the app did/)
  })
})

describe('controls on a phone', () => {
  it('makes every button size at least 44px tall below md', () => {
    const button = read('frontend/src/components/ui/Button.tsx')
    const sizes = button.slice(button.indexOf('const SIZES'), button.indexOf('export interface ButtonProps'))
    expect(sizes.match(/max-md:min-h-11/g)?.length).toBe(3)
  })

  it('makes every input, select and textarea at least 44px tall below md', () => {
    expect(read('frontend/src/components/ui/Field.tsx')).toContain('max-md:min-h-11')
  })

  it('gives tabs and the deck\'s own buttons the same', () => {
    expect(read('frontend/src/components/ui/Tabs.tsx')).toContain('max-md:py-3')
    const deck = read('frontend/src/components/DecisionDeck.tsx')
    expect(deck.match(/max-md:h-11/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('pads a text-only button instead of moving the text around it', () => {
    // `py-3 -my-3` grows the area that takes a tap and leaves the line where it
    // was, so a row of small links does not become a taller row.
    expect(read('frontend/src/components/DecisionDeck.tsx')).toContain('max-md:py-3 max-md:-my-3')
    expect(read('frontend/src/pages/HistoryPage.tsx')).toContain('max-md:py-3 max-md:-my-3')
  })

  it('makes the header\'s icon buttons a fingertip, and 40px under 360px wide', () => {
    expect(read('frontend/src/components/Layout.tsx').match(/max-md:p-3\.5 max-\[359px\]:p-3/g)?.length).toBeGreaterThanOrEqual(2)
    expect(read('frontend/src/components/NotificationBell.tsx')).toContain('max-md:p-3.5 max-[359px]:p-3')
    // At 320px the brand, a 12px gap and three 40px buttons with 4px between
    // them are 3px more than the row, so the icons wrap to a second row left of
    // where the menu is anchored and the menu opens off the left edge of the
    // screen. No gap between them, below 360px, is what makes the row fit.
    expect(read('frontend/src/components/Layout.tsx')).toContain('flex items-center gap-1 max-[359px]:gap-0')
  })
})

describe('the menu says whose account this is', () => {
  const layout = read('frontend/src/components/Layout.tsx')

  it('reads the name from the profile, and only outside admin mode', () => {
    // Admin mode is refused the profile route, so it would be a failed request
    // to ask. And with no name set it says nothing rather than guess one.
    expect(layout).toContain("queryKey: ['profile']")
    expect(layout).toContain('enabled: !admin')
    expect(layout).toContain('const accountName = admin ? null : profile.data?.displayName?.trim() || null')
    expect(layout).toMatch(/\{accountName && \(/)
    expect(layout).toContain('Signed in as')
  })
})
