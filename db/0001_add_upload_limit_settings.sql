ALTER TABLE configuration ADD COLUMN static_source_max_mb REAL NOT NULL DEFAULT 10;
ALTER TABLE configuration ADD COLUMN gif_source_max_mb REAL NOT NULL DEFAULT 20;
ALTER TABLE configuration ADD COLUMN webp_upload_max_mb REAL NOT NULL DEFAULT 20;
ALTER TABLE configuration ADD COLUMN svg_upload_max_mb REAL NOT NULL DEFAULT 1;