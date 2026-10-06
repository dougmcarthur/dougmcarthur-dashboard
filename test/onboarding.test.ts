import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextSteps, onboardingSteps, parseGoals, type OnboardingFacts } from '../shared/onboarding'

const EMPTY: OnboardingFacts = {
  displayName: null,
  libraryEntries: 0,
  documents: 0,
  profileConnected: false,
  googleConnected: false,
  googleAvailable: true,
  bandsintownConnected: false,
  passkeys: 1,
}

describe('onboardingSteps', () => {
  it('starts a new account with every required step open, name first', () => {
    const state = onboardingSteps(EMPTY, null)
    expect(state.steps.filter((s) => !s.optional).map((s) => s.id)).toEqual(['name', 'goals', 'profile', 'google'])
    expect(state.done).toBe(0)
    expect(state.complete).toBe(false)
  })

  it('ticks steps from what is on file, wherever it was done', () => {
    const state = onboardingSteps(
      { ...EMPTY, displayName: 'Sam', profileConnected: true, googleConnected: true },
      { goals: ['gigs'], reach: [], note: null },
    )
    expect(state.complete).toBe(true)
    expect(state.done).toBe(state.total)
  })

  it('counts a reference document or a library entry as a profile', () => {
    expect(onboardingSteps({ ...EMPTY, documents: 1 }, null).steps.find((s) => s.id === 'profile')?.done).toBe(true)
    expect(onboardingSteps({ ...EMPTY, libraryEntries: 3 }, null).steps.find((s) => s.id === 'profile')?.done).toBe(true)
  })

  // A step that cannot be done on this deployment must not hold "set up" back
  // forever — or be offered as a button that ends at an error.
  it('leaves Google out where the deployment cannot connect it', () => {
    const state = onboardingSteps({ ...EMPTY, googleAvailable: false }, null)
    expect(state.steps.map((s) => s.id)).not.toContain('google')
  })

  it('never lets an optional step hold back completion', () => {
    const state = onboardingSteps(
      { ...EMPTY, displayName: 'Sam', libraryEntries: 1, googleConnected: true, passkeys: 1 },
      { goals: ['gigs'], reach: [], note: null },
    )
    expect(state.steps.find((s) => s.id === 'backup')?.done).toBe(false)
    expect(state.complete).toBe(true)
  })

  it('offers tour dates only to somebody who might want shows', () => {
    const sync = onboardingSteps(EMPTY, { goals: ['sync'], reach: [], note: null })
    expect(sync.steps.map((s) => s.id)).not.toContain('shows')
    // Not having said is not the same as not wanting.
    expect(onboardingSteps(EMPTY, null).steps.map((s) => s.id)).toContain('shows')
  })

  it('does not count goals as given until at least one is chosen', () => {
    const state = onboardingSteps(EMPTY, { goals: [], reach: ['us'], note: null })
    expect(state.steps.find((s) => s.id === 'goals')?.done).toBe(false)
  })
})

describe('parseGoals', () => {
  it('reads an unreadable value as not having said, never as wanting nothing', () => {
    expect(parseGoals(null)).toBeNull()
    expect(parseGoals('{not json')).toBeNull()
    expect(parseGoals('"gigs"')).toBeNull()
  })

  it('drops ids this build does not know, and duplicates', () => {
    expect(parseGoals(JSON.stringify({ goals: ['gigs', 'gigs', 'world-domination'], reach: ['mars', 'us'], note: '  ' })))
      .toEqual({ goals: ['gigs'], reach: ['us'], note: null })
  })
})

/**
 * Source-level, like test/uiConsistency.test.ts: each of these renders fine
 * whichever way it goes.
 */
describe('the welcome questions', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
  // The keys and the portal live in the shared shell both flows use.
  const flow = read('frontend/src/components/flow/QuestionFlow.tsx')

  // The first version lived inside the checklist card, and saving the goals
  // completed the checklist, unmounted the card and closed the questions
  // mid-answer.
  it('is hosted by the page, never by the card it can complete', () => {
    expect(read('frontend/src/components/OnboardingCard.tsx')).not.toMatch(/<OnboardingFlow\b/)
    expect(read('frontend/src/pages/OverviewPage.tsx')).toMatch(/<OnboardingFlow\b/)
  })

  it('opens by itself only for an account that has never answered', () => {
    expect(read('frontend/src/components/OnboardingCard.tsx')).toMatch(/state\.goals !== null \|\| state\.hidden\) return/)
  })

  it('keeps Esc, Enter and the letter keys', () => {
    expect(flow).toMatch(/e\.key === 'Escape'/)
    expect(flow).toMatch(/e\.key === 'Enter' && !e\.shiftKey/)
    expect(flow).toMatch(/LETTERS\.indexOf\(e\.key\.toUpperCase\(\)\)/)
  })

  it('renders through a portal, so no ancestor can offset it', () => {
    expect(flow).toMatch(/createPortal\(/)
  })

  // The last screen listed two tasks and linked one: the second said what to do
  // and gave no way to do it. Each task it lists is its own link.
  it('links every task it lists on the last screen, not only the first', () => {
    const src = read('frontend/src/components/OnboardingFlow.tsx')
    expect(src).toMatch(/remaining\.map\(\(s, i\)[\s\S]{0,1200}href=\{s\.href\}/)
    expect(src).toMatch(/<a\s+href=\{s\.href\}/)
  })
})

// The other half of that: a step can only be listed there as a link if it has
// somewhere to go. Name and goals are the two asked on the questions themselves.
describe('a required step the questions do not ask has somewhere to go', () => {
  it('gives every such step an href', () => {
    const state = onboardingSteps(EMPTY, null)
    const listed = state.steps.filter((s) => !s.optional && s.id !== 'name' && s.id !== 'goals')
    expect(listed.map((s) => s.id)).toEqual(['profile', 'google'])
    for (const s of listed) expect(s.href, s.id).toMatch(/^#[a-z]/)
  })

  it('points them at screens that exist', () => {
    const hrefs = onboardingSteps(EMPTY, null)
      .steps.filter((s) => s.href)
      .map((s) => s.href)
    expect(hrefs).toEqual(expect.arrayContaining(['#artist', '#settings/connections']))
  })
})

describe('nextSteps', () => {
  it('links only to screens that can act on the suggestion', () => {
    const hrefs = nextSteps({ goals: ['sync'], reach: [], note: null }).map((n) => n.href)
    expect(hrefs).toEqual(['#sync'])
  })
})
