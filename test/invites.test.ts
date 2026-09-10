/**
 * Invitations: the rules, and the two places a token could leak.
 *
 * An invite is the largest credential this app hands out — a passkey signs
 * into an account that exists, and this one brings one into being — so the
 * behavioural half is worth testing directly, and the "where could the token
 * end up" half is worth reading off the source, because both leaks would work
 * perfectly and look fine.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  INVITE_REFUSALS,
  INVITE_TTL_DAYS,
  inviteExpiry,
  inviteState,
  maskAddress,
} from '../shared/invites'

/** Fixed, and relative to itself — never the real clock. */
const NOW = new Date('2026-09-10T12:00:00.000Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString()

describe('inviteState', () => {
  it('is valid until the day it lapses', () => {
    expect(inviteState({ now: NOW, invite: { expiresAt: days(30) } })).toBe('valid')
    expect(inviteState({ now: NOW, invite: { expiresAt: days(0.001) } })).toBe('valid')
  })

  it('expires on the boundary rather than after it', () => {
    // `<=`, so an invite whose expiry is exactly now is spent. A window that
    // includes its own last instant is a window nobody can reason about.
    expect(inviteState({ now: NOW, invite: { expiresAt: NOW.toISOString() } })).toBe('expired')
    expect(inviteState({ now: NOW, invite: { expiresAt: days(-1) } })).toBe('expired')
  })

  it('reports a used invitation as used even after it would have expired', () => {
    // Single use means a second attempt fails whether or not the date has
    // passed, and the person holding it is better served by "already used"
    // than by a date that is beside the point.
    expect(
      inviteState({ now: NOW, invite: { expiresAt: days(-5), redeemedAt: days(-10) } }),
    ).toBe('redeemed')
  })

  it('reports a withdrawn invitation as withdrawn, expired or not', () => {
    expect(inviteState({ now: NOW, invite: { expiresAt: days(5), revokedAt: days(-1) } })).toBe(
      'revoked',
    )
    expect(inviteState({ now: NOW, invite: { expiresAt: days(-5), revokedAt: days(-6) } })).toBe(
      'revoked',
    )
  })

  it('prefers redeemed over revoked, because redemption already happened', () => {
    expect(
      inviteState({
        now: NOW,
        invite: { expiresAt: days(5), redeemedAt: days(-2), revokedAt: days(-1) },
      }),
    ).toBe('redeemed')
  })
})

describe('inviteExpiry', () => {
  it('is thirty days out, measured from the date it is handed', () => {
    expect(inviteExpiry(NOW)).toBe(days(INVITE_TTL_DAYS))
    expect(INVITE_TTL_DAYS).toBe(30)
  })

  it('produces something the state check reads back as valid', () => {
    const expiresAt = inviteExpiry(NOW)
    expect(inviteState({ now: NOW, invite: { expiresAt } })).toBe('valid')
    // And not one second past its own window.
    const after = new Date(Date.parse(expiresAt) + 1000)
    expect(inviteState({ now: after, invite: { expiresAt } })).toBe('expired')
  })
})

describe('every refusal says what happened', () => {
  it('covers each state that is not valid', () => {
    for (const state of ['redeemed', 'revoked', 'expired'] as const) {
      const message = INVITE_REFUSALS[state]
      expect(message, state).toBeTruthy()
      // The remedy is always the same, and saying it is the whole value of
      // distinguishing the cases — "invalid invitation" leaves somebody
      // staring at a screen with no next move.
      expect(message.toLowerCase(), state).toContain('new one')
    }
  })
})

describe('maskAddress', () => {
  it('keeps enough to recognise and not enough to harvest', () => {
    expect(maskAddress('doug@example.com')).toBe('d•••@example.com')
    expect(maskAddress('a@example.com')).toBe('a•@example.com')
  })

  it('gives up rather than guessing at something that is not an address', () => {
    expect(maskAddress('not-an-address')).toBe('•••')
  })
})

/* --------------------------------------------------------------------- */
/* Where a token could end up, read off the source                        */
/* --------------------------------------------------------------------- */

/**
 * Source with comments removed.
 *
 * These rules are about what the code *does*, and a comment explaining why a
 * `mailto:` is absent contains the word `mailto:`. Reading prose as code is
 * how a guard reports a violation that is really an explanation — or worse,
 * passes on one.
 */
function source(...parts: string[]): string {
  return readFileSync(join(...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the token never travels somewhere it would be logged', () => {
  it('is sent in a body, never in a path', () => {
    const client = source('frontend', 'src', 'api.ts')
    // A credential in a URL is a credential in an access log, a `Referer`
    // header and a browser history. All three join calls POST it.
    expect(client).toContain("apiFetch<JoinCheck>('/auth/join/check', { method: 'POST'")
    expect(client).not.toMatch(/\/auth\/join\/\$\{/)
  })

  it('is read from the fragment, which browsers do not send', () => {
    const gate = source('frontend', 'src', 'components', 'AuthGate.tsx')
    expect(gate).toContain("page === 'join'")
    // `useHashRoute` is the only reader. A token pulled off `location.search`
    // would be one the server sees on every asset request.
    expect(gate).not.toContain('location.search')
  })
})

/**
 * One route handler, from its registration to the next one.
 *
 * Anchored on a regex rather than an exact string so that reformatting the
 * file changes nothing here — a guard that breaks on whitespace is a guard
 * somebody deletes.
 */
function handler(src: string, start: RegExp): string {
  const from = src.search(start)
  expect(from, `no handler matching ${start}`).toBeGreaterThan(-1)
  const rest = src.slice(from + 1)
  const next = rest.search(/\nadmin\.(get|post|delete|patch)\(/)
  return next === -1 ? src.slice(from) : src.slice(from, from + 1 + next)
}

describe('the oversight screen cannot re-show an invitation', () => {
  const route = source('src', 'routes', 'admin.ts')

  it('never returns a token from the list', () => {
    // The list route maps explicit fields. `token` is not among them and
    // cannot be: the column holds a hash, so there is nothing to return.
    expect(handler(route, /admin\.get\(\s*'\/invites'/)).not.toMatch(/\btoken\b/)
  })

  it('issues behind a passkey touch and withdraws without one', () => {
    // Issuing creates a credential that grants an account — the largest
    // instance of "changes who can get in". Withdrawing removes access, which
    // is the safe direction, and a prompt you see constantly is one you stop
    // reading.
    expect(handler(route, /admin\.post\(\s*'\/invites'/)).toContain('needsElevation')
    expect(handler(route, /admin\.delete\(\s*'\/invites\/:id'/)).not.toContain('needsElevation')
  })
})

describe('the invite panel offers Copy and never a send', () => {
  const panel = source('frontend', 'src', 'components', 'InvitesPanel.tsx')

  it('has a copy button', () => {
    expect(panel).toContain('Copy link')
  })

  it('offers no mail handler', () => {
    // Scout cannot mail an invitation until the sending domain is onboarded,
    // and a compose window pre-filled with a credential would put one in a
    // drafts folder besides. The screen says so instead.
    expect(panel).not.toContain('mailto:')
    expect(panel.toLowerCase()).not.toMatch(/>\s*send\s*</)
  })
})
