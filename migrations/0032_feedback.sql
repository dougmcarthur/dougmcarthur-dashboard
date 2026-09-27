-- Feedback an artist sends from inside the app, read by the owner in admin mode.
--
-- A platform table, not one of the sixteen scoped ones: it is a message
-- addressed to whoever runs Scout, not the artist's work, and the oversight
-- surface is where it is read. `tenant_id` says who sent it so tenant removal
-- can delete it by name, the way it deletes `agent_tokens` and `epk_shares`.
--
-- `context` is JSON the browser assembled and showed the sender before it
-- went: the page, the section, recent errors, the build. It is shown, not
-- hidden, because feedback that quietly carries more than the sender saw is
-- telemetry wearing a form.
--
-- Additive: the deployed Worker neither reads nor writes it.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created_at);
CREATE INDEX IF NOT EXISTS feedback_tenant_created ON feedback (tenant_id, created_at);
