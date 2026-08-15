-- Migration: reusable answer library
-- Apply with: wrangler d1 migrations apply dougmcarthur-music-hq --remote
--
-- Applications ask the same questions in different words. Answers approved on
-- one application are stored here by canonical question kind and reused on the
-- next, so prep starts from what's already been through review.

CREATE TABLE IF NOT EXISTS answer_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_key TEXT NOT NULL,   -- canonical kind, e.g. 'bio', 'why_this_event'
  label TEXT NOT NULL,
  category TEXT NOT NULL,       -- identity | links | story | pitch | logistics
  content TEXT NOT NULL,
  max_length INTEGER,           -- the length this variant is written for (null = longest)
  notes TEXT,                   -- when to use this one
  pinned INTEGER DEFAULT 0,     -- never auto-update from an approval
  usage_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  source_gig_id INTEGER,        -- where it was first approved
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- One entry per question kind and length variant. ifnull() so the "longest
-- version" rows (null max_length) still collide as duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_library_variant
  ON answer_library (question_key, ifnull(max_length, 0));

CREATE INDEX IF NOT EXISTS idx_answer_library_category
  ON answer_library (category, question_key);

-- Which kind a prepared field was recognised as, and which library entry (if
-- any) filled it — so drift between the two can be surfaced for review.
ALTER TABLE application_fields ADD COLUMN question_kind TEXT;
ALTER TABLE application_fields ADD COLUMN library_id INTEGER;
