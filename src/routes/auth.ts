/**
 * Passkey login.
 *
 * Four ceremonies, each two round trips: the server issues a challenge, the
 * browser has an authenticator sign it, the server checks the signature. The
 * checking is `@simplewebauthn/server`'s; everything this file adds is about
 * *who is allowed to start which ceremony*.
 *
 *   login      — anyone may start it; only a registered passkey finishes it.
 *   enrol      — needs an emailed code, because the browser asking has no
 *                passkey yet and so cannot prove anything else.
 *   add        — needs a session. Adding a second passkey from a laptop you
 *                are already signed in on should not involve your inbox.
 *   revoke     — needs a session.
 *
 * Everything under `/api/auth` is exempt from the middleware in
 * `src/index.ts`, which is what makes the exemption list worth reading
 * carefully: these routes are the only public surface the Worker has.
 */

import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { getDb } from '../db'
import { passkeyCredentials } from '../db/schema'
import {
  base64url,
  checkEnrolmentCode,
  clearedSessionCookie,
  consumeChallenge,
  createSession,
  destroyAllSessions,
  destroySession,
  enrolmentRecipient,
  fromBase64url,
  issueEnrolmentCode,
  lastCodeIssuedAt,
  listCredentials,
  readSession,
  sessionCookie,
  spendEnrolmentCode,
  storeChallenge,
  utf8Bytes,
} from '../lib/auth'
import { mailerConfigured, sendMail } from '../lib/mailer'
import {
  CHALLENGE_TTL_SECONDS,
  ENROLMENT_CODE_TTL_MINUTES,
  enrolmentCooldown,
  passkeyLabel,
  relyingParty,
} from '../../shared/auth'
import type { Env } from '../types'

/**
 * What a misconfigured relying party looks like to the person in front of it.
 *
 * The literal fault is that `DASHBOARD_URL` is unset or unparseable, so no
 * WebAuthn relying-party ID can be derived — but "relying party not
 * configured" on a login screen tells the reader nothing they can act on and
 * everything about our internals. The log keeps the precise version.
 */
const SITE_MISCONFIGURED = 'This site is not set up for sign-in yet. Its address is missing.'

const auth = new Hono<{ Bindings: Env }>()

/**
 * The user handle, fixed forever.
 *
 * Single-user app, so there is nothing to look up — but the value still has
 * to be *stable*, because an authenticator keyed by user handle replaces a
 * credential that shares one. A random handle per registration would leave a
 * second passkey on the same device sitting beside the first instead of
 * offering to replace it, which is how a keychain ends up with four entries
 * for one site.
 */
const USER_ID = utf8Bytes('sundogs-scout-owner')
/** Shown in the operating system's passkey prompt, so it is the full name. */
const USER_NAME = 'Sun Dogs Music Scout'

function rp(c: { env: Env; req: { url: string } }) {
  return relyingParty({ dashboardUrl: c.env.DASHBOARD_URL, requestUrl: c.req.url })
}

/* --------------------------------------------------------------------- */
/* Who am I                                                               */
/* --------------------------------------------------------------------- */

/**
 * What the login screen asks before it decides what to offer.
 *
 * `enrolled` is what separates "sign in" from "set up": a deployment with no
 * passkeys yet has nothing to sign in with, and offering the button anyway
 * produces a browser dialog that finds nothing and says so unhelpfully.
 */
auth.get('/session', async (c) => {
  const session = await readSession(c.env, c.req.header('Cookie'))
  const credentials = await listCredentials(c.env)
  return c.json({
    authenticated: Boolean(session),
    label: session?.label ?? null,
    enrolled: credentials.length > 0,
    // Whether the break-glass path can work at all. A deployment with no
    // email binding and no passkeys is one nobody can get into, and the
    // screen should say so rather than offering a button that 500s.
    recoveryAvailable: mailerConfigured(c.env),
  })
})

auth.post('/logout', async (c) => {
  await destroySession(c.env, c.req.header('Cookie'))
  c.header('Set-Cookie', clearedSessionCookie())
  return c.json({ ok: true })
})

/** Every browser, not just this one. The button you want after losing a laptop. */
auth.post('/logout-everywhere', async (c) => {
  const session = await readSession(c.env, c.req.header('Cookie'))
  if (!session) return c.json({ error: 'not signed in' }, 401)
  await destroyAllSessions(c.env)
  c.header('Set-Cookie', clearedSessionCookie())
  return c.json({ ok: true })
})

/* --------------------------------------------------------------------- */
/* Signing in                                                             */
/* --------------------------------------------------------------------- */

auth.post('/login/options', async (c) => {
  const party = rp(c)
  if (!party) return c.json({ error: SITE_MISCONFIGURED }, 500)

  const credentials = await listCredentials(c.env)
  if (credentials.length === 0) return c.json({ error: 'no passkey registered' }, 409)

  const options = await generateAuthenticationOptions({
    rpID: party.rpId,
    timeout: CHALLENGE_TTL_SECONDS * 1000,
    // Empty, deliberately: the passkey is discoverable, so the browser offers
    // the accounts it holds rather than being told which one to look for.
    // Listing them would also publish the credential IDs to anyone who asks.
    allowCredentials: [],
    userVerification: 'preferred',
  })

  const ceremony = await storeChallenge(c.env, {
    challenge: options.challenge,
    purpose: 'authentication',
  })
  return c.json({ ceremony, options })
})

const assertion = z.object({
  ceremony: z.string().min(1),
  response: z.record(z.unknown()),
})

auth.post('/login/verify', zValidator('json', assertion), async (c) => {
  const party = rp(c)
  if (!party) return c.json({ error: SITE_MISCONFIGURED }, 500)

  const body = c.req.valid('json')
  const expected = await consumeChallenge(c.env, { id: body.ceremony, purpose: 'authentication' })
  if (!expected) return c.json({ error: 'this sign-in expired — try again' }, 400)

  const response = body.response as unknown as AuthenticationResponseJSON
  const db = getDb(c.env.DB)
  const row = await db
    .select()
    .from(passkeyCredentials)
    .where(eq(passkeyCredentials.id, response.id))
    .get()
  if (!row) return c.json({ error: 'unknown passkey' }, 401)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: expected,
      expectedOrigin: party.origins,
      expectedRPID: party.rpId,
      credential: {
        id: row.id,
        publicKey: fromBase64url(row.publicKey),
        counter: row.counter,
        transports: parseTransports(row.transports),
      },
      // Not required, because it is not enforceable: an authenticator that
      // does not do user verification simply reports `false`, and demanding
      // it here would lock out a hardware key that is working as designed.
      requireUserVerification: false,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'sign-in failed' }, 401)
  }

  if (!verification.verified) return c.json({ error: 'sign-in failed' }, 401)

  const now = new Date()
  await db
    .update(passkeyCredentials)
    .set({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: now.toISOString(),
    })
    .where(eq(passkeyCredentials.id, row.id))

  const session = await createSession(c.env, {
    credentialId: row.id,
    label: row.label,
    now,
  })
  c.header('Set-Cookie', sessionCookie(session.token, session.maxAgeSeconds))
  return c.json({ ok: true, label: row.label })
})

/* --------------------------------------------------------------------- */
/* Break glass: an emailed code, which buys a passkey and nothing else     */
/* --------------------------------------------------------------------- */

/**
 * The one place email is still involved, and it is not a login.
 *
 * A passkey lives on a device, so losing every device you own is a state this
 * app has to have an answer for — the D1 database is not somewhere you can
 * reset a login from, and Cloudflare Access is no longer in front to fall
 * back on. The code authorises *enrolling an authenticator*; the session you
 * end up with is the one that enrolment produced, so a code intercepted
 * without a browser completing the ceremony is worth nothing.
 *
 * It reports success whether or not anything was sent, in the one case that
 * matters: it does not say whether a passkey is already registered. That is
 * the fact an attacker would most like to learn from this endpoint.
 */
auth.post('/enrol/request', async (c) => {
  if (!mailerConfigured(c.env)) {
    return c.json({ error: 'This site cannot send email, so a setup code cannot be sent.' }, 503)
  }

  const now = new Date()

  // Throttled, because this is the one endpoint that takes no credential and
  // sends mail. Unthrottled it is a button anybody can hold down to fill an
  // inbox — and because each request invalidates the previous code, it is also
  // a way for a stranger to keep expiring the code you are typing.
  const cooldown = enrolmentCooldown({ now, lastIssuedAt: await lastCodeIssuedAt(c.env) })
  if (!cooldown.allowed) {
    c.header('Retry-After', String(cooldown.retryAfterSeconds))
    return c.json(
      { error: `a code was just sent — try again in ${cooldown.retryAfterSeconds}s` },
      429,
    )
  }

  const issued = await issueEnrolmentCode(c.env, now)
  const to = enrolmentRecipient(c.env)

  await sendMail(c.env, {
    to,
    from: c.env.AUTH_EMAIL_SENDER ?? 'login@dougmcarthur.net',
    subject: `Scout — passkey setup code ${issued.code}`,
    text:
      `Your Scout passkey setup code is ${issued.code}.\n\n` +
      `It is good for ${ENROLMENT_CODE_TTL_MINUTES} minutes and lets you add one passkey.\n\n` +
      `If you did not ask for this, you can ignore it — the code does nothing on its own, ` +
      `and adding a passkey still needs your device to approve it.\n`,
    html:
      `<p>Your Scout passkey setup code is <strong style="font-size:1.4em;letter-spacing:.1em">${issued.code}</strong></p>` +
      `<p>It is good for ${ENROLMENT_CODE_TTL_MINUTES} minutes and lets you add one passkey.</p>` +
      `<p>If you did not ask for this, you can ignore it — the code does nothing on its own, ` +
      `and adding a passkey still needs your device to approve it.</p>`,
  })

  return c.json({ sent: true, to: maskEmail(to), expiresAt: issued.expiresAt })
})

/* --------------------------------------------------------------------- */
/* Adding a passkey                                                       */
/* --------------------------------------------------------------------- */

const enrolRequest = z.object({
  /** Omitted when an existing session is doing the asking. */
  code: z.string().trim().optional(),
})

auth.post('/register/options', zValidator('json', enrolRequest), async (c) => {
  const party = rp(c)
  if (!party) return c.json({ error: SITE_MISCONFIGURED }, 500)

  const authorised = await authoriseEnrolment(c.env, c.req.header('Cookie'), c.req.valid('json').code)
  if (!authorised.ok) return c.json({ error: authorised.error }, authorised.status)

  const existing = await listCredentials(c.env)
  const options = await generateRegistrationOptions({
    rpName: USER_NAME,
    rpID: party.rpId,
    userID: USER_ID,
    userName: USER_NAME,
    timeout: CHALLENGE_TTL_SECONDS * 1000,
    attestationType: 'none',
    // So the same device offers to replace its own passkey rather than
    // stacking a second one beside it.
    excludeCredentials: existing.map((cred) => ({
      id: cred.id,
      transports: parseTransports(cred.transports),
    })),
    authenticatorSelection: {
      // Discoverable, because the login screen asks for no username. A
      // non-resident key would be unusable: there would be nothing to put in
      // `allowCredentials` before you are signed in.
      residentKey: 'required',
      userVerification: 'preferred',
    },
  })

  const ceremony = await storeChallenge(c.env, {
    challenge: options.challenge,
    purpose: 'registration',
  })
  return c.json({ ceremony, options, codeId: authorised.codeId ?? null })
})

const attestation = z.object({
  ceremony: z.string().min(1),
  response: z.record(z.unknown()),
  code: z.string().trim().optional(),
  label: z.string().trim().max(80).optional(),
})

auth.post('/register/verify', zValidator('json', attestation), async (c) => {
  const party = rp(c)
  if (!party) return c.json({ error: SITE_MISCONFIGURED }, 500)

  const body = c.req.valid('json')
  // Re-checked rather than trusted from the options call: the two requests are
  // independent, and "I already passed this a moment ago" is a claim the
  // second one is in no position to make.
  const authorised = await authoriseEnrolment(c.env, c.req.header('Cookie'), body.code)
  if (!authorised.ok) return c.json({ error: authorised.error }, authorised.status)

  const expected = await consumeChallenge(c.env, { id: body.ceremony, purpose: 'registration' })
  if (!expected) return c.json({ error: 'this setup expired — start again' }, 400)

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body.response as unknown as RegistrationResponseJSON,
      expectedChallenge: expected,
      expectedOrigin: party.origins,
      expectedRPID: party.rpId,
      requireUserVerification: false,
    })
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'setup failed' }, 400)
  }

  const info = verification.registrationInfo
  if (!verification.verified || !info) return c.json({ error: 'setup failed' }, 400)

  const now = new Date()
  const label = body.label || passkeyLabel(c.req.header('User-Agent'))
  await getDb(c.env.DB)
    .insert(passkeyCredentials)
    .values({
      id: info.credential.id,
      publicKey: base64url(info.credential.publicKey),
      counter: info.credential.counter,
      transports: info.credential.transports ? JSON.stringify(info.credential.transports) : null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp ? 1 : 0,
      label,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
    })

  if (authorised.codeId) await spendEnrolmentCode(c.env, authorised.codeId, now)

  const session = await createSession(c.env, { credentialId: info.credential.id, label, now })
  c.header('Set-Cookie', sessionCookie(session.token, session.maxAgeSeconds))
  return c.json({ ok: true, label })
})

/* --------------------------------------------------------------------- */
/* Managing what is registered                                            */
/* --------------------------------------------------------------------- */

auth.get('/passkeys', async (c) => {
  const session = await readSession(c.env, c.req.header('Cookie'))
  if (!session) return c.json({ error: 'not signed in' }, 401)

  const rows = await listCredentials(c.env)
  return c.json({
    items: rows.map((row) => ({
      id: row.id,
      label: row.label,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      // Whether losing this device loses the passkey. A single-device key is
      // the one worth having a second of.
      backedUp: row.backedUp === 1,
      /** True for the passkey this browser signed in with. */
      current: row.id === session.credentialId,
    })),
  })
})

auth.delete('/passkeys/:id', async (c) => {
  const session = await readSession(c.env, c.req.header('Cookie'))
  if (!session) return c.json({ error: 'not signed in' }, 401)

  const id = decodeURIComponent(c.req.param('id'))
  const db = getDb(c.env.DB)
  const row = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.id, id)).get()
  if (!row) return c.json({ error: 'not found' }, 404)

  // Revoking the last one is allowed. It leaves the emailed code as the only
  // way back in, which is a real state — a stolen laptop is exactly when you
  // want this button — and refusing would be the app deciding it knows better
  // than you about a device you are holding.
  await db.delete(passkeyCredentials).where(eq(passkeyCredentials.id, id))
  return c.json({ ok: true, remaining: (await listCredentials(c.env)).length })
})

/* --------------------------------------------------------------------- */

type Authorised =
  | { ok: true; codeId: string | null }
  | { ok: false; error: string; status: 401 | 403 | 429 }

/**
 * Two ways to be allowed to add a passkey, and they are not equivalent.
 *
 * A session is the everyday one. A code is the one that exists because the
 * session is unreachable, so it is spent, attempt-limited and short-lived
 * where the session is none of those things.
 */
async function authoriseEnrolment(
  env: Env,
  cookie: string | null | undefined,
  code: string | undefined,
): Promise<Authorised> {
  const session = await readSession(env, cookie)
  if (session) return { ok: true, codeId: null }

  if (!code) return { ok: false, error: 'a setup code is required', status: 401 }

  const check = await checkEnrolmentCode(env, code)
  if (check.ok) return { ok: true, codeId: check.id }

  switch (check.reason) {
    case 'locked':
      return { ok: false, error: 'too many wrong codes — request a new one', status: 429 }
    case 'expired':
    case 'none':
      return { ok: false, error: 'that code has expired — request a new one', status: 403 }
    case 'used':
      return { ok: false, error: 'that code has already been used', status: 403 }
    default:
      return { ok: false, error: 'that code is not right', status: 403 }
  }
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as AuthenticatorTransportFuture[]) : undefined
  } catch {
    // A transport list is a hint to the browser about where to look. Bad JSON
    // costs a slightly worse prompt, never a failed sign-in, so it falls back
    // rather than throwing.
    return undefined
  }
}

/** `d••••••@gmail.com` — enough to recognise, not enough to harvest. */
function maskEmail(address: string): string {
  const [name, domain] = address.split('@')
  if (!domain) return '•••'
  return `${name.slice(0, 1)}${'•'.repeat(Math.max(name.length - 1, 1))}@${domain}`
}

export default auth
