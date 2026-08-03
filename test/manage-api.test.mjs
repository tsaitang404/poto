import test from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers/load-worker.mjs";
import { createEnv, buildImage } from "./helpers/manage-api-mocks.mjs";

const worker = await loadWorker();

// 生成 HMAC 签名 cookie（对应修复后的认证逻辑）
async function makeSignedCookie(env) {
  const { createHash } = await import("node:crypto");
  const expiry = String(Date.now() + 86400 * 1000);
  const sig = createHash("sha256").update(`${env.ACCESS_PASSWORD}:${expiry}`).digest("hex");
  return `poto_auth=${expiry}.${sig}`;
}


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
    headers: { Cookie: await makeSignedCookie(env) },
  });

  const response = await worker.fetch(request, env);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /图片管理/);
  assert.match(html, /统计概览/);
  assert.match(html, /上一页/);
  assert.match(html, /下一页/);
});

test("GET /api/stats returns platform-first summary and aggregates", async () => {
  const env = createEnv({
    images: {
      "img-1": buildImage("img-1", "2026-03-14T10:00:00.000Z"),
      "img-2": {
        ...buildImage("img-2", "2026-03-13T10:00:00.000Z"),
        title: "vector",
        mime_type: "image/svg+xml",
        object_key: "images/2026-03-13/img-2.svg",
        public_url: "https://example.com/files/images/2026-03-13/img-2.svg",
        size_bytes: 2048,
      },
    },
    configurationRow: {
      webp_mode: "smart",
      static_webp_quality: 86,
      gif_webp_quality: 80,
      static_source_max_mb: 10,
      gif_source_max_mb: 20,
      webp_upload_max_mb: 20,
      svg_upload_max_mb: 1,
      cloudflare_api_token: "override-token",
      updated_at: "2026-03-14T00:00:00.000Z",
    },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    assert.equal(String(init?.headers?.Authorization ?? init?.headers?.authorization ?? ""), "Bearer override-token");
    if (url === "https://api.cloudflare.com/client/v4/graphql") {
      const payload = JSON.parse(String(init?.body ?? "{}"));
      if (String(payload.query).includes("r2StorageAdaptiveGroups")) {
        return Response.json({
          data: {
            viewer: {
              accounts: [{
                r2StorageAdaptiveGroups: [{ max: { payloadSize: 6000, metadataSize: 200, objectCount: 2 } }],
              }],
            },
          },
        });
      }
      if (String(payload.query).includes("r2OperationsAdaptiveGroups")) {
        return Response.json({
          data: {
            viewer: {
              accounts: [{
                r2OperationsAdaptiveGroups: [
                  { dimensions: { objectName: "images/2026-03-14/img-1.webp" }, sum: { requests: 5 } },
                  { dimensions: { objectName: "images/2026-03-13/img-2.svg" }, sum: { requests: 2 } },
                ],
              }],
            },
          },
        });
      }
      if (String(payload.query).includes("d1AnalyticsAdaptiveGroups")) {
        return Response.json({
          data: {
            viewer: {
              accounts: [{
                d1AnalyticsAdaptiveGroups: [{ sum: { readQueries: 8, writeQueries: 5 } }],
              }],
            },
          },
        });
      }
    }

    if (url.includes("/d1/database/")) {
      return Response.json({
        success: true,
        result: { file_size: 40960 },
      });
    }

    throw new Error("Unexpected fetch: " + url);
  };

  try {
    const request = new Request("https://example.com/api/stats", {
      method: "GET",
      headers: { Cookie: await makeSignedCookie(env) },
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.summary.r2_total_usage_bytes, 6200);
    assert.equal(body.summary.d1_total_usage_bytes, 40960);
    assert.equal(body.summary.r2_monthly_downloads, 7);
    assert.equal(body.summary.d1_monthly_queries, 13);
    assert.equal(body.top_files.length, 2);
    assert.equal(body.mime_breakdown.length, 2);
    assert.equal(body.monthly_access[0].id, "img-1");
    assert.equal(body.monthly_access[0].downloads, 5);
    assert.equal(body.meta.sources.r2_total_usage, "cloudflare-r2-graphql");
    assert.equal(body.meta.sources.d1_total_usage, "cloudflare-d1-rest");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET /api/stats returns config error when CLOUDFLARE_API_TOKEN is missing", async () => {
  const env = createEnv();
  delete env.CLOUDFLARE_API_TOKEN;

  const request = new Request("https://example.com/api/stats", {
    method: "GET",
    headers: { Cookie: await makeSignedCookie(env) },
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.error, "missing_config:CLOUDFLARE_API_TOKEN");
});

test("POST /logout clears auth cookie and redirects to /protected", async () => {
  const env = createEnv();
  const request = new Request("https://example.com/logout", {
    method: "POST",
    headers: { Cookie: await makeSignedCookie(env) },
  });

  const response = await worker.fetch(request, env);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.com/protected");
  assert.match(String(response.headers.get("set-cookie")), /Max-Age=0/);
});

test("GET /api/images returns pagination metadata and paged items", async () => {
  const env = createEnv({
    images: {
      "img-1": buildImage("img-1", "2026-03-14T10:00:00.000Z"),
      "img-2": buildImage("img-2", "2026-03-14T09:00:00.000Z"),
      "img-3": buildImage("img-3", "2026-03-14T08:00:00.000Z"),
    },
  });
  const request = new Request("https://example.com/api/images?page=2&page_size=2", {
    method: "GET",
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.page, 2);
  assert.equal(body.page_size, 2);
  assert.equal(body.total, 3);
  assert.equal(body.total_pages, 2);
  assert.equal(body.has_prev, true);
  assert.equal(body.has_next, false);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].id, "img-3");
});

test("GET /api/images clamps invalid pagination params", async () => {
  const env = createEnv({
    images: {
      "img-1": buildImage("img-1", "2026-03-14T10:00:00.000Z"),
      "img-2": buildImage("img-2", "2026-03-14T09:00:00.000Z"),
    },
  });
  const request = new Request("https://example.com/api/images?page=0&page_size=999", {
    method: "GET",
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.page, 1);
  assert.equal(body.page_size, 500);
  assert.equal(body.total, 2);
  assert.equal(body.items.length, 2);
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
      Cookie: await makeSignedCookie(env),
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
      Cookie: await makeSignedCookie(env),
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
      Cookie: await makeSignedCookie(env),
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
      Cookie: await makeSignedCookie(env),
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
    headers: { Cookie: await makeSignedCookie(env) },
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
    headers: { Cookie: await makeSignedCookie(env) },
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
    headers: { Cookie: await makeSignedCookie(env) },
  });

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(env.__state.deletedKeys.length, 1);
  assert.equal(env.__state.deletedKeys[0], "images/2026-03-14/img-1.webp");
  assert.match(String(env.__state.images["img-1"].deleted_at), /T/);
});
