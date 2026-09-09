-- A Google authorisation the person granted in the browser, rather than one
-- pasted into a Worker secret by hand.
--
-- Every Google token this app has held so far arrived the same way: obtained
-- once at a terminal and stored with `wrangler secret put`. That works for a
-- deployment with one owner and does not work at all for a feature where the
-- *user* decides whether to connect — consent has to happen in their browser,
-- and what comes back has to be stored somewhere the Worker can reach at
-- runtime. Secrets cannot be written at runtime; this table can.
--
-- One row per scope family, so the read-only mail scan and the drafting grant
-- stay separable: revoking the ability to write drafts must not also blind
-- the reply matcher.
CREATE TABLE IF NOT EXISTS google_grants (
  -- 'gmail.compose' today. Named for what it buys rather than for the literal
  -- scope string, so a scope that gets renamed upstream does not orphan a row.
  purpose TEXT PRIMARY KEY,
  -- AES-GCM, with the key from a Worker secret. D1 holds a lot of ordinary
  -- prose and one refresh token; the token is the only thing in here that is
  -- a credential somewhere else, so it is the one thing not stored in clear.
  refresh_token TEXT NOT NULL,
  -- Which account this is, so the screen can say whose mailbox it will write
  -- to. Connecting the wrong Google account is an easy mistake and an
  -- invisible one until drafts appear somewhere unexpected.
  account_email TEXT,
  -- Exactly what was consented to, verbatim from Google's response. Google
  -- may grant less than was asked for, and a grant that quietly lacks the
  -- scope it needs should be readable here rather than inferred from a 403.
  scopes TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  last_used_at TEXT
);
