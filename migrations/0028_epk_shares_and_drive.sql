-- The public EPK link, and the Drive folder Scout builds.
--
-- 1. EPK_SHARES. A share link is a credential: whoever holds it can read the
-- artist's public profile. So it is the agent token's shape — stored hashed,
-- shown once, revocable, one row per link so an artist can give a festival
-- and a journalist different links and withdraw one without the other — and
-- like `agent_tokens` it is not one of the domain tables: it is looked up by
-- hash before any tenant is known. Tenant removal deletes it explicitly
-- (src/lib/tenantRemoval.ts).
--
-- `audience` is the EPK cut the link shows (festival | sync | press). The
-- token lives in the URL fragment, never the path, for the invitation's
-- reason: a fragment is never sent to a server, logged, or put in a Referer.
--
-- 2. GOOGLE_GRANTS.DRIVE_FOLDER_ID. The Drive grant is `drive.file`: Scout can
-- reach only what it made or what the artist picked. The folder it makes is
-- the root of everything it may touch, so its id belongs to the grant, the
-- way `calendar_id` does — a new grant is a new folder.
--
-- Additive: a new table and a new nullable column; the deployed Worker names
-- neither.

CREATE TABLE IF NOT EXISTS epk_shares (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'festival',
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_viewed_at TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS epk_shares_token ON epk_shares (token_hash);
CREATE INDEX IF NOT EXISTS epk_shares_tenant ON epk_shares (tenant_id, created_at);

ALTER TABLE google_grants ADD COLUMN drive_folder_id TEXT;
