-- Phase 4 of the pipeline: reading the organiser's answer.
--
-- Four states have existed since migration 0008 that nothing could ever
-- reach — `acknowledged`, `info_requested`, `invited` and `declined` are all
-- claims only a reply can justify, and until now nothing read received mail.
-- `submissionSilence` measured the wait honestly; it could not end it.
--
-- Two tables, and the second is the more interesting one.
--
-- `gig_replies` is what was found and how it was read. Every row is a
-- *proposal*: classification never transitions a gig on its own, because a
-- wrong auto-transition here tells you that you were rejected when you were
-- not. `evidence` holds the organiser's own sentence so the proposal can be
-- agreed with rather than trusted.
--
-- `gig_correspondents` is the answer to the problem that makes this hard.
-- Replies almost never come from the festival's domain — of eight real ones in
-- this mailbox, exactly one did. They arrive from Wufoo, Jotform, Squarespace,
-- a portal, a parent organisation, or somebody's gmail. So a match is worked
-- out from the event's name in the subject or body, and once you confirm it,
-- the address and thread are written here and never have to be worked out
-- again. One judgement, permanently.
--
-- Additive, as every migration here has to be: CI migrates before it deploys,
-- so for half a minute this schema runs under the Worker already live.

CREATE TABLE IF NOT EXISTS gig_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Gmail's ids. The message id is what makes a re-scan an update rather than
  -- a second copy of every reply already dealt with.
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,

  -- Null while nothing convincing matched, or while two gigs matched equally
  -- well. An unmatched reply is still worth keeping: it is the one the app
  -- could not explain, and that is a fact about the matcher.
  gig_id INTEGER,

  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  snippet TEXT,
  received_at TEXT NOT NULL,
  -- 1 when Gmail had filed it as spam. A rejection in the spam folder is
  -- exactly the silence this phase exists to break, so it is read — and said.
  in_spam INTEGER DEFAULT 0,

  -- acknowledged | declined | invited | info_requested | unclear
  classification TEXT NOT NULL DEFAULT 'unclear',
  class_confidence TEXT,
  -- The organiser's sentence, verbatim. Never a paraphrase.
  evidence TEXT,
  -- The status this reading would move the row to. Null for `unclear`.
  proposed_status TEXT,

  -- How the gig was arrived at, kept so a bad match can be argued with.
  match_score INTEGER DEFAULT 0,
  match_signals TEXT,               -- JSON array
  match_ambiguous INTEGER DEFAULT 0,

  -- null | accepted | dismissed. Set when a person answers the proposal.
  resolution TEXT,
  resolved_at TEXT,

  created_at TEXT NOT NULL
);

-- One row per Gmail message. A re-scan updates what is here rather than
-- dealing a second copy of a reply already resolved.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_replies_message
  ON gig_replies(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_gig_replies_gig ON gig_replies(gig_id);
CREATE INDEX IF NOT EXISTS idx_gig_replies_unresolved ON gig_replies(resolution, received_at);

-- Who writes about which opportunity, learned by confirmation.
CREATE TABLE IF NOT EXISTS gig_correspondents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gig_id INTEGER NOT NULL,
  -- 'address' | 'thread'
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- An address or a thread belongs to one gig. Confirming it elsewhere replaces
-- the binding rather than creating a second, contradictory one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_correspondents_value
  ON gig_correspondents(kind, value);
CREATE INDEX IF NOT EXISTS idx_gig_correspondents_gig ON gig_correspondents(gig_id);
