-- Migration: add pitch reconciliation columns to sync_targets
ALTER TABLE sync_targets ADD COLUMN pitch_sent TEXT;
ALTER TABLE sync_targets ADD COLUMN reconciled_at TEXT;
