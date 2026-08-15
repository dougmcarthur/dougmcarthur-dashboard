-- Migration: server-side opportunity discovery
-- Apply with: wrangler d1 migrations apply dougmcarthur-music-hq --remote
--
-- Discovery runs on the Worker cron and writes candidates straight into the
-- review queues. These columns record where a row came from, so a find from
-- the weekly sweep is distinguishable from something added by hand.

ALTER TABLE gig_opportunities ADD COLUMN discovered_by TEXT DEFAULT 'manual';
ALTER TABLE gig_opportunities ADD COLUMN source_note TEXT;

ALTER TABLE sync_targets ADD COLUMN discovered_by TEXT DEFAULT 'manual';
ALTER TABLE sync_targets ADD COLUMN source_note TEXT;
ALTER TABLE sync_targets ADD COLUMN url TEXT;

-- Everything that exists today was entered by hand or by the local task runs.
UPDATE gig_opportunities SET discovered_by = 'manual' WHERE discovered_by IS NULL;
UPDATE sync_targets SET discovered_by = 'manual' WHERE discovered_by IS NULL;
