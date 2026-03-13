import test from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers/load-worker.mjs";

const worker = await loadWorker();

test("GET /manage redirects to /protected when unauthorized", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/manage", { method: "GET" });

  const response = await worker.fetch(request, env);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.com/protected");
});

test("GET /manage returns HTML when authorized", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/manage", {
    method: "GET",
    headers: { Cookie: "poto_auth=1" },
  });

  const response = await worker.fetch(request, env);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /图片管理/);
});

test("PUT /api/images/:id returns 401 when unauthorized", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/api/images/img-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "new" }),
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "unauthorized");
});

test("PUT /api/images/:id returns 400 for invalid JSON", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/api/images/img-1", {
    method: "PUT",
    headers: {
      Cookie: "poto_auth=1",
      "Content-Type": "application/json",
    },
    body: "not-json",
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_json");
});

test("PUT /api/images/:id returns 400 when title is empty", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/api/images/img-1", {
    method: "PUT",
    headers: {
      Cookie: "poto_auth=1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "   " }),
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error, "title_required");
});

test("PUT /api/images/:id returns 404 when image not found", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/api/images/missing", {
    method: "PUT",
    headers: {
      Cookie: "poto_auth=1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "new" }),
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "not_found");
});

test("PUT /api/images/:id updates title successfully", async () => {
  const env = createEnv({
    images: {
      "img-1": { id: "img-1", title: "old", deleted_at: null },
    },
  });

  const request = new Request("https://example.com/api/images/img-1", {
    method: "PUT",
    headers: {
      Cookie: "poto_auth=1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "new title" }),
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.id, "img-1");
  assert.equal(body.title, "new title");
  assert.equal(env.__state.images["img-1"].title, "new title");
});

test("DELETE /api/images/:id returns 401 when unauthorized", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/api/images/img-1", {
    method: "DELETE",
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "unauthorized");
});

test("DELETE /api/images/:id returns 404 when image not found", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/api/images/missing", {
    method: "DELETE",
    headers: { Cookie: "poto_auth=1" },
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error, "not_found");
});

test("DELETE /api/images/:id returns already_deleted when image is already deleted", async () => {
  const env = createEnv({
    images: {
      "img-1": {
        id: "img-1",
        title: "old",
        object_key: "images/2026-03-14/img-1.webp",
        deleted_at: "2026-03-14T00:00:00.000Z",
      },
    },
  });

  const request = new Request("https://example.com/api/images/img-1", {
    method: "DELETE",
    headers: { Cookie: "poto_auth=1" },
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.already_deleted, true);
  assert.equal(env.__state.deletedKeys.length, 0);
});

test("DELETE /api/images/:id deletes from R2 and marks record deleted", async () => {
  const env = createEnv({
    images: {
      "img-1": {
        id: "img-1",
        title: "old",
        object_key: "images/2026-03-14/img-1.webp",
        deleted_at: null,
      },
    },
  });

  const request = new Request("https://example.com/api/images/img-1", {
    method: "DELETE",
    headers: { Cookie: "poto_auth=1" },
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(env.__state.deletedKeys.length, 1);
  assert.equal(env.__state.deletedKeys[0], "images/2026-03-14/img-1.webp");
  assert.match(String(env.__state.images["img-1"].deleted_at), /T/);
});

function createEnv(seed = { images: {} }) {
  const state = {
    images: { ...seed.images },
    deletedKeys: [],
  };

  return {
    DB: createMockDB(state),
    R2_BUCKET: {
      async put() {
        return { etag: "mock-etag" };
      },
      async get() {
        return null;
      },
      async delete() {
        const key = arguments[0];
        state.deletedKeys.push(key);
        return;
      },
    },
    ACCESS_PASSWORD: "123456",
    __state: state,
  };
}

function createMockDB(state) {
  return {
    prepare(query) {
      return createStatement(query, state);
    },
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
      if (query.includes("SELECT id, deleted_at FROM images WHERE id = ?")) {
        const id = values[0];
        return state.images[id] ?? null;
      }
      if (query.includes("SELECT object_key, deleted_at FROM images WHERE id = ?")) {
        const id = values[0];
        const row = state.images[id];
        if (!row) {
          return null;
        }
        return {
          object_key: row.object_key,
          deleted_at: row.deleted_at,
        };
      }
      throw new Error(`Unhandled first() query: ${query}`);
    },
    async run() {
      if (query.includes("UPDATE images SET title = ? WHERE id = ?")) {
        const [title, id] = values;
        if (state.images[id]) {
          state.images[id].title = title;
        }
        return {};
      }
      if (query.includes("UPDATE images SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")) {
        const [id] = values;
        if (state.images[id]) {
          state.images[id].deleted_at = new Date().toISOString();
        }
        return {};
      }
      throw new Error(`Unhandled run() query: ${query}`);
    },
    async all() {
      throw new Error(`Unhandled all() query: ${query}`);
    },
  };
}
