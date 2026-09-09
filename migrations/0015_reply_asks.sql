-- 0015: what the organiser asked for, recognised while the body is in hand.
--
-- `gig_replies` keeps a 400-character snippet, not the email. That is enough
-- to show a reply and never enough to answer one: an ask can sit three
-- paragraphs down. `classifyReply` already had this problem and solved it the
-- same way — it stores the deciding sentence verbatim rather than re-deriving
-- it later.
--
-- So the asks are read at scan time, when the whole body is there, and stored
-- beside the evidence. Composing the draft still happens on read, against the
-- artist database as it is then: an answer missing in March and on file in
-- April should appear without a re-scan.
--
-- Additive. Rows stored before this carry null and are re-read from the
-- snippet, marked approximate — the same treatment a deadline recovered from
-- prose gets.

-- JSON array of {id, label, questionKind, attachment, evidence}.
ALTER TABLE gig_replies ADD COLUMN asks TEXT;

-- Sentences that asked for something outside the vocabulary, as a JSON array.
-- Kept apart from `asks` on purpose: an ask this app does not know is exactly
-- the one that must not look handled.
ALTER TABLE gig_replies ADD COLUMN unrecognised_asks TEXT;
