-- What the owner changed from admin mode, one line each. Platform table. It
-- stores a sentence and never a request body: no address, key or token is in it.
-- Additive: the deployed Worker never names it. Pruned at 365 days on the daily tick.
CREATE TABLE IF NOT EXISTS admin_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_changes_at ON admin_changes (at);
