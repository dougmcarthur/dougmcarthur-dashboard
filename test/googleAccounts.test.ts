import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { connectNotice, listServices } from '../shared/integrations'
import { BUNDLE_PURPOSES, BUNDLE_WITHOUT_GMAIL, bundleScopes, CALENDAR_OWNED_SCOPE } from '../src/lib/googleGrant'
import { bundlePurposes, isBundle, unpackState } from '../src/lib/googleOAuth'

/**
 * One "Connect Google account" for every service, with a quiet way to put one
 * service on a different account. Pinned here: what the one consent asks for,
 * that its result reaches the screen, and that the screen offers one button
 * rather than four.
 */

const q = (s: string) => new URLSearchParams(s)
const src = (...parts: string[]) =>
  readFileSync(fileURLToPath(new URL(`../${parts.join('/')}`, import.meta.url)), 'utf8')

describe('the one consent', () => {
  it('asks for the four everyday services and the account address, never the broad calendar', () => {
    expect(BUNDLE_PURPOSES).toEqual(['calendar', 'tasks', 'gmail.compose', 'drive'])
    expect(bundleScopes()).toContain('email')
    expect(bundleScopes()).not.toContain(CALENDAR_OWNED_SCOPE)
  })

  it('survives the round trip through state', () => {
    expect(unpackState('abc.google')).toEqual({ nonce: 'abc', purpose: 'google' })
    expect(unpackState('abc.google.extra')).toBeNull()
  })

  it('lets Google ask which account, rather than taking the browser default', () => {
    expect(src('src', 'lib', 'googleOAuth.ts')).toMatch(/prompt', 'consent select_account'/)
  })
})

describe('what the screen says when Google sends you back', () => {
  it('says it connected', () => {
    expect(connectNotice(q('google=connected'))).toEqual({ tone: 'success', lines: ['Google account connected.'] })
  })

  it('names every gap in a partial connect, and why', () => {
    const notice = connectNotice(q('google=partial&declined=tasks,drive&failed=calendar&kept=gmail.compose'))!
    expect(notice.tone).toBe('danger')
    expect(notice.lines.join(' ')).toContain('Tasks and Drive were left unticked')
    expect(notice.lines.join(' ')).toContain('Calendar could not be set up')
    expect(notice.lines.join(' ')).toContain('Gmail drafts stayed on the other Google account')
  })

  it('reports the failure that used to be silent', () => {
    // A calendar "connected successfully" on Google's screen with nothing
    // stored: the callback said `calendar=failed` and nothing read it.
    const notice = connectNotice(q('calendar=failed'))!
    expect(notice.tone).toBe('danger')
    expect(notice.lines[0]).toContain('nothing was saved')
  })

  it('treats cancelling as a choice, not an error', () => {
    expect(connectNotice(q('google=access_denied'))?.tone).toBe('warn')
  })

  it('says nothing when the address carries no outcome', () => {
    expect(connectNotice(q('tab=general'))).toBeNull()
  })

  it('lists services in words', () => {
    expect(listServices(['calendar', 'tasks', 'gmail.compose'])).toBe('Calendar, Tasks and Gmail drafts')
  })
})

describe('the screen', () => {
  const card = src('frontend', 'src', 'components', 'IntegrationsCard.tsx')

  it('offers one Connect for Google, and the per-service ones only as the edge case', () => {
    expect(card).toContain('Connect Google account')
    expect(card).toContain('Use a different Google account for one service')
    expect(card).toMatch(/!IN_BUNDLE\.has\(row\.spec\.id\)/)
  })

  it('reads how the connect went', () => {
    expect(card).toContain('connectNotice(')
  })
})

/**
 * Gmail is explained before Google asks, and no means Google never asks.
 *
 * The drafting permission is the one in the bundle that reaches mail: Google's
 * narrowest drafting scope also lets the holder read, change and delete drafts
 * and send as you. So "Connect Google account" shows a disclosure first, and
 * its primary answer is a consent that does not request Gmail at all. These
 * pin the three halves: the consent without Gmail really leaves it out, the
 * screen you land on calls that a choice rather than a gap, and every route to
 * the Gmail permission passes through the disclosure — whose key sentences
 * cannot be softened without a test noticing.
 */
describe('Gmail is optional, and said so before Google asks', () => {
  it('asks Google for everything but Gmail when you say no', () => {
    const scopes = bundleScopes(BUNDLE_WITHOUT_GMAIL)
    expect(BUNDLE_WITHOUT_GMAIL).toEqual(['calendar', 'tasks', 'drive'])
    expect(scopes).not.toContain('gmail')
    expect(scopes).toContain('calendar.app.created')
    expect(bundleScopes()).toContain('gmail.compose')
  })

  it('carries the choice through the round trip', () => {
    expect(unpackState('abc.google.nogmail')).toEqual({ nonce: 'abc', purpose: 'google.nogmail' })
    expect(isBundle('google.nogmail')).toBe(true)
    expect(bundlePurposes('google.nogmail')).toEqual(BUNDLE_WITHOUT_GMAIL)
    expect(bundlePurposes('google')).toEqual(BUNDLE_PURPOSES)
  })

  it('calls leaving Gmail out a choice, never a gap', () => {
    const connected = connectNotice(q('google=connected&skipped=gmail.compose'))!
    expect(connected.tone).toBe('success')
    expect(connected.lines.join(' ')).toContain('as you chose')
    // The point of the whole screen: Scout still works without it.
    expect(connected.lines.join(' ')).toContain('Drafts still open in your own mail app')

    const partial = connectNotice(q('google=partial&failed=drive&skipped=gmail.compose'))!
    expect(partial.lines.join(' ')).not.toMatch(/Gmail drafts (was|were) left unticked/)
    expect(partial.lines.join(' ')).toContain('as you chose')
  })

  const modal = src('frontend', 'src', 'components', 'GoogleConsentModal.tsx')

  it('says what the permission allows, including sending, and what it cannot do', () => {
    const prose = modal.replace(/\s+/g, ' ')
    expect(prose).toContain('sending email as you')
    expect(prose).toContain('Read your inbox. Google does not allow that with this permission.')
    expect(prose).toContain('You do not need it')
    expect(prose).toContain('myaccount.google.com/permissions')
  })

  it('makes no the primary answer, and no requests a consent without Gmail', () => {
    expect(modal.replace(/\s+/g, ' ')).toMatch(
      /<Button variant="primary" onClick=\{\(\) => go\(api\.google\.connectWithoutGmailHref\)\}> Connect without Gmail/,
    )
  })

  it('is the only way to the Gmail permission', () => {
    // Every route that could request `gmail.compose` — the main button, "Add
    // them", Gmail on a second account, and the drafts panel on Sync — goes
    // through the modal. Nothing else may send the browser to those consents.
    const files = [
      src('frontend', 'src', 'components', 'IntegrationsCard.tsx'),
      src('frontend', 'src', 'components', 'GmailDraftsPanel.tsx'),
    ]
    for (const f of files) {
      expect(f).not.toMatch(/href=\{api\.(gmail|google)\.connectHref\}/)
      expect(f).not.toMatch(/location\.href\s*=\s*api\.(gmail|google)\.connectHref/)
    }
    const card = files[0]
    expect(card).toMatch(/if \(missing\.includes\('gmail\.compose'\)\) setConsent\('bundle'\)/)
    expect(card).toMatch(/if \(r\.spec\.id === 'gmail\.drafts'\) setConsent\('gmail'\)/)
    expect(files[1]).toContain('<GoogleConsentModal')
  })
})
