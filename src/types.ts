export interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ACCESS_PASSWORD?: string;
  PUBLIC_BASE_URL?: string;
  WORKER_BASE_URL?: string;
  SITE_TITLE?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  R2_BUCKET_NAME?: string;
  D1_DATABASE_ID?: string;
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

export type AccessPasswordRow = {
  password_hash: string;
  created_at: string;
  updated_at: string;
};

export type WebpMode = "force" | "smart" | "original";

export type ConfigurationRow = {
  webp_mode: WebpMode;
  static_webp_quality: number;
  gif_webp_quality: number;
  static_source_max_mb: number;
  gif_source_max_mb: number;
  webp_upload_max_mb: number;
  svg_upload_max_mb: number;
  cloudflare_api_token: string;
  updated_at: string;
};
