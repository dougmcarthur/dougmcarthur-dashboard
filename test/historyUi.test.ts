import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Source-level guards for the bell, the pinned panel and the History page.
 *
 * Each is something that typechecks, renders and is wrong: a notification list
 * polled twice for one screen, a panel docked inside admin mode where every
 * request behind it is refused, a row that grows to six lines because its writer
 * had a lot to say.
 */

const read = (f: string) => readFileSync(f, 'utf8')
/** Source with comments removed, for rules about what a screen *says*. */
const prose = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SCREENS = [
  'frontend/src/pages/HistoryPage.tsx',
  'frontend/src/components/AnswersPanel.tsx',
  'frontend/src/components/CopyButton.tsx',
  'frontend/src/components/NotificationBell.tsx',
  'frontend/src/components/NotificationPanel.tsx',
  'frontend/src/components/SidePanel.tsx',
  'frontend/src/components/notificationParts.tsx',
]

describe('how these screens read and look', () => {
  // The owner asked for none of the hallmarks of generated text and design,
  // twice, so they are pinned the way the survey results page pins them.
  it('has no em dash in anything a person reads', () => {
    for (const file of SCREENS) expect(prose(file), file).not.toContain('—')
  })

  it('has no small capitals caption over a heading', () => {
    for (const file of SCREENS) {
      expect(prose(file), file).not.toMatch(/<Caption|\buppercase\b|tracking-wide/)
    }
  })

  it('has no coloured bar down the edge of a card', () => {
    for (const file of SCREENS) expect(prose(file), file).not.toMatch(/\bborder-[lr]-\d/)
  })

  it('says nothing a person has to read in the faintest text colour', () => {
    // `text-faint` is 3.6 to 1 on the surface, under the 4.5 that text needs. It
    // is for an icon that is only a hint and for a control that is disabled.
    // "Asked 4 times on your applications" and "Not reviewed yet." are
    // information, and a rendered contrast scan caught them in it.
    for (const file of SCREENS) {
      const informative = [...prose(file).matchAll(/(?<!disabled:)text-faint/g)].length
      // The one allowance: the dismiss cross on a notification row.
      const allowed = file.endsWith('NotificationPanel.tsx') ? 1 : 0
      expect(informative, file).toBe(allowed)
    }
  })
})

describe('the list in the bell and in the panel', () => {
  const list = read('frontend/src/components/NotificationPanel.tsx')

  it('keeps a row to a headline and one line of context', () => {
    // The row ran to six lines when an agent's whole report was its body.
    expect(list).toContain('line-clamp-2')
    expect(list).toMatch(/text-xs text-muted mt-0\.5 truncate/)
  })

  it('is polled by the bell alone', () => {
    // Two observers each with an interval fetch twice per period for one list,
    // on a read that costs about 155 rows.
    expect(read('frontend/src/components/NotificationBell.tsx')).toContain('useNotificationFeed({ poll: true })')
    expect(read('frontend/src/components/SidePanel.tsx')).toContain('useNotificationFeed({ poll: false })')
  })

  it('is one component, not a copy in each frame', () => {
    for (const file of ['NotificationBell.tsx', 'SidePanel.tsx']) {
      const src = read(`frontend/src/components/${file}`)
      expect(src, file).toContain('NotificationBody')
      expect(src, file).not.toMatch(/function (Row|FilterBar)\b/)
    }
  })

  it('has a way into History from the dropdown whether or not anything overflowed', () => {
    expect(list).toContain("'Open History'")
    expect(list).toMatch(/runs\/\$\{filters\.kind\}/)
  })
})

describe('the pinned panel', () => {
  const dock = read('frontend/src/components/SidePanel.tsx')
  const bell = read('frontend/src/components/NotificationBell.tsx')
  const layout = read('frontend/src/components/Layout.tsx')

  it('has the way to the full History at the top', () => {
    // The notifications' way out is the History icon, named once in the table
    // of ways out and drawn first in the header.
    expect(dock).toMatch(/notifications: \{ label: 'Open the full History', icon: 'history', page: 'runs' \}/)
    // Before the other controls, so it is the first thing in the header.
    expect(dock.indexOf('label={out.label}')).toBeGreaterThan(-1)
    expect(dock.indexOf('label={out.label}')).toBeLessThan(dock.indexOf('icon="pin-off"'))
  })

  it('can be unpinned and hidden, which are different things', () => {
    expect(dock).toContain('side.unpin')
    expect(dock).toContain('side.hide')
  })

  it('is never docked in admin mode', () => {
    // An admin-mode session is refused every route the list reads.
    expect(layout).toMatch(/!admin && side\.docked/)
    expect(layout).toContain('<SideDock')
  })

  it('is offered only where there is room to dock to', () => {
    expect(bell).toMatch(/side\.wide &&[\s\S]*?label="Pin to the side of the screen"/)
  })

  it('turns the bell into its switch once pinned, and never opens both', () => {
    expect(bell).toMatch(/pinnedHere \? side\.toggle\('notifications'\) : setOpen/)
    expect(bell).toMatch(/open && !pinnedHere/)
  })

  it('sits beside the page rather than over it, and the page may shrink', () => {
    expect(layout).toMatch(/className="shell min-w-0/)
    expect(dock).toContain('sticky')
  })

  it('is a landmark with a name', () => {
    expect(dock).toContain('aria-label="Side panel"')
    expect(dock).toContain('<aside')
  })
})

describe('the History page', () => {
  const page = read('frontend/src/pages/HistoryPage.tsx')

  it('shows a run through its parsed report, never the stored prose', () => {
    // The entry the browser is handed has no `summary`; this fails if one is
    // ever read off it and printed as a block.
    expect(prose('frontend/src/pages/HistoryPage.tsx')).not.toMatch(/\.summary\b/)
    expect(page).toContain('ReportView')
  })

  it('keeps the report behind a disclosure', () => {
    expect(page).toContain('aria-expanded={open}')
  })

  it('opens on a type only when the route names one that exists', () => {
    expect(page).toContain('NOTIFICATION_KINDS')
    expect(page).toMatch(/function asKind/)
  })

  it("files entries under the reader's own day", () => {
    expect(page).toContain('groupByDay(entries, localDay)')
  })

  it('names the unread ones to a screen reader as well as by colour', () => {
    expect(page).toContain('(unread)')
  })

  it('is what the old run-log address now opens', () => {
    expect(read('frontend/src/App.tsx')).toMatch(/page === 'runs' && <HistoryPage/)
  })
})
