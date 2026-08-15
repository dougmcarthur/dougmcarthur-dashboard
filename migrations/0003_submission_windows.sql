-- Migration: submission windows + prepared application answers
-- Apply with: wrangler d1 migrations apply dougmcarthur-music-hq --remote
-- Safe to run: all new columns are nullable (or defaulted) with no constraints
-- on existing rows.

-- gig_opportunities: when the submission window opens/closes, and where the
-- application form lives. `deadline` stays the "act by" date shown everywhere;
-- submission_closes_at is only set when a festival publishes a close date that
-- differs from the deadline we track.
ALTER TABLE gig_opportunities ADD COLUMN submission_opens_at TEXT;
ALTER TABLE gig_opportunities ADD COLUMN submission_closes_at TEXT;
ALTER TABLE gig_opportunities ADD COLUMN window_note TEXT;
ALTER TABLE gig_opportunities ADD COLUMN application_url TEXT;
ALTER TABLE gig_opportunities ADD COLUMN login_required INTEGER DEFAULT 0;

-- Application-prep bookkeeping.
-- prep_status: none | queued | ready | blocked | failed
ALTER TABLE gig_opportunities ADD COLUMN prep_status TEXT DEFAULT 'none';
ALTER TABLE gig_opportunities ADD COLUMN prep_error TEXT;
ALTER TABLE gig_opportunities ADD COLUMN prep_updated_at TEXT;
ALTER TABLE gig_opportunities ADD COLUMN form_title TEXT;

-- One row per field on the real application form, so answers can be reviewed
-- and edited field-by-field before the window opens.
CREATE TABLE IF NOT EXISTS application_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gig_id INTEGER NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text | textarea | select | radio | checkbox | file | email | url | number | date
  options TEXT,                            -- JSON array of choices for select/radio/checkbox
  required INTEGER DEFAULT 0,
  max_length INTEGER,
  help_text TEXT,
  position INTEGER DEFAULT 0,
  draft_answer TEXT,                       -- what the system prepared
  answer TEXT,                             -- Doug's edited version (wins over draft)
  answer_source TEXT,                      -- llm | profile | manual
  confidence TEXT,                         -- high | medium | low
  needs_input INTEGER DEFAULT 0,           -- can't be answered from the profile (uploads, fees, dates)
  note TEXT,                               -- why it needs input / what was assumed
  approved INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_application_fields_gig_key
  ON application_fields (gig_id, field_key);
CREATE INDEX IF NOT EXISTS idx_application_fields_gig
  ON application_fields (gig_id, position);

-- reminders: delivery bookkeeping so the cron can send email and not resend.
ALTER TABLE reminders ADD COLUMN channel TEXT DEFAULT 'email';
ALTER TABLE reminders ADD COLUMN subject TEXT;
ALTER TABLE reminders ADD COLUMN body TEXT;
ALTER TABLE reminders ADD COLUMN sent_at TEXT;
ALTER TABLE reminders ADD COLUMN error TEXT;

CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON reminders (status, scheduled_for);
