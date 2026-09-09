# Passkey login

The dashboard authenticates in the Worker, with a WebAuthn passkey. There is
no identity provider in front of it any more.

- **App URL:** `https://dashboard.dougmcarthur.net/`
- **Code:** `src/routes/auth.ts`, `src/lib/auth.ts`, `shared/auth.ts`,
  `frontend/src/components/LoginScreen.tsx`
- **Schema:** migration `0017_passkey_auth.sql`

## What this replaced, and why

The app used to sit behind **Cloudflare Access**, which authenticated by
emailing a six-digit one-time PIN. `src/index.ts` had no auth in it at all —
every request that reached the Worker had already been let through at the edge.

Two things were wrong with that arrangement in practice:

1. **A code in your inbox is the slow way in.** It is a round trip through
   email every time, on every device, forever.
2. **"Sign in with Cloudflare" was a trap.** Access's login page offered it,
   and it authenticated you into your *Cloudflare account* rather than into the
   app. The account login flow knows nothing about Access's `redirect_url`, so
   on success it dropped you at `dash.cloudflare.com` — the symptom the old
   `docs/cloudflare-access-setup.md` existed to explain.

Both are gone. What is left is a passkey — Touch ID, Face ID, a screen lock or
a hardware key — verified against a public key stored in D1.

## Email did not disappear. It changed jobs.

A passkey lives on a device, and a device can be lost. D1 is not somewhere you
can reset a login from, and there is no longer an identity provider in front to
fall back on, so there has to be a way back in that does not depend on hardware
you no longer have.

That is the emailed code, and the distinction is the whole design:

> **A code no longer signs you in. It lets you add a passkey.**

The session you end up with is the one that *enrolment* produced, so a code
read by somebody else is worth nothing unless their browser also completes a
WebAuthn ceremony on a device you would have to have handed them. A code that
opened a session directly would be the old emailed login wearing new clothes,
which is why `test/uiConsistency.test.ts` fails if the code ever reaches a
login endpoint or if the button that takes it stops saying *Add a passkey*.

Codes are single-use, capped at five wrong guesses, good for fifteen minutes,
and only one is ever live — requesting a new one invalidates the old, so the
older email in your inbox is never a code that half-works.

Adding a *second* passkey from a browser you are already signed in on needs no
code at all. Settings → Passkeys.

## The parts

| Piece | Lives in | Note |
| --- | --- | --- |
| Signature verification | `@simplewebauthn/server` | Runs on Workers; not reimplemented here |
| Relying party, session and code rules | `shared/auth.ts` | Pure, tested, never reads the clock |
| D1, cookies, hashing | `src/lib/auth.ts` | Sessions and codes are stored hashed |
| The ceremonies | `src/routes/auth.ts` | The only public API surface |
| The gate | `src/index.ts` middleware | One check over `/api/*`, with a written-down exemption list |

Some details worth knowing before changing any of it:

- **`DASHBOARD_URL` is load-bearing now.** Its hostname is the WebAuthn
  relying-party ID, and that ID is baked into every credential at
  registration. Changing the hostname invalidates every passkey already
  enrolled — everyone would fall back to an emailed code and re-enrol.
- **The session cookie is `__Host-` prefixed.** That pins it to this exact
  origin, requires `Secure` and `Path=/`, and stops any other host under
  `dougmcarthur.net` from setting it.
- **Passkeys are discoverable (resident).** The login screen asks for no
  username, so there is nothing to put in `allowCredentials` before you are
  signed in. A non-resident key would be unusable here.
- **The signature counter is checked, not required to advance.** Every passkey
  synced through iCloud Keychain reports `0` forever. A counter that goes
  *backwards* is rejected; one that stands still is normal.
- **User verification is preferred, not required.** Demanding it would lock out
  a hardware key that is working exactly as designed. The one exception is the
  elevation ceremony below, where it *is* required — the point of asking twice
  is the person rather than the device, and a silent assertion from an unlocked
  laptop proves the laptop is present, which was never in doubt.

## Changing who can sign in asks for the key again

A session lasts thirty days, which is the right length for using the app and
the wrong credential for changing how you get into it. Two routes change that:
`POST /auth/register/*` adds a passkey and `DELETE /auth/passkeys/:id` removes
one.

Both accepted a session on its own until now, and that was a real gap rather
than a theoretical one. Anyone holding a stolen session cookie could enrol
their own passkey and delete every other — and that survives **sign out
everywhere**, because signing out clears sessions and not credentials. The
button you would reach for on realising you had been compromised was the one
that would not help.

So both now need a *recent assertion*: the cookie says which session, and the
key says somebody is holding it. A passkey cannot be stolen the way a cookie
can — it answers a fresh challenge from the authenticator or it does not
answer.

| Piece | Where |
| --- | --- |
| `ELEVATION_TTL_MINUTES`, `elevationState` | `shared/auth.ts` — fifteen minutes, decided against a `now` it is handed |
| `auth_sessions.elevated_at` | migration `0020`, nullable; null is where every session starts |
| `POST /auth/elevate/options` + `/verify` | the login assertion run again, under its own challenge purpose |
| `withConfirmation` | `frontend/src/confirmIdentity.ts` — try, and re-assert only if the server asks |

Four decisions inside that:

- **Signing in is not elevation.** A fresh session starts unelevated, because
  the cookie a sign-in produces is exactly what this defends against.
- **The emailed setup code is exempt, and has to be.** It exists for the case
  where there is no passkey left to touch. Requiring one to use it would make
  recovery need the thing you are recovering from losing. `test/uiConsistency`
  fails if the code branch of `authoriseEnrolment` ever consults elevation.
- **Its own challenge purpose**, so a challenge issued for signing in can never
  be replayed to raise a session's privilege.
- **Try first, then ask.** The client attempts the action and re-asserts only
  on a `needsElevation` refusal, so removing two stale credentials in a row
  costs one touch rather than two. Exactly one retry: a loop of authenticator
  dialogs is how somebody is trained to approve them without reading.

**Nothing else asks.** Not the bulk writes, not the Gmail connect, not a status
change — those are tenant-scoped and reversible, and a prompt you see
constantly is one you stop reading. The rule is narrow on purpose: an action
that changes who can get in, or that destroys data across a boundary. Admin
mode, when it arrives, is the next thing to qualify — see
`docs/multi-tenant-plan.md`.

## The research agents need a token now

This is the one way this change breaks something quietly.

The gig-research agents live outside this repo and POST and PATCH
`/api/gigs`. They run headless, so they cannot do a passkey ceremony — and
WebAuthn has no non-interactive mode to offer them. They authenticate with a
bearer token instead:

```
Authorization: Bearer <API_TOKEN>
```

**Set it before you deploy, not before you remove Access.** This is the part
that is easy to get backwards. Access authenticated at the *edge* and the
Worker then trusted whatever arrived — it never handed the Worker a credential
the middleware would recognise. So the agents start getting 401s the moment
this Worker goes live, whether or not Access is still in front of it.

```bash
openssl rand -base64 32                     # generate
npx wrangler secret put API_TOKEN           # paste
```

With `API_TOKEN` unset there is no bearer path at all — an empty secret is not
a credential, so nothing can be guessed into it. Setting it is only half the
job: the agents live outside this repository and have to be taught to send the
header. Until both halves are done they will 401, and because they retry on
their own schedule the symptom is gig rows quietly failing to arrive rather
than anything announcing itself.

## Rolling this out, in the order that avoids a lockout

Access is still what stands between the internet and this app until step 4,
and step 4 is a thing you do in the Cloudflare dashboard, not in this
repository. Doing it before step 3 leaves the app open; doing step 3 before
step 2 leaves you locked out of a dashboard nobody can reach.

1. **Set `API_TOKEN` and teach the agents to send it — before merging.**
   `npx wrangler secret put API_TOKEN` works against the live Worker without
   a deploy, so the secret can be in place before the code that needs it. Do
   this first: the agents 401 from the moment the Worker ships, not from the
   moment Access goes.
2. **Merge and deploy.** CI applies migration 0017 and ships the Worker. The
   login screen is live but Access is still in front of it, so nothing is
   reachable from outside yet either way.
3. **Check the rest of the configuration.**
   - Confirm `[[send_email]]` in `wrangler.toml` still lists the address the
     setup code should go to. The binding is the real boundary: the Worker
     cannot mail an address that is not on that list, whatever the code says.
   - `AUTH_EMAIL_SENDER` is `login@dougmcarthur.net`. Same domain as the
     digest's sender, so it should need nothing new — but it has never sent a
     message, and it is the only route to a first passkey. If the code never
     arrives, that address is the first thing to look at.
4. **Enrol a passkey — while Access is still on.** Sign in through Access as
   usual, land on the login screen, click *Email me a setup code*, and add a
   passkey. Then add a **second** one on another device. A single
   non-synced passkey is one lost laptop away from a break-glass email, and
   the Passkeys card on Settings says which of yours are synced.
5. **Turn Access off.** Zero Trust → Access → Applications → the dashboard app
   → delete it (or set its policy to Bypass). The Worker is the boundary from
   this moment on.
6. **Check the agents.** One authenticated POST from an agent, and one
   unauthenticated request from anywhere, which must answer
   `{"error":"not signed in"}` with a 401.

## If you cannot get in

- **"No passkey registered" / the sign-in button does nothing.** No credential
  exists on this deployment. Use *New device? Add a passkey with an emailed
  code*.
- **The code email never arrives.** The `send_email` allowlist in
  `wrangler.toml` is the boundary; an address that is not on it cannot be
  mailed. Check also that the Worker still has the `EMAIL` binding —
  `/api/auth/session` reports `recoveryAvailable: false` when it does not, and
  the login screen says so rather than offering a button that fails.
- **The browser offers a passkey and the Worker rejects it.** Almost always
  `DASHBOARD_URL` no longer matching the host you are on. The relying-party ID
  is checked on every assertion; a passkey enrolled under a different hostname
  can never be used under this one.
- **Nothing works and no code can be sent.** Deleting every row from
  `passkey_credentials` returns the app to its first-run state, from which the
  emailed code is the way in. That is a `wrangler d1 execute --remote` against
  a table, not schema SQL, so it does not break the migration ledger — see the
  rule in `CLAUDE.md` about never hand-running schema changes.
