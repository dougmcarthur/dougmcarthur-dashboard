-- The fee a listing states, on the shared catalog.
--
-- The landing page's sample shows it, and it is a fact about the call rather
-- than about any artist. Stored as stated — an amount and its currency — and
-- deliberately not interpreted: the research agents fill `fee_amount` on an
-- artist's row without being told which way the money goes (the local seed
-- uses it for a guarantee), so the catalog does not claim to know whether it
-- is paid to the artist or by them. NULL means the listing did not say, which
-- is not the same as free.
--
-- Additive: the deployed Worker never names these columns.
ALTER TABLE opportunities ADD COLUMN fee_amount REAL;
ALTER TABLE opportunities ADD COLUMN fee_currency TEXT;
