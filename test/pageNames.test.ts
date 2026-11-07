import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pageLabel } from '../frontend/src/hooks/usePageAnnouncement'

/**
 * A page is called one thing.
 *
 * The navigation, the browser tab and a screen reader's announcement said
 * "Gigs", "Sync" and "Promo" while the pages' own headings said "Gig
 * Opportunities", "Sync Targets" and "Promo Drafts", so what you pressed was
 * not what you were looking at. The short names win because the phone's tab bar
 * has fifty pixels a tab to say them in. This fails on a heading that drifts.
 */

const PAGES: Array<[id: string, file: string]> = [
  ['overview', 'frontend/src/pages/OverviewPage.tsx'],
  ['artist', 'frontend/src/pages/ArtistPage.tsx'],
  ['review', 'frontend/src/pages/ReviewPage.tsx'],
  ['gigs', 'frontend/src/pages/GigsPage.tsx'],
  ['sync', 'frontend/src/pages/SyncPage.tsx'],
  ['promo', 'frontend/src/pages/PromoDraftsPage.tsx'],
  ['runs', 'frontend/src/pages/HistoryPage.tsx'],
  ['help', 'frontend/src/pages/HelpPage.tsx'],
]

describe('page headings match the navigation', () => {
  for (const [id, file] of PAGES) {
    it(`${id} is headed with the name the tab and the navigation use`, () => {
      const src = readFileSync(file, 'utf8')
      // A page with a first-visit line is a `PageHeading`; Help has none.
      const heading =
        src.match(/<PageHeading page="[a-z]+" title="([^"]+)"/)?.[1] ?? src.match(/<PageTitle>([^<]+)<\/PageTitle>/)?.[1]
      expect(heading, file).toBe(pageLabel(id))
    })
  }

  it('has the phone\'s tab bar and the laptop\'s header saying the same words', () => {
    const layout = readFileSync('frontend/src/components/Layout.tsx', 'utf8')
    const bar = readFileSync('frontend/src/components/PhoneTabBar.tsx', 'utf8')
    const labels = (src: string) => [...src.matchAll(/id: '([a-z]+)', label: '([A-Za-z ]+)'/g)].map((m) => [m[1], m[2]])
    for (const [id, label] of [...labels(layout), ...labels(bar)]) expect(label, id).toBe(pageLabel(id))
  })
})
