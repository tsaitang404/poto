import type { ApiTokenRow, Env } from "../types";
import { sha256Hex } from "./upload";

// Cookie 认证修复：poto_auth 值改为 HMAC 签名（不再是固定值 "1"）
// 格式: <expiry>.<hmac>，其中 hmac = sha256(ACCESS_PASSWORD + expiry)
// 无法伪造（攻击者不知道 ACCESS_PASSWORD），防篡改（改了过期时间签名不匹配）
const COOKIE_MAX_AGE = 86400; // 24h

async function hmacFor(secret: string, expiry: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(`${secret}:${expiry}`));
}

export async function isAuthed(request: Request, env: Env): Promise<boolean> {
  const cookies = parseCookies(request.headers.get("Cookie") ?? "");
  const raw = cookies.get("poto_auth");
  if (!raw) {
    return false;
  }

  // 解析 <expiry>.<hmac>
  const dot = raw.indexOf(".");
  if (dot <= 0) {
    return false;
  }
  const expiry = raw.slice(0, dot);
  const provided = raw.slice(dot + 1);

  const secret = env.ACCESS_PASSWORD;
  if (!secret) {
    return false;
  }

  // 过期检查
  const expiryMs = Number(expiry);
  if (!Number.isFinite(expiryMs) || Date.now() > expiryMs) {
    return false;
  }

  // 签名比对（恒定时间比较，防时序攻击）
  const expected = await hmacFor(secret, expiry);
  if (expected.length !== provided.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export function createAuthCookie(): string {
  const expiry = String(Date.now() + COOKIE_MAX_AGE * 1000);
  // 由调用方在设置 cookie 时计算签名（需要 env.ACCESS_PASSWORD）
  return `${expiry}.`;
}

export async function buildAuthCookieValue(env: Env): Promise<string> {
  const expiry = String(Date.now() + COOKIE_MAX_AGE * 1000);
  const sig = await hmacFor(env.ACCESS_PASSWORD ?? "", expiry);
  return `${expiry}.${sig}`;
}

export async function verifyAuthCookieValue(env: Env, raw: string): Promise<boolean> {
  const dot = raw.indexOf(".");
  if (dot <= 0) {
    return false;
  }
  const expiry = raw.slice(0, dot);
  const provided = raw.slice(dot + 1);
  const secret = env.ACCESS_PASSWORD;
  if (!secret) {
    return false;
  }
  const expiryMs = Number(expiry);
  if (!Number.isFinite(expiryMs) || Date.now() > expiryMs) {
    return false;
  }
  const expected = await hmacFor(secret, expiry);
  if (expected.length !== provided.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export async function isUploadAuthed(request: Request, env: Env): Promise<boolean> {
  if (await isAuthed(request, env)) {
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

function parseCookies(header: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
    }
  }
  return map;
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
