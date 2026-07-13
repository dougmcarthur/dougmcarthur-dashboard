-- Live schema for D1 database "dougmcarthur-music-hq"
-- (database_id 515d234f-92c3-4519-abc3-3d453a1b5058), pulled directly from
-- sqlite_master via the Cloudflare API. This is the CURRENT production
-- schema, not the target schema — see the rebuild spec for the planned
-- structured-column redesign.

CREATE TABLE gig_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  deadline TEXT,
  fee TEXT,
  paid INTEGER DEFAULT 0,
  fit_notes TEXT,
  url TEXT,
  status TEXT DEFAULT 'pending_review',
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE promo_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  created_at TEXT NOT NULL
);

CREATE TABLE reference_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_email TEXT,
  notes TEXT,
  pitch_draft TEXT,
  status TEXT DEFAULT 'draft_ready',
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  run_at TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  items_added INTEGER DEFAULT 0
);
