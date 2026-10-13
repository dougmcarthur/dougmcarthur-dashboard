import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Scout is for Canadian artists, and the first screens say so.
 *
 * It is not a restriction on what is shown: costs are in Canadian dollars, the
 * funding and associations are Canadian, and a date abroad is welcome and comes
 * with its paperwork. What goes wrong without these lines is a visitor, or an
 * invited artist in another country, finding out three screens in. They are
 * pinned the way the other copy that carries a promise is.
 */
const read = (path: string) => readFileSync(path, 'utf8')

describe('who Scout is for, said where it is first read', () => {
  it('on the page a stranger sees', () => {
    const landing = read('frontend/src/pages/LandingPage.tsx')
    expect(landing).toMatch(/independent Canadian\s+musicians/)
    expect(landing).toMatch(/Canadian dollars/)
    expect(landing).toMatch(/small group of Canadian artists/)
  })

  it('in the page title area, for search and for a shared link', () => {
    expect(read('frontend/index.html')).toMatch(/name="description"[\s\S]*Canadian musicians/)
  })

  it('in the welcome questions, before anything is asked', () => {
    const flow = read('frontend/src/components/OnboardingFlow.tsx')
    expect(flow).toMatch(/built for Canadian artists/)
    expect(flow).toMatch(/playing abroad is\s+welcome/)
  })

  it('in Help, with what it does and does not mean', () => {
    const help = read('frontend/src/pages/HelpPage.tsx')
    expect(help).toContain('Made for Canadian artists')
    expect(help).toMatch(/Opportunities outside Canada are never left out/)
  })
})

describe('what the reach question does', () => {
  it('says out loud that nothing is hidden by it', () => {
    expect(read('frontend/src/components/OnboardingFlow.tsx')).toMatch(/Nothing is hidden/)
    expect(read('frontend/src/pages/HelpPage.tsx')).toMatch(/Nothing is ever hidden because of it/)
  })

  it('removes nothing in the code that reads it', () => {
    // The module orders; it has no filter. Dropping an item would take a list
    // and a predicate, and none here does. (`.filter(Boolean)` is tidying
    // strings in `regionOf`, not choosing opportunities.)
    const focus = read('shared/artistFocus.ts')
    expect(focus).not.toMatch(/\.filter\(\s*\(/)
  })
})
