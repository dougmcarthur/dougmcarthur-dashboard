import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import {
  GENRES,
  MAX_GENRES,
  ONBOARDING_KEYS,
  REGIONS,
  onboardingSteps,
  parseProfile,
  profileHome,
  type OnboardingFacts,
} from '../shared/onboarding'
import { focusFrom, regionOf } from '../shared/artistFocus'
import { inferTravelBand, homeFrom } from '../shared/gigCost'
import { asTenantId } from '../src/db/scope'
import { focusFor } from '../src/lib/focus'
import { readTenantSetting } from '../src/lib/nudgeSettings'
import onboarding from '../src/routes/onboarding'
import { sqliteD1 } from './support/sqliteD1'

/**
 * Where an artist is based, and what they play.
 *
 * Two questions the welcome flow never asked, so "my province" was an answer
 * about a province the account had never named and nothing could be matched to
 * a style. Both are optional and neither is a guess: an account that has not
 * said is treated as not having said.
 */

const TENANT = asTenantId('tnt_0001')

describe('parseProfile', () => {
  it('keeps what it knows and drops what it does not', () => {
    expect(parseProfile(JSON.stringify({ region: 'MB', city: ' Winnipeg ', genres: ['folk', 'polka', 'folk', 'jazz'] }))).toEqual({
      region: 'MB',
      city: 'Winnipeg',
      genres: ['folk', 'jazz'],
    })
  })

  it('takes at most the number of genres Scout asks for', () => {
    const all = GENRES.map((g) => g.id)
    expect(parseProfile(JSON.stringify({ genres: all }))?.genres).toHaveLength(MAX_GENRES)
  })

  it('reads nothing usable as not having been told', () => {
    expect(parseProfile(null)).toBeNull()
    expect(parseProfile('not json')).toBeNull()
    expect(parseProfile(JSON.stringify({ region: 'Atlantis', genres: ['polka'] }))).toBeNull()
    expect(parseProfile(JSON.stringify({ region: null, city: '   ', genres: [] }))).toBeNull()
  })
})

describe('where they travel from, according to the profile', () => {
  it('is the province, and the place only when there is a city', () => {
    expect(profileHome({ region: 'AB', city: 'Calgary', genres: [] })).toEqual({ region: 'AB', place: 'Calgary, AB' })
    expect(profileHome({ region: 'AB', city: null, genres: [] })).toEqual({ region: 'AB', place: null })
  })

  it('is nobody when they are outside Canada, or have not said', () => {
    expect(profileHome({ region: 'abroad', city: 'Glasgow', genres: [] })).toBeNull()
    expect(profileHome({ region: null, city: 'Calgary', genres: [] })).toBeNull()
    expect(profileHome(null)).toBeNull()
  })

  it('makes the cost guess theirs, so a Calgary artist is not priced from Winnipeg', () => {
    // Canmore is a drive from Calgary and a flight from Winnipeg.
    expect(inferTravelBand('Canmore, AB', 'CA', profileHome({ region: 'AB', city: null, genres: [] }))).toBe('drive')
    expect(inferTravelBand('Canmore, AB', 'CA', homeFrom('Winnipeg, MB'))).toBe('regional')
  })
})

describe('"my province"', () => {
  const goals = { goals: ['gigs' as const], reach: ['home' as const], note: null }

  it('is the home base\'s province, and the one they said until there is a home base', () => {
    expect(focusFrom(goals, 'Winnipeg, MB', 'AB')?.homeRegion).toBe('MB')
    expect(focusFrom(goals, null, 'AB')?.homeRegion).toBe('AB')
    expect(focusFrom(goals, null, null)?.homeRegion).toBeNull()
  })

  it('is nothing for somebody outside Canada', () => {
    expect(focusFrom(goals, null, 'abroad')?.homeRegion).toBeNull()
  })

  it('is read from the account, so a new artist\'s reach means something before a home base is set', async () => {
    const { d1 } = sqliteD1()
    const env = { DB: d1 } as never
    await onboardingApp(env).request('/goals', put({ goals: ['gigs'], reach: ['home'], note: null }), env)
    await onboardingApp(env).request('/profile', put({ region: 'SK' }), env)
    expect((await focusFor(env, TENANT))?.homeRegion).toBe('SK')
  })
})

describe('the regions Scout offers', () => {
  it('are every province and territory, and every one is something the region reader knows', () => {
    const provinces = REGIONS.filter((r) => r.id !== 'abroad')
    expect(provinces).toHaveLength(13)
    for (const r of provinces) expect(regionOf(`Somewhere, ${r.id}`), r.id).toEqual({ code: r.id, country: 'CA' })
  })

  it('offer outside Canada as an answer and not an error', () => {
    expect(REGIONS.some((r) => r.id === 'abroad')).toBe(true)
  })
})

describe('the checklist', () => {
  const FACTS: OnboardingFacts = {
    displayName: 'Jane Smith', libraryEntries: 1, documents: 0, profileConnected: false, googleConnected: true,
    googleAvailable: true, bandsintownConnected: false, passkeys: 2,
  }
  const goals = { goals: ['gigs' as const], reach: [], note: null }

  it('offers the question as an optional step, so it never holds back "you are set up"', () => {
    const state = onboardingSteps(FACTS, goals, null)
    const about = state.steps.find((s) => s.id === 'about')!
    expect(about.optional).toBe(true)
    expect(about.done).toBe(false)
    expect(state.complete).toBe(true)
  })

  it('ticks itself once they have said where, or what', () => {
    expect(onboardingSteps(FACTS, goals, { region: 'MB', city: null, genres: [] }).steps.find((s) => s.id === 'about')!.done).toBe(true)
    expect(onboardingSteps(FACTS, goals, { region: null, city: null, genres: ['folk'] }).steps.find((s) => s.id === 'about')!.done).toBe(true)
  })
})

describe('the route', () => {
  it('saves what is said and keeps what was not', async () => {
    const { d1 } = sqliteD1()
    const env = { DB: d1 } as never
    const app = onboardingApp(env)
    await app.request('/profile', put({ region: 'MB', city: 'Winnipeg' }), env)
    const res = await app.request('/profile', put({ genres: ['folk', 'roots'] }), env)
    expect(((await res.json()) as { profile: unknown }).profile).toEqual({ region: 'MB', city: 'Winnipeg', genres: ['folk', 'roots'] })
    expect(parseProfile(await readTenantSetting(env, TENANT, ONBOARDING_KEYS.profile))?.region).toBe('MB')
  })

  it('refuses a genre it does not offer, and more than three', async () => {
    const { d1 } = sqliteD1()
    const env = { DB: d1 } as never
    const app = onboardingApp(env)
    expect((await app.request('/profile', put({ genres: ['polka'] }), env)).status).toBe(400)
    expect((await app.request('/profile', put({ genres: ['folk', 'roots', 'jazz', 'blues'] }), env)).status).toBe(400)
    expect((await app.request('/profile', put({ region: 'Atlantis' }), env)).status).toBe(400)
  })

  it('keeps one account\'s answers from another\'s', async () => {
    const { d1, db } = sqliteD1()
    db.exec("INSERT INTO tenants (id, display_name, created_at) VALUES ('tnt_0002', 'Other', '2026-10-01T00:00:00Z')")
    const env = { DB: d1 } as never
    await onboardingApp(env, 'tnt_0001').request('/profile', put({ region: 'MB' }), env)
    expect(await readTenantSetting(env, asTenantId('tnt_0002'), ONBOARDING_KEYS.profile)).toBeNull()
  })
})

describe('the welcome questions', () => {
  const flow = readFileSync('frontend/src/components/OnboardingFlow.tsx', 'utf8')

  it('ask where and what, between the name and the goals', () => {
    expect(flow).toMatch(/'welcome', 'name', 'where', 'play', 'goals', 'reach', 'note', 'done'/)
    expect(flow).toContain('Where are you based?')
    expect(flow).toContain('What do you play?')
  })

  it('let somebody skip either, since neither is needed to use the app', () => {
    expect(flow).toMatch(/region === null && !city\.trim\(\) \? 'Skip'/)
    expect(flow).toMatch(/genres\.size === 0 \? 'Skip'/)
  })
})

function put(body: unknown) {
  return { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

function onboardingApp(_env: unknown, tenant = 'tnt_0001') {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('actor' as never, { kind: 'user', role: 'owner', tenant, userId: 'usr_0001', session: { elevatedAt: null } } as never)
    await next()
  })
  app.route('/', onboarding as never)
  return app
}
