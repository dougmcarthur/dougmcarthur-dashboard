/**
 * Passkey login: the parts that touch D1, the cookie and the clock.
 *
 * The app was behind Cloudflare Access until now, which is why `src/index.ts`
 * had no auth in it at all. Access authenticated by emailing a six-digit code
 * — a one-time PIN — and the login page also offered "Sign in with
 * Cloudflare", which authenticated you into the *Cloudflare account* rather
 * than the app and is what sent you to `dash.cloudflare.com` instead of the
 * dashboard (docs/cloudflare-access-setup.md, now replaced).
 *
 * What replaces it is a WebAuthn passkey, verified here. Two things move as a
 * result and both are worth knowing:
 *
 *  - **The Worker is now the security boundary.** Nothing in front of it
 *    turns anyone away, so a route that forgets to authenticate is public.
 *    That is why the check is one middleware over `/api/*` with a named
 *    exemption list, rather than a decorator each route has to remember.
 *  - **The research agents lost their front door.** They POST from outside a
 *    browser and cannot do a passkey ceremony, so they authenticate with
 *    `API_TOKEN` as a bearer instead. They break **the moment this deploys**,
 *    not when Access is later switched off: Access let a request through the
 *    edge and the Worker then trusted everything that arrived, so it never
 *    supplied a credential the middleware below would accept. Setting the
 *    secret and teaching the agents to send it is a prerequisite of the
 *    deploy, not of the Access removal — see docs/passkey-login.md.
 */

import { eq, lt } from 'drizzle-orm'
import { getDb } from '../db'
import {
  authChallenges,
  authEnrolmentCodes,
  authSessions,
  passkeyCredentials,
} from '../db/schema'
import {
  CHALLENGE_TTL_SECONDS,
  ENROLMENT_CODE_MAX_ATTEMPTS,
  ENROLMENT_CODE_TTL_MINUTES,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  enrolmentCodeState,
  formatEnrolmentCode,
  isoAfter,
  sessionState,
  type EnrolmentCodeState,
} from '../../shared/auth'
import type { Env } from '../types'

/* --------------------------------------------------------------------- */
/* Bytes                                                                  */
/* --------------------------------------------------------------------- */

const encoder = new TextEncoder()

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return base64url(buf)
}

export function base64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The return type is `Uint8Array<ArrayBuffer>` rather than plain
 * `Uint8Array`, because that is what the verifier's signature asks for — a
 * view over a `SharedArrayBuffer` is a `Uint8Array` too, and crypto routines
 * will not take one. Building the buffer explicitly is how the narrower type
 * is earned.
 */
export function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** UTF-8 bytes, in the same narrowed form and for the same reason. */
export function utf8Bytes(value: string): Uint8Array<ArrayBuffer> {
  const encoded = encoder.encode(value)
  const out = new Uint8Array(new ArrayBuffer(encoded.length))
  out.set(encoded)
  return out
}

/**
 * Hashed before storage, everywhere a secret is stored.
 *
 * The session table and the enrolment code table both hold the hash rather
 * than the value, so a dump of either is a list of things that have been
 * used, not a set of working credentials.
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Length-independent, then value-independent. Comparing tokens with `===` leaks. */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  let diff = x.length ^ y.length
  const len = Math.max(x.length, y.length)
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/* --------------------------------------------------------------------- */
/* Cookie                                                                 */
/* --------------------------------------------------------------------- */

export function readSessionCookie(header: string | null | undefined): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return rest.join('=') || null
  }
  return null
}

/**
 * `__Host-` is the reason the attributes below are not negotiable: the prefix
 * is only honoured with `Secure`, `Path=/` and no `Domain`, and in exchange no
 * other host under `dougmcarthur.net` can set or overwrite this cookie.
 *
 * `SameSite=Lax` and not `Strict` because `Strict` withholds the cookie on
 * the first navigation *into* the app from anywhere else — including from the
 * digest email — which reads as being logged out every time a link is
 * followed.
 */
export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ')
}

export function clearedSessionCookie(): string {
  return sessionCookie('', 0)
}

/* --------------------------------------------------------------------- */
/* Sessions                                                               */
/* --------------------------------------------------------------------- */

export interface Session {
  token: string
  maxAgeSeconds: number
}

/**
 * Which surface a session is on.
 *
 * Null in the column means artist, so every session that predates migration
 * 0023 — and every new one — starts where it should. `readMode` is the only
 * reader, so an unrecognised value cannot become a third mode by accident.
 */
export type SessionMode = 'artist' | 'admin'

export function readMode(raw: string | null | undefined): SessionMode {
  return raw === 'admin' ? 'admin' : 'artist'
}

/**
 * Move a session between surfaces.
 *
 * Whether it *may* move is decided by the caller — entering admin mode needs
 * the owner role and a recent passkey assertion, and leaving needs neither,
 * because giving up privilege is not a privileged act. This only writes it.
 */
export async function setSessionMode(env: Env, sessionId: string, mode: SessionMode): Promise<void> {
  await getDb(env.DB)
    .update(authSessions)
    .set({ mode: mode === 'admin' ? 'admin' : null })
    .where(eq(authSessions.id, sessionId))
}

export async function createSession(
  env: Env,
  input: { credentialId: string | null; label: string | null; userId: string | null; now?: Date },
): Promise<Session> {
  const now = input.now ?? new Date()
  const token = randomToken()
  const db = getDb(env.DB)
  await db.insert(authSessions).values({
    id: await sha256Hex(token),
    credentialId: input.credentialId,
    label: input.label,
    // Whose session this is, and therefore whose rows it reaches. Nullable in
    // the column because migration 0021 added it to sessions that predate the
    // idea; a session that resolves to no user resolves to no tenant, and
    // `actorForSession` answers that with 401 rather than with everything.
    userId: input.userId,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: isoAfter(now, SESSION_TTL_DAYS * 86_400_000),
  })
  return { token, maxAgeSeconds: SESSION_TTL_DAYS * 86_400 }
}

export interface ActiveSession {
  id: string
  label: string | null
  credentialId: string | null
  /** The account this session belongs to. Null only on a row that predates 0021. */
  userId: string | null
  expiresAt: string
  /** Last passkey touch, or null. Not the same as when it signed in. */
  elevatedAt: string | null
  /** 'admin' or 'artist'. See src/lib/actor.ts — the tenant follows from it. */
  mode: SessionMode
}

/**
 * The session behind a request, or null.
 *
 * An expired row is deleted on the way past rather than left to the sweeper:
 * the request that finds it is the cheapest place to notice, and leaving it
 * means the next request pays the same lookup to reach the same answer.
 */
export async function readSession(
  env: Env,
  cookieHeader: string | null | undefined,
  now = new Date(),
): Promise<ActiveSession | null> {
  const token = readSessionCookie(cookieHeader)
  if (!token) return null

  const db = getDb(env.DB)
  const id = await sha256Hex(token)
  const row = await db.select().from(authSessions).where(eq(authSessions.id, id)).get()
  if (!row) return null

  const state = sessionState({ now, session: row })
  if (!state.valid) {
    await db.delete(authSessions).where(eq(authSessions.id, id))
    return null
  }

  if (state.shouldExtend) {
    await db
      .update(authSessions)
      .set({
        lastSeenAt: now.toISOString(),
        expiresAt: isoAfter(now, SESSION_TTL_DAYS * 86_400_000),
      })
      .where(eq(authSessions.id, id))
  }

  return {
    id: row.id,
    label: row.label,
    credentialId: row.credentialId,
    userId: row.userId,
    expiresAt: row.expiresAt,
    elevatedAt: row.elevatedAt,
    mode: readMode(row.mode),
  }
}

export async function destroySession(env: Env, cookieHeader: string | null | undefined): Promise<void> {
  const token = readSessionCookie(cookieHeader)
  if (!token) return
  const db = getDb(env.DB)
  await db.delete(authSessions).where(eq(authSessions.id, await sha256Hex(token)))
}

/**
 * Every session this account has open. What "sign out everywhere" means.
 *
 * Scoped to the user, because "everywhere" means every browser of *yours* —
 * signing a stranger out of their own account is not what the button on your
 * settings screen offers to do.
 */
export async function destroyAllSessions(env: Env, userId: string): Promise<void> {
  await getDb(env.DB).delete(authSessions).where(eq(authSessions.userId, userId))
}

/**
 * Record that this session has just answered a passkey challenge.
 *
 * Stamped on the session rather than handed back as a token, because a token
 * is a second credential to carry and this one would travel next to the cookie
 * it is meant to be stronger than.
 */
export async function elevateSession(env: Env, sessionId: string, now = new Date()): Promise<void> {
  await getDb(env.DB)
    .update(authSessions)
    .set({ elevatedAt: now.toISOString() })
    .where(eq(authSessions.id, sessionId))
}

/* --------------------------------------------------------------------- */
/* Challenges                                                             */
/* --------------------------------------------------------------------- */

export type ChallengePurpose = 'registration' | 'authentication' | 'elevation'

export async function storeChallenge(
  env: Env,
  input: { challenge: string; purpose: ChallengePurpose; now?: Date },
): Promise<string> {
  const now = input.now ?? new Date()
  const id = randomToken(16)
  await getDb(env.DB).insert(authChallenges).values({
    id,
    challenge: input.challenge,
    purpose: input.purpose,
    expiresAt: isoAfter(now, CHALLENGE_TTL_SECONDS * 1000),
    createdAt: now.toISOString(),
  })
  return id
}

/**
 * Reads a challenge and spends it in the same call.
 *
 * There is no way to look at one without consuming it, on purpose: the single
 * use is what makes a captured assertion worthless, and a `peek` would be the
 * function somebody reaches for by mistake.
 */
export async function consumeChallenge(
  env: Env,
  input: { id: string; purpose: ChallengePurpose; now?: Date },
): Promise<string | null> {
  const now = input.now ?? new Date()
  const db = getDb(env.DB)
  const row = await db.select().from(authChallenges).where(eq(authChallenges.id, input.id)).get()
  await db.delete(authChallenges).where(eq(authChallenges.id, input.id))
  if (!row || row.purpose !== input.purpose) return null
  if (Date.parse(row.expiresAt) <= now.getTime()) return null
  return row.challenge
}

/* --------------------------------------------------------------------- */
/* Credentials                                                            */
/* --------------------------------------------------------------------- */

/**
 * Every credential in the deployment, whoever holds it.
 *
 * Deliberately unscoped, and used for exactly one question: whether *anybody*
 * has a passkey yet. The signed-out login screen asks it to decide between
 * "sign in" and "set up", and it cannot be scoped because there is no session
 * to scope it by. It returns a count's worth of information and no identity,
 * which is the only reason that is safe.
 */
export async function listCredentials(env: Env) {
  return getDb(env.DB).select().from(passkeyCredentials)
}

/**
 * One account's credentials. What every signed-in surface wants.
 *
 * Separate from the above rather than a parameter with a default, because a
 * default here is the wrong answer arriving silently: a management screen that
 * forgot to pass a user would list a stranger's authenticators.
 */
export async function credentialsForUser(env: Env, userId: string) {
  return getDb(env.DB).select().from(passkeyCredentials).where(eq(passkeyCredentials.userId, userId))
}

export async function countCredentials(env: Env): Promise<number> {
  return (await listCredentials(env)).length
}

/* --------------------------------------------------------------------- */
/* Enrolment codes                                                        */
/* --------------------------------------------------------------------- */

/**
 * Where a break-glass code is sent, or null when nowhere is configured.
 *
 * **Never user-supplied, and that is the whole point.** An address typed on
 * the login screen would decide where an enrolment code goes, so anyone who
 * could load the page could mail themselves one and take the account. The
 * destination is deployment configuration; what a person types can only ever
 * be a *lookup key* for an address already on file.
 *
 * A settings row would be worse still — a way to redirect the recovery
 * channel from inside the app, which is exactly what an attacker holding a
 * session would reach for.
 *
 * There is no default. It used to fall back to a hardcoded personal address,
 * which worked for exactly one deployment and silently mailed somebody else's
 * inbox on any other. Unset now means recovery is unavailable and the screen
 * says so — a missing input is never a guess.
 *
 * The `send_email` allowlist in wrangler.toml is the real boundary either
 * way: the Worker cannot mail an address that is not on it, whatever this
 * returns.
 */
export function enrolmentRecipient(env: Env): string | null {
  return env.AUTH_EMAIL?.trim() || null
}

export interface IssuedCode {
  id: string
  code: string
  expiresAt: string
}

/** When the live code was issued, for the cooldown. Null when there is none. */
export async function lastCodeIssuedAt(env: Env): Promise<string | null> {
  const row = await getDb(env.DB).select().from(authEnrolmentCodes).get()
  return row?.createdAt ?? null
}

/**
 * Issues a code, invalidating any earlier one.
 *
 * One live code at a time, because two means a phone showing the older email
 * is a code that does not work and no way to tell which is which.
 */
export async function issueEnrolmentCode(
  env: Env,
  input: { userId: string | null; now?: Date } = { userId: null },
): Promise<IssuedCode> {
  const now = input.now ?? new Date()
  const db = getDb(env.DB)
  await db.delete(authEnrolmentCodes)

  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  const code = formatEnrolmentCode(bytes)
  const id = randomToken(16)
  const expiresAt = isoAfter(now, ENROLMENT_CODE_TTL_MINUTES * 60_000)

  await db.insert(authEnrolmentCodes).values({
    id,
    // Whose account this code enrols a passkey for. Today it is the owner's,
    // because `enrolmentRecipient` is deployment configuration and there is
    // one address. When accounts arrive the typed address becomes a lookup
    // key and this is the account it matched — never the address typed.
    userId: input.userId,
    codeHash: await sha256Hex(code),
    attempts: 0,
    expiresAt,
    usedAt: null,
    createdAt: now.toISOString(),
  })
  return { id, code, expiresAt }
}

export type CodeCheck =
  | { ok: true; id: string; userId: string | null }
  | { ok: false; reason: EnrolmentCodeState | 'none' | 'wrong' }

/**
 * Checks a code without spending it — the ceremony is two round trips, and a
 * code spent at `options` time would be gone before the browser answered.
 * `spendEnrolmentCode` marks it used once a credential actually lands.
 *
 * A wrong guess costs an attempt whether or not a code is live, which is what
 * keeps the attempt counter from being reset by simply guessing early.
 */
export async function checkEnrolmentCode(env: Env, code: string, now = new Date()): Promise<CodeCheck> {
  const db = getDb(env.DB)
  const row = await db.select().from(authEnrolmentCodes).get()
  if (!row) return { ok: false, reason: 'none' }

  const state = enrolmentCodeState({ now, code: row })
  if (state !== 'valid') return { ok: false, reason: state }

  if (!timingSafeEqual(await sha256Hex(code), row.codeHash)) {
    await db
      .update(authEnrolmentCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(authEnrolmentCodes.id, row.id))
    return {
      ok: false,
      reason: row.attempts + 1 >= ENROLMENT_CODE_MAX_ATTEMPTS ? 'locked' : 'wrong',
    }
  }

  return { ok: true, id: row.id, userId: row.userId }
}

export async function spendEnrolmentCode(env: Env, id: string, now = new Date()): Promise<void> {
  await getDb(env.DB)
    .update(authEnrolmentCodes)
    .set({ usedAt: now.toISOString() })
    .where(eq(authEnrolmentCodes.id, id))
}

/* --------------------------------------------------------------------- */
/* Bearer token                                                           */
/* --------------------------------------------------------------------- */

/**
 * The research agents' credential.
 *
 * Deliberately a shared secret rather than a second passkey: they run headless
 * and outside this repo, and WebAuthn has no non-interactive mode.
 *
 * Answering *whether* a bearer is valid is no longer enough, because the
 * answer a request needs is *whose rows it may write* — the agents POST gigs,
 * and a gig belongs to somebody. `actorForBearer` in src/lib/actor.ts resolves
 * a token to a tenant, and this remains only as the platform-secret half of
 * that, kept while the agents still hold `API_TOKEN` rather than a per-tenant
 * row.
 */
export function bearerAuthorised(env: Env, header: string | null | undefined): boolean {
  const expected = env.API_TOKEN
  if (!expected) return false
  const offered = /^Bearer\s+(.+)$/i.exec(header ?? '')?.[1]
  if (!offered) return false
  return timingSafeEqual(offered, expected)
}

/* --------------------------------------------------------------------- */
/* Housekeeping                                                           */
/* --------------------------------------------------------------------- */

/**
 * Expired sessions and dead challenges, swept on the cron.
 *
 * Neither is a correctness problem — both are checked against the clock on
 * every read — so this exists only to stop two tables growing forever. A
 * challenge row is a few hundred bytes and there is one per login attempt.
 */
export async function pruneAuth(env: Env, now = new Date()): Promise<void> {
  const db = getDb(env.DB)
  const iso = now.toISOString()
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, iso))
  await db.delete(authSessions).where(lt(authSessions.expiresAt, iso))
  await db.delete(authEnrolmentCodes).where(lt(authEnrolmentCodes.expiresAt, iso))
}
