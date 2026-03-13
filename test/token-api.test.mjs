import test from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers/load-worker.mjs";

const worker = await loadWorker();

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
    headers: { Cookie: "poto_auth=1" },
  });
  const rotateRes = await worker.fetch(rotateReq, env);
  const rotateBody = await rotateRes.json();

  assert.equal(rotateRes.status, 200);
  assert.equal(rotateBody.ok, true);
  assert.match(String(rotateBody.token), /^poto_/);

  const infoReq = new Request("https://example.com/api/token", {
    method: "GET",
    headers: { Cookie: "poto_auth=1" },
  });
  const infoRes = await worker.fetch(infoReq, env);
  const infoBody = await infoRes.json();

  assert.equal(infoRes.status, 200);
  assert.equal(infoBody.configured, true);
  assert.ok(infoBody.rotated_at);
  assert.equal(env.__state.tokenRow !== null, true);
});

test("POST /api/upload accepts Bearer token auth", async () => {
  const env = createEnv();

  const rotateReq = new Request("https://example.com/api/token/rotate", {
    method: "POST",
    headers: { Cookie: "poto_auth=1" },
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
