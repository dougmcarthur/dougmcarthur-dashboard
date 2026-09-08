-- 0014: where each opportunity actually is, and what kind of appearance it is.
--
-- Migration 0013 added the columns; every one of the 34 production rows landed
-- with them null, so nothing could cost a trip and the P-2 rule had nothing to
-- fire on. This reads the answer out of the prose each row already carries.
--
-- Data, not schema, and additive in the sense that matters: it fills nulls and
-- the live Worker reads the result fine. Every statement is guarded on the
-- column still being null, so a value set by hand between the merge and the
-- deploy is not clobbered, and re-running writes nothing.
--
-- Matched on id rather than name: these are this database's rows, read back
-- from it, and a LIKE on a festival name is a way to update the wrong one.

-- Canada. Every row whose note names a Canadian city, province or circuit.
UPDATE gig_opportunities SET country = 'CA' WHERE country IS NULL AND id IN (
  1,  -- Home Routes — Winnipeg-headquartered national circuit
  2,  -- CMI Live — Canada-wide
  3,  -- The Listening Room — Lac du Bonnet, MB
  6,  -- Winnipeg Folk Festival — Birds Hill Park, MB
  7,  -- Mariposa Folk Festival — Orillia, ON
  8,  -- Edmonton Folk Music Festival — AB
  9,  -- Canadian Folk Music Awards
  10, -- Sofar Sounds Winnipeg
  11, -- HomeDitty — hosts across Canada
  12, -- West End Cultural Centre — Winnipeg
  15, -- Canmore Folk Music Festival — AB
  16, -- Folk Canada Conference
  18, -- Come Together 2026 — Toronto, ON
  19, -- New Music Night, Park Alleys — Winnipeg
  22, -- Ness Creek Music Festival — Big River, SK
  23, -- Stan Rogers Folk Festival — Canso, NS
  24, -- Dawson City Music Festival — YT
  25, -- Mission Folk Music Festival — BC
  26, -- Salmon Arm Roots & Blues — BC
  27, -- Dawson City songwriter residency — YT
  28, -- Roots North — Orillia, ON
  29, -- Deep Roots — Wolfville, NS
  30, -- Summerfolk — Owen Sound, ON
  31, -- Sawdust City — Gravenhurst, ON
  34, -- M for Montreal — QC
  35, -- Trout Forest — Ear Falls, ON
  37  -- Northern Lights Festival Boréal — Sudbury, ON
);

-- The United States. These are the four the visa rule exists for.
UPDATE gig_opportunities SET country = 'US' WHERE country IS NULL AND id IN (
  5,  -- West Coast Songwriters — California
  14, -- SXSW — Austin, TX
  20, -- Kerrville Folk Festival — Kerrville, TX
  36  -- Rocky Mountain Folks Festival — Lyons, CO
);

-- Manchester, and the only row outside North America. `other` is honest here:
-- `visaFor` returns "check this one by hand" rather than pretending to know
-- the UK's rules, which nothing in this repo encodes.
UPDATE gig_opportunities SET country = 'other' WHERE country IS NULL AND id = 33;

-- Not set, deliberately, and these are the two worth naming:
--   17  Listening Room Network — a US-based network booking rooms across North
--       America. The organisation's country is not the performance's country,
--       and this column means the second one.
--   32  International Songwriting Competition — a recording is submitted and
--       nobody travels. There is no performance to place.

-- Where the US rows are, so the travel band is banded rather than guessed off
-- the country alone. Row 5's note names no city, so it keeps the fallback.
UPDATE gig_opportunities SET location = 'Austin, TX'    WHERE location IS NULL AND id = 14;
UPDATE gig_opportunities SET location = 'Kerrville, TX' WHERE location IS NULL AND id = 20;
UPDATE gig_opportunities SET location = 'Lyons, CO'     WHERE location IS NULL AND id = 36;

-- Paid bookings — each of these three says so in its own note: "paid
-- performance slots", "two paid opportunities", "receives an honorarium".
UPDATE gig_opportunities SET performance_kind = 'paid' WHERE performance_kind IS NULL AND id IN (
  2,  -- CMI Live
  12, -- West End Cultural Centre
  19  -- New Music Night
);

-- Showcases and conference appearances: a stage in front of delegates, with no
-- fee attached to standing on it.
UPDATE gig_opportunities SET performance_kind = 'showcase' WHERE performance_kind IS NULL AND id IN (
  5,  -- West Coast Songwriters — a Featured Showcase slot at their conference
  16, -- Folk Canada Conference — showcase streams
  18, -- Come Together — industry showcase
  20, -- Kerrville New Folk — finalists play the New Folk stage
  33, -- English Folk Expo — the Folk Canada Showcase
  34, -- M for Montreal — the Groover Showcase
  36  -- Rocky Mountain Folks — the Songwriter Showcase competition
);

-- Row 14, SXSW, is left null on purpose, and it is the one row where that is a
-- decision rather than an omission. SXSW pays showcasing artists a fee or
-- offers a wristband instead, and which of those you accept is what decides
-- whether the appearance needs a P-2 — so the answer is not in this row and
-- guessing the cheap one is exactly what `visaFor` refuses to do. Null keeps
-- the ninety days and makes the queue ask.
