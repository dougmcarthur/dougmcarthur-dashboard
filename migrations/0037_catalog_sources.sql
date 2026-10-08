-- Where opportunities come from, and what has been read from there.
--
-- Until now an opportunity reached the shared catalog only when a research
-- agent filed a gig for one artist. The agents spend their time on two quite
-- different jobs: *reading* pages that are already known to list calls, and
-- *finding* pages nobody knew about. The first is mechanical and a Worker can
-- do it for nothing; only the second needs a model. This is the half that
-- makes the first possible.
--
-- `catalog_sources` is the registry of pages Scout keeps reading — a feed, an
-- iCal calendar, or a listing page of dated calls. It is seeded from
-- `shared/musicAssociations.ts`, which stays the truth for the ones it names,
-- and is meant to grow by agents *finding* sources rather than rows.
--
-- `catalog_candidates` is what the poller read from them: one row per item, a
-- verdict on whether it looks like a call, and nothing more. A candidate is
-- not a catalog entry and nothing here reaches `opportunities`. The announcing
-- page is usually not the programme's own page — SaskMusic's "Read More" goes
-- to SaskMusic — and publishing it would key the catalog on the wrong address
-- and duplicate the entry the day the real one is found. Following the link
-- is the next step; until it exists this table is for measuring.
--
-- Titles, addresses, dates and a verdict are stored. A feed item's body is read
-- to classify it and then dropped: these are facts about a call, not copies of
-- somebody's article.
--
-- Platform tables, not scoped ones: a call belongs to nobody. Additive — new
-- tables the deployed Worker never names.

CREATE TABLE IF NOT EXISTS catalog_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Stable name, `<association>:<label slug>`. Never shown; screens use `label`.
  source_key TEXT NOT NULL,
  -- The association this belongs to, when it does, and the province it serves.
  association TEXT,
  region TEXT,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  -- feed | calendar | page
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  -- seed | agent | owner. A seed follows the code; the other two follow a person.
  added_by TEXT NOT NULL DEFAULT 'seed',
  cadence_hours INTEGER NOT NULL DEFAULT 24,
  next_due_at TEXT,
  last_fetched_at TEXT,
  -- The last time it answered and was understood, as opposed to merely tried.
  last_ok_at TEXT,
  last_status INTEGER,
  last_error TEXT,
  -- Conditional-request validators, so an unchanged source costs one 304.
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  -- Consecutive reads that failed or found nothing; drives the back-off.
  failures INTEGER NOT NULL DEFAULT 0,
  -- How many items the last read understood, and how new the newest was.
  last_item_count INTEGER,
  newest_item_at TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_sources_key ON catalog_sources (source_key);
CREATE INDEX IF NOT EXISTS catalog_sources_due ON catalog_sources (enabled, next_due_at);

CREATE TABLE IF NOT EXISTS catalog_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  -- The feed's guid, the calendar's UID, or the listing entry's address.
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  -- Where the item is. The announcing page, which is not always the programme.
  url TEXT,
  published_at TEXT,
  -- An iCal event's date. A call is not an event, so this is mostly empty.
  event_at TEXT,
  -- A listing's own deadline line, as an ISO date when it carried a year, and
  -- as the words when it did not. Never guessed.
  deadline TEXT,
  deadline_note TEXT,
  -- The place a listing named, as written ("Calgary, Alberta").
  place_text TEXT,
  -- opportunity | unclear | not_opportunity, and the sentence that decided it.
  verdict TEXT NOT NULL,
  category TEXT,
  kind TEXT,
  reason TEXT NOT NULL,
  -- new | ignored | stale | closed. What happens to a 'new' one is the next step.
  status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_candidates_item ON catalog_candidates (source_id, item_key);
CREATE INDEX IF NOT EXISTS catalog_candidates_status ON catalog_candidates (status, first_seen_at);
CREATE INDEX IF NOT EXISTS catalog_candidates_seen ON catalog_candidates (last_seen_at);
