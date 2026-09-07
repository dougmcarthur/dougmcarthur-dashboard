-- The artist database: one place holding everything a booking manager or an
-- artistic director could ask for, so no application starts from a blank page.
--
-- Additive, as every migration here has to be: CI applies migrations before it
-- deploys the Worker, so for half a minute this schema runs under the code
-- already in production. A new table is invisible to it.
--
-- Two things this does that a folder of files cannot, and both are columns
-- rather than conventions:
--
--   review_by      A press photo from 2019 and a bio that predates the last
--                  record are worse than nothing. Every asset carries a date
--                  it needs looking at again.
--   question_kind  The key from src/lib/questionKinds.ts that this answers.
--                  It is what lets an application form be pre-filled from
--                  here rather than from memory.

CREATE TABLE IF NOT EXISTS artist_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- bio | photo | audio | video | link | document | fact. Deliberately a TEXT
  -- column and not a CHECK constraint: the same reasoning as gig status, where
  -- production rows carry values outside every union the UI offers.
  kind TEXT NOT NULL,
  label TEXT NOT NULL,

  -- The bio itself, or the URL. Which one it is follows from `kind`.
  value TEXT,

  -- Canonical question this answers, e.g. 'bio', 'spotify', 'tech_requirements'.
  question_kind TEXT,

  -- 'short' / 'medium' / 'long' for bios; free text elsewhere. Length is stored
  -- rather than computed so a variant can be picked without loading every body.
  variant TEXT,
  char_count INTEGER,

  -- A press photo without its photographer credit is unusable, and finding that
  -- out at 11pm the night before a deadline is how it usually goes.
  credit TEXT,
  usage_rights TEXT,

  review_by TEXT,          -- ISO date
  source TEXT,             -- where it came from, so it can be refreshed
  notes TEXT,

  sort_order INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artist_assets_kind ON artist_assets(kind);
CREATE INDEX IF NOT EXISTS idx_artist_assets_question ON artist_assets(question_kind);
CREATE INDEX IF NOT EXISTS idx_artist_assets_review ON artist_assets(review_by);
