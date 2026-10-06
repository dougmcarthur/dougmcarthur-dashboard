-- The artist survey's responses. See docs/artist-survey-questionnaire.md.
--
-- A platform table, like `opportunities` and `invite_requests`: it has no
-- tenant, because the people answering have no account, and it is not one of the
-- sixteen scoped tables. Nothing here identifies a person, on purpose:
--
--   * `id` is a random 128-bit token and is also the only credential for
--     reading, adding to or deleting the response. The browser holds it; nobody
--     else can guess it, and nothing connects it to a name.
--   * There is no IP address, no user-agent string and no email column, and no
--     hash of any of them. A salted hash of an address is still derived from
--     it, and the survey's notice says none is stored.
--   * `source` is a tag from the link (`?src=...`) naming the channel, so the
--     sample can be described without asking anybody anything.
--
-- `plan` is what the respondent was shown, stored as it was built, so the
-- analysis reads a record rather than rebuilding it from code that may change.
-- `answers` and `seconds` are JSON keyed by screen id.
--
-- Additive: a new table the deployed Worker never names.

CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  instrument TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  source TEXT,
  device TEXT,
  plan TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '{}',
  seconds TEXT NOT NULL DEFAULT '{}',
  -- in_progress | complete | screened_out
  status TEXT NOT NULL DEFAULT 'in_progress',
  saves INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS survey_responses_created ON survey_responses (created_at);
CREATE INDEX IF NOT EXISTS survey_responses_status ON survey_responses (status, created_at);
