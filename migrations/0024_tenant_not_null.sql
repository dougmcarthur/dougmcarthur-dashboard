-- Step 5 of `docs/multi-tenant-plan.md` — and it is deliberately smaller than
-- the plan asked for. What it does, and what it refuses to do, are both the
-- point.
--
-- The plan's last step reads: `tenant_id` to `NOT NULL` on the fourteen domain
-- tables, and on `users` too. `users` is done here. The fourteen are not, and
-- the reasons are below rather than in a commit message, because the next
-- person to reach for this needs them.

------------------------------------------------------------------------------
-- The prop from 0022 comes out
------------------------------------------------------------------------------

-- 0022 kept a narrow unique index on `notification_marks(dedupe_key)` for one
-- reason: the Worker deployed at the time named that exact constraint in an
-- `ON CONFLICT` target, and would have errored against the composite primary
-- key for the minute between the migration and the deploy.
--
-- By the time this file runs, that deploy is in the same CI run and the new
-- code names no constraint at all. The narrow index is what forbids a second
-- tenant, so it goes now — before an invitation can be redeemed, which is the
-- only thing that creates one.
DROP INDEX IF EXISTS idx_notification_marks_dedupe;

------------------------------------------------------------------------------
-- `users.tenant_id` becomes NOT NULL
------------------------------------------------------------------------------

-- Every account owns a tenant, including the owner's. This is the half of the
-- plan's last step that is safe to do now, and it is safe for a reason that
-- does not hold for the fourteen: `users` is created by 0021, in this same
-- release, so nothing outside this repository has ever written to it and its
-- shape here is its shape everywhere. There is no drift to be wrong about.
--
-- SQLite cannot alter a column's nullability, so the table is rebuilt. It
-- holds one row at this point — the bootstrap owner — and any account created
-- since by redeeming an invitation, all of which set a tenant.
--
-- A row with no tenant would fail the copy below and roll the migration back,
-- which is the correct outcome: an account that resolves to nothing is an
-- account that cannot read its own rows, and finding that out at deploy time
-- beats finding it out at sign-in.
CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'artist', -- 'owner' | 'artist'
  tenant_id TEXT NOT NULL,
  display_name TEXT,
  -- The recovery address, and the one place one may come from. Never typed by
  -- the person asking for it; at signup it comes from the invitation.
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO users_new (id, role, tenant_id, display_name, email, created_at)
  SELECT id, role, tenant_id, display_name, email, created_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

------------------------------------------------------------------------------
-- The fourteen keep their nullable, defaulted column, and here is why
------------------------------------------------------------------------------

-- Three reasons, in order of how much they matter.
--
-- **1. Rebuilding them means transcribing a schema this repository cannot
-- verify.** SQLite has no `ALTER COLUMN`, so `NOT NULL` on fourteen tables is
-- fourteen rebuilds, and a rebuild is `CREATE TABLE new (…every column…)`,
-- copy, `DROP TABLE old`, rename. The column list has to come from somewhere,
-- and the only source available from a development session is the *local*
-- database. Production was created from `schema.sql` by hand before anything
-- went through the ledger, and 0006, 0007 and 0008 were each applied by hand
-- and back-filled afterwards — which is exactly the history that produces
-- drift. A column that exists in production and not in the local schema would
-- be dropped, silently, by a statement that succeeds. That is not a risk worth
-- taking for the benefit in reason 3.
--
-- **2. The plan's own precondition is not met.** It says `NOT NULL` comes
-- "once the code that fills it has been live long enough to trust". The
-- scoping code has not been live for a minute: the deployed Worker is from
-- migration 0009, and everything since — passkeys, agents in CI, tenants, the
-- oversight surface, invitations — merges in one release. Doing the hardening
-- pass in the same breath as the thing it is meant to harden is doing it for
-- the wrong reason.
--
-- **3. With the defaults in place, `NOT NULL` adds almost nothing.** Every
-- `tenant_id` on the fourteen carries `DEFAULT 'tnt_0001'`, so a write that
-- omits the column cannot produce a NULL. The only way to store one is to pass
-- null explicitly — which `withTenant` cannot do, because it returns a
-- `TenantId`, and which `test/tenantScope.test.ts` catches for any query that
-- goes around `withTenant`. The constraint would be guarding a state the type
-- system and a source-level test already make unreachable.
--
-- Dropping the defaults is the change with real value, and it is the one that
-- cannot happen yet: for the minute between this migration and the deploy, the
-- live Worker is the 0009-era one, which names `tenant_id` nowhere. Without a
-- default, every write it makes would fail.
--
-- ### What has to be true before this is finished
--
-- 1. This release is deployed and the scoping Worker has been serving traffic —
--    so the code that fills `tenant_id` is the code that is running.
-- 2. Production's schema is compared against what these migrations produce,
--    table by table, so a rebuild transcribes rows rather than losing them.
-- 3. No row has a NULL `tenant_id`. `GET /api/admin/health` answers that from
--    the oversight surface — a count per table, naming no column and returning
--    no row — so the check is something to look at rather than something to
--    assume.
--
-- When all three hold, one migration can rebuild the fourteen with
-- `tenant_id TEXT NOT NULL` and no default, in that order, and this comment
-- can go.
