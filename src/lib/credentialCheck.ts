/**
 * Ask Google whether a stored credential is still accepted, and remember the
 * answer.
 *
 * The cheapest honest proof for an OAuth refresh token is to spend it: exchange
 * it for an access token. That is one request, it is what every real use of the
 * credential does first anyway, and unlike listing a message or an event it
 * tests the credential rather than a scope's data. A probe that reads a mailbox
 * to prove a token works is a probe that fails for reasons that are not the
 * token.
 *
 * Where the result lives: `app_settings`, not a new table. These credentials
 * are Worker secrets — platform configuration rather than any artist's — which
 * is the same reason the digest schedule lives there, and it is why the probe
 * needs no tenant and no migration.
 *
 * `now` is an argument, as everywhere in this repository that records a time:
 * a function that reads its own clock cannot be tested for what it writes.
 */

import { calendarConfigured } from './googleCalendar'
import { gmailConfigured } from './gmail'
import { mailerConfigured } from './mailer'
import { readSetting, writeSetting } from './settings'
import {
  type CredentialHealth,
  type CredentialId,
  type ProbeRecord,
  credentialHealth,
  isProbeable,
} from '../../shared/credentialHealth'
import type { Env } from '../types'

const KEY_PREFIX = 'credentialCheck.'

/** Google's refusals, which are decisive, against everything else, which is not. */
const REFUSAL_STATUSES = new Set([400, 401, 403])

/** Keep stored detail short: it is shown on a card, and it can carry a body. */
const DETAIL_LIMIT = 200

export function settingKey(id: CredentialId): string {
  return `${KEY_PREFIX}${id}`
}

export function configuredFor(env: Env, id: CredentialId): boolean {
  switch (id) {
    case 'calendar':
      return calendarConfigured(env)
    case 'gmail':
      return gmailConfigured(env)
    case 'email':
      return mailerConfigured(env)
  }
}

function refreshTokenFor(env: Env, id: CredentialId): string | null {
  switch (id) {
    case 'calendar':
      return env.GOOGLE_REFRESH_TOKEN ?? null
    case 'gmail':
      return env.GMAIL_REFRESH_TOKEN ?? null
    default:
      return null
  }
}

/**
 * Spend the refresh token once and classify what came back.
 *
 * Three outcomes, and the distinction between the last two is the whole point:
 * a refusal is a fact about the credential and a network failure is a fact
 * about the network. Reporting the second as the first would put a critical
 * alarm on the bell every time a request lost a race, and an alarm that is
 * wrong sometimes is one that is ignored always.
 */
export async function probeCredential(env: Env, id: CredentialId, now: Date): Promise<ProbeRecord> {
  const at = now.toISOString()
  const refreshToken = refreshTokenFor(env, id)

  if (!refreshToken || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    // Not reachable through `runCredentialChecks`, which skips unconfigured
    // connections — but a direct caller deserves an answer rather than a throw.
    return { outcome: 'unreachable', at, detail: 'Not configured.' }
  }

  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch (err) {
    return { outcome: 'unreachable', at, detail: trim(String(err)) }
  }

  if (res.ok) return { outcome: 'working', at }

  const body = trim(await res.text().catch(() => ''))

  if (REFUSAL_STATUSES.has(res.status)) {
    return { outcome: 'rejected', at, detail: body || `Google answered ${res.status}.` }
  }

  // A 500, a 502, a rate limit: Google had a problem, and the credential was
  // never judged. Recording this as a refusal would be inventing a verdict.
  return { outcome: 'unreachable', at, detail: body || `Google answered ${res.status}.` }
}

export async function readProbe(env: Env, id: CredentialId): Promise<ProbeRecord | null> {
  const raw = await readSetting(env, settingKey(id))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ProbeRecord
    return parsed && typeof parsed.outcome === 'string' && typeof parsed.at === 'string' ? parsed : null
  } catch {
    // Unreadable JSON reads as "never checked" rather than as a failure, for
    // the reason unreadable `blocked_on` falls back to the parse: a record
    // nobody can read is not entitled to make a claim.
    return null
  }
}

export async function writeProbe(env: Env, id: CredentialId, record: ProbeRecord): Promise<void> {
  await writeSetting(env, settingKey(id), JSON.stringify(record))
}

/** Every connection's current answer, without probing anything. */
export async function readCredentialHealth(env: Env, now: Date): Promise<CredentialHealth[]> {
  const ids: CredentialId[] = ['calendar', 'gmail', 'email']
  return Promise.all(
    ids.map(async (id) =>
      credentialHealth(id, { configured: configuredFor(env, id), probe: await readProbe(env, id) }, now),
    ),
  )
}

/**
 * Probe what can be probed, store each answer, and hand back the new state.
 *
 * Unconfigured connections are skipped rather than probed and recorded as
 * broken: "the secret is not set" is already the state, and a refusal recorded
 * against it would say the credential was refused when there was no credential.
 */
export async function runCredentialChecks(env: Env, now: Date): Promise<CredentialHealth[]> {
  const ids: CredentialId[] = ['calendar', 'gmail', 'email']

  await Promise.all(
    ids
      .filter((id) => isProbeable(id) && configuredFor(env, id))
      .map(async (id) => {
        const record = await probeCredential(env, id, now)
        await writeProbe(env, id, record)
      }),
  )

  return readCredentialHealth(env, now)
}

/**
 * Google's answer, shortened for a card.
 *
 * Whitespace collapsed because the body arrives as JSON with newlines in it,
 * and a card is one line of small text.
 */
function trim(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > DETAIL_LIMIT ? `${flat.slice(0, DETAIL_LIMIT - 1)}…` : flat
}
