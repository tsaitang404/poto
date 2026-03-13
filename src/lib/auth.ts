import type { ApiTokenRow, Env } from "../types";
import { sha256Hex } from "./upload";

export function isAuthed(request: Request): boolean {
  const cookie = request.headers.get("Cookie") ?? "";
  return cookie.includes("poto_auth=1");
}

export async function isUploadAuthed(request: Request, env: Env): Promise<boolean> {
  if (isAuthed(request)) {
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

export async function hashApiToken(token: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(token));
}

export function generateApiToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  const base64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `poto_${base64}`;
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
