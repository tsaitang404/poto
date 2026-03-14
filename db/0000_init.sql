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

CREATE TABLE IF NOT EXISTS configuration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  webp_mode TEXT NOT NULL DEFAULT 'smart' CHECK (webp_mode IN ('force', 'smart', 'original')),
  static_webp_quality INTEGER NOT NULL DEFAULT 86,
  gif_webp_quality INTEGER NOT NULL DEFAULT 80,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO configuration (id, webp_mode, static_webp_quality, gif_webp_quality)
VALUES (1, 'smart', 86, 80)
ON CONFLICT(id) DO NOTHING;
