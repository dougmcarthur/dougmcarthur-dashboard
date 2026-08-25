-- Migration: let a row say "not now, ask me again in September".
--
-- Nothing in the schema could express deferral, so the only moves available on
-- an opportunity were act or ignore — which is why sixteen no-deadline rows
-- sit in permanent limbo. `snoozed_until` gives the queue a reason to drop an
-- item and a date to bring it back on its own.
--
-- `snoozed_at` records when the snooze was set, and exists for one rule: a
-- snooze should not outlive the facts it was set against. If a research run
-- changes a snoozed row — a deadline appears, a fee is added — `updated_at`
-- moves past `snoozed_at` and buildReviewQueue() wakes it immediately rather
-- than honouring a date chosen against different information.
--
-- Both nullable, both additive. A row with no snooze behaves exactly as before.

ALTER TABLE gig_opportunities ADD COLUMN snoozed_until TEXT;
ALTER TABLE gig_opportunities ADD COLUMN snoozed_at TEXT;

ALTER TABLE sync_targets ADD COLUMN snoozed_until TEXT;
ALTER TABLE sync_targets ADD COLUMN snoozed_at TEXT;
