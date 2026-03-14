import { json } from "../lib/http";
import type { ConfigurationRow, Env, WebpMode } from "../types";

const DEFAULT_SETTINGS = {
  webp_mode: "smart" as WebpMode,
  static_webp_quality: 86,
  gif_webp_quality: 80,
};

export async function handleGetSettings(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT webp_mode, static_webp_quality, gif_webp_quality, updated_at FROM configuration WHERE id = 1"
  ).first<ConfigurationRow>();

  return json(normalizeSettings(row));
}

export async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const existing = await env.DB.prepare(
    "SELECT webp_mode, static_webp_quality, gif_webp_quality, updated_at FROM configuration WHERE id = 1"
  ).first<ConfigurationRow>();
  const next = sanitizeSettings(body, normalizeSettings(existing));
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO configuration (id, webp_mode, static_webp_quality, gif_webp_quality, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       webp_mode = excluded.webp_mode,
       static_webp_quality = excluded.static_webp_quality,
       gif_webp_quality = excluded.gif_webp_quality,
       updated_at = excluded.updated_at`
  )
    .bind(next.webp_mode, next.static_webp_quality, next.gif_webp_quality, now)
    .run();

  return json({ ok: true, ...next, updated_at: now });
}

function normalizeSettings(row: ConfigurationRow | null | undefined): ConfigurationRow {
  return {
    webp_mode: normalizeMode(row?.webp_mode),
    static_webp_quality: clampQuality(row?.static_webp_quality, DEFAULT_SETTINGS.static_webp_quality),
    gif_webp_quality: clampQuality(row?.gif_webp_quality, DEFAULT_SETTINGS.gif_webp_quality),
    updated_at: row?.updated_at ?? "",
  };
}

function sanitizeSettings(payload: unknown, fallback: ConfigurationRow): Omit<ConfigurationRow, "updated_at"> {
  const data = typeof payload === "object" && payload ? payload as Record<string, unknown> : {};
  return {
    webp_mode: normalizeMode(data.webp_mode, fallback.webp_mode),
    static_webp_quality: clampQuality(data.static_webp_quality, fallback.static_webp_quality),
    gif_webp_quality: clampQuality(data.gif_webp_quality, fallback.gif_webp_quality),
  };
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