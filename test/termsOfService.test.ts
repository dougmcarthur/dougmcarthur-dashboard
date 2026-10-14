import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { INVITE_TTL_DAYS } from '../shared/invites'
import { AGENT_ROUTES } from '../shared/agentRoutes'

/**
 * The terms of service, read off the source.
 *
 * Terms are a set of promises, and these are the ones that typecheck, render
 * and go stale the day the code changes under them: the service is free, it
 * never sends anything, an agent token cannot delete, a revoked link stops
 * working, an invitation lapses after a number of days. Each check ties a
 * sentence on `/terms-of-service/` to the thing that makes it true, the same
 * way `privacyPolicy.test.ts` does for `/privacy/`.
 *
 * It is also read against the house rules: no em dash, never "Scout" standing
 * alone, no eyebrow above a heading, no accent bar down a card's edge.
 */

const read = (path: string) => readFileSync(path, 'utf8')
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** What a reader sees: tags and scripts gone, entities decoded, space collapsed. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    // Inline tags leave no gap, so "Policy</a>, including" does not become "Policy ,".
    .replace(/<\/?(?:a|strong|em|span)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

/** Every .ts and .tsx file under a directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

const HTML = read('frontend/terms-of-service/index.html')
const TEXT = visibleText(HTML)
const PRIVACY_HTML = read('frontend/privacy/index.html')
const PRIVACY = visibleText(PRIVACY_HTML)

describe('where the terms live', () => {
  it('is a document of its own, built and styled with the app', () => {
    expect(read('vite.config.ts')).toContain("terms: page('./frontend/terms-of-service/index.html')")
    expect(read('tailwind.config.js')).toContain('./frontend/terms-of-service/index.html')
    expect(HTML).toContain('src="/src/terms.ts"')
    // It takes the stylesheet, fonts and saved appearance from the policy's entry
    // rather than carrying a second copy that could drift.
    expect(read('frontend/src/terms.ts')).toMatch(/import '\.\/privacy'/)
  })

  it('is served by the static assets, so the Worker names no route for it', () => {
    // A route here would be a second way to answer /terms-of-service/, and the
    // one most likely to be wrong: a redirect to a hash page is not a document a
    // reviewer, a search engine or a court can read without running a script.
    expect(withoutComments(read('src/index.ts'))).not.toMatch(/['"]\/terms/)
  })

  it('names its own address, so a copy knows where the original is', () => {
    expect(HTML).toContain('<link rel="canonical" href="https://scout.sundogsmusic.ca/terms-of-service/" />')
  })

  it('and the policy and the terms point at each other', () => {
    expect(HTML).toContain('href="/privacy/"')
    expect(PRIVACY_HTML).toContain('href="/terms-of-service/"')
  })
})

describe('who the agreement is with', () => {
  it('names the registered business, the person, and a way to write to them', () => {
    expect(TEXT).toContain('Sun Dogs Music Manitoba')
    expect(TEXT).toContain('Doug McArthur')
    // The same registration the privacy policy names.
    expect(TEXT).toContain('10219396')
    expect(TEXT).toContain('55 Tunis Bay, Winnipeg, Manitoba R3T 2X2')
    expect(TEXT).toContain('hello@sundogsmusic.ca')
  })

  it('is governed by Manitoba law, which is where the business is registered', () => {
    expect(TEXT).toContain('the laws of Manitoba and the federal laws of Canada that apply there')
  })

  it('says the same minimum age the policy and the product were decided with', () => {
    expect(TEXT).toContain('You must be 18 or older')
    expect(PRIVACY).toContain('You must be 18 or older to have an account')
  })

  it('does not take away a right the law will not let it take away', () => {
    expect(TEXT).toContain('where the law does not allow them')
    expect(TEXT).toContain('right you have under consumer or privacy law that cannot be waived')
    // The forum clause is exclusive, as it is on SOCAN's and FACTOR's terms, and
    // it gives way to a right to sue at home, which is the part that has to stay
    // or the clause is the sort a court sets aside.
    expect(TEXT).toContain('have exclusive jurisdiction over a dispute about them')
    expect(TEXT).toContain('nothing in these terms takes away a right the law of where you live gives you to go to court at home')
  })

  it('binds the person to capacity as well as age, and covers whoever acts for an artist', () => {
    expect(TEXT).toContain('able to make a binding agreement where you live')
    expect(TEXT).toContain('If you manage or represent an artist, you confirm that you are authorized to act for them')
    expect(TEXT).toContain('If you use the service for a band, a duo or any other group')
  })

  it('names the onerous terms near the top, and again at the one action that agrees to them', () => {
    // Tilden Rent-A-Car v Clendenning and the cases after it: a standard-form term
    // that is stringent has to be drawn to the reader's attention, and a link to a
    // long document does not do that on its own. The limit on responsibility, the
    // indemnity and the forum are the three, and each is in the short version.
    const short = TEXT.split('The short version is that')[1].split('Sun Dogs Music Manitoba runs this service')[0]
    expect(short).toContain('Our responsibility to you is limited')
    expect(short).toContain('you are responsible for claims that come from what you send or publish')
    expect(short).toContain('Manitoba law applies, and the courts of Manitoba decide disputes')
    const join = read('frontend/src/components/JoinScreen.tsx')
    expect(join).toContain('which limit our responsibility and say that Manitoba law applies')
  })

  it('says what a Quebec resident keeps, and who may change the terms and for what', () => {
    // Quebec commentary lists both as the clauses most often left out. A change
    // clause has to name its circumstances and elements (art. 1373 CCQ, CPA s. 11.2
    // asks for thirty days and a right to refuse), and a limit has to say it gives
    // way where Quebec law will not let it stand.
    expect(TEXT).toContain('If you live in Quebec, some of them may not apply to you')
    expect(TEXT).toContain('that includes any right Quebec law gives you to bring a claim in the courts of Quebec')
    expect(TEXT).toContain('We change them for four reasons')
    expect(TEXT).toContain('you can have your account deleted before it takes effect')
    expect(TEXT).toContain('A change does not apply to a dispute that has already begun')
    expect(TEXT).toContain('or for injury to a person')
  })

  it('says it is English only, as the policy does, and tells a Quebec resident to ask first', () => {
    // Section 55 of the Charter of the French language, since 1 June 2023, wants a
    // French version delivered before an adhesion contract in English can bind,
    // and it is not limited to consumers. This is a known gap, said out loud.
    expect(TEXT).toContain('available only in English for now')
    expect(PRIVACY).toContain('available only in English for now')
    expect(TEXT).toContain('If you live in Quebec, please write to us before you create an account')
  })

  it('asks the person to cover a third-party claim only as far as they caused it', () => {
    // Every comparable service has an indemnity, and most are open-ended. This
    // one is narrow on purpose: what you put in, published or sent, in breach,
    // to the extent you caused it, and never something we did wrong.
    expect(TEXT).toContain('to the extent you caused it')
    expect(TEXT).toContain('This does not apply to a claim that comes from something we did wrong')
    expect(TEXT).toContain('We will tell you about the claim promptly')
  })
})

describe('the numbers are the code’s, or the policy’s', () => {
  it('an invitation lapses after the days the code gives it, and works once', () => {
    expect(TEXT).toContain(`An invitation link works once and expires after ${INVITE_TTL_DAYS} days`)
  })

  it('the answer time and the backup window are the ones the policy states', () => {
    expect(TEXT).toContain('we will answer within 30 days')
    expect(PRIVACY).toContain('We answer within 30 days')
    expect(TEXT).toContain('backups, which age out within 30 days')
    expect(PRIVACY).toContain('deleted information ages out of backups within 30 days')
  })

  it('every notice period the terms promise is thirty days, in each place it is promised', () => {
    // A change to these terms, a paid plan, and closing the whole service. They
    // are three promises with one number, so they are checked together: moving
    // one without the others would leave the page disagreeing with itself.
    expect(TEXT).toContain('at least 30 days before it takes effect')
    expect(TEXT).toContain('we will tell you at least 30 days before it applies to you')
    expect(TEXT).toContain('we will tell you at least 30 days before, and you can ask for a copy of your information')
  })
})

describe('what the terms promise about the service', () => {
  it('is free because nothing in the code can take a payment', () => {
    // The sentence is "it does not collect payment details". If a payment
    // processor is ever added, this fails until the page says something true.
    const processors = /\bstripe\b|paddle\.com|paypal|braintree|lemonsqueezy|gumroad|squareup/i
    expect(read('package.json')).not.toMatch(processors)
    for (const dir of ['src', 'shared', 'frontend/src']) {
      for (const file of sourceFiles(dir)) {
        expect(withoutComments(read(file)), file).not.toMatch(processors)
      }
    }
    expect(TEXT).toContain('Using Sun Dogs Music Scout costs nothing, and it does not collect payment details')
  })

  it('never sends a message, because no send call is written anywhere in the Worker', () => {
    const send = /messages\/send|drafts\/send|users\.messages\.send/
    for (const file of sourceFiles('src')) {
      expect(withoutComments(read(file)), file).not.toMatch(send)
    }
    expect(TEXT).toContain('The service has no way to send a message')
    expect(TEXT).toContain('It never submits an application, sends a pitch or any other message to an organiser')
  })

  it('an agent token can read and add and nothing else', () => {
    // "It cannot delete anything, and it cannot send anything." The routes are
    // the whole list of what an issued token may call, and none is a DELETE, a
    // PATCH or a PUT.
    expect([...new Set(AGENT_ROUTES.map((route) => route.method))].sort()).toEqual(['GET', 'POST'])
    expect(TEXT).toContain('It cannot delete anything, and it cannot send anything')
  })

  it('a press kit link can be switched off, and a switched-off link stops working', () => {
    expect(read('src/routes/epk.ts')).toContain("epk.delete('/shares/:id'")
    expect(read('frontend/src/pages/artist/ProfileTab.tsx')).toContain('api.epk.revoke')
    expect(read('src/lib/actor.ts')).toMatch(/!row \|\| row\.revokedAt\) return null/)
    expect(TEXT).toContain('You can switch a link off on the Artist page. That stops it working from then on')
  })

  it('does not point artists at a screen they never see', () => {
    // Settings shows the agent token card to the owner only, so a sentence that
    // told every artist to issue or revoke one there would be false for them.
    expect(read('frontend/src/pages/SettingsPage.tsx')).toMatch(/role === 'owner' && <AgentTokensCard/)
    expect(TEXT).not.toMatch(/issue an agent token in Settings/i)
    expect(TEXT).not.toMatch(/revoke it in Settings/i)
  })

  it('says only we issue an agent token, because the route refuses an artist', () => {
    expect(TEXT).toContain('Tokens are issued only by us, and an artist cannot issue one.')
    // The sentences it replaced assumed an artist holds one for their own account
    // or runs software of their own, which no artist can.
    expect(TEXT).not.toContain('issued for your own account')
    expect(TEXT).not.toContain('software of yours')
    expect(TEXT).toContain('other than through an agent token we have issued')
    // What makes it true, and the sentence the privacy page says in its own words.
    expect(withoutComments(read('src/routes/agentTokens.ts'))).toMatch(
      /actor\.kind === 'user' && actor\.role !== 'owner'/,
    )
  })

  it('promises about your content only what the policy already promises', () => {
    // The terms say we do not sell it, will not send it to an AI service without
    // asking, and read it only with permission. Each of those is a sentence the
    // privacy policy already carries, so the two cannot be made to disagree by
    // changing one page.
    expect(TEXT).toContain('We do not sell your content')
    expect(PRIVACY).toContain('We do not sell or rent personal information')
    expect(TEXT).toContain('without asking you first')
    expect(PRIVACY).toContain('say so here, tell you, and ask first')
    expect(TEXT).toContain('We read what is in your account only with your permission')
    expect(PRIVACY).toContain('We read your content only with your permission')
  })

  it('names the same four uses of your information as the policy does', () => {
    for (const use of [
      'To provide the service you asked for',
      'To keep it secure',
      'To talk to you',
      'To fix and improve the service',
    ]) {
      expect(PRIVACY, use).toContain(use)
    }
    expect(TEXT).toContain('run the service for you, keep it secure, talk to you, and fix and improve the service')
  })

  it('credits OpenStreetMap where a measured figure appears, as the terms say it does', () => {
    expect(read('frontend/src/pages/gigs/CostPanel.tsx')).toContain('© OpenStreetMap contributors')
    expect(TEXT).toContain('The screens credit OpenStreetMap beside a measured figure')
  })
})

describe('what the page promises about the page', () => {
  it('loads nothing from another company and links to none', () => {
    expect(HTML).not.toMatch(/<link[^>]+rel="stylesheet"[^>]+href="https?:/)
    expect(HTML).not.toMatch(/<script[^>]+src="https?:/)
    expect(HTML).not.toMatch(/<img\b|<iframe\b|@import/)
    expect([...HTML.matchAll(/\b(?:src|action|data-src)="https?:/g)]).toEqual([])
    // No outbound link at all: every company it names has its own terms, and
    // an address typed from memory is how a terms page ends up pointing at the
    // wrong one. The names are enough to find them.
    expect([...HTML.matchAll(/<a\b[^>]*\bhref="(https?:\/\/[^"]+)"/g)].map((m) => m[1])).toEqual([])
  })

  it('adds no analytics or advertising of any kind', () => {
    const markup = HTML.replace(/>[^<]*</g, '><')
    expect(markup).not.toMatch(/gtag|googletagmanager|google-analytics|cloudflareinsights|doubleclick|fbq\(|hotjar|segment\.com/i)
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
    // The first h2 is the jump list's own label, which is a label by design.
    for (const heading of headings.filter((h) => h !== 'Jump to a section')) {
      expect(heading.split(' ').length, heading).toBeGreaterThanOrEqual(4)
    }
  })

  it('uses only the app’s colour tokens', () => {
    const body = HTML.split('<body>')[1]
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(body).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|zinc|neutral|stone|blue|red|green)-\d/)
  })

  it('every section in the jump list exists, and every section is in the list', () => {
    const linked = [...HTML.matchAll(/<a[^>]*href="#([a-z-]+)"/g)].map((m) => m[1]).filter((id) => id !== 'terms')
    const sections = [...HTML.matchAll(/<section id="([a-z-]+)"/g)].map((m) => m[1])
    expect(linked.sort()).toEqual(sections.sort())
  })
})

describe('where a person finds it, and where they agree to it', () => {
  const places: Array<[string, string]> = [
    ['the landing page footer', 'frontend/src/pages/LandingPage.tsx'],
    ['the sign-in screen', 'frontend/src/components/LoginScreen.tsx'],
    ['the invitation screen, before the passkey is made', 'frontend/src/components/JoinScreen.tsx'],
    ['the Help page', 'frontend/src/pages/HelpPage.tsx'],
  ]

  for (const [name, path] of places) {
    it(`is linked from ${name}`, () => {
      expect(read(path)).toContain('href="/terms-of-service/')
    })
  }

  it('is agreed to at the one action that creates an account, in words, beside the button', () => {
    const join = read('frontend/src/components/JoinScreen.tsx')
    expect(join).toContain('by setting one up you agree to the')
    // The sentence has to come after the button it is about, in the same card,
    // and the terms say the same thing the screen does.
    expect(join.indexOf('Set up a passkey')).toBeLessThan(join.indexOf('you agree to the'))
    expect(TEXT).toContain('You agree to these terms when you set up a passkey to create an account')
  })
})
