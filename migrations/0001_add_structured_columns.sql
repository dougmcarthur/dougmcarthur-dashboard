-- Migration: add structured columns to existing tables
-- Apply with: wrangler d1 migrations apply dougmcarthur-music-hq --remote
-- Safe to run: all new columns are nullable with no constraints on existing data.

-- gig_opportunities: new structured columns
ALTER TABLE gig_opportunities ADD COLUMN organizer TEXT;
ALTER TABLE gig_opportunities ADD COLUMN submission_method TEXT;
ALTER TABLE gig_opportunities ADD COLUMN audience_size INTEGER;
ALTER TABLE gig_opportunities ADD COLUMN genre_fit_score INTEGER;
ALTER TABLE gig_opportunities ADD COLUMN fee_amount REAL;
ALTER TABLE gig_opportunities ADD COLUMN fee_currency TEXT DEFAULT 'USD';
ALTER TABLE gig_opportunities ADD COLUMN fit_rationale TEXT;
ALTER TABLE gig_opportunities ADD COLUMN google_event_id TEXT;

-- sync_targets: new structured columns
ALTER TABLE sync_targets ADD COLUMN agency_type TEXT;
ALTER TABLE sync_targets ADD COLUMN contact_role TEXT;
ALTER TABLE sync_targets ADD COLUMN confirmation_method TEXT;

-- New reminders table for approval automation follow-up
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  reminder_type TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL
);
