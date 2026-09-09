-- Passkey login, replacing Cloudflare Access.
--
-- Four tables, all new, so this is additive in the sense CLAUDE.md requires:
-- the currently-live Worker reads none of them, and the deploy that follows
-- this migration is the first thing that does.
--
-- The app is single-user, so there is no `users` table and no user id on any
-- row. A passkey *is* the account. What the tables separate instead is the
-- three lifetimes involved: a credential lasts until it is deleted, a session
-- lasts weeks, and a challenge lasts one round trip.

-- One row per registered authenticator. `id` is the base64url credential ID
-- the browser reports, which is what an assertion arrives naming.
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  -- The COSE public key, base64url. Verification is a signature check against
  -- this; nothing else about the authenticator is trusted.
  public_key TEXT NOT NULL,
  -- The authenticator's signature counter. Some authenticators never move it
  -- (every passkey on iCloud Keychain reports 0 forever), so a counter that
  -- fails to advance is not evidence of anything. One that goes *backwards*
  -- is, which is the only case the verifier rejects.
  counter INTEGER NOT NULL DEFAULT 0,
  -- JSON array, as reported at registration. Purely a UI hint for the browser
  -- on the next login ("try the USB key"), never a security claim.
  transports TEXT,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  -- What to call it on the Settings screen. Guessed from the user agent at
  -- registration, because "Passkey 3" tells you nothing when you are trying
  -- to work out which one to revoke.
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- A login or registration ceremony in flight.
--
-- Server-side rather than a signed cookie because the property that matters
-- is single use: the row is deleted when it is spent, so a captured assertion
-- cannot be replayed. A cookie can be replayed by whoever captured it.
CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL, -- 'registration' | 'authentication'
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A logged-in browser.
--
-- `id` is the SHA-256 of the cookie value, never the cookie value itself, so
-- a copy of this table is not a set of working sessions.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  -- Which passkey opened it. Nullable because a session can outlive the
  -- credential that created it, and revoking a passkey should not have to
  -- decide what that means for a session already open.
  credential_id TEXT,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- The break-glass path: a code emailed to the owner, which authorises adding
-- a passkey and nothing else.
--
-- This is the thing passkeys need that a password does not — a device you can
-- no longer unlock is a door with no key behind it, and the D1 database is
-- not somewhere you can reset a login from. It is deliberately *not* a login:
-- a valid code lets you enrol an authenticator, and the session you get is
-- the one that enrolment produced.
CREATE TABLE IF NOT EXISTS auth_enrolment_codes (
  id TEXT PRIMARY KEY,
  -- SHA-256 of the code. Same reason as the session id.
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at);
