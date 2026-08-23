-- ollij.fi comments — D1 schema. All *_ct columns are AES-256-GCM ciphertext under the
-- master comment key K, which never reaches Cloudflare (see README.md).
CREATE TABLE IF NOT EXISTS tokens (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  auth_hash   TEXT NOT NULL UNIQUE,   -- sha256 of the bearer (itself an HKDF half — the fragment token never appears)
  wrapped_key TEXT NOT NULL,          -- K wrapped under this link's kek half
  admin       INTEGER NOT NULL DEFAULT 0,
  revoked     INTEGER NOT NULL DEFAULT 0,
  created     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS authors (
  id      TEXT PRIMARY KEY,           -- client-generated, per-browser
  name_ct TEXT,
  created TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,        -- client-generated
  slug       TEXT NOT NULL,
  author     TEXT NOT NULL,
  parent     TEXT,                    -- NULL = root; replies are flat under a root
  payload_ct TEXT,                    -- NULL = tombstoned root (replies survive)
  removed    INTEGER NOT NULL DEFAULT 0,
  created    TEXT NOT NULL,
  edited     TEXT
);
CREATE INDEX IF NOT EXISTS idx_comments_slug ON comments (slug);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent);
CREATE TABLE IF NOT EXISTS events (   -- write rate limiting, pruned hourly
  token TEXT NOT NULL,
  ts    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_token ON events (token, ts);
