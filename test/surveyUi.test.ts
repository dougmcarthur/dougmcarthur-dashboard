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
const RESULTS = source('frontend/src/pages/survey/SurveyResultsPage.tsx')
const PANEL = source('frontend/src/components/SurveyPanel.tsx')
const API = source('frontend/src/api.ts')
const GATE = source('frontend/src/components/AuthGate.tsx')

describe('what a respondent reads', () => {
  it('never says "Scout"; the survey names the company and no product', () => {
    for (const [name, text] of [['SurveyPage', PAGE], ['SurveyScreens', SCREENS], ['TurnstileBox', TURNSTILE], ['SurveyResultsPage', RESULTS]] as const) {
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

  it('answers the results page before the session too, since the notice sends strangers there', () => {
    expect(GATE.indexOf("page === 'survey-results'")).toBeGreaterThan(-1)
    expect(GATE.indexOf("page === 'survey-results'")).toBeLessThan(GATE.indexOf('session.isLoading'))
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

describe('the results page', () => {
  it('says plainly that nothing is posted until something is, and reads nothing but the published snapshot', () => {
    expect(RESULTS).toMatch(/have not been posted yet/)
    expect(RESULTS).toContain('api.survey.results')
    // Public: no admin route, and nothing that computes from the responses on a visit.
    expect(RESULTS + VIEW_SOURCES.map(([, t]) => t).join('\n')).not.toMatch(/api\.admin|\/admin\//)
  })
})

/**
 * The look of everything the public sees of the results, held to the rules the
 * owner set for this product's text and design: no em dash anywhere a person
 * reads, no small caption above a heading, no coloured bar down the left edge of
 * a rounded card, and no colour that is not one of the app's tokens.
 */
const RESULTS_DIR = 'frontend/src/pages/survey/results'
const VIEW_SOURCES = [
  'BarList',
  'DollarCharts',
  'Marks',
  'RankingChart',
  'ResultsView',
  'SayDoChart',
].map((name) => [name, source(`${RESULTS_DIR}/${name}.tsx`)] as const)
const FORMAT = source(`${RESULTS_DIR}/format.ts`)
const HERO = source(`${RESULTS_DIR}/hero.ts`)
const PUBLISH = source('frontend/src/components/SurveyPublish.tsx')
const SHARED = source('shared/surveyPublic.ts')
const EVERYTHING_PUBLIC: Array<readonly [string, string]> = [
  ...VIEW_SOURCES,
  ['format', FORMAT],
  ['hero', HERO],
  ['SurveyResultsPage', RESULTS],
  ['SurveyPublish', PUBLISH],
  ['surveyPublic', SHARED],
  ['SurveyPage', PAGE],
  ['SurveyScreens', SCREENS],
]

describe('how the results look', () => {
  it('has no em dash in anything a person reads', () => {
    for (const [name, text] of EVERYTHING_PUBLIC) expect(text, name).not.toContain('\u2014')
  })

  it('puts no small label above a heading: a heading says the finding itself', () => {
    for (const [name, text] of [...VIEW_SOURCES, ['SurveyPublish', PUBLISH] as const]) {
      expect(text, name).not.toMatch(/uppercase/)
      expect(text, name).not.toMatch(/<Caption\b/)
      expect(text, name).not.toMatch(/eyebrow/i)
    }
  })

  it('has no coloured bar down the left edge of a card', () => {
    for (const [name, text] of [...VIEW_SOURCES, ['SurveyPublish', PUBLISH] as const]) {
      expect(text, name).not.toMatch(/border-l-(?:\d|accent|success|info|danger|warn|cat-)/)
    }
  })

  it('draws only in the app’s own colour tokens, so both themes follow', () => {
    for (const [name, text] of VIEW_SOURCES) {
      expect(text, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(text, name).not.toMatch(/\brgba?\(/)
      expect(text, name).not.toMatch(/\bhsla?\(/)
      expect(text, name).not.toMatch(/(?:bg|text|border|stroke|fill)-(?:red|green|blue|yellow|orange|purple|pink|indigo|teal|sky|rose|violet|emerald|amber|lime|slate|gray|zinc|neutral|stone)-\d/)
    }
  })

  it('never says "Scout", and gives every chart a table twin so no number is only in a tooltip', () => {
    for (const [name, text] of EVERYTHING_PUBLIC) expect(text, name).not.toMatch(/scout/i)
    const all = VIEW_SOURCES.map(([, t]) => t).join('\n')
    for (const chart of ['RankingChart', 'DollarCharts', 'SayDoChart']) {
      expect(VIEW_SOURCES.find(([n]) => n === chart)![1], chart).toContain('<TableTwin')
    }
    expect(all).toContain('role="tooltip"')
    // A tooltip only repeats what is printed or tabulated: it is never given the keyboard alone.
    expect(all).toMatch(/focus-visible:block/)
  })
})

describe('the owner’s side of publishing', () => {
  it('shows the page before it can be published, and publishes only a digest of what was shown', () => {
    expect(PUBLISH.indexOf('api.admin.surveyPublication(')).toBeGreaterThan(-1)
    expect(PUBLISH.indexOf('api.admin.surveyPublication(')).toBeLessThan(PUBLISH.indexOf('api.admin.publishSurvey('))
    expect(PUBLISH).toContain('<Disclosure')
    expect(PUBLISH).toContain('<ResultsView')
    // The browser sends a digest and the exclusions, never the content it was shown.
    expect(PUBLISH).toMatch(/publishSurvey\(\{ fingerprint, \.\.\.flags \}\)/)
    expect(PUBLISH).not.toMatch(/publishSurvey\([^)]*results/)
  })

  it('cannot publish a page that matches what is already published, which would change only the date', () => {
    expect(PUBLISH).toMatch(/disabled=\{publish\.isPending \|\| current\}/)
  })

  it('uses one component for the preview and the public page, so what was reviewed is what is shown', () => {
    expect(RESULTS).toContain('<ResultsView')
    expect(PUBLISH).toContain('<ResultsView')
  })
})

describe('the owner’s switch', () => {
  it('is the only control: nothing reads or names the old environment settings', () => {
    // Two switches for one thing is how a survey you closed stays open.
    const names = /SURVEY_OPEN|SURVEY_CONTACT_EMAIL|SURVEY_RESULTS_URL|TURNSTILE_SITE_KEY/
    for (const [file, text] of [
      ['src/routes/survey.ts', source('src/routes/survey.ts')],
      ['src/routes/admin.ts', source('src/routes/admin.ts')],
      ['src/lib/surveySettings.ts', source('src/lib/surveySettings.ts')],
      ['src/types.ts', source('src/types.ts')],
      ['SurveyPanel', PANEL],
    ] as const) {
      expect(text, file).not.toMatch(names)
    }
  })

  it('waits on a contact address and on unsaved edits rather than failing after the click', () => {
    expect(PANEL).toMatch(/Add a contact address first/)
    expect(PANEL).toMatch(/Save your changes first/)
    expect(PANEL).toContain('disabled={save.isPending || !!blocker}')
  })

  it('names the spam check’s secret only to say where it is set, and never asks for it', () => {
    expect(PANEL).toContain('TURNSTILE_SECRET_KEY')
    expect(PANEL).not.toMatch(/setSurvey\([^)]*secret/i)
    expect(PANEL).not.toMatch(/type="password"/)
  })
})
