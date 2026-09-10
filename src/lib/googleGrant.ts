/**
 * A Google authorisation the person granted in their browser.
 *
 * Every Google token this app held before this one arrived the same way: got
 * once at a terminal, stored with `wrangler secret put`. That is fine for a
 * deployment with one owner and impossible for a feature where the *user*
 * decides whether to connect — consent happens in their browser and what
 * comes back has to be written at runtime. Secrets cannot be written at
 * runtime; `google_grants` can (migration 0019).
 *
 * **The scope is wider than this app's habit, and knowingly so.** Gmail's
 * narrowest scope that can create a draft is `gmail.compose`, and it also
 * permits *sending*. There is no drafts-only scope. So the guarantee that
 * nothing goes out on its own stops being enforced by Google and starts being
 * enforced here — by there being no send call in this file, and by
 * `test/uiConsistency.test.ts` failing if a Send button appears. That is a
 * real reduction in what the permission itself protects, which is why the
 * connect screen says so in as many words.
 *
 * The read-only scan keeps its own separate token. Revoking drafting must not
 * blind the reply matcher, which is why grants are keyed by purpose.
 */

import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { googleGrants } from '../db/schema'
import { scoped, withTenant, type TenantId } from '../db/scope'
import type { Env } from '../types'

export const GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose'
export const GRANT_PURPOSE = 'gmail.compose'

/** The scopes the connect flow asks for. `openid email` is only so the screen
 *  can name the account it will write to — connecting the wrong Google
 *  account is an easy mistake and an invisible one until drafts appear
 *  somewhere unexpected. */
export const REQUESTED_SCOPES = [GMAIL_COMPOSE_SCOPE, 'openid', 'email'].join(' ')

/* --------------------------------------------------------------------- */
/* Encryption                                                             */
/* --------------------------------------------------------------------- */

async function keyFor(env: Env): Promise<CryptoKey> {
  const secret = env.TOKEN_ENCRYPTION_KEY
  if (!secret) throw new Error('TOKEN_ENCRYPTION_KEY is not set')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * D1 holds a lot of ordinary prose and, with this feature, one refresh token.
 * The token is the only value in the database that is a credential somewhere
 * *else*, so it is the one value not stored in clear.
 */
export async function encryptToken(env: Env, plaintext: string): Promise<string> {
  const iv = new Uint8Array(new ArrayBuffer(12))
  crypto.getRandomValues(iv)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyFor(env),
    new TextEncoder().encode(plaintext),
  )
  return `${toB64(iv)}.${toB64(new Uint8Array(cipher))}`
}

export async function decryptToken(env: Env, stored: string): Promise<string> {
  const [iv, cipher] = stored.split('.')
  if (!iv || !cipher) throw new Error('stored token is malformed')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    await keyFor(env),
    fromB64(cipher),
  )
  return new TextDecoder().decode(plain)
}

/* --------------------------------------------------------------------- */
/* The grant                                                              */
/* --------------------------------------------------------------------- */

export interface GrantStatus {
  connected: boolean
  accountEmail: string | null
  grantedAt: string | null
  lastUsedAt: string | null
  /** False when Google handed back less than was asked for. */
  canDraft: boolean
  /** Whether the deployment is even able to offer this. */
  configured: boolean
}

export function grantConfigured(env: Env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY)
}

export function redirectUri(env: Env): string {
  const base = (env.DASHBOARD_URL ?? '').replace(/\/$/, '')
  return `${base}/api/gmail/callback`
}

export async function readGrant(env: Env, tenant: TenantId): Promise<GrantStatus> {
  const configured = grantConfigured(env)
  const row = await getDb(env.DB)
    .select()
    .from(googleGrants)
    .where(scoped(googleGrants, tenant, eq(googleGrants.purpose, GRANT_PURPOSE)))
    .get()

  if (!row) {
    return { connected: false, accountEmail: null, grantedAt: null, lastUsedAt: null, canDraft: false, configured }
  }
  return {
    connected: true,
    accountEmail: row.accountEmail,
    grantedAt: row.grantedAt,
    lastUsedAt: row.lastUsedAt,
    // Google may grant less than was asked for. A grant quietly missing the
    // scope it needs should be readable here rather than inferred from a 403
    // in the middle of a bulk write.
    canDraft: row.scopes.includes(GMAIL_COMPOSE_SCOPE),
    configured,
  }
}

/**
 * Replace this tenant's grant, if any, with a new one.
 *
 * Delete-then-insert rather than an upsert, and that is a deliberate change
 * rather than a simplification. This used to be
 * `onConflictDoUpdate({ target: googleGrants.purpose })`, which names a
 * uniqueness constraint — and the constraint moved in this same deploy, from
 * `purpose` to `(tenant_id, purpose)`, because two artists can both hold a
 * `gmail.compose` grant. SQLite requires an `ON CONFLICT` target to match a
 * unique constraint exactly, so an upsert naming the old key would error
 * against the new schema and one naming the new key would error against the
 * old — and CI migrates before it deploys, so both shapes are live for half a
 * minute. Two statements that name no constraint work against either.
 *
 * Re-consenting is rare and not concurrent, so the gap between the delete and
 * the insert costs nothing worth a transaction.
 */
export async function storeGrant(
  env: Env,
  tenant: TenantId,
  input: { refreshToken: string; accountEmail: string | null; scopes: string },
): Promise<void> {
  const now = new Date().toISOString()
  const db = getDb(env.DB)
  await db.delete(googleGrants).where(scoped(googleGrants, tenant, eq(googleGrants.purpose, GRANT_PURPOSE)))
  await db.insert(googleGrants).values(withTenant(tenant, {
    purpose: GRANT_PURPOSE,
    refreshToken: await encryptToken(env, input.refreshToken),
    accountEmail: input.accountEmail,
    scopes: input.scopes,
    grantedAt: now,
    lastUsedAt: null,
  }))
}

export async function forgetGrant(env: Env, tenant: TenantId): Promise<void> {
  await getDb(env.DB)
    .delete(googleGrants)
    .where(scoped(googleGrants, tenant, eq(googleGrants.purpose, GRANT_PURPOSE)))
}

/* --------------------------------------------------------------------- */
/* Tokens                                                                 */
/* --------------------------------------------------------------------- */

export async function exchangeCode(
  env: Env,
  code: string,
): Promise<{ refreshToken: string; accessToken: string; scopes: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri(env),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`)
  const json = await res.json<{ refresh_token?: string; access_token: string; scope: string }>()
  if (!json.refresh_token) {
    // Google only returns one when it is a fresh consent. The connect URL
    // sends `prompt=consent` for exactly this reason; without a refresh token
    // the grant lasts an hour and then silently stops working.
    throw new Error('Google returned no refresh token — re-consent is required')
  }
  return { refreshToken: json.refresh_token, accessToken: json.access_token, scopes: json.scope }
}

/** A short-lived access token for the stored grant. */
export async function accessTokenForGrant(env: Env, tenant: TenantId): Promise<string> {
  const row = await getDb(env.DB)
    .select()
    .from(googleGrants)
    .where(scoped(googleGrants, tenant, eq(googleGrants.purpose, GRANT_PURPOSE)))
    .get()
  if (!row) throw new Error('Gmail is not connected')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: await decryptToken(env, row.refreshToken),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${await res.text()}`)
  return (await res.json<{ access_token: string }>()).access_token
}

/** Who the grant belongs to, asked once at consent time. */
export async function accountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  return (await res.json<{ email?: string }>()).email ?? null
}

/**
 * Create one draft. Note what is absent: there is no send here, and adding
 * one would be the whole design undone in four lines.
 */
export async function createDraft(accessToken: string, raw: string): Promise<{ id: string }> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  })
  if (!res.ok) throw new Error(`Gmail draft failed: ${res.status} ${await res.text()}`)
  return res.json<{ id: string }>()
}

export async function markGrantUsed(env: Env, tenant: TenantId): Promise<void> {
  await getDb(env.DB)
    .update(googleGrants)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(scoped(googleGrants, tenant, eq(googleGrants.purpose, GRANT_PURPOSE)))
}
