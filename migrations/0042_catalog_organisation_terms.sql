-- What a sync organisation's own site says about being pitched, kept on the
-- shared catalog entry so a new account can be shown who takes submissions.
--
-- Until now these facts lived only on one artist's `sync_targets` row, which
-- is right for a pitch you are about to send and no use for somebody who has
-- just arrived and has no rows at all. They are facts about the organisation,
-- not about anybody's relationship to it, so they belong with the listing
-- facts and hold nothing an artist decided.
--
--   site                  the organisation's public website, as the owner's
--                         research filed it. Never an artist's own address
--                         for somebody else's company.
--   submission_policy     'open' or 'closed', from its own site, or null when
--                         nobody has found a statement either way. Null is
--                         never a green light.
--   policy_evidence       the sentence that said so, or what a read did when
--                         it found nothing.
--   policy_url            the page that sentence was on.
--   policy_checked_at     when its site was last read for this.
--   exclusivity           'non_exclusive' or 'exclusive', from its own site,
--                         or null when nothing was found. "No exclusivity
--                         clause" is shown only for a stated non-exclusive
--                         term with its sentence, never for silence.
--   exclusivity_evidence  the sentence, with the page it came from in
--                         exclusivity_url.
--   terms_read_at         when exclusivity was last looked for. Its own column
--                         because a read that found nothing leaves
--                         `exclusivity` null, and "never looked" and "looked
--                         and found nothing" are different states.
--
-- Additive, every one nullable: the deployed Worker selects named columns and
-- never names these, so it runs unchanged against this schema.

ALTER TABLE opportunities ADD COLUMN site TEXT;
ALTER TABLE opportunities ADD COLUMN submission_policy TEXT;
ALTER TABLE opportunities ADD COLUMN policy_evidence TEXT;
ALTER TABLE opportunities ADD COLUMN policy_url TEXT;
ALTER TABLE opportunities ADD COLUMN policy_checked_at TEXT;
ALTER TABLE opportunities ADD COLUMN exclusivity TEXT;
ALTER TABLE opportunities ADD COLUMN exclusivity_evidence TEXT;
ALTER TABLE opportunities ADD COLUMN exclusivity_url TEXT;
ALTER TABLE opportunities ADD COLUMN terms_read_at TEXT;
