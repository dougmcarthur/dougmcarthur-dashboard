-- Step 1 of `docs/multi-tenant-plan.md`: the shape an account needs, added
-- underneath an app that does not yet know accounts exist.
--
-- Nothing in this migration is read by the currently-live Worker, and nothing
-- it does changes an answer that Worker already gives. That is the whole
-- design constraint: CI migrates before it deploys, so for half a minute this
-- schema runs under code written when a passkey *was* the account and every
-- row belonged to the only person who could log in.
--
-- The device that makes it safe is a **default**. Every `tenant_id` added
-- below defaults to the one tenant this database has ever had, so a write from
-- the old Worker — which names no such column — lands in the right place
-- rather than as a NULL nobody scoped. It is correct while there is one
-- tenant, which is exactly as long as it survives: the scoping deploy drops
-- the defaults, because past that point a row that did not say who it belongs
-- to is a bug and should look like one.
--
-- What is deliberately *not* here: any code reading any of it. Resolving a
-- session to a tenant, and filtering the fourteen domain tables on what it
-- resolves to, is its own step with nothing else in it.

------------------------------------------------------------------------------
-- The account tables
------------------------------------------------------------------------------

-- An artist. One row here owns every domain row carrying its id.
--
-- Separate from `users` rather than folded into it because the two answer
-- different questions and will not stay one-to-one: a tenant is the thing rows
-- belong to, a user is the thing that signs in. Today the owner is one of
-- each; the first time an artist wants a manager able to log in, that is a
-- second user against the same tenant and no migration at all.
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  -- What to call this artist on the oversight screen. Nullable, and null
  -- means nobody has said — not a guess assembled from an email address.
  -- The bootstrap row below leaves it null on purpose: this migration knows
  -- that a tenant exists and does not know the owner's name.
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Somebody who can sign in.
--
-- `role` is two values and stays two values. A permissions matrix with two
-- rows is a worse way to write `role = 'owner'`, and it invites a third role
-- to be invented before anyone needs one.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'artist', -- 'owner' | 'artist'
  -- The tenant this user's session resolves to in artist mode. Nullable here
  -- and NOT NULL in a later migration, once the code that fills it has been
  -- live long enough to trust — the same staging every column below gets.
  tenant_id TEXT,
  display_name TEXT,
  -- The recovery address, and the one place it is allowed to come from.
  -- An address typed on the login screen is an account-takeover vector, so
  -- the emailed enrolment code goes to the address already on file here and
  -- never to what somebody asked it to go to. At signup the address comes
  -- from the invite the owner issued, which is why `invites` carries one too.
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- An invitation to create an account. A credential, so it is stored the way
-- this repo stores credentials: the token never lands in a column, only its
-- SHA-256 does, and a leaked backup is therefore not a set of working
-- invitations.
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  -- Fixed at issue time by the owner, and not chosen by the person redeeming.
  -- This is the signup half of the recovery-address rule: at signup there is
  -- nothing on file, so the address has to come from somewhere trusted, and
  -- an invite is exactly that.
  email TEXT NOT NULL,
  display_name TEXT,
  issued_by TEXT NOT NULL, -- users.id
  expires_at TEXT NOT NULL,
  -- Single use. Redemption writes this, and a second attempt on the same
  -- token fails whether or not the invite has expired.
  redeemed_at TEXT,
  redeemed_user_id TEXT,
  -- An invite sent to the wrong address needs an answer better than waiting
  -- thirty days for it to lapse.
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_token ON invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);

-- One row per tenant per day, written by the 3am housekeeping tick by code
-- running as that tenant.
--
-- A rollup rather than a meter, for the reason the bell poll was slowed to
-- five minutes: metering every request is a write per request to answer a
-- question nobody asks per request. The owner wants "is this artist costing
-- me anything unusual", once a day.
--
-- Every column is a counter the plan names, and there is no per-table
-- breakdown beyond the two the owner actually looks at. `domain_rows` is the
-- total across the fourteen scoped tables — the number that answers "how big
-- is this tenant" without needing fourteen columns to grow a fifteenth when a
-- table is added.
CREATE TABLE IF NOT EXISTS usage_daily (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL, -- YYYY-MM-DD, in the tenant's own reckoning
  domain_rows INTEGER NOT NULL DEFAULT 0,
  gig_rows INTEGER NOT NULL DEFAULT 0,
  promo_rows INTEGER NOT NULL DEFAULT 0,
  api_requests INTEGER NOT NULL DEFAULT 0,
  agent_runs INTEGER NOT NULL DEFAULT 0,
  gmail_drafts INTEGER NOT NULL DEFAULT 0,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  written_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, day)
);

-- Prunes at 90 days, the way `notification_events` prunes at 30. The index is
-- what makes that a delete rather than a scan.
CREATE INDEX IF NOT EXISTS idx_usage_daily_day ON usage_daily(day);

------------------------------------------------------------------------------
-- The one tenant that already exists
------------------------------------------------------------------------------

-- There is exactly one artist today, so this is unambiguous in a way it will
-- never be again — which is the argument for doing it now rather than after a
-- second tenant exists and somebody has to work out who owned what.
--
-- The ids are literals because a migration cannot generate one and keep it:
-- every default below has to name the same tenant, and every future
-- environment bootstrapped from this ledger has to agree on which row is the
-- owner's. They are handles, never rendered — `taskLabel`'s rule applies to
-- screens, and no screen prints these.
INSERT OR IGNORE INTO tenants (id) VALUES ('tnt_0001');
INSERT OR IGNORE INTO users (id, role, tenant_id) VALUES ('usr_0001', 'owner', 'tnt_0001');

------------------------------------------------------------------------------
-- `tenant_id` on the fourteen domain tables
------------------------------------------------------------------------------

-- Nullable, defaulted, and therefore also backfilled: SQLite fills existing
-- rows with the default as it adds the column, so there is no separate UPDATE
-- to get half-applied.
--
-- The default is the thing to understand and the thing to remove. It exists so
-- that an INSERT written before tenants existed still files correctly, which
-- covers both the half-minute deploy gap and every route not yet taught to
-- pass a tenant. It stops being true the moment a second tenant does, so the
-- scoping migration drops it — after which a write that omits the column
-- fails, which is what a missing scope should do.

ALTER TABLE gig_opportunities ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE sync_targets ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE promo_drafts ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE artist_assets ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE reference_docs ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE gig_replies ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE reminders ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE notification_events ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE digest_reports ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE task_runs ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';

-- `application_fields` hangs off a gig, so its tenant is derivable by join.
-- It gets the column anyway. A scoping rule that reads "filter on `tenant_id`,
-- except these which you reach through their parent" is a rule with an
-- exception, and the exception is where the leak will be.
ALTER TABLE application_fields ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';

------------------------------------------------------------------------------
-- The four tables whose identity has to become tenant-scoped, later
------------------------------------------------------------------------------

-- Four of the fourteen carry a uniqueness constraint that is right today and
-- wrong with a second tenant, because the value it is unique on is not
-- distinctive between artists: `gig_correspondents` is unique on
-- `(kind, value)` and two artists can correspond with the same festival
-- address; `google_grants` keys on `purpose` and both can hold a
-- `gmail.compose` grant; `notification_marks` keys on `dedupe_key` and both
-- can raise the identical condition; `notification_events` dedupes on the
-- same kind of key.
--
-- **None of them change here**, and the reason is a rule this migration would
-- otherwise have broken quietly. Two of those constraints are named in an
-- `ON CONFLICT` target by code that is live right now —
-- `onConflictDoUpdate({ target: notificationMarks.dedupeKey })` in
-- `src/routes/notifications.ts` and `target: googleGrants.purpose` in
-- `src/lib/googleGrant.ts`. SQLite requires an upsert's target to match a
-- unique constraint exactly, so widening either key to lead with `tenant_id`
-- makes those statements fail outright: not a wrong answer, an error, in the
-- half-minute before the new Worker is live and for as long as the old one
-- runs.
--
-- The prop that would have made it safe — keeping the narrow unique index
-- alongside the composite key — is also the thing that would make the change
-- pointless, since the narrow index is what forbids a second tenant. So a
-- constraint and the upsert that names it move together, in the scoping
-- deploy, and this migration only adds the column they will be widened onto.
-- Two of them need the table rebuilt when that happens, since SQLite cannot
-- alter a primary key in place.

ALTER TABLE gig_correspondents ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE google_grants ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';
ALTER TABLE notification_marks ADD COLUMN tenant_id TEXT DEFAULT 'tnt_0001';

------------------------------------------------------------------------------
-- Which user a credential belongs to
------------------------------------------------------------------------------

-- The four auth tables key off a user rather than a tenant — a level above,
-- since a user is what signs in and a tenant is what rows belong to.
-- `auth_challenges` is the exception: a challenge is one round trip long and
-- is answered by whichever credential the browser produces, so it belongs to
-- a ceremony and not to a person.
--
-- Same default, same reason: the live Worker's INSERTs name none of these.
ALTER TABLE passkey_credentials ADD COLUMN user_id TEXT DEFAULT 'usr_0001';
ALTER TABLE auth_sessions ADD COLUMN user_id TEXT DEFAULT 'usr_0001';
ALTER TABLE auth_enrolment_codes ADD COLUMN user_id TEXT DEFAULT 'usr_0001';

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

------------------------------------------------------------------------------
-- 0018's indexes, as composites
------------------------------------------------------------------------------

-- An index that does not lead with the column the WHERE clause filters on is
-- an index the planner declines to use, so every ordering 0018 added needs
-- `tenant_id` in front of it before a scoped read exists to use it.
--
-- The singles are **kept**, not dropped, and this is a departure from the plan
-- worth stating: the plan said "become composites in step 1", which read as a
-- swap. A swap would leave the currently-live unscoped queries — which filter
-- on nothing — with no usable index at all, for however many deploys separate
-- this migration from the scoping one. That is the pre-0018 full scan, put
-- back for an unknown window, to save six index entries per row on tables
-- holding tens of rows. The singles go in the scoping migration instead, in
-- the same change that makes the composites the ones actually used.

CREATE INDEX IF NOT EXISTS idx_gig_tenant_discovered
  ON gig_opportunities(tenant_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_tenant_discovered
  ON sync_targets(tenant_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_tenant_created
  ON promo_drafts(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_runs_tenant_run_at
  ON task_runs(tenant_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant_entity
  ON reminders(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant_due
  ON reminders(tenant_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notification_events_tenant_created
  ON notification_events (tenant_id, created_at DESC);
