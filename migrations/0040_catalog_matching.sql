-- What the shared catalog needs to be matched to an artist, and where a
-- catalogued opportunity came from on the artist's side.
--
-- The catalog held what a listing says about itself: name, page, closing date,
-- place, fee. Matching it to an artist needs a little more, and every new
-- column is a fact about the listing that belongs to nobody:
--
--   region       the province or state the place names ("MB", "TX"), read from
--                the location. Null where the listing does not say, which is
--                not the same as national: the country column says that.
--   genres       JSON array of closed genre ids (shared/onboarding.ts). Null is
--                "no claim", and the matcher treats it as open to anything
--                only where the listing said so, which a null never does.
--   eligibility  JSON: who may apply (residents of, members of, ages, career
--                stage, plain notes). Null is "no claim", never "anyone".
--   opens_at     the day the window opens, when the listing states one.
--   pays_*       what the listing says it pays, as stated. Separate from the
--                fee because the fee's direction was never recorded reliably.
--   found_by     who put it here: 'agent', 'poller', 'artist' or 'owner'.
--                Null on the rows that predate this column.
--   source_id    the catalog source it was read from, when it was.
--   delivery     whether it may go into artists' lists. Null means "after the
--                holding period", 'approved' means now, 'blocked' means never.
--                Its own column because `public` answers a different question,
--                whether a stranger may see it, and conflating the two is how
--                one poisoned page would reach every artist at once.
--   checked_at   the last time somebody confirmed it still stands.
--
-- `catalog_candidates.opportunity_id` is set when a candidate becomes an entry,
-- so the poller does not promote the same announcement twice.
--
-- `gig_opportunities.origin` says how a row arrived on an artist's side:
-- 'catalog' for one Scout added from the shared catalog, null for everything
-- else. It exists so that "who filed this" stops being inferred from the
-- row's stage, which is how the nightly relink had to guess.
--
-- Additive, every one nullable: the deployed Worker selects named columns and
-- never names these, so it runs unchanged against this schema.

ALTER TABLE opportunities ADD COLUMN region TEXT;
ALTER TABLE opportunities ADD COLUMN genres TEXT;
ALTER TABLE opportunities ADD COLUMN eligibility TEXT;
ALTER TABLE opportunities ADD COLUMN opens_at TEXT;
ALTER TABLE opportunities ADD COLUMN pays_amount REAL;
ALTER TABLE opportunities ADD COLUMN pays_currency TEXT;
ALTER TABLE opportunities ADD COLUMN found_by TEXT;
ALTER TABLE opportunities ADD COLUMN source_id INTEGER;
ALTER TABLE opportunities ADD COLUMN delivery TEXT;
ALTER TABLE opportunities ADD COLUMN checked_at TEXT;

CREATE INDEX IF NOT EXISTS opportunities_first_seen ON opportunities (first_seen_at);

ALTER TABLE catalog_candidates ADD COLUMN opportunity_id INTEGER;

ALTER TABLE gig_opportunities ADD COLUMN origin TEXT;
