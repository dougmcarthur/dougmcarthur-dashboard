-- Connectors: outside services that already know something about the artist,
-- read with the artist's own credential.
--
-- The first is Bandsintown. Its public API answers "what shows does this
-- artist have?" for an artist name and an `app_id`, and Bandsintown issues
-- that id per artist — "each API key is linked to a single artist unless
-- authorized otherwise". So one deployment-wide key would be the owner's key
-- used on strangers' behalf, and the connector is a row per tenant holding
-- that tenant's own key, not a Worker secret.
--
-- The key is stored AES-GCM encrypted with TOKEN_ENCRYPTION_KEY, the same as
-- a Google refresh token. It is a weak secret — the owner's is readable in the
-- JavaScript of his own links page — but it is a credential for somewhere
-- else, and this database's rule is that those are the values that get
-- encrypted.
--
-- `status` and `checked_at` record the last probe, in the vocabulary of
-- shared/credentialHealth.ts: a refusal is a verdict on the key, a timeout is
-- not a verdict at all.
--
-- A sixteenth scoped table, so src/db/scope.ts gains it. Additive: a new
-- table the deployed Worker never names.

CREATE TABLE IF NOT EXISTS artist_connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL DEFAULT 'doug',
  kind TEXT NOT NULL,
  account TEXT NOT NULL,
  secret TEXT,
  status TEXT NOT NULL DEFAULT 'unverified',
  status_note TEXT,
  checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS artist_connectors_tenant_kind
  ON artist_connectors (tenant_id, kind);
