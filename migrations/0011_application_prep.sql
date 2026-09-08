-- Phase 3 of the pipeline: apply & track.
--
-- `preparing` has existed as a status since 0008 without anything behind it,
-- so "I said I'd apply" and "the application is half-written" were the same
-- row wearing different words. This is the table that makes the second one
-- real: the fields an application actually asks for, and the answer staged
-- against each from the artist database.
--
-- Two decisions worth stating, because both are load-bearing:
--
--   * A staged answer is a draft, never a submission. Nothing here is ever
--     POSTed to an organiser — an application filed by automation is a good
--     way to be blacklisted, and the output is a copy-paste block per field.
--
--   * `answer_state` is separate from `answer` for the same reason
--     `unreviewed` is separate from `overdue` in the artist database: a
--     suggestion nobody has read is not the same as an answer you approved,
--     and a screen that counts them together reports an application as ready
--     when nothing in it has been looked at.
--
-- Additive, as every migration here has to be: CI migrates before it deploys,
-- so for half a minute this schema runs under the Worker already live. A new
-- table is invisible to it and the four new columns are nullable.

CREATE TABLE IF NOT EXISTS application_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gig_id INTEGER NOT NULL,

  -- The form's own name for the field (`entry.123456` on a Google Form). What
  -- makes a re-read of the same form an update rather than a second copy.
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,

  -- text | textarea | email | url | number | date | select | radio | checkbox
  -- | file. TEXT rather than a CHECK for the same reason status is: a parser
  -- reading somebody else's HTML will meet things this list does not have.
  field_type TEXT NOT NULL DEFAULT 'text',
  options TEXT,                    -- JSON array for select/radio/checkbox
  required INTEGER DEFAULT 0,
  max_length INTEGER,
  help_text TEXT,
  position INTEGER DEFAULT 0,

  -- The canonical question this is, from shared/questionKinds.ts. Null when
  -- nothing matched, which is a real answer: it means this one needs you.
  question_kind TEXT,

  answer TEXT,
  -- Which asset the answer came from, so a bio that changes underneath can be
  -- noticed. Null on anything typed by hand.
  answer_asset_id INTEGER,
  -- empty | suggested | edited | approved. See shared/application.ts.
  answer_state TEXT NOT NULL DEFAULT 'empty',

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_application_fields_gig ON application_fields(gig_id);

-- One row per field per gig. Re-reading a form updates what is there instead
-- of dealing a second copy of every question beside the answers you staged.
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_fields_key
  ON application_fields(gig_id, field_key);

-- Where the form lives, when that is not the same URL as the listing. The
-- research agents fill `url` with whatever page they found the opportunity on,
-- which is often an announcement rather than the form itself.
ALTER TABLE gig_opportunities ADD COLUMN application_url TEXT;

-- unread | ready | blocked | failed. Whether the form has been read, and if
-- not, why — a login wall is a fact about the opportunity worth keeping, not
-- an error to retry.
ALTER TABLE gig_opportunities ADD COLUMN prep_status TEXT;
ALTER TABLE gig_opportunities ADD COLUMN prep_checked_at TEXT;
-- The reason, in a sentence, for the screen to show verbatim.
ALTER TABLE gig_opportunities ADD COLUMN prep_note TEXT;
