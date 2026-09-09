/**
 * The decisions passkey login makes that are not cryptography.
 *
 * The signature check itself is `@simplewebauthn/server`'s job and is not
 * something to reimplement. What lives here is everything around it that has
 * a right answer worth pinning in a test: which relying party the ceremony
 * runs under, when a session has expired and when it is worth the write to
 * extend one, and what an emailed enrolment code is allowed to do.
 *
 * Same rule as the review queue: nothing in here reads the clock. Every
 * function that needs "now" is handed it, so a test that passes today passes
 * in Auckland tomorrow.
 */

/** How long a session lasts before it must be re-established with a passkey. */
export const SESSION_TTL_DAYS = 30

/**
 * A ceremony is a round trip, not a sitting. Ninety seconds is longer than
 * Touch ID takes and shorter than a laptop lid.
 */
export const CHALLENGE_TTL_SECONDS = 300

/** An emailed code has to survive a walk to another room. */
export const ENROLMENT_CODE_TTL_MINUTES = 15

/**
 * Five guesses at six digits. The code is one in a million and short-lived,
 * so the lock is belt and braces — but a code with no attempt limit is a
 * password with a smaller alphabet.
 */
export const ENROLMENT_CODE_MAX_ATTEMPTS = 5

/** Digits, so it can be read off a phone screen without ambiguity. */
export const ENROLMENT_CODE_LENGTH = 6

/**
 * The shortest gap between two setup codes.
 *
 * Requesting one needs no credential — it cannot, since the browser asking has
 * no passkey yet — so without a floor the endpoint is a button anybody on the
 * internet can hold down to fill an inbox and burn the send quota. It also
 * protects the person using it: each request invalidates the last code, so an
 * unthrottled endpoint lets a stranger keep expiring the code you are in the
 * middle of typing.
 *
 * A minute rather than something longer, because the legitimate reason to ask
 * twice is that the first mail has not arrived yet, and that is a wait
 * measured in seconds.
 */
export const ENROLMENT_CODE_COOLDOWN_SECONDS = 60

/**
 * Whether a new code may be issued yet, given the live one.
 *
 * Measured from when the last code was *issued*, not from when it expires: the
 * cooldown is about how often mail is sent, and a spent or expired code costs
 * the same to replace as a live one.
 */
export function enrolmentCooldown(input: {
  now: Date
  lastIssuedAt: string | null
  cooldownSeconds?: number
}): { allowed: boolean; retryAfterSeconds: number } {
  if (!input.lastIssuedAt) return { allowed: true, retryAfterSeconds: 0 }
  const issued = Date.parse(input.lastIssuedAt)
  if (!Number.isFinite(issued)) return { allowed: true, retryAfterSeconds: 0 }

  const window = (input.cooldownSeconds ?? ENROLMENT_CODE_COOLDOWN_SECONDS) * 1000
  const elapsed = input.now.getTime() - issued
  // A clock that went backwards reads as "just issued" rather than as
  // permission: the safe direction for a throttle is to wait.
  if (elapsed >= window) return { allowed: true, retryAfterSeconds: 0 }
  return { allowed: false, retryAfterSeconds: Math.ceil((window - Math.max(elapsed, 0)) / 1000) }
}

/**
 * How long one passkey touch keeps a session *elevated*.
 *
 * A session is thirty days because signing in constantly is how people stop
 * locking their screens. But a handful of actions are not "use the app" —
 * they change who can get in, and a thirty-day cookie is the wrong credential
 * to authorise those with, because a cookie can be stolen and a passkey
 * cannot: it stays on the authenticator and answers a fresh challenge or it
 * does not answer at all.
 *
 * So those actions ask for the passkey again, and the answer is good for
 * fifteen minutes. Long enough to remove three stale credentials without
 * touching the key three times; short enough that a session spends almost all
 * of its life unable to do any of it. There is deliberately one window for
 * every elevated action rather than a tuned number per feature — a second
 * value is a second thing to reason about, for a difference nobody can
 * perceive.
 */
export const ELEVATION_TTL_MINUTES = 15

/**
 * Whether a session's last passkey touch is still recent enough to act on.
 *
 * Reads the clock it is handed, like everything else here. Null means the
 * session has never been elevated, which is the state every session starts in
 * — signing in is not elevation, because the cookie that carries a sign-in is
 * exactly what this is defending against.
 */
export function elevationState(input: {
  now: Date
  elevatedAt: string | null | undefined
  ttlMinutes?: number
}): { elevated: boolean; expiresAt: string | null } {
  if (!input.elevatedAt) return { elevated: false, expiresAt: null }

  const at = Date.parse(input.elevatedAt)
  if (!Number.isFinite(at)) return { elevated: false, expiresAt: null }

  const window = (input.ttlMinutes ?? ELEVATION_TTL_MINUTES) * 60_000
  const expires = at + window
  // A stamp in the future reads as not elevated rather than as permission:
  // the safe direction for a privilege check is to ask again.
  if (at > input.now.getTime()) return { elevated: false, expiresAt: null }
  if (expires <= input.now.getTime()) return { elevated: false, expiresAt: null }
  return { elevated: true, expiresAt: new Date(expires).toISOString() }
}

/** The cookie. `__Host-` pins it to this exact origin and to Secure. */
export const SESSION_COOKIE = '__Host-mhq_session'

/**
 * The relying party a ceremony runs under.
 *
 * `rpId` is baked into every credential at registration and checked on every
 * assertion, so getting it wrong once means the passkey it created can never
 * be used again — this is the one value here worth being fussy about.
 *
 * It comes from `DASHBOARD_URL` rather than from the request, because a
 * request header is written by whoever is asking. The request URL is only
 * consulted when no dashboard URL is configured at all, which in practice
 * means `wrangler dev`.
 */
export interface RelyingParty {
  rpId: string
  /** Origins an assertion may claim to come from. */
  origins: string[]
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/**
 * Local development is two origins, not one: the browser is on Vite's 5173
 * and the Worker answers on wrangler's 8787 through a proxy, so the origin
 * the browser stamps into the ceremony is never the one the Worker was
 * reached on. Both are listed. They share the hostname, which is what `rpId`
 * is, so the credential itself is portable between them.
 */
const LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8787',
]

export function relyingParty(input: {
  dashboardUrl?: string | null
  requestUrl: string
}): RelyingParty | null {
  const configured = safeUrl(input.dashboardUrl)
  if (configured && !LOCAL_HOSTS.has(configured.hostname)) {
    return { rpId: configured.hostname, origins: [configured.origin] }
  }

  const requested = safeUrl(input.requestUrl)
  if (!requested) return configured ? { rpId: configured.hostname, origins: [configured.origin] } : null

  if (LOCAL_HOSTS.has(requested.hostname)) {
    const origins = new Set([requested.origin, ...LOCAL_ORIGINS])
    return { rpId: requested.hostname, origins: [...origins] }
  }

  return { rpId: requested.hostname, origins: [requested.origin] }
}

function safeUrl(value: string | null | undefined): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * Whether a browser request may be acted on, by origin.
 *
 * `SameSite=Lax` already stops a cross-site form POST from carrying the
 * session cookie, so this is the second lock rather than the only one. The
 * case it covers that SameSite does not is a request with an `Origin` this
 * deployment has never heard of.
 *
 * **A request with no `Origin` at all is allowed**, and that is not an
 * oversight: the research agents POST from outside a browser and stamp no
 * origin. They authenticate with the bearer token instead, which is a
 * credential no cross-site page can read.
 */
export function originAllowed(origin: string | null | undefined, allowed: string[]): boolean {
  if (!origin) return true
  return allowed.includes(origin)
}

export interface SessionWindow {
  expiresAt: string
  lastSeenAt: string
}

/**
 * A session's standing, and whether it is worth a write to extend it.
 *
 * Rolling expiry means every request could refresh the row, which on D1 is a
 * write per page view for no benefit anybody can perceive. So the window is
 * only extended once it is half spent: the session still behaves as "thirty
 * days from your last visit", and a busy afternoon costs one write instead of
 * four hundred.
 */
export function sessionState(input: {
  now: Date
  session: SessionWindow
  ttlDays?: number
}): { valid: boolean; shouldExtend: boolean } {
  const now = input.now.getTime()
  const expires = Date.parse(input.session.expiresAt)
  if (!Number.isFinite(expires) || expires <= now) return { valid: false, shouldExtend: false }

  const ttl = (input.ttlDays ?? SESSION_TTL_DAYS) * 86_400_000
  return { valid: true, shouldExtend: expires - now < ttl / 2 }
}

export type EnrolmentCodeState = 'valid' | 'expired' | 'used' | 'locked'

/**
 * Why a code is or is not usable, as four separate answers.
 *
 * They are told apart rather than collapsed into "invalid" because the reply
 * to each is different — a used code means look for the newer email, an
 * expired one means ask for another, and a locked one means somebody has been
 * guessing.
 */
export function enrolmentCodeState(input: {
  now: Date
  code: { expiresAt: string; usedAt: string | null; attempts: number }
  maxAttempts?: number
}): EnrolmentCodeState {
  if (input.code.usedAt) return 'used'
  if (input.code.attempts >= (input.maxAttempts ?? ENROLMENT_CODE_MAX_ATTEMPTS)) return 'locked'
  const expires = Date.parse(input.code.expiresAt)
  if (!Number.isFinite(expires) || expires <= input.now.getTime()) return 'expired'
  return 'valid'
}

/**
 * A name for a passkey, guessed from the browser that registered it.
 *
 * Not identity and not checked against anything — it exists so the revoke
 * button on the Settings screen names a device you recognise. "Passkey 3" is
 * the version of this that leaves you guessing which one is the old phone.
 */
export function passkeyLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? ''
  const platform =
    /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /Android/i.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac'
    : /Windows/i.test(ua) ? 'Windows'
    : /Linux/i.test(ua) ? 'Linux'
    : null

  // Order matters: every Chrome claims Safari in its user agent, and Edge
  // claims both. The most specific name that matches wins.
  const browser =
    /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari'
    : null

  if (platform && browser) return `${browser} on ${platform}`
  return platform ?? browser ?? 'Passkey'
}

/** Six digits, zero-padded, from bytes a caller got somewhere honest. */
export function formatEnrolmentCode(bytes: Uint8Array): string {
  let n = 0
  for (const b of bytes.slice(0, 4)) n = (n * 256 + b) % 1_000_000
  return String(n).padStart(ENROLMENT_CODE_LENGTH, '0')
}

/** ISO datetime `ms` milliseconds after `now`. */
export function isoAfter(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString()
}
