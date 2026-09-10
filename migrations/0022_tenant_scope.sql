-- Step 2 of `docs/multi-tenant-plan.md`, schema half: the changes that could
-- not be made until the code reading them shipped in the same deploy.
--
-- Migration 0021 added `tenant_id` everywhere and deliberately changed nothing
-- else. This one changes the two things that are only safe *with* the scoping
-- code: four uniqueness constraints, and the single-column indexes the scoped
-- reads no longer use. It also adds the table that gives the research agents a
-- credential belonging to somebody.
--
-- What is still not here: the column defaults 0021 set. They stay until
-- `tenant_id` goes `NOT NULL`, which is a later migration on purpose — CI
-- migrates before it deploys, so dropping a default here would leave the
-- currently-live Worker, which is the *pre*-scoping one, writing NULLs for
-- half a minute. The default is wrong the moment a second tenant exists, and
-- there is not one yet.

------------------------------------------------------------------------------
-- Four uniqueness constraints, widened
------------------------------------------------------------------------------

-- Each is unique on a value that two artists can share, so each has to lead
-- with `tenant_id`. 0021 left them alone and said why: live code named two of
-- them in an `ON CONFLICT` target, SQLite requires that target to match a
-- unique constraint exactly, and widening the key would have made those
-- statements *error* under the old Worker rather than merely return something
-- stale.
--
-- What makes it safe now is that the statements no longer name a constraint at
-- all. `storeGrant` in `src/lib/googleGrant.ts` is a delete-then-insert, and
-- the two mark writers in `src/routes/notifications.ts` are an update followed
-- by an insert that conflicts to nothing. Both shapes work against the schema
-- on either side of this file, which is what the deploy gap requires.

-- `gig_correspondents`: two artists can correspond with the same festival
-- address, and today that is one row that would move between them.
DROP INDEX IF EXISTS idx_gig_correspondents_value;
CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_correspondents_value
  ON gig_correspondents(tenant_id, kind, value);
DROP INDEX IF EXISTS idx_gig_correspondents_gig;
CREATE INDEX IF NOT EXISTS idx_gig_correspondents_gig
  ON gig_correspondents(tenant_id, gig_id);

-- `notification_events`: the dedupe key is built from what happened, so the
-- same run finishing for two artists is one key. Partial as before — a row
-- with no dedupe key is not deduped at all.
DROP INDEX IF EXISTS idx_notification_events_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_dedupe
  ON notification_events (tenant_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- `google_grants`: primary key `purpose`, so one `gmail.compose` grant for the
-- whole deployment. A primary key cannot be altered in place, so the table is
-- rebuilt. The new one carries every old column, so a statement written
-- against the old shape still reads and writes — and the `tenant_id` default
-- from 0021 is carried too, for the same reason it was set there.
CREATE TABLE IF NOT EXISTS google_grants_new (
  tenant_id TEXT DEFAULT 'tnt_0001',
  purpose TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  account_email TEXT,
  scopes TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  last_used_at TEXT,
  PRIMARY KEY (tenant_id, purpose)
);
INSERT INTO google_grants_new
  (tenant_id, purpose, refresh_token, account_email, scopes, granted_at, last_used_at)
  SELECT tenant_id, purpose, refresh_token, account_email, scopes, granted_at, last_used_at
  FROM google_grants;
DROP TABLE google_grants;
ALTER TABLE google_grants_new RENAME TO google_grants;

-- `notification_marks`: primary key `dedupe_key`, so a condition raised for two
-- artists is one mark, and dismissing yours would mark a stranger's as read.
CREATE TABLE IF NOT EXISTS notification_marks_new (
  tenant_id TEXT DEFAULT 'tnt_0001',
  dedupe_key TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT,
  PRIMARY KEY (tenant_id, dedupe_key)
);
INSERT INTO notification_marks_new
  (tenant_id, dedupe_key, first_seen, read_at, dismissed_at)
  SELECT tenant_id, dedupe_key, first_seen, read_at, dismissed_at
  FROM notification_marks;
DROP TABLE notification_marks;
ALTER TABLE notification_marks_new RENAME TO notification_marks;

------------------------------------------------------------------------------
-- 0018's single-column indexes, retired
------------------------------------------------------------------------------

-- 0021 kept these alongside the composite twins because the reads were still
-- unscoped and a swap would have left them with no usable index for however
-- many deploys separated the two migrations. That window closes here: every
-- read of these tables now leads with `WHERE tenant_id = ?`, which the
-- composites serve and these cannot.
DROP INDEX IF EXISTS idx_gig_discovered;
DROP INDEX IF EXISTS idx_sync_discovered;
DROP INDEX IF EXISTS idx_promo_created;
DROP INDEX IF EXISTS idx_task_runs_run_at;
DROP INDEX IF EXISTS idx_reminders_entity;
DROP INDEX IF EXISTS idx_reminders_due;
DROP INDEX IF EXISTS idx_notification_events_created;

------------------------------------------------------------------------------
-- A credential the research agents can hold that belongs to somebody
------------------------------------------------------------------------------

-- `API_TOKEN` is a Worker secret with no tenant attached. That is correct with
-- one artist and wrong with two: the agents POST gigs, and a gig belongs to
-- somebody — and nothing breaks visibly when one lands in the wrong tenant, it
-- just appears on a stranger's Overview.
--
-- Stored hashed, like every other credential in this database, so a dump of
-- this table is a list of tokens that exist rather than a set of working ones.
--
-- The secret is **not** retired here. `actorForBearer` still accepts it and
-- resolves it to the owner's tenant, because withdrawing it in the same deploy
-- that introduces this table would 401 every agent until three GitHub secrets
-- were rotated. It goes when the agents hold rows instead.
CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  -- Which agent this is for, so revoking one does not mean guessing. Named by
  -- the person who issued it rather than derived from a task id: a slug reads
  -- as a leak on a screen, and this one is shown on Settings.
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

-- The lookup every bearer request makes when the platform secret did not
-- match. Unique because two tokens hashing the same would be a collision worth
-- an error rather than a coin toss.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tokens_hash ON agent_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_tenant ON agent_tokens(tenant_id, created_at DESC);
