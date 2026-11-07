import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Gigs below the width where the table fits.
 *
 * The table was twice the width of a phone: the name was pinned, and the stage,
 * which is what a row is for, sat past the right edge with the buttons. On a
 * tablet in portrait it still scrolled sideways with the buttons cut off. Below
 * 1024px it is now a list of cards, one per gig, drawn from the same cells as
 * the table. These pin the shape; the layout itself was measured at 375px (no
 * sideways page scroll, 44px controls), at 768 and 900 (a list, no scroll), and
 * at 1100, where the table takes over and fits.
 */

const page = readFileSync('frontend/src/pages/GigsPage.tsx', 'utf8')
const hook = readFileSync('frontend/src/hooks/useNarrow.ts', 'utf8')

describe('where the list takes over from the table', () => {
  it('is the width Tailwind calls lg, and decided in script', () => {
    // Decided in script, not hidden by CSS, so only one layout is mounted: both
    // at once would mount every open panel twice.
    expect(hook).toContain("'(max-width: 1023.98px)'")
    expect(page).toContain('useNarrow()')
    expect(page).toMatch(/\) : asList \? \(/)
  })
})

describe('the list', () => {
  const start = page.indexOf(') : asList ? (')
  const list = page.slice(start, page.indexOf('<table', start))

  it('shows the stage on every card, which is the point of it', () => {
    expect(list).toContain('<StatusBadge')
  })

  it('draws the deadline and fee through the table\'s own cells', () => {
    // A second renderer is where a recovered date loses the prose beside it.
    expect(list).toContain('<DeadlineCell')
    expect(list).toContain('<FeeCell')
    expect(page).toContain('cell: (info) => <DeadlineCell')
    expect(page).toContain('cell: (info) => <FeeCell')
  })

  it('offers the pipeline\'s next step, and not a list of its own', () => {
    expect(list).toContain('<GigActions card')
    expect(page).toContain('inlineGigMoves(gig.status, gig.type)')
  })

  it('opens the same panel under the card as the table opens under the row', () => {
    expect(list).toContain('detail(gig)')
    expect(page).toContain('detail(row.original)')
  })

  it('keeps the buttons visible, since a touch screen has no hover to reveal them', () => {
    // `.row-actions` is invisible until a pointer is over the row. A narrow
    // desktop window has a pointer and a phone does not, so the list must not
    // use it at all.
    const actions = page.slice(page.indexOf('function GigActions'), page.indexOf('// ── Main page'))
    expect(actions).toContain("card ? 'flex gap-2 whitespace-nowrap'")
    expect(actions).toContain("'row-actions flex gap-1 justify-end whitespace-nowrap'")
  })

  it('makes every control a tap target a thumb can hit', () => {
    expect(list).toContain('min-h-11')
    const actions = page.slice(page.indexOf('function GigActions'), page.indexOf('// ── Main page'))
    expect(actions).toContain("size={card ? 'lg' : 'sm'}")
    expect(actions).toContain("className={card ? 'min-h-11' : ''}")
    // The page header's controls too: filter, sort, search and the new-gig button.
    expect(page.match(/max-md:min-h-11/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('sorts from a control, because the list has no column headers to tap', () => {
    expect(page).toContain('aria-label="Sort gigs"')
    expect(page).toContain("const LIST_SORTS = ['name', 'deadline']")
  })
})

describe('the table, from lg up', () => {
  it('no longer pins a column to scroll under, which the list replaced', () => {
    expect(page).not.toContain('max-md:sticky')
    expect(page).not.toContain('PINNED_CELL')
    expect(page).not.toContain('100cqw')
  })
})
