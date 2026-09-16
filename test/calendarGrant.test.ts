import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALENDAR_APP_SCOPE,
  GMAIL_COMPOSE_SCOPE,
  GRANT_PURPOSES,
  requestedScopes,
  scopeFor,
} from '../src/lib/googleGrant'
import { packState, unpackState } from '../src/lib/googleOAuth'

describe('the calendar scope', () => {
  it('is the app-created one, which is the whole security argument', () => {
    // `calendar.app.created` can only touch calendars this app made. Scout
    // cannot read the artist's own calendar and cannot alter an event it did
    // not create — a guarantee Google enforces rather than one this code
    // promises. Widening it would hand over the whole calendar silently.
    expect(scopeFor('calendar')).toBe('https://www.googleapis.com/auth/calendar.app.created')
  })

  it('is never the broad one, anywhere in the Worker', () => {
    const broad = [
      'https://www.googleapis.com/auth/calendar"',
      "https://www.googleapis.com/auth/calendar'",
      'auth/calendar.events',
      'auth/calendar.readonly',
    ]
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name)
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
      })
    })('src')

    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const scope of broad) if (src.includes(scope)) offenders.push(`${file} — ${scope}`)
    }
    expect(offenders).toEqual([])
  })

  it('asks for the account identity only so the screen can name it', () => {
    const scopes = requestedScopes('calendar')
    expect(scopes).toContain(CALENDAR_APP_SCOPE)
    expect(scopes).toContain('openid')
    expect(scopes).toContain('email')
    // Connecting the wrong Google account is easy and invisible otherwise.
  })

  it('keeps each purpose to its own scope, so one grant cannot stand in for another', () => {
    expect(scopeFor('gmail.compose')).toBe(GMAIL_COMPOSE_SCOPE)
    expect(requestedScopes('gmail.compose')).not.toContain(CALENDAR_APP_SCOPE)
    expect(requestedScopes('calendar')).not.toContain(GMAIL_COMPOSE_SCOPE)
  })

  it('names every purpose it supports, so adding one cannot skip a scope', () => {
    for (const purpose of GRANT_PURPOSES) {
      expect(scopeFor(purpose), purpose).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//)
    }
  })
})

describe('the consent state', () => {
  it('round-trips the nonce and the purpose', () => {
    const packed = packState('abc123', 'calendar')
    expect(unpackState(packed)).toEqual({ nonce: 'abc123', purpose: 'calendar' })
  })

  it('keeps the nonce first, because that half is the CSRF check', () => {
    // Only the nonce is in the cookie. A purpose that could be read as the
    // nonce would let a crafted link match a cookie it never saw.
    expect(packState('nonce', 'gmail.compose').startsWith('nonce.')).toBe(true)
    expect(unpackState('nonce.gmail.compose')?.nonce).toBe('nonce')
  })

  it('refuses a purpose it does not know rather than guessing one', () => {
    expect(unpackState('abc.calendars')).toBeNull()
    expect(unpackState('abc.drive')).toBeNull()
    expect(unpackState('abc.')).toBeNull()
  })

  it('refuses a state with no purpose at all', () => {
    expect(unpackState('justanonce')).toBeNull()
    expect(unpackState('')).toBeNull()
    expect(unpackState(null)).toBeNull()
  })

  it('refuses an empty nonce, which would match an absent cookie', () => {
    expect(unpackState('.calendar')).toBeNull()
  })
})
