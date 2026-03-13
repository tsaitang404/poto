import { generateApiToken, hashApiToken } from "../lib/auth";
import { htmlResponse, json } from "../lib/http";
import { renderProtectedPage } from "../pages/simple-pages";
import type { ApiTokenRow, Env } from "../types";

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

  if (!env.ACCESS_PASSWORD || password !== env.ACCESS_PASSWORD) {
    return htmlResponse(renderProtectedPage("密码错误"), 401);
  }

  const headers = new Headers();
  headers.set("Location", `${origin}/`);
  headers.append("Set-Cookie", "poto_auth=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400");
  return new Response(null, { status: 302, headers });
}
