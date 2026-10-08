-- Whether a sync target takes pitches from somebody it does not know.
--
-- A target whose own site says "no unsolicited material" was filed as ready to
-- pitch, and nothing in the app could say otherwise. These columns hold the
-- answer and the evidence for it (shared/syncTerms.ts):
--
--   website              their own site, which the check reads. Null for the
--                        rows filed before this, which fall back to the
--                        contact address's domain.
--   submission_policy    'open' or 'closed'. Null means nobody found a
--                        statement, which is not the same as permission.
--   policy_evidence      the sentence that says so, or what was checked when
--                        nothing was found.
--   policy_url           the page it was read on.
--   policy_checked_at    when somebody or something last read their rules.
--                        Null is "never checked", which the screens treat as
--                        a reason to look rather than a reason to proceed.
--   policy_overridden_at when the artist read a refusal and chose to pitch
--                        anyway. Its own column so that a re-check can never
--                        quietly undo the decision.
--
-- Additive only: six nullable columns the deployed Worker ignores, so the
-- migrate-then-deploy gap is safe. Nothing is backfilled here. The Worker that
-- ships with this reads the sites on its daily tick, and a statement about a
-- company's policy is not something SQL can honestly invent.
ALTER TABLE sync_targets ADD COLUMN website TEXT;
ALTER TABLE sync_targets ADD COLUMN submission_policy TEXT;
ALTER TABLE sync_targets ADD COLUMN policy_evidence TEXT;
ALTER TABLE sync_targets ADD COLUMN policy_url TEXT;
ALTER TABLE sync_targets ADD COLUMN policy_checked_at TEXT;
ALTER TABLE sync_targets ADD COLUMN policy_overridden_at TEXT;
