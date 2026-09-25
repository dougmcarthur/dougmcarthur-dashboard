-- What the daily profile re-read has already announced, per connector.
--
-- A JSON list of proposal sources (see shared/profileScan.ts). NULL means the
-- profile has never been re-read, and the first re-read sets the baseline
-- without announcing anything. Additive: the deployed Worker neither reads nor
-- writes it.
ALTER TABLE artist_connectors ADD COLUMN seen_sources TEXT;
