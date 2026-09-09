import { describe, it, expect } from 'vitest'
import {
  ELEVATION_TTL_MINUTES,
  ENROLMENT_CODE_COOLDOWN_SECONDS,
  ENROLMENT_CODE_MAX_ATTEMPTS,
  SESSION_TTL_DAYS,
  elevationState,
  enrolmentCodeState,
  enrolmentCooldown,
  formatEnrolmentCode,
  isoAfter,
  originAllowed,
  passkeyLabel,
  relyingParty,
  sessionState,
} from '../shared/auth'

/**
 * Fixed, and everything below is relative to it. Passkey login is the one
 * feature in here that people reach in a hurry, and a suite that starts
 * failing at midnight is the wrong thing to be reading when you cannot get in.
 */
const TODAY = new Date('2026-03-01T12:00:00.000Z')

describe('relyingParty', () => {
  it('takes the rp id from the configured dashboard URL, not the request', () => {
    // The request URL is written by whoever is asking. `rpId` is baked into
    // every credential at registration, so letting a request choose it is how
    // an attacker would register a passkey the real origin cannot check.
    const party = relyingParty({
      dashboardUrl: 'https://dashboard.dougmcarthur.net',
      requestUrl: 'https://dashboard.dougmcarthur.net.evil.example/api/auth/login/options',
    })
    expect(party).toEqual({
      rpId: 'dashboard.dougmcarthur.net',
      origins: ['https://dashboard.dougmcarthur.net'],
    })
  })

  it('ignores a path on the configured URL', () => {
    const party = relyingParty({
      dashboardUrl: 'https://dashboard.dougmcarthur.net/#/overview',
      requestUrl: 'https://dashboard.dougmcarthur.net/api/auth/session',
    })
    expect(party?.rpId).toBe('dashboard.dougmcarthur.net')
    expect(party?.origins).toEqual(['https://dashboard.dougmcarthur.net'])
  })

  it('accepts both local development origins', () => {
    // Vite serves the browser on 5173 and proxies to wrangler on 8787, so the
    // origin the browser stamps into a ceremony is never the one the Worker
    // was reached on. They share a hostname, which is what rpId is.
    const party = relyingParty({ dashboardUrl: null, requestUrl: 'http://localhost:8787/api/auth/session' })
    expect(party?.rpId).toBe('localhost')
    expect(party?.origins).toContain('http://localhost:5173')
    expect(party?.origins).toContain('http://localhost:8787')
  })

  it('falls back to the request host when nothing is configured', () => {
    const party = relyingParty({ dashboardUrl: undefined, requestUrl: 'https://example.test/api/auth/session' })
    expect(party).toEqual({ rpId: 'example.test', origins: ['https://example.test'] })
  })

  it('is null when neither is usable', () => {
    expect(relyingParty({ dashboardUrl: 'not a url', requestUrl: 'also not a url' })).toBeNull()
  })
})

describe('originAllowed', () => {
  const allowed = ['https://dashboard.dougmcarthur.net']

  it('refuses an origin this deployment has never heard of', () => {
    expect(originAllowed('https://evil.example', allowed)).toBe(false)
  })

  it('accepts the deployment origin', () => {
    expect(originAllowed('https://dashboard.dougmcarthur.net', allowed)).toBe(true)
  })

  it('accepts a request with no origin at all', () => {
    // The research agents POST from outside a browser and stamp no origin.
    // They have already had to present the bearer token to get this far.
    expect(originAllowed(null, allowed)).toBe(true)
    expect(originAllowed(undefined, allowed)).toBe(true)
  })
})

describe('sessionState', () => {
  const window = (ms: number) => ({
    expiresAt: isoAfter(TODAY, ms),
    lastSeenAt: TODAY.toISOString(),
  })

  it('is invalid once the window has passed', () => {
    expect(sessionState({ now: TODAY, session: window(-1) }).valid).toBe(false)
  })

  it('is invalid on an expiry that is not a date', () => {
    // A row nothing can read is not entitled to claim it is still good.
    const state = sessionState({
      now: TODAY,
      session: { expiresAt: 'sometime', lastSeenAt: TODAY.toISOString() },
    })
    expect(state.valid).toBe(false)
  })

  it('does not write on every request', () => {
    // Rolling expiry with no threshold is one D1 write per page view for a
    // difference nobody can perceive.
    const fresh = sessionState({ now: TODAY, session: window(SESSION_TTL_DAYS * 86_400_000) })
    expect(fresh).toEqual({ valid: true, shouldExtend: false })
  })

  it('extends once the window is more than half spent', () => {
    const half = sessionState({ now: TODAY, session: window((SESSION_TTL_DAYS * 86_400_000) / 2 - 1000) })
    expect(half).toEqual({ valid: true, shouldExtend: true })
  })
})

describe('enrolmentCodeState', () => {
  const base = { expiresAt: isoAfter(TODAY, 60_000), usedAt: null, attempts: 0 }

  it('reads a live code as valid', () => {
    expect(enrolmentCodeState({ now: TODAY, code: base })).toBe('valid')
  })

  it('tells the four failures apart', () => {
    // Collapsing them into "invalid" would be one message for four different
    // things to do about it: look for the newer email, ask for another, or
    // notice that somebody has been guessing.
    expect(enrolmentCodeState({ now: TODAY, code: { ...base, usedAt: TODAY.toISOString() } })).toBe('used')
    expect(enrolmentCodeState({ now: TODAY, code: { ...base, attempts: ENROLMENT_CODE_MAX_ATTEMPTS } })).toBe('locked')
    expect(enrolmentCodeState({ now: TODAY, code: { ...base, expiresAt: isoAfter(TODAY, -1) } })).toBe('expired')
  })

  it('reports a spent code as used even after it expires', () => {
    // Order matters: "you already used this" is the more useful of the two.
    const state = enrolmentCodeState({
      now: TODAY,
      code: { expiresAt: isoAfter(TODAY, -60_000), usedAt: TODAY.toISOString(), attempts: 0 },
    })
    expect(state).toBe('used')
  })
})

describe('formatEnrolmentCode', () => {
  it('is always six digits', () => {
    for (const bytes of [[0, 0, 0, 0], [0, 0, 0, 7], [255, 255, 255, 255], [1, 2, 3, 4]]) {
      const code = formatEnrolmentCode(Uint8Array.from(bytes))
      expect(code, String(bytes)).toMatch(/^\d{6}$/)
    }
  })

  it('pads rather than shortening — a five-digit code is a typo waiting to happen', () => {
    expect(formatEnrolmentCode(Uint8Array.from([0, 0, 0, 7]))).toBe('000007')
  })
})

describe('passkeyLabel', () => {
  it('names the most specific browser that matches', () => {
    // Every Chrome claims Safari in its user agent and Edge claims both, so a
    // first-match rule labels three browsers "Safari".
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 Edg/120'
    expect(passkeyLabel(edge)).toBe('Edge on Windows')

    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    expect(passkeyLabel(chrome)).toBe('Chrome on Mac')

    const safari =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(passkeyLabel(safari)).toBe('Safari on iPhone')
  })

  it('falls back rather than inventing a name', () => {
    expect(passkeyLabel(null)).toBe('Passkey')
    expect(passkeyLabel('curl/8.4.0')).toBe('Passkey')
  })
})

describe('enrolmentCooldown', () => {
  it('allows the first request', () => {
    expect(enrolmentCooldown({ now: TODAY, lastIssuedAt: null })).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    })
  })

  it('refuses a second request inside the window, and says how long', () => {
    // The endpoint takes no credential and sends mail. Unthrottled it is a
    // button anybody can hold down.
    const result = enrolmentCooldown({ now: TODAY, lastIssuedAt: isoAfter(TODAY, -20_000) })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(ENROLMENT_CODE_COOLDOWN_SECONDS - 20)
  })

  it('allows one once the window has passed', () => {
    const past = isoAfter(TODAY, -(ENROLMENT_CODE_COOLDOWN_SECONDS * 1000))
    expect(enrolmentCooldown({ now: TODAY, lastIssuedAt: past }).allowed).toBe(true)
  })

  it('waits rather than opening up when the timestamp is ahead of now', () => {
    // A clock that went backwards should read as "just issued". The safe
    // direction for a throttle is to make you wait.
    const result = enrolmentCooldown({ now: TODAY, lastIssuedAt: isoAfter(TODAY, 60_000) })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(ENROLMENT_CODE_COOLDOWN_SECONDS)
  })

  it('ignores a timestamp that is not a date rather than blocking forever', () => {
    expect(enrolmentCooldown({ now: TODAY, lastIssuedAt: 'whenever' }).allowed).toBe(true)
  })
})

import { enrolmentRecipient } from '../src/lib/auth'

/**
 * Where a break-glass code goes.
 *
 * Never user-supplied: an address typed on the login screen would decide the
 * destination, so anyone able to load the page could mail themselves an
 * enrolment code and take the account. Deployment configuration only.
 */
describe('enrolmentRecipient', () => {
  it('uses the configured address', () => {
    expect(enrolmentRecipient({ AUTH_EMAIL: 'artist@example.com' } as never)).toBe('artist@example.com')
  })

  it('returns null rather than falling back to somebody real', () => {
    // It used to default to a hardcoded personal address, which worked for
    // exactly one deployment and silently mailed a stranger's inbox on any
    // other. Unset means recovery is unavailable and the screen says so.
    expect(enrolmentRecipient({} as never)).toBeNull()
    expect(enrolmentRecipient({ AUTH_EMAIL: '   ' } as never)).toBeNull()
  })
})

describe('elevationState', () => {
  const minutesBefore = (n: number) => new Date(TODAY.getTime() - n * 60_000).toISOString()

  it('treats a session that has never been elevated as not elevated', () => {
    // The state every session starts in. Signing in is not elevation: the
    // cookie a sign-in produces is exactly what elevation defends against.
    expect(elevationState({ now: TODAY, elevatedAt: null }).elevated).toBe(false)
    expect(elevationState({ now: TODAY, elevatedAt: undefined }).elevated).toBe(false)
  })

  it('holds for the window and then lapses', () => {
    expect(elevationState({ now: TODAY, elevatedAt: minutesBefore(1) }).elevated).toBe(true)
    expect(
      elevationState({ now: TODAY, elevatedAt: minutesBefore(ELEVATION_TTL_MINUTES - 1) }).elevated,
    ).toBe(true)
    expect(
      elevationState({ now: TODAY, elevatedAt: minutesBefore(ELEVATION_TTL_MINUTES) }).elevated,
    ).toBe(false)
    expect(
      elevationState({ now: TODAY, elevatedAt: minutesBefore(ELEVATION_TTL_MINUTES + 60) }).elevated,
    ).toBe(false)
  })

  it('reports when the confirmation runs out', () => {
    const state = elevationState({ now: TODAY, elevatedAt: minutesBefore(5) })
    expect(state.expiresAt).toBe(
      new Date(TODAY.getTime() + (ELEVATION_TTL_MINUTES - 5) * 60_000).toISOString(),
    )
  })

  it('refuses a stamp in the future rather than honouring it', () => {
    // A clock that disagrees must not become an unbounded grant. The safe
    // direction for a privilege check is to ask again.
    const ahead = new Date(TODAY.getTime() + 60_000).toISOString()
    expect(elevationState({ now: TODAY, elevatedAt: ahead }).elevated).toBe(false)
  })

  it('refuses an unparseable stamp', () => {
    expect(elevationState({ now: TODAY, elevatedAt: 'sometime' }).elevated).toBe(false)
  })

  it('is much shorter than a session', () => {
    // The whole point: a session lasts a month so that people do not stop
    // locking their screens, and that is far too long to authorise changing
    // who can sign in.
    expect(ELEVATION_TTL_MINUTES * 60_000).toBeLessThan(SESSION_TTL_DAYS * 86_400_000 / 100)
  })
})
