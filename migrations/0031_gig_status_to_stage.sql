-- Convert every gig written before 0030 to the stored shape 0030 introduced.
--
-- Deploy 2b of the status rename (CLAUDE.md, "Migrations must be additive").
-- 0030 added `outcome` and `flag`, and the Worker shipped with it writes the
-- stage in `status` with those two beside it; rows older than that still say
-- one of the fourteen statuses. This rewrites them into the same shape.
--
-- Safe under the Worker CI leaves deployed while this runs: that Worker is
-- 2a's, and `gigStatusFromStored` (shared/gigStage.ts) reads both vocabularies.
-- It would not have been safe in the same merge as 0030 — deploy 1 reads
-- `closed` as a gig nobody has looked at.
--
-- Each spelling maps exactly as `storedGigState` maps it on write, and
-- test/gigStatusMigration.test.ts runs this file against SQLite and fails if
-- any row reads back differently from how it read before — except `preparing`
-- and `acknowledged`, which 2a already stores as In progress and Applied, and
-- which read back as `shortlisted` and `submitted`, as a row written since 2a
-- already does.
--
-- Three things are deliberately left alone:
--
--   * A value this does not recognise. Status columns are not a closed set,
--     and `normaliseGigStatus` already reads an unknown value as a new gig;
--     rewriting it to `new` would read the same and destroy what it said.
--     NULL likewise.
--   * A row already in the new shape, so running this twice changes nothing.
--   * `updated_at`. Moving a value into a new spelling is not an edit to the
--     row, and bumping it would wake every snooze in the table.
--
-- Matched on lower(trim(status)), the way `normaliseGigStatus` reads it, so a
-- stray capital or space converts rather than being skipped.
UPDATE gig_opportunities
SET
  status = CASE lower(trim(status))
    WHEN 'discovered'     THEN 'new'
    WHEN 'pending_review' THEN 'new'
    WHEN 'shortlisted'    THEN 'in_progress'
    WHEN 'approved'       THEN 'in_progress'
    WHEN 'preparing'      THEN 'in_progress'
    WHEN 'submitted'      THEN 'applied'
    WHEN 'sent'           THEN 'applied'
    WHEN 'acknowledged'   THEN 'applied'
    WHEN 'info_requested' THEN 'applied'
    WHEN 'invited'        THEN 'applied'
    WHEN 'booked'         THEN 'closed'
    WHEN 'declined'       THEN 'closed'
    WHEN 'passed'         THEN 'closed'
    WHEN 'rejected'       THEN 'closed'
    WHEN 'expired'        THEN 'closed'
    WHEN 'withdrawn'      THEN 'closed'
    WHEN 'archived'       THEN 'closed'
  END,
  -- `rejected` was your rejection, not theirs: passed, never not_selected.
  -- `archived` has no outcome — archiving never recorded why.
  outcome = CASE lower(trim(status))
    WHEN 'booked'    THEN 'accepted'
    WHEN 'declined'  THEN 'not_selected'
    WHEN 'passed'    THEN 'passed'
    WHEN 'rejected'  THEN 'passed'
    WHEN 'expired'   THEN 'missed'
    WHEN 'withdrawn' THEN 'withdrawn'
    ELSE NULL
  END,
  flag = CASE lower(trim(status))
    WHEN 'info_requested' THEN 'reply_owed'
    WHEN 'invited'        THEN 'offer_pending'
    ELSE NULL
  END
WHERE lower(trim(status)) IN (
  'discovered', 'pending_review',
  'shortlisted', 'approved', 'preparing',
  'submitted', 'sent', 'acknowledged', 'info_requested', 'invited',
  'booked', 'declined', 'passed', 'rejected', 'expired', 'withdrawn', 'archived'
);
