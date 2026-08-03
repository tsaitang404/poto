import test from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers/load-worker.mjs";

const worker = await loadWorker();

test("POST /api/upload returns existing image info when same sha256 is active", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const sha = await sha256Hex(bytes);
  const env = createEnv({
    bySha: {
      [sha]: {
        id: "img-existing",
        title: "already there",
        public_url: "http://localhost:8788/files/images/existing.webp",
        mime_type: "image/webp",
        size_bytes: 4,
        created_at: "2026-03-14T00:00:00.000Z",
        deleted_at: null,
      },
    },
  });

  const request = makeUploadRequest(bytes, "same.webp", "image/webp", await makeSignedCookie(env));
  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.duplicate, true);
  assert.equal(body.id, "img-existing");
  assert.equal(body.url, "http://localhost:8788/files/images/existing.webp");
  assert.equal(env.__state.r2PutCalls.length, 0);
  assert.equal(env.__state.insertCalls.length, 0);
  assert.equal(env.__state.restoreCalls.length, 0);
});

test("POST /api/upload restores deleted record and writes file again", async () => {
  const bytes = new Uint8Array([9, 8, 7, 6]);
  const sha = await sha256Hex(bytes);
  const env = createEnv({
    bySha: {
      [sha]: {
        id: "img-deleted",
        title: "old title",
        public_url: "http://localhost:8788/files/images/deleted.webp",
        mime_type: "image/webp",
        size_bytes: 4,
        created_at: "2026-03-13T00:00:00.000Z",
        deleted_at: "2026-03-14T00:00:00.000Z",
      },
    },
  });

  const request = makeUploadRequest(bytes, "again.webp", "image/webp", await makeSignedCookie(env));
  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.restored, true);
  assert.equal(body.id, "img-deleted");
  assert.equal(env.__state.r2PutCalls.length, 1);
  assert.equal(env.__state.insertCalls.length, 0);
  assert.equal(env.__state.restoreCalls.length, 1);
});

function makeUploadRequest(bytes, filename, mimeType, cookie = "poto_auth=1") {
  const form = new FormData();
  const file = new File([bytes], filename, { type: mimeType });
  form.set("image", file);
  form.set("title", "upload title");
  return new Request("http://localhost:8788/api/upload", {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
}

// 生成 HMAC 签名 cookie（对应修复后的认证逻辑）
async function makeSignedCookie(env) {
  const { createHash } = await import("node:crypto");
  const expiry = String(Date.now() + 86400 * 1000);
  const sig = createHash("sha256").update(`${env.ACCESS_PASSWORD}:${expiry}`).digest("hex");
  return `poto_auth=${expiry}.${sig}`;
}

function createEnv(seed = { bySha: {} }) {
  const state = {
    configurationRow: seed.configurationRow ?? null,
    bySha: { ...seed.bySha },
    r2PutCalls: [],
    insertCalls: [],
    restoreCalls: [],
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
      if (query.includes("INSERT INTO images")) {
        state.insertCalls.push(values);
        return {};
      }
      if (query.includes("UPDATE images") && query.includes("deleted_at = NULL")) {
        state.restoreCalls.push(values);
        return {};
      }
      throw new Error(`Unhandled run() query: ${query}`);
    },
    async all() {
      throw new Error(`Unhandled all() query: ${query}`);
    },
  };
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", input);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}
