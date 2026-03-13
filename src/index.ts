interface Env {
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  ACCESS_PASSWORD: string;
  PUBLIC_BASE_URL?: string;
  WORKER_BASE_URL?: string;
  SITE_TITLE?: string;
}

type ImageRow = {
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

type ApiTokenRow = {
  token_hash: string;
  created_at: string;
  rotated_at: string;
};

const MAX_WEBP_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_SVG_UPLOAD_BYTES = 1 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const workerBaseUrl = getWorkerBaseUrl(request, env);

    if (request.method === "GET" && url.pathname === "/") {
      if (!isAuthed(request, env)) {
        return Response.redirect(`${url.origin}/protected`, 302);
      }
      return htmlResponse(renderUploadPage(env.SITE_TITLE ?? "Poto"));
    }

    if (request.method === "GET" && url.pathname === "/manage") {
      if (!isAuthed(request, env)) {
        return Response.redirect(`${url.origin}/protected`, 302);
      }
      return htmlResponse(renderManagePage(env.SITE_TITLE ?? "Poto"));
    }

    if (url.pathname === "/protected" && request.method === "GET") {
      return htmlResponse(renderProtectedPage());
    }

    if (url.pathname === "/protected" && request.method === "POST") {
      return handleProtectedPost(request, env, url.origin);
    }

    if (url.pathname === "/api/upload" && request.method === "POST") {
      return handleUpload(request, env, workerBaseUrl);
    }

    if (url.pathname === "/api/token" && request.method === "GET") {
      if (!isAuthed(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleGetApiToken(env);
    }

    if (url.pathname === "/api/token/rotate" && request.method === "POST") {
      if (!isAuthed(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }
      return handleRotateApiToken(env);
    }

    if (url.pathname === "/api/images" && request.method === "GET") {
      return handleListImages(env);
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
      const id = url.pathname.split("/").pop() ?? "";
      return handleGetImage(env, id);
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "DELETE") {
      if (!isAuthed(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }
      const id = url.pathname.split("/").pop() ?? "";
      return handleDeleteImage(env, id);
    }

    if (url.pathname.startsWith("/api/images/") && request.method === "PUT") {
      if (!isAuthed(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }
      const id = url.pathname.split("/").pop() ?? "";
      return handleUpdateImage(request, env, id);
    }

    if (url.pathname.startsWith("/i/") && request.method === "GET") {
      const id = url.pathname.split("/").pop() ?? "";
      return handleViewPage(env, id);
    }

    if (url.pathname.startsWith("/files/") && request.method === "GET") {
      const key = decodeURIComponent(url.pathname.slice("/files/".length));
      return handleServeFile(env, key);
    }

    return json({ error: "not_found" }, 404);
  },
};

async function handleUpload(request: Request, env: Env, workerBaseUrl: string): Promise<Response> {
  if (!(await isUploadAuthed(request, env))) {
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
    return json({ error: "only image/webp and image/svg+xml are accepted" }, 400);
  }

  const maxBytes = getMaxUploadBytes(file.type);
  if (file.size > maxBytes) {
    return json({ error: `file too large, max ${Math.floor(maxBytes / 1024 / 1024)}MB for ${file.type}` }, 413);
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

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
  const base = getPublicBaseUrl(workerBaseUrl, env, storedMime);
  const publicUrl = `${base}/${encodeObjectKeyForUrl(objectKey)}`;

  const putResult = await env.R2_BUCKET.put(objectKey, bytes, {
    httpMetadata: {
      contentType: storedMime,
    },
    customMetadata: {
      title: safeTitle,
      sha256,
    },
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

  return json(
    {
      ok: true,
      restored: Boolean(exists?.deleted_at),
      id,
      title: safeTitle,
      url: publicUrl,
      mime_type: storedMime,
      size_bytes: bytes.byteLength,
    },
    201
  );
}

async function handleServeFile(env: Env, objectKey: string): Promise<Response> {
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

async function handleListImages(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, title, public_url, mime_type, size_bytes, created_at
     FROM images
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 100`
  ).all();

  return json({ items: result.results ?? [] });
}

async function handleGetImage(env: Env, id: string): Promise<Response> {
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

async function handleDeleteImage(env: Env, id: string): Promise<Response> {
  if (!id) {
    return json({ error: "invalid_id" }, 400);
  }

  const row = await env.DB.prepare(
    "SELECT object_key, deleted_at FROM images WHERE id = ?"
  )
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

async function handleUpdateImage(request: Request, env: Env, id: string): Promise<Response> {
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

async function handleGetApiToken(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT token_hash, created_at, rotated_at FROM api_tokens WHERE id = 1"
  ).first<ApiTokenRow>();

  if (!row) {
    return json({ configured: false });
  }

  return json({
    configured: true,
    created_at: row.created_at,
    rotated_at: row.rotated_at,
  });
}

async function handleRotateApiToken(env: Env): Promise<Response> {
  const token = generateApiToken();
  const tokenHash = await hashApiToken(token);
  const now = new Date().toISOString();

  const exists = await env.DB.prepare("SELECT token_hash, created_at, rotated_at FROM api_tokens WHERE id = 1")
    .first<ApiTokenRow>();

  if (exists) {
    await env.DB.prepare(
      "UPDATE api_tokens SET token_hash = ?, rotated_at = ? WHERE id = 1"
    )
      .bind(tokenHash, now)
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO api_tokens (id, token_hash, created_at, rotated_at) VALUES (1, ?, ?, ?)"
    )
      .bind(tokenHash, now, now)
      .run();
  }

  return json({
    ok: true,
    token,
    created_at: exists?.created_at ?? now,
    rotated_at: now,
  });
}

async function handleViewPage(env: Env, id: string): Promise<Response> {
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

async function handleProtectedPost(request: Request, env: Env, origin: string): Promise<Response> {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");

  if (!env.ACCESS_PASSWORD || password !== env.ACCESS_PASSWORD) {
    return htmlResponse(renderProtectedPage("密码错误"), 401);
  }

  const headers = new Headers();
  headers.set("Location", `${origin}/`);
  headers.append("Set-Cookie", "poto_auth=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400");
  return new Response(null, { status: 302, headers });
}

function isAuthed(request: Request, env: Env): boolean {
  const cookie = request.headers.get("Cookie") ?? "";
  if (cookie.includes("poto_auth=1")) {
    return true;
  }
  return false;
}

async function isUploadAuthed(request: Request, env: Env): Promise<boolean> {
  if (isAuthed(request, env)) {
    return true;
  }

  const token = extractApiToken(request);
  if (!token) {
    return false;
  }

  const tokenHash = await hashApiToken(token);
  const row = await env.DB.prepare("SELECT token_hash, created_at, rotated_at FROM api_tokens WHERE id = 1")
    .first<ApiTokenRow>();

  if (!row) {
    return false;
  }

  return row.token_hash === tokenHash;
}

function extractApiToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  const custom = request.headers.get("x-api-token") ?? request.headers.get("X-API-Token") ?? "";
  const token = custom.trim();
  return token || null;
}

async function hashApiToken(token: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(token));
}

function generateApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const base64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `poto_${base64}`;
}

function isAcceptedUploadMime(mime: string): boolean {
  return mime === "image/webp" || mime === "image/svg+xml";
}

function getMaxUploadBytes(mime: string): number {
  if (mime === "image/svg+xml") {
    return MAX_SVG_UPLOAD_BYTES;
  }
  return MAX_WEBP_UPLOAD_BYTES;
}

function normalizeStoredMime(mime: string): string {
  if (mime === "image/svg+xml") {
    return mime;
  }
  return "image/webp";
}

function extensionByMime(mime: string): string {
  if (mime === "image/svg+xml") {
    return "svg";
  }
  return "webp";
}

function validateSvgContent(bytes: Uint8Array): string | null {
  const source = new TextDecoder().decode(bytes).trim();

  if (!source.startsWith("<svg") && !source.startsWith("<?xml")) {
    return "invalid svg content";
  }

  const blockedPatterns = [
    /<script[\s>]/i,
    /<foreignObject[\s>]/i,
    /on[a-z]+\s*=/i,
    /javascript\s*:/i,
    /data\s*:\s*text\/html/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(source)) {
      return "unsafe svg content is not allowed";
    }
  }

  return null;
}

function getWorkerBaseUrl(request: Request, env: Env): string {
  return normalizeBaseUrl(env.WORKER_BASE_URL) ?? new URL(request.url).origin;
}

function getPublicBaseUrl(workerBaseUrl: string, env: Env, mimeType = "image/webp"): string {
  if (mimeType === "image/svg+xml") {
    return `${workerBaseUrl}/files`;
  }
  const explicit = normalizeBaseUrl(env.PUBLIC_BASE_URL);
  if (explicit) {
    return explicit;
  }
  return `${workerBaseUrl}/files`;
}

function normalizeBaseUrl(input: string | undefined): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/$/, "");
}

function encodeObjectKeyForUrl(key: string): string {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", input as unknown as BufferSource);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderUploadPage(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} 上传</title>
  <style>
    :root {
      --bg: #f5f0e6;
      --card: #fffdf7;
      --text: #2a1f1a;
      --primary: #b3472a;
      --line: #e5d8c5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Noto Serif SC", "Source Han Serif SC", serif;
      color: var(--text);
      background:
        radial-gradient(circle at 20% 10%, #fff5de 0, transparent 30%),
        radial-gradient(circle at 80% 80%, #f3d7b6 0, transparent 25%),
        var(--bg);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(720px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(66, 44, 30, 0.12);
      padding: 24px;
      animation: rise .5s ease-out;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    h1 { margin: 0; }
    .manage-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      color: var(--primary);
      text-decoration: none;
      background: #fff7ee;
      font-size: 14px;
      white-space: nowrap;
    }
    .manage-link:hover { background: #fbe9d7; }
    .drop {
      border: 2px dashed var(--line);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      margin-bottom: 12px;
      transition: .2s border-color;
    }
    .drop.drag { border-color: var(--primary); }
    input, button {
      width: 100%;
      padding: 10px 12px;
      font-size: 16px;
      border-radius: 10px;
      border: 1px solid var(--line);
      margin-top: 10px;
    }
    button {
      background: var(--primary);
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: 700;
    }
    .hint {
      margin: 10px 0 0;
      color: #6a5548;
      font-size: 13px;
      line-height: 1.5;
    }
    #preview { text-align: center; }
    #preview img { max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 10px; margin: 12px auto 0; display: block; }
    #result { margin-top: 8px; font-size: 13px; word-break: break-all; color: #5a4a42; text-align: center; }
    @keyframes rise {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="card-head">
      <h1>图床上传</h1>
      <a class="manage-link" href="/manage">进入管理页</a>
    </div>
    <form id="uploadForm">
      <div class="drop" id="dropZone">拖拽图片到这里，或点击下方选择文件</div>
      <p class="hint">JPEG/PNG/静态图会自动转为 WebP；GIF 会自动转为动态 WebP；SVG 原样上传但会做安全检查。默认大小限制：静态图源文件 10MB，GIF 源文件 20MB，最终 WebP 20MB，SVG 1MB。</p>
      <input id="title" name="title" type="text" maxlength="120" placeholder="图片标题" />
      <input id="image" name="image" type="file" accept="image/*" required />
      <button type="submit">上传到 R2</button>
    </form>
    <div id="preview"></div>
    <div id="result"></div>
  </main>
  <script type="module">
    const GIF2WEBP_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@libwebp-wasm/gif2webp@1.0.8/es/gif2webp.js';
    const MAX_STATIC_SOURCE_BYTES = 10 * 1024 * 1024;
    const MAX_GIF_SOURCE_BYTES = 20 * 1024 * 1024;
    const MAX_WEBP_UPLOAD_BYTES = 20 * 1024 * 1024;
    const MAX_SVG_UPLOAD_BYTES = 1 * 1024 * 1024;

    const form = document.getElementById('uploadForm');
    const fileInput = document.getElementById('image');
    const titleInput = document.getElementById('title');
    const drop = document.getElementById('dropZone');
    const preview = document.getElementById('preview');
    const result = document.getElementById('result');
    let pendingNormalize = Promise.resolve();
    let gif2webpToolsPromise;

    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      pendingNormalize = normalizeAndAssign(f);
    });

    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      const f = files[0];
      pendingNormalize = normalizeAndAssign(f);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await pendingNormalize;
      const normalized = fileInput.files && fileInput.files[0];
      if (!normalized) {
        result.textContent = '请先选择图片';
        return;
      }
      if (normalized.type !== 'image/webp' && normalized.type !== 'image/svg+xml') {
        result.textContent = '上传失败: 仅支持 WebP 或 SVG';
        return;
      }
      result.textContent = '上传中...';
      const data = new FormData(form);
      const res = await fetch('/api/upload', { method: 'POST', body: data });
      const body = await res.json();
      if (!res.ok) {
        result.textContent = '上传失败: ' + (body.error || 'unknown');
        return;
      }
      if (body.duplicate) {
        result.innerHTML = '重复图片：已存在记录 <a href="' + body.url + '" target="_blank" rel="noreferrer">' + body.url + '</a><br/>查看页: <a href="/i/' + body.id + '" target="_blank" rel="noreferrer">/i/' + body.id + '</a>';
        return;
      }
      if (body.restored) {
        result.innerHTML = '图片曾被删除，已恢复并覆盖: <a href="' + body.url + '" target="_blank" rel="noreferrer">' + body.url + '</a><br/>查看页: <a href="/i/' + body.id + '" target="_blank" rel="noreferrer">/i/' + body.id + '</a>';
        return;
      }
      result.innerHTML = '上传成功: <a href="' + body.url + '" target="_blank" rel="noreferrer">' + body.url + '</a><br/>查看页: <a href="/i/' + body.id + '" target="_blank" rel="noreferrer">/i/' + body.id + '</a>';
    });

    function showPreview(file) {
      const reader = new FileReader();
      reader.onload = () => {
        preview.innerHTML = '<img alt="preview" src="' + reader.result + '" />';
      };
      reader.readAsDataURL(file);
    }

    async function normalizeAndAssign(file) {
      titleInput.value = file.name.replace(/\.[^.]+$/, '');

      const policy = getUploadPolicy(file);
      if (file.size > policy.maxSourceBytes) {
        result.textContent = '文件过大: ' + policy.label + ' 最大支持 ' + Math.floor(policy.maxSourceBytes / 1024 / 1024) + 'MB';
        fileInput.value = '';
        return;
      }

      result.textContent = policy.needsConvert ? '转码中...' : '校验中...';
      try {
        const normalized = await normalizeUploadFile(file, policy);
        if (normalized.size > policy.maxUploadBytes) {
          result.textContent = '文件过大: 最终上传文件最大支持 ' + Math.floor(policy.maxUploadBytes / 1024 / 1024) + 'MB';
          fileInput.value = '';
          return;
        }
        const dt = new DataTransfer();
        dt.items.add(normalized);
        fileInput.files = dt.files;
        showPreview(normalized);
        const saved = file.size - normalized.size;
        const ratio = file.size > 0 ? Math.round((saved / file.size) * 100) : 0;
        function fmtSize(bytes) {
          return bytes >= 1024 * 1024
            ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
            : (bytes / 1024).toFixed(1) + ' KB';
        }
        if (file.type === 'image/webp') {
          result.textContent = '已是 WebP，大小 ' + fmtSize(file.size) + '，直接上传';
        } else if (file.type === 'image/gif') {
          result.textContent = 'GIF 已转为动态 WebP：' + fmtSize(file.size) + ' → ' + fmtSize(normalized.size) + (saved > 0 ? '（节省 ' + ratio + '%）' : '');
        } else if (file.type === 'image/svg+xml') {
          result.textContent = 'SVG 大小 ' + fmtSize(file.size) + '，原样上传并在服务端做安全校验';
        } else {
          result.textContent = '已转为 WebP：' + fmtSize(file.size) + ' → ' + fmtSize(normalized.size) + '（节省 ' + ratio + '%）';
        }
      } catch (err) {
        const msg = (err && err.message) ? err.message : '转码失败';
        result.textContent = '上传前转码失败: ' + msg;
      }
    }

    async function convertToWebp(file) {
      if (!file.type.startsWith('image/')) {
        throw new Error('仅支持图片文件');
      }
      if (file.type === 'image/webp') {
        return file;
      }
      if (!window.createImageBitmap) {
        throw new Error('当前浏览器不支持自动转码，请直接上传 WebP');
      }

      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('浏览器不支持 Canvas 转码');
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (!b) {
            reject(new Error('WebP 编码失败'));
            return;
          }
          resolve(b);
        }, 'image/webp', 0.86);
      });

      const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
      return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
    }

    async function convertGifToAnimatedWebp(file) {
      const tools = await loadGif2WebpTools();
      const module = await tools.Gif2Webp(tools.initLocateFile(new URL('gif2webp.wasm', GIF2WEBP_MODULE_URL).href));
      const cwd = '/workspace';
      const inputPath = cwd + '/input.gif';
      const outputPath = cwd + '/output.webp';
      const bytes = new Uint8Array(await file.arrayBuffer());

      tools.initFS(module, cwd);
      tools.writeFileWithUint8ArrayData(module, inputPath, bytes);
      tools.runGif2Webp(module, undefined, inputPath, '-q', '80', '-mixed', '-mt', '-o', outputPath);

      const blob = tools.getFileWithBlobData(module, outputPath, 'image/webp');
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
        type: 'image/webp',
        lastModified: Date.now(),
      });
    }

    async function loadGif2WebpTools() {
      if (!gif2webpToolsPromise) {
        gif2webpToolsPromise = import(GIF2WEBP_MODULE_URL);
      }
      return gif2webpToolsPromise;
    }

    async function normalizeUploadFile(file, policy) {
      if (!policy.needsConvert) {
        return file;
      }
      if (policy.kind === 'gif') {
        try {
          return await convertGifToAnimatedWebp(file);
        } catch (err) {
          const msg = (err && err.message) ? err.message : 'GIF 转动态 WebP 失败';
          throw new Error(msg + '，请稍后重试或先手动转为动态 WebP');
        }
      }
      return convertToWebp(file);
    }

    function getUploadPolicy(file) {
      if (file.type === 'image/gif') {
        return {
          kind: 'gif',
          needsConvert: true,
          maxSourceBytes: MAX_GIF_SOURCE_BYTES,
          maxUploadBytes: MAX_WEBP_UPLOAD_BYTES,
          label: 'GIF',
        };
      }
      if (file.type === 'image/svg+xml') {
        return {
          kind: 'svg',
          needsConvert: false,
          maxSourceBytes: MAX_SVG_UPLOAD_BYTES,
          maxUploadBytes: MAX_SVG_UPLOAD_BYTES,
          label: 'SVG',
        };
      }
      return {
        kind: 'static',
        needsConvert: file.type !== 'image/webp',
        maxSourceBytes: file.type === 'image/webp' ? MAX_WEBP_UPLOAD_BYTES : MAX_STATIC_SOURCE_BYTES,
        maxUploadBytes: MAX_WEBP_UPLOAD_BYTES,
        label: file.type === 'image/webp' ? 'WebP' : '静态图',
      };
    }
  </script>
</body>
</html>`;
}

function renderManagePage(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} 管理</title>
  <style>
    :root {
      --bg: #f7efe2;
      --card: #fffdf8;
      --text: #2a1f1a;
      --line: #e5d8c5;
      --primary: #8f3f23;
      --primary-soft: #f4e1d3;
      --danger: #b42318;
      --muted: #6a5548;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 8% 5%, #fff6e7 0, transparent 34%),
        radial-gradient(circle at 90% 88%, #efd4b2 0, transparent 26%),
        var(--bg);
      color: var(--text);
      font-family: "Noto Sans SC", sans-serif;
      padding: 18px;
    }
    .wrap {
      width: min(1040px, 100%);
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 22px 56px rgba(70, 44, 28, 0.12);
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .title h2 { margin: 0; font-size: 24px; }
    .subtitle { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .status-pill {
      background: var(--primary-soft);
      color: var(--primary);
      border: 1px solid #e5c9b3;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      min-height: 28px;
      display: inline-flex;
      align-items: center;
    }
    .control, .tool-btn {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      color: var(--text);
      min-height: 36px;
    }
    .control {
      width: min(260px, 70vw);
      padding: 0 12px;
    }
    .tool-btn {
      padding: 0 12px;
      cursor: pointer;
    }
    .list {
      display: grid;
      gap: 14px;
      margin-top: 12px;
    }
    .token-panel {
      border: 1px solid #e7d8c8;
      border-radius: 12px;
      padding: 12px;
      background: #fff8ef;
      margin-bottom: 12px;
    }
    .token-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .token-title {
      font-size: 14px;
      font-weight: 700;
    }
    .token-hint {
      font-size: 12px;
      color: var(--muted);
      margin: 0;
      line-height: 1.45;
    }
    .token-value {
      margin-top: 8px;
      padding: 10px;
      border-radius: 8px;
      background: #fff;
      border: 1px solid #ecdccc;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      word-break: break-all;
      display: none;
    }
    .token-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .token-meta {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }
    .item {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      display: grid;
      grid-template-columns: 118px 1fr;
      gap: 12px;
      align-items: start;
      background: #fff;
    }
    .thumb-wrap {
      width: 118px;
      height: 84px;
      border-radius: 10px;
      border: 1px solid var(--line);
      display: grid;
      place-items: center;
      background: #fff;
      overflow: hidden;
    }
    .thumb {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      object-fit: contain;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .meta { font-size: 12px; color: var(--muted); }
    .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #866753; }
    input[type="text"] {
      width: 100%;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      border: none;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      color: #fff;
      background: var(--primary);
      font-size: 13px;
      line-height: 1;
    }
    .btn.danger { background: var(--danger); }
    .view-link {
      color: var(--primary);
      text-decoration: none;
      font-size: 13px;
      padding: 7px 0;
    }
    .view-link:hover { text-decoration: underline; }
    .empty {
      border: 1px dashed #dfcdbb;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      color: var(--muted);
      background: #fffaf2;
    }
    a { color: var(--primary); }
    @media (max-width: 680px) {
      .wrap { padding: 14px; }
      .item {
        grid-template-columns: 1fr;
      }
      .thumb-wrap {
        width: 100%;
        height: 180px;
      }
      .control { width: 100%; }
      .toolbar { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="topbar">
      <div class="title">
        <h2>图片管理</h2>
        <p class="subtitle">在这里快速预览、改标题、删除历史图片</p>
      </div>
      <div class="toolbar">
        <span id="status" class="status-pill">加载中...</span>
        <input id="filter" class="control" type="search" placeholder="搜索标题或 ID" />
        <button id="reload" class="tool-btn" type="button">刷新</button>
        <a href="/">返回上传页</a>
      </div>
    </div>
    <section class="token-panel">
      <div class="token-head">
        <strong class="token-title">上传 API Token</strong>
        <div class="token-actions">
          <button id="rotateToken" class="tool-btn" type="button">生成 Token</button>
          <button id="copyToken" class="tool-btn" type="button" disabled>复制 Token</button>
        </div>
      </div>
      <p class="token-hint">用于无 Cookie 场景调用上传接口。请求头可用 <code>Authorization: Bearer &lt;token&gt;</code> 或 <code>X-API-Token: &lt;token&gt;</code>。</p>
      <div id="tokenMeta" class="token-meta">正在读取 Token 状态...</div>
      <div id="tokenValue" class="token-value"></div>
    </section>
    <section id="list" class="list"></section>
  </main>
  <script>
    const list = document.getElementById('list');
    const status = document.getElementById('status');
    const filter = document.getElementById('filter');
    const reload = document.getElementById('reload');
    const rotateToken = document.getElementById('rotateToken');
    const copyToken = document.getElementById('copyToken');
    const tokenMeta = document.getElementById('tokenMeta');
    const tokenValue = document.getElementById('tokenValue');
    let allItems = [];
    let latestToken = '';

    loadImages();
    loadTokenInfo();
    filter.addEventListener('input', renderCurrent);
    reload.addEventListener('click', loadImages);
    rotateToken.addEventListener('click', rotateUploadToken);
    copyToken.addEventListener('click', copyUploadToken);

    async function loadImages() {
      status.textContent = '正在获取数据...';
      const res = await fetch('/api/images');
      const body = await res.json();
      if (!res.ok) {
        status.textContent = '加载失败: ' + (body.error || 'unknown');
        return;
      }

      allItems = body.items || [];
      renderCurrent();
    }

    function renderCurrent() {
      const keyword = (filter.value || '').trim().toLowerCase();
      const items = keyword
        ? allItems.filter((item) => {
            const title = String(item.title || '').toLowerCase();
            const id = String(item.id || '').toLowerCase();
            return title.includes(keyword) || id.includes(keyword);
          })
        : allItems;

      status.textContent = '显示 ' + items.length + ' / ' + allItems.length + ' 张图片';
      list.innerHTML = '';

      if (!items.length) {
        list.innerHTML = '<div class="empty">没有匹配结果，试试换个关键词。</div>';
        return;
      }

      for (const item of items) {
        const box = document.createElement('article');
        box.className = 'item';
        const safeTitle = escapeHtml(item.title || '');
        const safeId = escapeHtml(String(item.id || '').slice(0, 12));
        box.innerHTML =
          '<div class="thumb-wrap"><img class="thumb" src="' + escapeAttr(item.public_url) + '" alt="thumb" loading="lazy" /></div>' +
          '<div>' +
            '<div class="row"><span class="meta">' + escapeHtml(item.mime_type || 'unknown') + ' · ' + fmtSize(item.size_bytes || 0) + ' · ' + fmtDate(item.created_at || '') + '</span><span class="meta id">' + safeId + '</span></div>' +
            '<input type="text" maxlength="120" value="' + safeTitle + '" data-id="' + item.id + '" />' +
            '<div class="actions">' +
              '<button class="btn" data-action="save" data-id="' + item.id + '">保存标题</button>' +
              '<button class="btn danger" data-action="delete" data-id="' + item.id + '">删除</button>' +
              '<a class="view-link" href="/i/' + item.id + '" target="_blank" rel="noreferrer">查看页</a>' +
            '</div>' +
          '</div>';
        list.appendChild(box);
      }
    }

    async function loadTokenInfo() {
      const res = await fetch('/api/token');
      const body = await res.json();
      if (!res.ok) {
        tokenMeta.textContent = '读取 Token 状态失败: ' + (body.error || 'unknown');
        return;
      }
      if (!body.configured) {
        rotateToken.textContent = '生成 Token';
        tokenMeta.textContent = '当前未配置 Token。点击“生成 Token”创建。';
        return;
      }
      rotateToken.textContent = '轮换 Token';
      tokenMeta.textContent = '已配置 Token，最近轮换时间：' + fmtDate(body.rotated_at || body.created_at || '');
    }

    async function rotateUploadToken() {
      if (!confirm('确认生成新 Token 吗？旧 Token 将立即失效。')) {
        return;
      }
      status.textContent = '正在生成 Token...';
      const res = await fetch('/api/token/rotate', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        status.textContent = 'Token 生成失败: ' + (body.error || 'unknown');
        return;
      }
      latestToken = body.token || '';
      tokenValue.textContent = latestToken;
      tokenValue.style.display = latestToken ? 'block' : 'none';
      copyToken.disabled = !latestToken;
      rotateToken.textContent = '轮换 Token';
      tokenMeta.textContent = 'Token 已轮换，最近轮换时间：' + fmtDate(body.rotated_at || '');
      status.textContent = 'Token 生成成功';
    }

    async function copyUploadToken() {
      if (!latestToken) {
        return;
      }
      await navigator.clipboard.writeText(latestToken);
      status.textContent = 'Token 已复制';
    }

    list.addEventListener('click', async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      const id = target.dataset.id;
      if (!action || !id) return;

      if (action === 'save') {
        const input = list.querySelector('input[data-id="' + id + '"]');
        const nextTitle = input ? input.value.trim() : '';
        if (!nextTitle) {
          status.textContent = '标题不能为空';
          return;
        }
        status.textContent = '保存中...';
        const res = await fetch('/api/images/' + id, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: nextTitle }),
        });
        const body = await res.json();
        if (!res.ok) {
          status.textContent = '保存失败: ' + (body.error || 'unknown');
          return;
        }
        status.textContent = '保存成功';
      }

      if (action === 'delete') {
        if (!confirm('确定删除这张图片吗？此操作不可恢复。')) return;
        status.textContent = '删除中...';
        const res = await fetch('/api/images/' + id, { method: 'DELETE' });
        const body = await res.json();
        if (!res.ok) {
          status.textContent = '删除失败: ' + (body.error || 'unknown');
          return;
        }
        status.textContent = '删除成功';
        await loadImages();
      }
    });

    function fmtSize(bytes) {
      return bytes >= 1024 * 1024
        ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
        : (bytes / 1024).toFixed(1) + ' KB';
    }

    function fmtDate(input) {
      if (!input) return '-';
      const date = new Date(input);
      if (Number.isNaN(date.getTime())) return input;
      return date.toLocaleString('zh-CN', { hour12: false });
    }

    function escapeHtml(str) {
      return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function escapeAttr(str) {
      return escapeHtml(str);
    }
  </script>
</body>
</html>`;
}

function renderViewPage(image: { id: string; title: string; public_url: string; created_at: string }): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(image.title)}</title>
  <style>
    body {
      margin: 0;
      font-family: "Noto Sans SC", sans-serif;
      background: #f8f7f4;
      color: #242424;
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .wrap {
      background: #fff;
      border: 1px solid #ece7df;
      border-radius: 14px;
      padding: 16px;
      width: min(860px, 100%);
    }
    img { max-width: 100%; border-radius: 10px; display: block; }
    .url {
      margin-top: 10px;
      padding: 10px;
      border-radius: 8px;
      background: #f3efe8;
      word-break: break-all;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <h2>${escapeHtml(image.title)}</h2>
    <img src="${escapeAttr(image.public_url)}" alt="${escapeAttr(image.title)}" />
    <div class="url" id="copy">${escapeHtml(image.public_url)}</div>
    <small>上传时间: ${escapeHtml(image.created_at)}</small>
  </main>
  <script>
    document.getElementById('copy').addEventListener('click', async () => {
      const text = document.getElementById('copy').textContent;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      alert('链接已复制');
    });
  </script>
</body>
</html>`;
}

function renderProtectedPage(error = ""): string {
  const msg = error ? `<p style="color:#b42318;">${escapeHtml(error)}</p>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>访问验证</title>
  <style>
    body { font-family: sans-serif; display: grid; place-items: center; min-height: 100vh; background: #f4efe6; }
    form { background: #fff; border-radius: 12px; padding: 20px; width: min(360px, 92%); border: 1px solid #e7dece; }
    input, button { width: 100%; padding: 10px; margin-top: 8px; }
    button { background: #8f3f23; color: #fff; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <form method="post" action="/protected">
    <h3>输入上传密码</h3>
    ${msg}
    <input type="password" name="password" required />
    <button type="submit">进入上传页</button>
  </form>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input);
}
