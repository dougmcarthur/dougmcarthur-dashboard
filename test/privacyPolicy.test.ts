import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  CHALLENGE_TTL_SECONDS,
  ELEVATION_TTL_MINUTES,
  ENROLMENT_CODE_MAX_ATTEMPTS,
  ENROLMENT_CODE_TTL_MINUTES,
  SESSION_TTL_DAYS,
} from '../shared/auth'
import { HANDLED_RETENTION_DAYS, UNHANDLED_RETENTION_DAYS } from '../shared/inviteRequests'
import { UNUSED_INVITE_RETENTION_DAYS } from '../shared/invites'

/**
 * The privacy policy, read off the source.
 *
 * A policy is a set of claims, and these are the ones that typecheck, render and
 * go stale the day somebody changes a number in code and not on the page. Each
 * check ties a sentence on `/privacy/` to the thing that makes it true, so the
 * page cannot quietly drift from what the Worker does.
 *
 * It is also read against the rest of the house rules: no em dash, never "Scout"
 * standing alone, no eyebrow above a heading, no accent bar down a card's edge.
 */

const read = (path: string) => readFileSync(path, 'utf8')
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const HTML = read('frontend/privacy/index.html')

/** What a reader sees: tags and scripts gone, entities decoded, space collapsed. */
const TEXT = HTML.replace(/<script[\s\S]*?<\/script>/g, ' ')
  // Inline tags leave no gap, so "Policy</a>, including" does not become "Policy ,".
  .replace(/<\/?(?:a|strong|em|span)\b[^>]*>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&rsquo;/g, '’')
  .replace(/&lsquo;/g, '‘')
  .replace(/&ldquo;|&rdquo;/g, '"')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')

/** An exported or module-level `const NAME = 123` from a source file. */
function constant(path: string, name: string): number {
  const match = read(path).match(new RegExp(`const ${name}\\s*=\\s*(\\d[\\d_]*)`))
  if (!match) throw new Error(`${name} not found in ${path}`)
  return Number(match[1].replace(/_/g, ''))
}

describe('where the policy lives', () => {
  it('is a document of its own, built and styled with the app', () => {
    const vite = read('vite.config.ts')
    expect(vite).toContain("privacy: page('./frontend/privacy/index.html')")
    expect(read('tailwind.config.js')).toContain('./frontend/privacy/index.html')
    expect(read('frontend/privacy/index.html')).toContain('src="/src/privacy.ts"')
  })

  it('is served by the static assets, so the Worker names no route for it', () => {
    // A route here would be a second way to answer /privacy/, and the one most
    // likely to be wrong: a redirect to a hash page is not a page a regulator,
    // a search engine or Google's app review can read without running a script.
    expect(withoutComments(read('src/index.ts'))).not.toMatch(/['"]\/privacy/)
  })

  it('names its own address, so a copy knows where the original is', () => {
    expect(HTML).toContain('<link rel="canonical" href="https://scout.sundogsmusic.ca/privacy/" />')
  })
})

describe('who is responsible', () => {
  it('names the registered business, the person, and a way to write to them', () => {
    expect(TEXT).toContain('Sun Dogs Music Manitoba')
    expect(TEXT).toContain('Doug McArthur')
    // The Business Names Registration Act filing of 30 December 2024.
    expect(TEXT).toContain('10219396')
    expect(TEXT).toContain('55 Tunis Bay, Winnipeg, Manitoba R3T 2X2')
    expect(TEXT).toContain('hello@sundogsmusic.ca')
  })

  it('sends a complaint to the regulator, and promises the thirty days the law allows', () => {
    expect(TEXT).toContain('Office of the Privacy Commissioner of Canada')
    expect(TEXT).toContain('1-800-282-1376')
    expect(TEXT).toContain('We answer within 30 days')
  })

  it('states the minimum age the product was decided with', () => {
    expect(TEXT).toContain('You must be 18 or older to have an account')
  })
})

describe('the numbers are the code’s', () => {
  it('session, challenge, setup code and elevation lengths', () => {
    expect(TEXT).toContain(`${SESSION_TTL_DAYS} days from signing in`)
    expect(TEXT).toContain(`A sign-in check lasts ${CHALLENGE_TTL_SECONDS / 60} minutes`)
    expect(TEXT).toContain(`An emailed setup code lasts ${ENROLMENT_CODE_TTL_MINUTES} minutes`)
    // Said as a word on the page, so the number is pinned here.
    expect(ENROLMENT_CODE_MAX_ATTEMPTS).toBe(5)
    expect(TEXT).toContain('allows five guesses')
    expect(TEXT).toContain(`within the last ${ELEVATION_TTL_MINUTES} minutes`)
  })

  it('invitation requests, notifications and the daily counts', () => {
    expect(TEXT).toContain(`${HANDLED_RETENTION_DAYS} days after we answer one`)
    // A year, said as a word.
    expect(UNHANDLED_RETENTION_DAYS).toBe(365)
    expect(TEXT).toContain('or one year if it is never answered')

    const events = constant('src/lib/notificationEvents.ts', 'EVENT_RETENTION_DAYS')
    expect(TEXT).toMatch(new RegExp(`Notifications ${events} days\\.`))

    const usage = constant('src/lib/usage.ts', 'USAGE_RETENTION_DAYS')
    expect(TEXT).toMatch(new RegExp(`Daily record counts ${usage} days\\.`))
  })

  it('an invitation nobody used goes when the sweep says it does', () => {
    // The number is the constant `pruneInvites` measures from, so the page and
    // the daily tick cannot disagree about it.
    expect(TEXT).toContain(
      `One that was never used goes ${UNUSED_INVITE_RETENTION_DAYS} days after it expires or is withdrawn, whichever comes first.`,
    )
    // And the old promise, which was the absence of a rule, is gone.
    expect(TEXT).not.toContain('is kept until you ask us to remove it')
  })

  it('the Google connection cookie lasts as long as the page says', () => {
    const seconds = constant('src/lib/googleOAuth.ts', 'STATE_TTL_SECONDS')
    expect(seconds).toBe(600)
    expect(TEXT).toContain('for ten minutes while you connect a Google account')
  })
})

describe('what the page promises about the page', () => {
  it('loads nothing from another company', () => {
    // The sentence is "this site loads nothing from other companies", and the
    // fonts were the thing that made it false until they were self-hosted.
    expect(HTML).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="https?:/)
    expect(HTML).not.toMatch(/<script[^>]+src="https?:/)
    expect(HTML).not.toMatch(/<img\b|<iframe\b|@import/)

    const app = read('frontend/index.html')
    expect(app).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    expect(withoutComments(read('frontend/src/index.css'))).not.toMatch(/https?:\/\/fonts\./)
    expect(read('frontend/src/fonts.ts')).toContain('@fontsource-variable/public-sans')
  })

  it('does not ping a font service when an email is opened', () => {
    expect(withoutComments(read('src/lib/emailTemplate.ts'))).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
  })

  it('adds no analytics or advertising of any kind', () => {
    // Markup only: the policy's own prose says the word "analytics" on purpose.
    const markup = (html: string) => html.replace(/>[^<]*</g, '><')
    const beacons = /gtag|googletagmanager|google-analytics|cloudflareinsights|doubleclick|fbq\(|hotjar|segment\.com/i
    expect(markup(HTML)).not.toMatch(beacons)
    expect(markup(read('frontend/index.html'))).not.toMatch(beacons)
  })

  it('links out to three places and loads from none of them', () => {
    const anchors = [...HTML.matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1]).host)
    expect([...new Set(anchors)].sort()).toEqual(['developers.google.com', 'myaccount.google.com', 'www.priv.gc.ca'])
    expect([...HTML.matchAll(/\b(?:src|action|data-src)="https?:/g)]).toEqual([])
  })
})

describe('Google data', () => {
  it('carries the Limited Use statement Google asks for, with the link', () => {
    expect(TEXT).toContain(
      'Sun Dogs Music Scout’s use and transfer of information received from Google APIs to any other app will adhere to the Google API Services User Data Policy, including the Limited Use requirements.',
    )
    expect(HTML).toContain('https://developers.google.com/terms/api-services-user-data-policy')
  })

  it('says what it never does with it', () => {
    for (const phrase of [
      'We do not use it for advertising',
      'we do not sell it',
      'we do not use it to train AI models',
      'is never passed to an AI service',
    ]) {
      expect(TEXT, phrase).toContain(phrase)
    }
  })

  it('describes the drafts permission as drafting only, which the code is built to be', () => {
    expect(TEXT).toContain('It never sends a message')
    // The other half of the sentence: no call that sends is written anywhere.
    expect(withoutComments(read('src/lib/googleGrant.ts'))).not.toMatch(/messages\/send|drafts\/send|users\.messages\.send/)
  })
})

describe('what happens when an account is removed', () => {
  it('reaches the invitation that created it, which holds the name and address typed for it', () => {
    const removal = withoutComments(read('src/lib/tenantRemoval.ts'))
    expect(removal).toMatch(/delete\(invites\)\.where\(eq\(invites\.redeemedUserId, account\.id\)\)/)
    expect(TEXT).toContain('passkeys, sessions, tokens, share links, invitation, feedback and usage counts')
  })
})

describe('who can hand a program a token', () => {
  it('says an artist cannot issue one, which the card and the route both enforce', () => {
    expect(TEXT).toContain(
      'A token that lets a program read an account without signing in is issued only by the operator, and an artist cannot issue one.',
    )
    // The sentence the page used to carry promised a control an artist never had.
    expect(TEXT).not.toContain('run an agent of your own')
    expect(TEXT).not.toContain('a token you issue in Settings')

    // What makes it true: the card is rendered for the owner alone, and the
    // route refuses everybody else, since a card that is not rendered is still
    // a URL (see test/ownerOnly.test.ts for the request-level check).
    expect(read('frontend/src/pages/SettingsPage.tsx')).toMatch(/role === 'owner' && <AgentTokensCard \/>/)
    expect(withoutComments(read('src/routes/agentTokens.ts'))).toMatch(
      /actor\.kind === 'user' && actor\.role !== 'owner'/,
    )
  })

  it('keeps the sentence about where a token holder’s data goes', () => {
    expect(TEXT).toContain(
      'What a program holding a token receives goes to the AI service its holder chooses, under the holder’s own arrangement with that service and not ours.',
    )
  })
})

describe('how it reads', () => {
  it('has no em dash', () => {
    expect(HTML).not.toContain(String.fromCodePoint(0x2014))
  })

  it('never says "Scout" on its own; the mark is the whole name', () => {
    const bare = [...TEXT.matchAll(/(.{0,16})\bScout\b/g)].filter((m) => !/Sun Dogs Music $/.test(m[1]))
    expect(bare.map((m) => m[0])).toEqual([])
  })

  it('has no eyebrow above a heading and no accent bar down a card', () => {
    expect(HTML).not.toMatch(/\buppercase\b/)
    expect(HTML).not.toMatch(/border-l-/)
  })

  it('writes each section heading as a sentence, not a label', () => {
    const headings = [...HTML.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/\s+/g, ' ').trim())
    expect(headings.length).toBeGreaterThan(10)
    for (const heading of headings) {
      expect(heading.split(' ').length, heading).toBeGreaterThanOrEqual(4)
    }
  })

  it('uses only the app’s colour tokens', () => {
    // The theme-color meta and the early theme script are the only places a
    // colour is allowed to be written as a value.
    const body = HTML.split('<body>')[1]
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(body).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|blue|red|green)-\d/)
  })
})

describe('where a person finds it', () => {
  const places: Array<[string, string]> = [
    ['the landing page footer', 'frontend/src/pages/LandingPage.tsx'],
    ['the sign-in screen', 'frontend/src/components/LoginScreen.tsx'],
    ['the invitation screen, before the passkey is made', 'frontend/src/components/JoinScreen.tsx'],
    ['the Help page', 'frontend/src/pages/HelpPage.tsx'],
    ['the Google consent dialog', 'frontend/src/components/GoogleConsentModal.tsx'],
  ]

  for (const [name, path] of places) {
    it(`is linked from ${name}`, () => {
      expect(read(path)).toContain('href="/privacy/')
    })
  }
})
