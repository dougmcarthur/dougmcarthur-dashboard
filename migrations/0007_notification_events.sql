-- Migration: notifications that are events rather than conditions.
--
-- Migration 0006 deliberately stored no notifications, because everything it
-- carried was a *condition* — a fact about the present, recomputed on every
-- read, which disappears on its own when it stops being true.
--
-- Events are the other half and they cannot work that way. A research run
-- finishing, a digest going out: those happened at a moment and are not
-- recoverable from current state. Nothing about the database tomorrow tells you
-- a run added three rows yesterday, so if it is not written down when it
-- happens it is gone.
--
-- The two halves are merged by the API and the client never learns there were
-- two mechanisms. What it buys is that neither is forced into the other's
-- shape: conditions never go stale, and events are never invented.
--
-- `dedupe_key` is nullable here but unique when set, so a writer that might
-- fire twice for the same happening (a retried cron, a double-clicked send)
-- can make that safe without every writer having to care.

CREATE TABLE IF NOT EXISTS notification_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,      -- 'automation' | 'digest' | 'reconcile'
  tier        TEXT NOT NULL,      -- 'critical' | 'attention' | 'info'
  title       TEXT NOT NULL,
  body        TEXT,
  href        TEXT,
  action_label TEXT,
  -- Set only where a writer needs at-most-once. NULL rows are always inserted.
  dedupe_key  TEXT,
  created_at  TEXT NOT NULL,
  read_at     TEXT,
  dismissed_at TEXT
);

-- Reading the feed is "newest first, not dismissed", every minute the tab is
-- open, so it is the one query worth an index.
CREATE INDEX IF NOT EXISTS idx_notification_events_created
  ON notification_events (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_events_dedupe
  ON notification_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
