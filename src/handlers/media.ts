import { json, htmlResponse } from "../lib/http";
import { getUploadSettings } from "./settings";
import {
  encodeObjectKeyForUrl,
  extensionByMime,
  formatMegabytes,
  getPublicBaseUrl,
  isAcceptedUploadMime,
  megabytesToBytes,
  normalizeStoredMime,
  sha256Hex,
  validateSvgContent,
} from "../lib/upload";
import { renderViewPage } from "../pages/simple-pages";
import type { Env, ImageRow } from "../types";

export async function handleUpload(request: Request, env: Env, workerBaseUrl: string, isAllowed: boolean): Promise<Response> {
  if (!isAllowed) {
    return json({ error: "unauthorized" }, 401);
  }

  const form = await request.formData();
  const file = form.get("image");
  const titleRaw = String(form.get("title") ?? "").trim();

  if (!(file instanceof File)) {
    return json({ error: "image is required" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return json({ error: "only image uploads are allowed" }, 400);
  }
  if (!isAcceptedUploadMime(file.type)) {
    return json({ error: "unsupported image format: " + file.type }, 400);
  }

  const settings = await getUploadSettings(env);
  const maxBytes = getConfiguredUploadBytes(file.type, settings);
  if (file.size > maxBytes) {
    return json({ error: `file too large, max ${formatMegabytes(maxBytes / 1024 / 1024)}MB for ${file.type}` }, 413);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === "image/svg+xml") {
    const svgError = validateSvgContent(bytes);
    if (svgError) {
      return json({ error: svgError }, 400);
    }
  }

  const sha256 = await sha256Hex(bytes);
  const exists = await env.DB.prepare(
    "SELECT id, title, public_url, mime_type, size_bytes, created_at, deleted_at FROM images WHERE sha256 = ?"
  )
    .bind(sha256)
    .first<{ id: string; title: string; public_url: string; mime_type: string; size_bytes: number; created_at: string; deleted_at: string | null }>();

  if (exists && !exists.deleted_at) {
    return json({
      ok: true,
      duplicate: true,
      id: exists.id,
      title: exists.title,
      url: exists.public_url,
      mime_type: exists.mime_type,
      size_bytes: exists.size_bytes,
      created_at: exists.created_at,
    });
  }

  const id = exists?.id ?? crypto.randomUUID().replaceAll("-", "");
  const storedMime = normalizeStoredMime(file.type);
  const objectKey = `images/${new Date().toISOString().slice(0, 10)}/${id}.${extensionByMime(storedMime)}`;
  const safeTitle = titleRaw.length > 0 ? titleRaw.slice(0, 120) : file.name.slice(0, 120);
  const publicUrl = `${getPublicBaseUrl(workerBaseUrl, env, storedMime)}/${encodeObjectKeyForUrl(objectKey)}`;

  const putResult = await env.R2_BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: storedMime },
    customMetadata: { title: safeTitle, sha256 },
  });

  if (exists?.deleted_at) {
    await env.DB.prepare(
      `UPDATE images
       SET title = ?,
           object_key = ?,
           public_url = ?,
           mime_type = ?,
           size_bytes = ?,
           sha256 = ?,
           r2_etag = ?,
           deleted_at = NULL,
           created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`
    )
      .bind(safeTitle, objectKey, publicUrl, storedMime, bytes.byteLength, sha256, putResult?.etag ?? null, id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO images (id, title, object_key, public_url, mime_type, size_bytes, sha256, r2_etag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, safeTitle, objectKey, publicUrl, storedMime, bytes.byteLength, sha256, putResult?.etag ?? null)
      .run();
  }

  return json({
    ok: true,
    restored: Boolean(exists?.deleted_at),
    id,
    title: safeTitle,
    url: publicUrl,
    mime_type: storedMime,
    size_bytes: bytes.byteLength,
  }, 201);
}

export async function handleServeFile(env: Env, objectKey: string): Promise<Response> {
  if (!objectKey) {
    return json({ error: "invalid_key" }, 400);
  }
  const object = await env.R2_BUCKET.get(objectKey);
  if (!object) {
    return json({ error: "not_found" }, 404);
  }

  const headers = new Headers();
  const contentType = object.httpMetadata?.contentType;
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  if (contentType === "image/svg+xml") {
    headers.set("content-security-policy", "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  }

  return new Response(object.body, { status: 200, headers });
}

export async function handleListImages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = clampPositiveInt(url.searchParams.get("page"), 1);
  const pageSize = clampPositiveInt(url.searchParams.get("page_size"), 10, 500);
  const offset = (page - 1) * pageSize;

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS total
     FROM images
     WHERE deleted_at IS NULL`
  ).first<{ total: number | string }>();

  const total = Number(countRow?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * pageSize;

  const result = await env.DB.prepare(
    `SELECT id, title, public_url, mime_type, size_bytes, created_at
     FROM images
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(pageSize, safeOffset)
    .all();

  return json({
    items: result.results ?? [],
    page: safePage,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    has_next: safePage < totalPages,
    has_prev: safePage > 1,
  });
}

function clampPositiveInt(value: string | null, fallback: number, max = Number.POSITIVE_INFINITY): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function getConfiguredUploadBytes(fileType: string, settings: { static_source_max_mb: number; gif_source_max_mb: number; webp_upload_max_mb: number; svg_upload_max_mb: number }): number {
  if (fileType === "image/svg+xml") {
    return megabytesToBytes(settings.svg_upload_max_mb);
  }
  if (fileType === "image/gif") {
    return megabytesToBytes(settings.gif_source_max_mb);
  }
  if (fileType === "image/webp") {
    return megabytesToBytes(settings.webp_upload_max_mb);
  }
  return megabytesToBytes(settings.static_source_max_mb);
}

export async function handleGetImage(env: Env, id: string): Promise<Response> {
  if (!id) {
    return json({ error: "invalid_id" }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT id, title, object_key, public_url, mime_type, size_bytes, sha256, r2_etag, created_at, deleted_at
     FROM images WHERE id = ?`
  )
    .bind(id)
    .first<ImageRow>();

  if (!row || row.deleted_at) {
    return json({ error: "not_found" }, 404);
  }

  return json({ item: row });
}

export async function handleDeleteImage(env: Env, id: string): Promise<Response> {
  if (!id) {
    return json({ error: "invalid_id" }, 400);
  }

  const row = await env.DB.prepare("SELECT object_key, deleted_at FROM images WHERE id = ?")
    .bind(id)
    .first<{ object_key: string; deleted_at: string | null }>();

  if (!row) {
    return json({ error: "not_found" }, 404);
  }
  if (row.deleted_at) {
    return json({ ok: true, already_deleted: true });
  }

  await env.R2_BUCKET.delete(row.object_key);
  await env.DB.prepare("UPDATE images SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(id)
    .run();

  return json({ ok: true });
}

export async function handleUpdateImage(request: Request, env: Env, id: string): Promise<Response> {
  if (!id) {
    return json({ error: "invalid_id" }, 400);
  }

  let payload: { title?: unknown };
  try {
    payload = (await request.json()) as { title?: unknown };
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const titleRaw = String(payload.title ?? "").trim();
  if (!titleRaw) {
    return json({ error: "title_required" }, 400);
  }

  const safeTitle = titleRaw.slice(0, 120);
  const exists = await env.DB.prepare("SELECT id, deleted_at FROM images WHERE id = ?")
    .bind(id)
    .first<{ id: string; deleted_at: string | null }>();

  if (!exists || exists.deleted_at) {
    return json({ error: "not_found" }, 404);
  }

  await env.DB.prepare("UPDATE images SET title = ? WHERE id = ?")
    .bind(safeTitle, id)
    .run();

  return json({ ok: true, id, title: safeTitle });
}

export async function handleViewPage(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT id, title, public_url, created_at FROM images WHERE id = ? AND deleted_at IS NULL"
  )
    .bind(id)
    .first<{ id: string; title: string; public_url: string; created_at: string }>();

  if (!row) {
    return htmlResponse("<h2>Not Found</h2>", 404);
  }

  return htmlResponse(renderViewPage(row));
}
