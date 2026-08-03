import test from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers/load-worker.mjs";

const worker = await loadWorker();

// 生成 HMAC 签名 cookie（对应修复后的认证逻辑）
async function makeSignedCookie(env) {
  const { sha256Hex } = await import("../src/lib/upload.ts");
  const expiry = String(Date.now() + 86400 * 1000);
  const sig = await sha256Hex(new TextEncoder().encode(`${env.ACCESS_PASSWORD}:${expiry}`));
  return `poto_auth=${expiry}.${sig}`;
}


test("POST /api/token/rotate returns 401 when unauthorized", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/api/token/rotate", { method: "POST" });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "unauthorized");
});

test("POST /api/token/rotate issues token and GET /api/token shows configured", async () => {
  const env = createEnv();

  const rotateReq = new Request("https://example.com/api/token/rotate", {
    method: "POST",
    headers: { Cookie: await makeSignedCookie(env) },
  });
  const rotateRes = await worker.fetch(rotateReq, env);
  const rotateBody = await rotateRes.json();

  assert.equal(rotateRes.status, 200);
  assert.equal(rotateBody.ok, true);
  assert.match(String(rotateBody.token), /^poto_/);

  const infoReq = new Request("https://example.com/api/token", {
    method: "GET",
    headers: { Cookie: await makeSignedCookie(env) },
  });
  const infoRes = await worker.fetch(infoReq, env);
  const infoBody = await infoRes.json();

  assert.equal(infoRes.status, 200);
  assert.equal(infoBody.configured, true);
  assert.ok(infoBody.rotated_at);
  assert.equal(env.__state.tokenRow !== null, true);
});

test("GET /api/settings returns default upload settings", async () => {
  const env = createEnv();

  const response = await worker.fetch(new Request("https://example.com/api/settings", {
    method: "GET",
    headers: { Cookie: await makeSignedCookie(env) },
  }), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.webp_mode, "smart");
  assert.equal(body.static_webp_quality, 86);
  assert.equal(body.gif_webp_quality, 80);
  assert.equal(body.static_source_max_mb, 10);
  assert.equal(body.gif_source_max_mb, 20);
  assert.equal(body.webp_upload_max_mb, 20);
  assert.equal(body.svg_upload_max_mb, 1);
  assert.equal(body.cloudflare_api_token, "");
  assert.equal(body.cloudflare_api_token_source, "env");
});

test("PUT /api/settings saves upload settings", async () => {
  const env = createEnv();

  const response = await worker.fetch(new Request("https://example.com/api/settings", {
    method: "PUT",
    headers: {
      Cookie: await makeSignedCookie(env),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      webp_mode: "force",
      static_webp_quality: 72,
      gif_webp_quality: 64,
      static_source_max_mb: 12.5,
      gif_source_max_mb: 25,
      webp_upload_max_mb: 18.5,
      svg_upload_max_mb: 2,
      cloudflare_api_token: "override-token",
    }),
  }), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.webp_mode, "force");
  assert.equal(body.static_webp_quality, 72);
  assert.equal(body.gif_webp_quality, 64);
  assert.equal(body.static_source_max_mb, 12.5);
  assert.equal(body.gif_source_max_mb, 25);
  assert.equal(body.webp_upload_max_mb, 18.5);
  assert.equal(body.svg_upload_max_mb, 2);
  assert.equal(body.cloudflare_api_token, "override-token");
  assert.equal(body.cloudflare_api_token_source, "configured");
  assert.equal(env.__state.configurationRow.webp_mode, "force");
  assert.equal(env.__state.configurationRow.cloudflare_api_token, "override-token");
});

test("POST /api/upload enforces configured upload size limit", async () => {
  const env = createEnv({
    configurationRow: {
      webp_mode: "smart",
      static_webp_quality: 86,
      gif_webp_quality: 80,
      static_source_max_mb: 10,
      gif_source_max_mb: 20,
      webp_upload_max_mb: 0.1,
      svg_upload_max_mb: 1,
      updated_at: "2026-03-14T00:00:00.000Z",
    },
  });
  const form = new FormData();
  const file = new File([new Uint8Array(200 * 1024)], "large.webp", { type: "image/webp" });
  form.set("image", file);

  const response = await worker.fetch(new Request("https://example.com/api/upload", {
    method: "POST",
    headers: { Cookie: await makeSignedCookie(env) },
    body: form,
  }), env);
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.match(String(body.error), /file too large/);
});

test("POST /api/upload accepts Bearer token auth", async () => {
  const env = createEnv();

  const rotateReq = new Request("https://example.com/api/token/rotate", {
    method: "POST",
    headers: { Cookie: await makeSignedCookie(env) },
  });
  const rotateRes = await worker.fetch(rotateReq, env);
  const rotateBody = await rotateRes.json();
  const token = rotateBody.token;

  const form = new FormData();
  const file = new File([new Uint8Array([1, 2, 3])], "a.webp", { type: "image/webp" });
  form.set("image", file);
  form.set("title", "token-upload");

  const uploadReq = new Request("https://example.com/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const uploadRes = await worker.fetch(uploadReq, env);
  const uploadBody = await uploadRes.json();

  assert.equal(uploadRes.status, 201);
  assert.equal(uploadBody.ok, true);
  assert.equal(env.__state.r2PutCalls.length, 1);
});

test("POST /api/upload rejects invalid token", async () => {
  const env = createEnv();
  const form = new FormData();
  const file = new File([new Uint8Array([1, 2, 3])], "a.webp", { type: "image/webp" });
  form.set("image", file);

  const request = new Request("https://example.com/api/upload", {
    method: "POST",
    headers: { Authorization: "Bearer invalid-token" },
    body: form,
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "unauthorized");
});

function createEnv(seed = {}) {
  const state = {
    tokenRow: seed.tokenRow ?? null,
    configurationRow: seed.configurationRow ?? null,
    bySha: seed.bySha ?? {},
    r2PutCalls: [],
  };

  return {
    DB: {
      prepare(query) {
        return createStatement(query, state);
      },
    },
    R2_BUCKET: {
      async put(key) {
        state.r2PutCalls.push(key);
        return { etag: "mock-etag" };
      },
      async get() {
        return null;
      },
      async delete() {
        return;
      },
    },
    ACCESS_PASSWORD: "123456",
    CLOUDFLARE_API_TOKEN: "env-token",
    __state: state,
  };
}

function createStatement(query, state) {
  let values = [];
  return {
    bind(...args) {
      values = args;
      return this;
    },
    async first() {
      if (query.includes("SELECT token_hash, created_at, rotated_at FROM api_tokens WHERE id = 1")) {
        return state.tokenRow;
      }
      if (query.includes("SELECT webp_mode") && query.includes("FROM configuration") && query.includes("WHERE id = 1")) {
        return state.configurationRow;
      }
      if (query.includes("SELECT id, title, public_url, mime_type, size_bytes, created_at, deleted_at FROM images WHERE sha256 = ?")) {
        const [sha] = values;
        return state.bySha[sha] ?? null;
      }
      throw new Error(`Unhandled first() query: ${query}`);
    },
    async run() {
      if (query.includes("INSERT INTO api_tokens")) {
        const [tokenHash, createdAt, rotatedAt] = values;
        state.tokenRow = {
          token_hash: tokenHash,
          created_at: createdAt,
          rotated_at: rotatedAt,
        };
        return {};
      }
      if (query.includes("UPDATE api_tokens SET token_hash = ?, rotated_at = ? WHERE id = 1")) {
        const [tokenHash, rotatedAt] = values;
        if (!state.tokenRow) {
          state.tokenRow = {
            token_hash: tokenHash,
            created_at: rotatedAt,
            rotated_at: rotatedAt,
          };
        } else {
          state.tokenRow.token_hash = tokenHash;
          state.tokenRow.rotated_at = rotatedAt;
        }
        return {};
      }
      if (query.includes("INSERT INTO configuration")) {
        const [webpMode, staticWebpQuality, gifWebpQuality, staticSourceMaxMb, gifSourceMaxMb, webpUploadMaxMb, svgUploadMaxMb, cloudflareApiToken, updatedAt] = values;
        state.configurationRow = {
          webp_mode: webpMode,
          static_webp_quality: staticWebpQuality,
          gif_webp_quality: gifWebpQuality,
          static_source_max_mb: staticSourceMaxMb,
          gif_source_max_mb: gifSourceMaxMb,
          webp_upload_max_mb: webpUploadMaxMb,
          svg_upload_max_mb: svgUploadMaxMb,
          cloudflare_api_token: cloudflareApiToken,
          updated_at: updatedAt,
        };
        return {};
      }
      if (query.includes("INSERT INTO images")) {
        return {};
      }
      if (query.includes("UPDATE images") && query.includes("deleted_at = NULL")) {
        return {};
      }
      throw new Error(`Unhandled run() query: ${query}`);
    },
    async all() {
      throw new Error(`Unhandled all() query: ${query}`);
    },
  };
}
