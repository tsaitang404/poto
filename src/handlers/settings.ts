import { json } from "../lib/http";
import type { ConfigurationRow, Env, WebpMode } from "../types";

const DEFAULT_SETTINGS = {
  webp_mode: "smart" as WebpMode,
  static_webp_quality: 86,
  gif_webp_quality: 80,
  static_source_max_mb: 10,
  gif_source_max_mb: 20,
  webp_upload_max_mb: 20,
  svg_upload_max_mb: 1,
  cloudflare_api_token: "",
  ai_enabled: 1,
  ai_model: "@cf/meta/llama-3.2-11b-vision-instruct",
  ai_text_model: "@cf/meta/llama-3.1-8b-fast-v2",
  ai_max_daily: 200,
};

export async function handleGetSettings(env: Env): Promise<Response> {
  const settings = await getUploadSettings(env);
  return json({
    ...settings,
    cloudflare_api_token_source: getCloudflareApiTokenSource(settings, env),
  });
}

export async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const existing = await getUploadSettings(env);
  const next = sanitizeSettings(body, normalizeSettings(existing));
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO configuration (
      id,
      webp_mode,
      static_webp_quality,
      gif_webp_quality,
      static_source_max_mb,
      gif_source_max_mb,
      webp_upload_max_mb,
      svg_upload_max_mb,
      cloudflare_api_token,
      ai_enabled,
      ai_model,
      ai_text_model,
      ai_max_daily,
      updated_at
    )
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      webp_mode = excluded.webp_mode,
      static_webp_quality = excluded.static_webp_quality,
      gif_webp_quality = excluded.gif_webp_quality,
      static_source_max_mb = excluded.static_source_max_mb,
      gif_source_max_mb = excluded.gif_source_max_mb,
      webp_upload_max_mb = excluded.webp_upload_max_mb,
      svg_upload_max_mb = excluded.svg_upload_max_mb,
      cloudflare_api_token = excluded.cloudflare_api_token,
      ai_enabled = excluded.ai_enabled,
      ai_model = excluded.ai_model,
      ai_text_model = excluded.ai_text_model,
      ai_max_daily = excluded.ai_max_daily,
      updated_at = excluded.updated_at`
  )
    .bind(next.webp_mode, next.static_webp_quality, next.gif_webp_quality, next.static_source_max_mb, next.gif_source_max_mb, next.webp_upload_max_mb, next.svg_upload_max_mb, next.cloudflare_api_token, next.ai_enabled, next.ai_model, next.ai_text_model, next.ai_max_daily, now)
    .run();

  return json({
    ok: true,
    ...next,
    updated_at: now,
    cloudflare_api_token_source: getCloudflareApiTokenSource({ ...next, updated_at: now }, env),
  });
}

export async function getUploadSettings(env: Env): Promise<ConfigurationRow> {
  const row = await env.DB.prepare(
    `SELECT webp_mode,
            static_webp_quality,
            gif_webp_quality,
            static_source_max_mb,
            gif_source_max_mb,
            webp_upload_max_mb,
            svg_upload_max_mb,
              cloudflare_api_token,
              ai_enabled,
              ai_model,
              ai_text_model,
              ai_max_daily,
            updated_at
      FROM configuration
     WHERE id = 1`
  ).first<ConfigurationRow>();

  return normalizeSettings(row);
}

function normalizeSettings(row: ConfigurationRow | null | undefined): ConfigurationRow {
  return {
    webp_mode: normalizeMode(row?.webp_mode),
    static_webp_quality: clampQuality(row?.static_webp_quality, DEFAULT_SETTINGS.static_webp_quality),
    gif_webp_quality: clampQuality(row?.gif_webp_quality, DEFAULT_SETTINGS.gif_webp_quality),
    static_source_max_mb: clampMegabytes(row?.static_source_max_mb, DEFAULT_SETTINGS.static_source_max_mb),
    gif_source_max_mb: clampMegabytes(row?.gif_source_max_mb, DEFAULT_SETTINGS.gif_source_max_mb),
    webp_upload_max_mb: clampMegabytes(row?.webp_upload_max_mb, DEFAULT_SETTINGS.webp_upload_max_mb),
    svg_upload_max_mb: clampMegabytes(row?.svg_upload_max_mb, DEFAULT_SETTINGS.svg_upload_max_mb),
    cloudflare_api_token: normalizeToken(row?.cloudflare_api_token, DEFAULT_SETTINGS.cloudflare_api_token),
    ai_enabled: normalizeInt(row?.ai_enabled, DEFAULT_SETTINGS.ai_enabled, 0, 1),
    ai_model: normalizeModel(row?.ai_model, DEFAULT_SETTINGS.ai_model),
    ai_text_model: normalizeModel(row?.ai_text_model, DEFAULT_SETTINGS.ai_text_model),
    ai_max_daily: normalizeInt(row?.ai_max_daily, DEFAULT_SETTINGS.ai_max_daily, 1, 10000),
    updated_at: row?.updated_at ?? "",
  };
}

function sanitizeSettings(payload: unknown, fallback: ConfigurationRow): Omit<ConfigurationRow, "updated_at"> {
  const data = typeof payload === "object" && payload ? payload as Record<string, unknown> : {};
  return {
    webp_mode: normalizeMode(data.webp_mode, fallback.webp_mode),
    static_webp_quality: clampQuality(data.static_webp_quality, fallback.static_webp_quality),
    gif_webp_quality: clampQuality(data.gif_webp_quality, fallback.gif_webp_quality),
    static_source_max_mb: clampMegabytes(data.static_source_max_mb, fallback.static_source_max_mb),
    gif_source_max_mb: clampMegabytes(data.gif_source_max_mb, fallback.gif_source_max_mb),
    webp_upload_max_mb: clampMegabytes(data.webp_upload_max_mb, fallback.webp_upload_max_mb),
    svg_upload_max_mb: clampMegabytes(data.svg_upload_max_mb, fallback.svg_upload_max_mb),
    cloudflare_api_token: normalizeToken(data.cloudflare_api_token, fallback.cloudflare_api_token),
    ai_enabled: normalizeInt(data.ai_enabled, fallback.ai_enabled, 0, 1),
    ai_model: normalizeModel(data.ai_model, fallback.ai_model),
    ai_text_model: normalizeModel(data.ai_text_model, fallback.ai_text_model),
    ai_max_daily: normalizeInt(data.ai_max_daily, fallback.ai_max_daily, 1, 10000),
  };
}

function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeModel(value: unknown, fallback: string): string {
  const s = String(value ?? "").trim();
  if (!s) {
    return fallback;
  }
  return s.slice(0, 200);
}

export function getEffectiveCloudflareApiToken(env: Env, settings?: ConfigurationRow | null): string {
  const configured = normalizeToken(settings?.cloudflare_api_token, "");
  if (configured) {
    return configured;
  }
  return normalizeToken(env.CLOUDFLARE_API_TOKEN, "");
}

export function getCloudflareApiTokenSource(settings: ConfigurationRow | null | undefined, env: Env): "configured" | "env" | "missing" {
  if (normalizeToken(settings?.cloudflare_api_token, "")) {
    return "configured";
  }
  if (normalizeToken(env.CLOUDFLARE_API_TOKEN, "")) {
    return "env";
  }
  return "missing";
}

function normalizeMode(value: unknown, fallback: WebpMode = DEFAULT_SETTINGS.webp_mode): WebpMode {
  return value === "force" || value === "smart" || value === "original" ? value : fallback;
}

function clampQuality(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(1, Math.min(100, Math.round(num)));
}

function clampMegabytes(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0.1, Math.min(500, Math.round(num * 10) / 10));
}

function normalizeToken(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim();
}