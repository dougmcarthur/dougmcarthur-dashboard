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

/**
 * The narrowest calendar scope that can do the job: "make secondary Google
 * calendars, and see, create, change, and delete events" — on the calendars
 * *this app made*, and nowhere else.
 *
 * That is the opposite of the compromise above. `gmail.compose` had to permit
 * sending because Google offers nothing narrower, so the promise that nothing
 * goes out on its own is kept by this code rather than by the permission.
 * Here Google does the enforcing: Scout cannot read the artist's own calendar
 * and cannot touch an event it did not create, whatever this code does.
 *
 * It is also what removes the configuration. `GOOGLE_CALENDAR_ID` existed
 * because somebody had to decide which calendar to write to; under this scope
 * there is only one Scout can reach, and it makes it itself.
 */
export const CALENDAR_APP_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created'

/**
 * Google Tasks, where there is no narrow option at all.
 *
 * `tasks.readonly` cannot write and `tasks` is read and write over every list
 * in the account. There is no `tasks.app.created`, so the structural
 * guarantee the calendar grant enjoys is simply not on offer. This is the
 * `gmail.compose` trade again: the limit moves from Google into
 * `src/lib/googleTasks.ts`, which names one list and never enumerates, and
 * the connect screen says so rather than implying a protection that is not
 * there.
 */
export const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks'

/**
 * Writing to the artist's **own** calendars, which is the opt-in this app
 * spent a release arguing itself out of needing.
 *
 * The narrowest scope that can reach a primary calendar. It is still far
 * wider than `calendar.app.created`: it is read *and* write over every event
 * on every calendar the artist owns, and Google enforces nothing about which
 * of those Scout touches. There is no version of this that is only "add an
 * entry to primary".
 *
 * Three things keep it from being a quiet widening of what Scout already has:
 *
 * - It is its **own purpose**, so the narrow grant is untouched and this one
 *   is revocable on its own. Choosing primary means a second consent screen
 *   naming this scope, not a bigger version of the first.
 * - It is **off unless the deployment turns it on** (`PRIMARY_CALENDAR_OPT_IN`).
 *   Declaring this scope on the OAuth client puts it in front of Google's
 *   verification review for *every* user of the deployment, including the
 *   ones who will never opt in — so a deployment that has not done that work
 *   does not offer the row, rather than offering a button that 403s.
 * - It has **nothing in its `cannot` list**, because there is no guarantee to
 *   make. Saying nothing is better than implying a limit that does not exist.
 */
export const CALENDAR_OWNED_SCOPE = 'https://www.googleapis.com/auth/calendar.events.owned'

/**
 * Drive, for the folder of assets juries and organisers ask for.
 *
 * `drive.file` is the narrow one and the only one this app asks for: Scout
 * can reach files it created, and files the artist picked for it in Google's
 * picker, and nothing else in their Drive — **whatever this code does**, the
 * same structural guarantee `calendar.app.created` gives. It is
 * non-sensitive, so it needs no Google verification. The cost is that picking
 * an existing *folder* grants that folder and not its contents; the artist
 * selects the files inside instead. `test/calendarGrant.test.ts` fails if the
 * broad `drive` or `drive.readonly` scope appears anywhere in `src/`.
 */
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

/**
 * Grants are keyed by purpose so revoking one does not revoke the others —
 * disconnecting drafting must not blind the reply matcher, neither should
 * touch the calendar, and giving up the primary-calendar grant must leave the
 * Scout calendar working rather than disconnecting everything.
 */
export type GrantPurpose = 'gmail.compose' | 'calendar' | 'calendar.primary' | 'tasks' | 'drive'

export const GRANT_PURPOSES: GrantPurpose[] = [
  'gmail.compose',
  'calendar',
  'calendar.primary',
  'tasks',
  'drive',
]

/**
 * What one "Connect Google account" asks for, in one consent.
 *
 * Most people keep calendar, mail and files under one Google account, so the
 * common path is one press rather than four. Google shows these as separate
 * checkboxes (granular consent) and any can be unticked, so what comes back is
 * checked service by service and each is stored as its own grant — which is
 * what keeps every consumer of `google_grants` unchanged, and lets one service
 * be moved to a different account later without touching the rest.
 *
 * `calendar.primary` is not here: it is an opt-in with its own warning, and a
 * bundle is not the place to ask for the broadest scope in the app.
 */
export const BUNDLE_PURPOSES: GrantPurpose[] = ['calendar', 'tasks', 'gmail.compose', 'drive']

export function bundleScopes(): string {
  return [...BUNDLE_PURPOSES.map((p) => SCOPE_FOR[p]), 'openid', 'email'].join(' ')
}

/** The purpose `gmailDrafts.ts` has always meant, named so its callers read. */
export const GRANT_PURPOSE: GrantPurpose = 'gmail.compose'

const SCOPE_FOR: Record<GrantPurpose, string> = {
  'gmail.compose': GMAIL_COMPOSE_SCOPE,
  calendar: CALENDAR_APP_SCOPE,
  'calendar.primary': CALENDAR_OWNED_SCOPE,
  tasks: TASKS_SCOPE,
  drive: DRIVE_FILE_SCOPE,
}

/**
 * Whether this deployment offers the broad calendar grant at all.
 *
 * Unset means no, and no is the state to be in: the scope has to be declared
 * on the OAuth client and reviewed by Google before a consent naming it will
 * complete for anybody outside the test users list. A missing input is never
 * a guess — same rule `enrolmentRecipient` follows.
 */
export function primaryCalendarOffered(env: Env): boolean {
  return (env.PRIMARY_CALENDAR_OPT_IN ?? '').trim() === 'true'
}

export function scopeFor(purpose: GrantPurpose): string {
  return SCOPE_FOR[purpose]
}

/** The scopes the connect flow asks for. `openid email` is only so the screen
 *  can name the account it will write to — connecting the wrong Google
 *  account is an easy mistake and an invisible one until drafts appear
 *  somewhere unexpected. */
export function requestedScopes(purpose: GrantPurpose): string {
  return [SCOPE_FOR[purpose], 'openid', 'email'].join(' ')
}

/** What `gmailDrafts.ts` imported before there was more than one purpose. */
export const REQUESTED_SCOPES = requestedScopes('gmail.compose')

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
  /** The calendar Scout made, on a `calendar` grant. Null on every other. */
  calendarId: string | null
  /** The list Scout made, on a `tasks` grant. Null on every other. */
  tasksListId: string | null
  /** The folder Scout made, on a `drive` grant. Null on every other. */
  driveFolderId: string | null
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

export async function readGrant(
  env: Env,
  tenant: TenantId,
  purpose: GrantPurpose = GRANT_PURPOSE,
): Promise<GrantStatus> {
  const configured = grantConfigured(env)
  const row = await getDb(env.DB)
    .select()
    .from(googleGrants)
    .where(scoped(googleGrants, tenant, eq(googleGrants.purpose, purpose)))
    .get()

  if (!row) {
    return {
      connected: false, accountEmail: null, grantedAt: null, lastUsedAt: null,
      canDraft: false, calendarId: null, tasksListId: null, driveFolderId: null, configured,
    }
  }
  return {
    connected: true,
    accountEmail: row.accountEmail,
    grantedAt: row.grantedAt,
    lastUsedAt: row.lastUsedAt,
    // Google may grant less than was asked for. A grant quietly missing the
    // scope it needs should be readable here rather than inferred from a 403
    // in the middle of a bulk write.
    canDraft: row.scopes.includes(SCOPE_FOR[purpose]),
    calendarId: row.calendarId ?? null,
    tasksListId: row.tasksListId ?? null,
    driveFolderId: row.driveFolderId ?? null,
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
  input: {
    refreshToken: string
    accountEmail: string | null
    scopes: string
    purpose?: GrantPurpose
    /** Only a calendar grant carries one: the calendar Scout made. */
    calendarId?: string | null
    /** Only a tasks grant carries one: the list Scout made. */
    tasksListId?: string | null
    /** Only a drive grant carries one: the folder Scout made. */
    driveFolderId?: string | null
  },
): Promise<void> {
  const purpose = input.purpose ?? GRANT_PURPOSE
  const now = new Date().toISOString()
  const db = getDb(env.DB)
  await db.delete(googleGrants).where(scoped(googleGrants, tenant, eq(googleGrants.purpose, purpose)))
  await db.insert(googleGrants).values(withTenant(tenant, {
    purpose,
    refreshToken: await encryptToken(env, input.refreshToken),
    accountEmail: input.accountEmail,
    scopes: input.scopes,
    grantedAt: now,
    lastUsedAt: null,
    calendarId: input.calendarId ?? null,
    tasksListId: input.tasksListId ?? null,
    driveFolderId: input.driveFolderId ?? null,
  }))
}

export async function forgetGrant(
  env: Env,
  tenant: TenantId,
  purpose: GrantPurpose = GRANT_PURPOSE,
): Promise<void> {
  await getDb(env.DB)
    .delete(googleGrants)
    .where(scoped(googleGrants, tenant, eq(googleGrants.purpose, purpose)))
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
export async function accessTokenForGrant(
  env: Env,
  tenant: TenantId,
  purpose: GrantPurpose = GRANT_PURPOSE,
): Promise<string> {
  const row = await getDb(env.DB)
    .select()
    .from(googleGrants)
    .where(scoped(googleGrants, tenant, eq(googleGrants.purpose, purpose)))
    .get()
  if (!row) throw new Error(`${purpose} is not connected`)

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
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`)
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

/* --------------------------------------------------------------------- */
/* Accounts                                                               */
/* --------------------------------------------------------------------- */

export interface GoogleAccount {
  /** Null only for a grant made before the address was recorded. */
  email: string | null
  /** The services this account is connected for, in `GRANT_PURPOSES` order. */
  purposes: GrantPurpose[]
  /** When the most recent of them was connected. */
  connectedAt: string | null
}

/**
 * The tenant's grants, grouped by the Google account behind them.
 *
 * The screen talks about accounts because that is what a person connected —
 * "doug@…, for Calendar, Tasks and Drive" — while storage stays one row per
 * service, which is what the code that uses a grant reads.
 */
export async function listGoogleAccounts(env: Env, tenant: TenantId): Promise<GoogleAccount[]> {
  const rows = await getDb(env.DB).select().from(googleGrants).where(scoped(googleGrants, tenant))
  const byEmail = new Map<string, GoogleAccount>()
  for (const row of rows) {
    const key = row.accountEmail?.trim().toLowerCase() ?? ''
    const account = byEmail.get(key) ?? { email: row.accountEmail, purposes: [], connectedAt: null }
    if ((GRANT_PURPOSES as string[]).includes(row.purpose)) account.purposes.push(row.purpose as GrantPurpose)
    if (!account.connectedAt || row.grantedAt > account.connectedAt) account.connectedAt = row.grantedAt
    byEmail.set(key, account)
  }
  const order = (p: GrantPurpose) => GRANT_PURPOSES.indexOf(p)
  return [...byEmail.values()]
    .map((a) => ({ ...a, purposes: a.purposes.sort((x, y) => order(x) - order(y)) }))
    .sort((a, b) => b.purposes.length - a.purposes.length)
}

/**
 * Disconnect one Google account from every service it covers.
 *
 * The token is revoked at Google as well as forgotten here, so the account's
 * "Third-party access" page stops listing Scout — which is where a careful
 * person goes to check, and a disconnect that leaves the permission standing
 * there is one that did half its job. Best effort: a revoke Google refuses
 * (already revoked, say) must not leave the rows behind.
 *
 * The per-service disconnects do not revoke, deliberately: one token backs
 * several services, and revoking it to drop one would drop them all.
 */
export async function forgetGoogleAccount(env: Env, tenant: TenantId, email: string | null): Promise<GrantPurpose[]> {
  const db = getDb(env.DB)
  const key = email?.trim().toLowerCase() ?? ''
  const rows = (await db.select().from(googleGrants).where(scoped(googleGrants, tenant))).filter(
    (r) => (r.accountEmail?.trim().toLowerCase() ?? '') === key,
  )
  const tokens = new Set<string>()
  for (const row of rows) {
    try {
      tokens.add(await decryptToken(env, row.refreshToken))
    } catch {
      // A token that cannot be decrypted cannot be revoked either; the row
      // still goes.
    }
  }
  for (const token of tokens) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    }).catch(() => undefined)
  }
  for (const row of rows) {
    await db.delete(googleGrants).where(scoped(googleGrants, tenant, eq(googleGrants.purpose, row.purpose)))
  }
  return rows.map((r) => r.purpose as GrantPurpose)
}
