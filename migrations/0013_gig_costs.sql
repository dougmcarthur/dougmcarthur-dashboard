-- 0013: what a trip costs, and the paperwork that gates it.
--
-- Step F of docs/gig-pipeline-plan.md, cost half. Money is the one thing in
-- the weighing model that is genuinely measurable, and none of it could be
-- measured: a gig row said what it was and when it closed, never where it is
-- or how long you would be there.
--
-- Additive only, so the currently-live Worker reads this schema fine during
-- the gap between the migrate step and the deploy step.

-- Where it is, as prose ("Whitehorse, YT"), because that is how the research
-- agents write it and a code they would have to be taught is a code they
-- will get wrong.
ALTER TABLE gig_opportunities ADD COLUMN location TEXT;

-- CA | US | other. Separate from `location` because the visa rule turns on
-- this one fact and nothing else, and grepping a prose field for "USA" on
-- every read is how the deadline column got into the state it is in.
ALTER TABLE gig_opportunities ADD COLUMN country TEXT;

-- drive | regional | transcontinental | international. Set by hand; when it
-- is null `inferTravelBand` guesses from `location` and says that it guessed.
ALTER TABLE gig_opportunities ADD COLUMN travel_band TEXT;

-- none | standard | major, per night.
ALTER TABLE gig_opportunities ADD COLUMN lodging_tier TEXT;

-- Nights away. 0 is a real answer (a drive there and back); null is not.
ALTER TABLE gig_opportunities ADD COLUMN nights INTEGER;

-- showcase | paid. The single fact that decides whether a US date needs a
-- P-2 (about $800 CAD and ninety days) or a B-1 (nothing). Nullable, and
-- treated as an open question rather than as "showcase", because guessing
-- the cheap answer is how you find out about the ninety days in month three.
ALTER TABLE gig_opportunities ADD COLUMN performance_kind TEXT;

-- What they pay you, CAD. Both nullable and both distinct from `fee_amount`,
-- which is what *you* pay *them* to be considered.
ALTER TABLE gig_opportunities ADD COLUMN stipend_amount REAL;
ALTER TABLE gig_opportunities ADD COLUMN guarantee_amount REAL;
