import { generateApiToken, hashApiToken } from "../lib/auth";
import { htmlResponse, json } from "../lib/http";
import { sha256Hex } from "../lib/upload";
import { renderProtectedPage } from "../pages/simple-pages";
import type { AccessPasswordRow, ApiTokenRow, Env } from "../types";

const DEFAULT_ACCESS_PASSWORD = "potopaas";

export async function handleGetApiToken(env: Env): Promise<Response> {
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

export async function handleRotateApiToken(env: Env): Promise<Response> {
  const token = generateApiToken();
  const tokenHash = await hashApiToken(token);
  const now = new Date().toISOString();
  const exists = await env.DB.prepare("SELECT token_hash, created_at, rotated_at FROM api_tokens WHERE id = 1")
    .first<ApiTokenRow>();

  if (exists) {
    await env.DB.prepare("UPDATE api_tokens SET token_hash = ?, rotated_at = ? WHERE id = 1")
      .bind(tokenHash, now)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO api_tokens (id, token_hash, created_at, rotated_at) VALUES (1, ?, ?, ?)")
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

export async function handleProtectedPost(request: Request, env: Env, origin: string): Promise<Response> {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const valid = await verifyAccessPassword(env, password);

  if (!valid) {
    return htmlResponse(renderProtectedPage("密码错误"), 401);
  }

  const headers = new Headers();
  headers.set("Location", `${origin}/`);
  headers.append("Set-Cookie", "poto_auth=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400");
  return new Response(null, { status: 302, headers });
}

export function handleLogout(origin: string): Response {
  const headers = new Headers();
  headers.set("Location", `${origin}/protected`);
  headers.append("Set-Cookie", "poto_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(null, { status: 302, headers });
}

export async function handleGetAccessPassword(env: Env): Promise<Response> {
  const row = await getAccessPasswordRow(env);
  return json({
    configured: Boolean(row),
    updated_at: row?.updated_at ?? "",
  });
}

export async function handleUpdateAccessPassword(request: Request, env: Env): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const payload = typeof body === "object" && body ? body as Record<string, unknown> : {};
  const nextPassword = String(payload.password ?? "").trim();
  if (!nextPassword) {
    return json({ error: "password_required" }, 400);
  }

  const now = new Date().toISOString();
  const current = await getAccessPasswordRow(env);
  const nextHash = await hashAccessPassword(nextPassword);

  if (current) {
    await env.DB.prepare("UPDATE access_password SET password_hash = ?, updated_at = ? WHERE id = 1")
      .bind(nextHash, now)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO access_password (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)")
      .bind(nextHash, now, now)
      .run();
  }

  return json({ ok: true, updated_at: now });
}

async function verifyAccessPassword(env: Env, inputPassword: string): Promise<boolean> {
  const row = await ensureAccessPasswordRow(env);
  const inputHash = await hashAccessPassword(inputPassword);
  return row.password_hash === inputHash;
}

async function ensureAccessPasswordRow(env: Env): Promise<AccessPasswordRow> {
  const existing = await getAccessPasswordRow(env);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const fallbackPassword = String(env.ACCESS_PASSWORD ?? "").trim() || DEFAULT_ACCESS_PASSWORD;
  const fallbackHash = await hashAccessPassword(fallbackPassword);
  await env.DB.prepare("INSERT INTO access_password (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)")
    .bind(fallbackHash, now, now)
    .run();

  return {
    password_hash: fallbackHash,
    created_at: now,
    updated_at: now,
  };
}

async function getAccessPasswordRow(env: Env): Promise<AccessPasswordRow | null> {
  return env.DB.prepare("SELECT password_hash, created_at, updated_at FROM access_password WHERE id = 1")
    .first<AccessPasswordRow>();
}

async function hashAccessPassword(password: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(password));
}
