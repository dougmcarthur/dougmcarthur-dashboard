-- One row per read of an external data source, so the owner can see when a page
-- went quiet instead of only that it is quiet now. Platform table, not scoped:
-- a source belongs to nobody. Additive: the deployed Worker never names it.
-- Kept to the newest 60 per source and 90 days, pruned on the daily tick.

CREATE TABLE IF NOT EXISTS catalog_source_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  read_at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  items INTEGER NOT NULL DEFAULT 0,
  added INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS catalog_source_reads_source ON catalog_source_reads (source_id, read_at);
