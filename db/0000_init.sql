CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  r2_etag TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_deleted_at ON images(deleted_at);

CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rotated_at TEXT NOT NULL
);
