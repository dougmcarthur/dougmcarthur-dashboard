-- Migration: separate the gig deadline into a date, a qualifier, and a window.
--
-- `deadline` is TEXT and 26 of 34 production rows hold prose in it —
-- "None — rolling artist roster intake", "Submission window: September 1 –
-- December 31, 2026", "TBD — submit now via contact form". Everything that
-- treats it as a date degrades quietly: the Overview's BETWEEN query can never
-- match those rows, daysUntil() returns NaN, and PATCH /api/gigs hands the raw
-- string to Google Calendar.
--
-- After this migration:
--   deadline       ISO date only (YYYY-MM-DD), or NULL when there genuinely is none
--   deadline_note  the qualifier the prose carried ("rolling intake", "TBD")
--   opens_at       ISO date a submission window opens, distinct from its close
--
-- The ALTERs are additive and safe on live data. They do NOT clean `deadline`
-- itself — scripts/backfill-deadlines.ts does that, separately and reversibly,
-- so a bad extraction can be reviewed before it is applied.

ALTER TABLE gig_opportunities ADD COLUMN deadline_note TEXT;
ALTER TABLE gig_opportunities ADD COLUMN opens_at TEXT;
