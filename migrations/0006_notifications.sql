-- Migration: read and dismiss state for notifications.
--
-- There is no `notifications` table here, deliberately. Phase 1 carries only
-- *conditions* — a dead Calendar token, an item gone overdue, a status that
-- contradicts its own note — and a condition is a fact about the present, not
-- an event. Storing one means something has to remember to delete it when it
-- stops being true, and that is exactly how a notification list fills with
-- stale rows nobody trusts.
--
-- So conditions are recomputed on every read, and the only thing that persists
-- is what you have already seen. Reconnect Calendar and the notification is
-- gone on the next read because the generator no longer produces it — nothing
-- had to clean up.
--
-- `dedupe_key` is the identity of a condition, not of a row: 'connection:calendar',
-- 'overdue:gig:14'. The same condition recurring after you dismissed it keeps
-- its key, which is what makes "dismiss" mean "not now" rather than "never" —
-- see `dismissed_at` below.
--
-- Events (a research run finishing, a digest sending) cannot be recovered from
-- current state and will need a real table. That is phase 3.

CREATE TABLE IF NOT EXISTS notification_marks (
  dedupe_key   TEXT PRIMARY KEY,
  -- When this condition was first observed. Drives "2h ago" without needing
  -- an event row, and survives the condition flickering off and on.
  first_seen   TEXT NOT NULL,
  read_at      TEXT,
  -- Dismissal is scoped to a day, not forever: a critical you dismissed while
  -- the cause still holds comes back tomorrow. The generator compares this
  -- date against today rather than treating any value as permanent.
  dismissed_at TEXT
);
