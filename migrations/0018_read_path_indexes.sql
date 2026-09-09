-- Indexes for the three scans on the hot read path.
--
-- `composeFeed` and `buildReviewQueue` both open with the same three
-- unbounded reads — every gig, every sync target, every promo draft, each
-- ordered newest-first — and the bell polls the first of them on a timer.
-- None of those orderings had an index, so `EXPLAIN QUERY PLAN` on
-- production answered:
--
--     SCAN gig_opportunities
--     USE TEMP B-TREE FOR ORDER BY
--
-- which is why that query reports **68 rows read to return 34**. The scan
-- and the sort are counted separately, and D1's free tier bills rows read.
--
-- The doubling is not the reason to care. The reason is what happens when
-- these tables stop being one artist's: `WHERE tenant_id = ?` against an
-- unindexed table scans *everybody's* rows to render one person's page, and
-- the read cost goes from "twice what you needed" to "times the number of
-- artists". Adding the index later is a bigger conversation than adding it
-- now, so the shape is put in before it is load-bearing.
--
-- **When `tenant_id` arrives, every index below becomes a composite with
-- `tenant_id` first.** An index that does not lead with the column the WHERE
-- clause filters on is an index the planner will decline to use.
--
-- Additive in the sense CLAUDE.md requires: an index changes no value any
-- statement returns, so the currently-live Worker reads the same rows in the
-- same order across the gap between migrate and deploy. It only changes how
-- many rows are touched getting there.

-- The three ordered scans.
CREATE INDEX IF NOT EXISTS idx_gig_discovered ON gig_opportunities(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_discovered ON sync_targets(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_created ON promo_drafts(created_at DESC);

-- The run log's own ordering. `GET /api/task-runs` pages by `run_at DESC`,
-- and its two facet queries (`selectDistinct` over task and status) read the
-- whole table by design — they have to, or choosing one task would remove
-- every other task from the menu that chose it. That is fine at 18 rows and
-- is the one table here that grows without a ceiling, so the index is worth
-- having before the log is long rather than after.
CREATE INDEX IF NOT EXISTS idx_task_runs_run_at ON task_runs(run_at DESC);

-- Reminders, on both the shapes that read them: the orphan check in
-- `composeFeed` (entity_type + entity_id, which is also the pair the Overview
-- joins on) and the due-reminder lookup (status + scheduled_for).
CREATE INDEX IF NOT EXISTS idx_reminders_entity ON reminders(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, scheduled_for);
