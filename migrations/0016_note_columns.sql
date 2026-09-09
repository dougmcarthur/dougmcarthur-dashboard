-- 0016: the two facts a note carries that had nowhere to go.
--
-- Migration 0001 added nine structured columns and none was ever filled;
-- `shared/reviewParse.ts` has re-derived them out of prose on every read ever
-- since. Most of what it finds already has a column — `submission_method`,
-- `fee_amount` and `fee_currency` from 0001, `location` from 0013 — and the
-- backfill fills those. These two had none.
--
-- The rest of what the parser finds stays derived, on purpose. `requirements`,
-- `dealTerms`, `provenance` and the drafted field values are rendered and
-- nothing else; a JSON copy of them would be a cache of the parser wearing a
-- schema's clothes, with a staleness bug the read-time version cannot have.
--
-- Additive, and read by nothing in the currently-live Worker, so the gap
-- between the migrate step and the deploy is uneventful.

-- not_submitted | submitted. Null where the note does not say — `unknown` is
-- the absence of a claim, and a column holding that word reads as a finding.
--
-- This is the fact `status` keeps getting wrong: three gigs have said
-- `submitted` while their own note said the opposite, which is why the queue
-- raises a conflict rather than trusting either side.
ALTER TABLE gig_opportunities ADD COLUMN submission_state TEXT;

-- Things waiting on you, as a JSON array of the parser's own sentences.
-- A list rather than a flag because "needs Doug, not on file" and "left blank
-- for Doug to pick" are different jobs, and the Review screen names them.
ALTER TABLE gig_opportunities ADD COLUMN blocked_on TEXT;
