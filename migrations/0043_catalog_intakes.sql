-- A programme that comes round again.
--
-- One catalog entry is one programme, keyed by its address, and until now held
-- the first deadline it was filed with for good. The deadline column can now
-- move forward when the programme's next intake is seen (shared/intakes.ts), and
-- two columns say when:
--
--   reopened_at       when the deadline last moved forward. Null on every entry
--                     that never has. A new intake is a new arrival, so it waits
--                     out the same holding period `first_seen_at` does before it
--                     reaches anybody's list, and the owner can block it in the
--                     same window.
--   intake_checked_at when somebody last looked for a next intake on the
--                     programme's own page. Null is never looked. It is its own
--                     column because `checked_at` means "confirmed it still
--                     stands", which a read that found nothing does not say.
--
-- Additive, both nullable: the deployed Worker selects named columns and never
-- names these, so it runs unchanged against this schema.

ALTER TABLE opportunities ADD COLUMN reopened_at TEXT;
ALTER TABLE opportunities ADD COLUMN intake_checked_at TEXT;
