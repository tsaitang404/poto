export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ACCESS_PASSWORD: string;
  PUBLIC_BASE_URL?: string;
  WORKER_BASE_URL?: string;
  SITE_TITLE?: string;
}

export type ImageRow = {
  id: string;
  title: string;
  object_key: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  r2_etag: string | null;
  created_at: string;
  deleted_at: string | null;
};

export type ApiTokenRow = {
  token_hash: string;
  created_at: string;
  rotated_at: string;
};
