-- Where a gig is, and how far it is from home, from OpenStreetMap.
--
-- The trip-cost estimate guessed its travel band from place names on a list
-- written for Winnipeg — which is wrong for any other artist, and could not
-- judge the drive-or-fly boundary (Regina, Thunder Bay, Minneapolis) that a
-- list has no way to decide. These columns cache a real answer: the place is
-- geocoded with Nominatim and the drive from the artist's home base routed
-- with OSRM, once, by the hourly job in src/lib/travelEnrich.ts.
--
-- Cached, not fetched on read, and the usage policies of both services are
-- why as much as speed is: each allows one request a second from the whole
-- app and requires results to be stored. `geo_place` and `geo_home` record
-- which place and which home the answer was for, so a changed location or a
-- moved home base is recomputed and nothing else ever is.
--
-- Additive only: nullable columns the deployed Worker ignores.
ALTER TABLE gig_opportunities ADD COLUMN geo_place TEXT;
ALTER TABLE gig_opportunities ADD COLUMN geo_home TEXT;
-- found | not_found. A place Nominatim does not know is remembered as such, so
-- it is not asked again every hour; a network failure writes nothing and is
-- retried.
ALTER TABLE gig_opportunities ADD COLUMN geo_status TEXT;
ALTER TABLE gig_opportunities ADD COLUMN geo_lat REAL;
ALTER TABLE gig_opportunities ADD COLUMN geo_lon REAL;
-- One way, from home. Road figures from a route; `crow_km` in a straight line,
-- which is what a flight band turns on.
ALTER TABLE gig_opportunities ADD COLUMN road_km REAL;
ALTER TABLE gig_opportunities ADD COLUMN road_hours REAL;
ALTER TABLE gig_opportunities ADD COLUMN crow_km REAL;
-- route | straight_line. Straight-line is the fallback when routing is down or
-- finds no road (Churchill, MB has none), and is marked as the rougher answer.
ALTER TABLE gig_opportunities ADD COLUMN distance_source TEXT;
ALTER TABLE gig_opportunities ADD COLUMN geo_checked_at TEXT;
