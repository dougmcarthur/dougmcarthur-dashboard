import { describe, it, expect } from 'vitest'
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

describe('nextSteps', () => {
  it('links only to screens that can act on the suggestion', () => {
    const hrefs = nextSteps({ goals: ['sync'], reach: [], note: null }).map((n) => n.href)
    expect(hrefs).toEqual(['#sync'])
  })
})
