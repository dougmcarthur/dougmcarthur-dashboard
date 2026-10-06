import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/**
 * The survey page, read off the source: promises the notice makes that typecheck
 * and render whether they hold or not. A respondent never sees most of what
 * these guard, which is exactly why they cannot be left to a screenshot.
 */

function source(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const PAGE = source('frontend/src/pages/survey/SurveyPage.tsx')
const SCREENS = source('frontend/src/pages/survey/SurveyScreens.tsx')
const TURNSTILE = source('frontend/src/pages/survey/TurnstileBox.tsx')
const API = source('frontend/src/api.ts')
const GATE = source('frontend/src/components/AuthGate.tsx')

describe('what a respondent reads', () => {
  it('never says "Scout"; the survey names the company and no product', () => {
    for (const [name, text] of [['SurveyPage', PAGE], ['SurveyScreens', SCREENS], ['TurnstileBox', TURNSTILE]] as const) {
      expect(text, name).not.toMatch(/scout/i)
    }
  })

  it('has no Send button: it records answers, it does not send anything anywhere else', () => {
    expect(PAGE + SCREENS).not.toMatch(/>\s*Send\b/)
  })
})

describe('what the browser keeps', () => {
  it('keeps one random code and a note that this browser has finished, never an answer', () => {
    // One write, in one function, taking the two-field shape and nothing else.
    expect([...PAGE.matchAll(/localStorage\.setItem\(/g)]).toHaveLength(1)
    expect(PAGE).toMatch(/interface Stored \{\s*id\?: string\s*done\?: boolean\s*\}/)
    expect(PAGE).not.toMatch(/sessionStorage|indexedDB|document\.cookie/)
    expect(SCREENS).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/)
  })

  it('clears the code when a response is deleted or the person is screened out', () => {
    expect(PAGE).toMatch(/clearStored\(\)\s*\n\s*onScreened\(\)/)
    expect(PAGE).toMatch(/clearStored\(\)\s*\n\s*onDiscarded\(\)/)
  })
})

describe('the response id', () => {
  const block = API.slice(API.indexOf('  survey: {'), API.indexOf('  drive: {'))

  it('travels in a body and never in a path, where the request logger would print it', () => {
    expect(block).toContain("'/public/survey/resume'")
    expect(block).not.toMatch(/\/public\/survey\/\$\{/)
    expect(block).not.toMatch(/method: 'DELETE'/)
    expect(block).not.toMatch(/\?id=/)
  })

  it('is not put in the address bar by the page', () => {
    expect(PAGE).not.toMatch(/location\.hash\s*=|history\.(push|replace)State/)
  })
})

describe('where the page is reached', () => {
  it('is answered before the session, so it looks the same signed in or out', () => {
    expect(GATE.indexOf("page === 'survey'")).toBeGreaterThan(-1)
    expect(GATE.indexOf("page === 'survey'")).toBeLessThan(GATE.indexOf('session.isLoading'))
  })

  it('asks search engines not to list it, and puts the title back afterwards', () => {
    expect(PAGE).toContain("robots.content = 'noindex'")
    expect(PAGE).toMatch(/document\.title = previous/)
  })
})

describe('the spam check', () => {
  it('loads Cloudflare’s script only when the survey is being taken, and only once', () => {
    expect(TURNSTILE).toContain('challenges.cloudflare.com')
    expect(TURNSTILE).toMatch(/loading \?\?= new Promise/)
    // Rendered by the consent screen, and only when the deployment has a key.
    expect(PAGE).toMatch(/status\.siteKey && <TurnstileBox/)
  })
})
