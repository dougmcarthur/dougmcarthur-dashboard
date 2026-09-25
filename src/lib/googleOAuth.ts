/**
 * The consent round trip, shared by every purpose that needs one.
 *
 * It was inside the Gmail router when drafting was the only grant. Calendar
 * needs the same four steps — build a URL, set a state cookie, check it on the
 * way back, exchange the code — and copying them would be the fourteenth
 * button all over again.
 *
 * **The redirect URI does not change, and that is the point.** It is
 * registered in the Google Cloud console, so a second one would be a thing
 * somebody has to go and configure — which is exactly what connecting a
 * calendar is supposed to stop needing. So both purposes come back to
 * `/api/gmail/callback` and the purpose rides in `state`. The path is named
 * after the feature that registered it rather than what it now does; renaming
 * it would mean a console edit, which is the cost this avoids.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../context'
import { randomToken } from './auth'
import {
  GRANT_PURPOSES,
  grantConfigured,
  redirectUri,
  bundleScopes,
  requestedScopes,
  type GrantPurpose,
} from './googleGrant'

/**
 * What a consent is for: one service, or `google` — every service in
 * `BUNDLE_PURPOSES` in one pass, which is what the Connect button on Settings
 * starts.
 */
export type ConsentTarget = GrantPurpose | 'google'
import type { Env } from '../types'

/** Ten minutes is longer than a consent screen takes and shorter than a day. */
const STATE_COOKIE = '__Host-mhq_oauth_state'
const STATE_TTL_SECONDS = 600

export function stateCookie(value: string, maxAge: number): string {
  return `${STATE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

export function readStateCookie(header: string | null | undefined): string | null {
  for (const part of (header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === STATE_COOKIE) return rest.join('=') || null
  }
  return null
}

/**
 * `state` carries two things: the CSRF nonce, and which grant is being made.
 *
 * Only the nonce goes in the cookie. The purpose is not a secret and does not
 * need protecting — but it does need to survive the round trip, because the
 * callback has no other way to know whether the code it was handed is a
 * calendar consent or a drafting one.
 */
export function packState(nonce: string, purpose: ConsentTarget): string {
  return `${nonce}.${purpose}`
}

export function unpackState(state: string | null): { nonce: string; purpose: ConsentTarget } | null {
  if (!state) return null
  const dot = state.indexOf('.')
  if (dot < 1) return null
  const nonce = state.slice(0, dot)
  const purpose = state.slice(dot + 1)
  // Checked against the list rather than by hand, so a purpose added in
  // googleGrant.ts cannot silently fail to survive the round trip — and a
  // near-miss like `calendar.primary.extra` is refused rather than read as the
  // narrow calendar grant, which would complete a consent for the wrong one.
  if (purpose !== 'google' && !(GRANT_PURPOSES as string[]).includes(purpose)) return null
  return { nonce, purpose: purpose as ConsentTarget }
}

/**
 * Send the browser to Google.
 *
 * `prompt=consent` and `access_type=offline` together are what produce a
 * refresh token. Google returns one only on a fresh consent, so a flow that
 * omits them appears to work and then stops an hour later — the failure being
 * a silent one is exactly why they are not left to default.
 */
export function beginConsent(c: Context<AppEnv>, purpose: ConsentTarget): Response {
  const nonce = randomToken(16)
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID ?? '')
  url.searchParams.set('redirect_uri', redirectUri(c.env))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', purpose === 'google' ? bundleScopes() : requestedScopes(purpose))
  url.searchParams.set('access_type', 'offline')
  // `select_account` as well as `consent`: somebody signed in to two Google
  // accounts gets asked which one, rather than Google quietly picking the
  // browser's default — which is how a calendar ends up in the wrong account.
  url.searchParams.set('prompt', 'consent select_account')
  // Explicit, so an older OAuth client shows the per-service checkboxes too.
  url.searchParams.set('enable_granular_consent', 'true')
  url.searchParams.set('state', packState(nonce, purpose))

  c.header('Set-Cookie', stateCookie(nonce, STATE_TTL_SECONDS))
  return c.redirect(url.toString(), 302)
}

export function consentAvailable(env: Env): boolean {
  return grantConfigured(env)
}

export type CallbackCheck =
  | { ok: true; code: string; purpose: ConsentTarget }
  | { ok: false; reason: string; purpose: ConsentTarget | null }

/**
 * Validate what came back.
 *
 * The `state` check is the CSRF guard: without it, a link somebody else
 * crafted could complete a consent flow into this account. It is compared
 * against a cookie this Worker set, so nothing an attacker can write matches.
 */
export function checkCallback(c: Context<AppEnv>): CallbackCheck {
  const url = new URL(c.req.url)
  const parsed = unpackState(url.searchParams.get('state'))
  const expected = readStateCookie(c.req.header('Cookie'))
  c.header('Set-Cookie', stateCookie('', 0))

  const error = url.searchParams.get('error')
  if (error) return { ok: false, reason: error, purpose: parsed?.purpose ?? null }
  if (!parsed || !expected || parsed.nonce !== expected) {
    return { ok: false, reason: 'state_mismatch', purpose: parsed?.purpose ?? null }
  }
  const code = url.searchParams.get('code')
  if (!code) return { ok: false, reason: 'no_code', purpose: parsed.purpose }
  return { ok: true, code, purpose: parsed.purpose }
}

/** Where the browser lands afterwards, with a word about how it went. */
export function settingsRedirect(
  env: Env,
  purpose: ConsentTarget | null,
  outcome: string,
  detail: Record<string, string[]> = {},
): string {
  const origin = (env.DASHBOARD_URL ?? '').replace(/\/$/, '')
  if (purpose === 'google') {
    const query = new URLSearchParams({ google: outcome })
    for (const [key, values] of Object.entries(detail)) if (values.length) query.set(key, values.join(','))
    return `${origin}/#settings?${query.toString()}`
  }
  // Drive's card lives with the EPK on the Artist page, so that is where the
  // artist comes back to.
  if (purpose === 'drive') return `${origin}/#artist/drive?drive=${encodeURIComponent(outcome)}`
  const base = `${origin}/#settings`
  const key =
    purpose === 'calendar' || purpose === 'calendar.primary'
      ? 'calendar'
      : purpose === 'tasks'
        ? 'tasks'
        : 'gmail'
  return `${base}?${key}=${encodeURIComponent(outcome)}`
}
