-- A gig's stage, stored the way the screens show it.
--
-- Deploy 2a of the status rename (CLAUDE.md, "Migrations must be additive").
-- Deploy 1 put four stages on screen over fourteen stored statuses; this lets
-- storage hold the same shape: `status` carries the stage (new, in_progress,
-- applied, closed), OUTCOME says how a closed gig ended (accepted,
-- not_selected, passed, missed, withdrawn — null for a row archived without
-- saying why), and FLAG marks an Applied gig where the ball is back with you
-- (reply_owed, offer_pending).
--
-- Additive only: two nullable columns, which the deployed Worker ignores.
-- Nothing is rewritten here. The Worker that ships with this reads both
-- vocabularies (src/db/gigRows.ts) and writes the new one; existing rows are
-- converted by a later migration, once that Worker is the one deployed — run
-- now, the conversion would put `closed` in front of a Worker that reads it as
-- a gig nobody has looked at.
ALTER TABLE gig_opportunities ADD COLUMN outcome TEXT;
ALTER TABLE gig_opportunities ADD COLUMN flag TEXT;
