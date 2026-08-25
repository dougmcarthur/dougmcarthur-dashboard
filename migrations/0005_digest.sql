-- Migration: remember what the digest has already said, and let the schedule
-- be changed without a deploy.
--
-- `digest_reports` is per item, not a single `last_digest_at`. The rule the
-- plan sets is "never repeat an item that has not changed", and a timestamp
-- cannot express that: it only knows when the last email went out, so anything
-- still open would be reported every week forever until it was actioned. What
-- makes an item repeatable is its facts changing, so each row keeps a
-- fingerprint of the facts as reported. Same fingerprint, no mention.
--
-- `grp` is the group the item was last reported under. An item can legitimately
-- appear again under a different heading — reported as new in April, then as
-- "now actionable" in September when its window opens — and that is a
-- different statement, not a repeat.
--
-- `app_settings` is a plain key/value store. The digest's cadence and
-- on/off switch live here rather than in wrangler.toml so that turning the
-- email off does not require a deploy — which matters most at exactly the
-- moment you want it off.

CREATE TABLE IF NOT EXISTS digest_reports (
  entity_type TEXT NOT NULL,          -- 'gig' | 'sync' | 'promo'
  entity_id   INTEGER NOT NULL,
  grp         TEXT NOT NULL,          -- group it was last reported under
  fingerprint TEXT NOT NULL,          -- hash of the facts as reported
  reported_at TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
