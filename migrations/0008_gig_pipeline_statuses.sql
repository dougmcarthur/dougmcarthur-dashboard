-- Migration: rename the gig statuses so they say who decided.
--
-- `approved` was the problem. It meant "I will apply", but it reads as
-- "this is booked" — and the app agreed with the misreading, putting a 🎵
-- calendar event on the submission deadline the moment you approved.
--
-- `rejected` was worse in a quieter way: it meant *you* passed, while every
-- reader assumes it means *they* turned you down. The new vocabulary splits
-- your decisions (shortlisted / passed) from theirs (invited / declined) so
-- the subject of the verb is never in doubt. See docs/gig-pipeline-plan.md.
--
-- `legacy_status` keeps the pre-rename value on every row that had one. This
-- is not belt-and-braces: the mapping below is a judgement about what someone
-- meant months ago, and if `passed` turns out to be the wrong reading of a
-- particular `rejected` row, the original is still there to argue with.

ALTER TABLE gig_opportunities ADD COLUMN legacy_status TEXT;

UPDATE gig_opportunities SET legacy_status = status
 WHERE status IN ('pending_review', 'approved', 'rejected', 'sent');

UPDATE gig_opportunities SET status = 'discovered'  WHERE status = 'pending_review';
UPDATE gig_opportunities SET status = 'shortlisted' WHERE status = 'approved';
-- Deliberately `passed`, never `declined`: this was your decision, not theirs.
UPDATE gig_opportunities SET status = 'passed'      WHERE status = 'rejected';
UPDATE gig_opportunities SET status = 'submitted'   WHERE status = 'sent';

-- When you will actually be on stage, which nothing has ever recorded because
-- until now the app had no state that meant "booked". Null everywhere until
-- something reaches that state; a calendar event for a performance cannot be
-- written without it.
ALTER TABLE gig_opportunities ADD COLUMN performance_start TEXT;
ALTER TABLE gig_opportunities ADD COLUMN performance_end   TEXT;

-- Calendar entries are no longer one-per-gig. An opportunity can carry a
-- "window opens" reminder, an "apply by" reminder and — only once booked — a
-- real performance event, and each has to be created and deleted separately.
ALTER TABLE gig_opportunities ADD COLUMN opens_event_id TEXT;
ALTER TABLE gig_opportunities ADD COLUMN show_event_id  TEXT;
-- `google_event_id` keeps its meaning narrowed to the deadline reminder.

CREATE INDEX IF NOT EXISTS idx_gig_status ON gig_opportunities (status);
