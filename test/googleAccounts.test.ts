import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { connectNotice, listServices } from '../shared/integrations'
import { BUNDLE_PURPOSES, bundleScopes, CALENDAR_OWNED_SCOPE } from '../src/lib/googleGrant'
import { unpackState } from '../src/lib/googleOAuth'

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
