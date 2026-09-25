import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  CALENDAR_APP_SCOPE,
  GMAIL_COMPOSE_SCOPE,
  GRANT_PURPOSES,
  primaryCalendarOffered,
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

  it('is the only calendar scope the default connect flow can reach', () => {
    // The `calendar.primary` purpose exists and asks for something far wider
    // (see below), so "never the broad one" stopped being true and had to be
    // replaced by something narrower rather than deleted. What still holds:
    // connecting *the calendar* means the app-created scope and nothing else.
    expect(requestedScopes('calendar')).toBe(
      'https://www.googleapis.com/auth/calendar.app.created openid email',
    )
  })

  it('is never the broad one, anywhere in the Worker', () => {
    // `calendar.events.owned` is deliberately absent from this list and is
    // checked separately: it is reachable, but only through its own purpose,
    // its own consent screen and a deployment that turned it on.
    const broad = [
      'https://www.googleapis.com/auth/calendar"',
      "https://www.googleapis.com/auth/calendar'",
      'auth/calendar.events"',
      "auth/calendar.events'",
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

  it('keeps the broad one behind its own purpose and its own switch', () => {
    // Writing to the artist's own calendar needs a scope Google enforces
    // nothing about: read and write over every event on every calendar they
    // own. Three things stop that being a quiet widening of the narrow grant,
    // and this pins all three.
    expect(scopeFor('calendar.primary')).toBe(
      'https://www.googleapis.com/auth/calendar.events.owned',
    )
    // It is a separate purpose, so the Scout-calendar grant is untouched by it
    // and either can be revoked without the other.
    expect(requestedScopes('calendar')).not.toContain('calendar.events.owned')
    // And it is off unless the deployment says otherwise, because declaring
    // the scope puts it in front of Google's review for every user of the
    // deployment — including everybody who will never opt in.
    expect(primaryCalendarOffered({} as never)).toBe(false)
    expect(primaryCalendarOffered({ PRIMARY_CALENDAR_OPT_IN: 'false' } as never)).toBe(false)
    expect(primaryCalendarOffered({ PRIMARY_CALENDAR_OPT_IN: 'true' } as never)).toBe(true)
  })

  it('keeps Tasks honest about having no narrow option at all', () => {
    // Google offers `tasks.readonly` and `tasks`, and nothing in between —
    // no `tasks.app.created`. So this is the `gmail.compose` trade: the limit
    // is src/lib/googleTasks.ts naming one list and never enumerating, not
    // something Google enforces. The integration spec has to say so, and
    // test/integrations.test.ts checks that it does.
    expect(scopeFor('tasks')).toBe('https://www.googleapis.com/auth/tasks')
    expect(requestedScopes('tasks')).not.toContain('tasks.readonly')
  })

  it('names every purpose it supports, so adding one cannot skip a scope', () => {
    for (const purpose of GRANT_PURPOSES) {
      expect(scopeFor(purpose), purpose).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//)
    }
  })
})

describe('the Drive grant', () => {
  it('asks for drive.file and nothing wider', () => {
    expect(scopeFor('drive')).toBe('https://www.googleapis.com/auth/drive.file')
    expect(requestedScopes('drive')).toBe('https://www.googleapis.com/auth/drive.file openid email')
  })

  it('names no broad Drive scope anywhere in the Worker', () => {
    // drive.file reaches only what Scout made or the artist picked. The broad
    // scopes read the whole Drive and are Restricted: a Google security
    // assessment, and a promise to artists this app would stop being able to
    // keep.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, e.name)
        if (e.isDirectory()) walk(path)
        else if (/\.ts$/.test(e.name)) {
          const src = readFileSync(path, 'utf8')
          for (const scope of ["auth/drive'", 'auth/drive"', 'auth/drive.readonly', 'auth/drive.metadata']) {
            if (src.includes(scope)) offenders.push(`${path} — ${scope}`)
          }
        }
      }
    }
    walk('src')
    expect(offenders).toEqual([])
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

  it('round-trips the two purposes added since', () => {
    expect(unpackState(packState('n', 'tasks'))).toEqual({ nonce: 'n', purpose: 'tasks' })
    expect(unpackState(packState('n', 'calendar.primary'))).toEqual({
      nonce: 'n',
      purpose: 'calendar.primary',
    })
  })

  it('refuses a purpose it does not know rather than guessing one', () => {
    expect(unpackState('abc.calendars')).toBeNull()
    expect(unpackState('abc.photos')).toBeNull()
    expect(unpackState('abc.drive.readonly')).toBeNull()
    expect(unpackState('abc.')).toBeNull()
    // A near-miss on a real purpose is the one worth naming: it would be read
    // as the narrow calendar grant and complete a consent for the wide one.
    expect(unpackState('abc.calendar.primary.extra')).toBeNull()
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
