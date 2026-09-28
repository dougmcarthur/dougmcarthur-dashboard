-- The shared opportunity catalog, and requests for an invitation.
--
-- `opportunities` holds the listing facts of each real-world opportunity once,
-- whoever found it — name, page, closing date, place — and nothing about any
-- artist's relationship to it. Each artist's gig and sync rows link to it by
-- `opportunity_id`. It is a platform table, not one of the sixteen scoped
-- ones: it has no tenant, because its facts belong to nobody. See
-- shared/opportunityCatalog.ts. `public` decides whether the logged-out
-- landing page may show it.
--
-- `invite_requests` is the landing page's "Request an invitation" form: a
-- name, an address and a sentence from somebody who has no account. Read on
-- the admin surface; pruned by housekeeping.
--
-- Additive. The deployed Worker selects named columns from both artist
-- tables, so the new `opportunity_id` columns are invisible to it, and it
-- never names either new table. The catalog's unique key is on a new table
-- no deployed statement targets.

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  catalog_key TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  organizer TEXT,
  kind TEXT,
  url TEXT,
  deadline TEXT,
  deadline_note TEXT,
  location TEXT,
  country TEXT,
  public INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_key ON opportunities (catalog_key);
CREATE INDEX IF NOT EXISTS opportunities_public_recent ON opportunities (public, category, first_seen_at);

ALTER TABLE gig_opportunities ADD COLUMN opportunity_id INTEGER;
ALTER TABLE sync_targets ADD COLUMN opportunity_id INTEGER;

CREATE TABLE IF NOT EXISTS invite_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  -- A salted hash of the sender's network address, for rate limiting only.
  -- Never the address itself.
  requester_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  handled_at TEXT
);

CREATE INDEX IF NOT EXISTS invite_requests_created ON invite_requests (created_at);
CREATE INDEX IF NOT EXISTS invite_requests_requester ON invite_requests (requester_hash, created_at);
