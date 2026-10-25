import test from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers/load-worker.mjs";
const worker = await loadWorker();
const base = "https://poto.example/files/images/sample.png";
function setup() {
  const state = { version: "v1", mime: "image/png", size: 8, calls: [], gets: 0, missing: false, fail: false };
  const metadata = () => ({ version: state.version, etag: state.version, size: state.size, httpMetadata: { contentType: state.mime } });
  const env = {
    R2_BUCKET: {
      async head() { return state.missing ? null : metadata(); },
      async get() { state.gets++; return state.missing ? null : { ...metadata(), body: new Response("original").body }; },
    },
    IMAGES: { input(stream) { return { transform(options) { return { async output(output) {
      state.calls.push({ options, output });
      await new Response(stream).text();
      if (state.fail) throw new Error("9422 secret-token");
      return { response: () => new Response("webp-result", { headers: { "content-type": "image/webp" } }) };
    } }; } }; } },
  };
  const entries = new Map();
  globalThis.caches = { default: {
    async match(key) { return entries.get(key.url)?.clone(); },
    async put(key, response) { entries.set(key.url, response.clone()); },
  } };
  return { env, state, entries, get: (query = "", url = base) => worker.fetch(new Request(url + query), env) };
}
test("original bytes and headers stay unchanged without parameters", async () => {
  const { get, state } = setup();
  const res = await get();
  assert.equal(await res.text(), "original");
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(state.calls.length, 0);
});
test("fixed variants, normalized queries, source identity and version isolate cache", async () => {
  const { get, state, entries } = setup();
  let res = await get("?w=160");
  assert.equal(res.headers.get("content-type"), "image/webp");
  assert.equal(res.headers.get("x-poto-thumbnail"), "generated");
  assert.equal(await res.text(), "webp-result");
  res = await get("?%77=%31%36%30");
  assert.equal(res.headers.get("x-poto-thumbnail"), "hit");
  assert.equal(state.calls.length, 1);
  assert.equal(state.gets, 1);
  await get("?w=320");
  await get("?w=640");
  assert.deepEqual(state.calls.map(c => c.options), [160, 320, 640].map(width => ({ width, fit: "scale-down" })));
  assert.deepEqual(state.calls[0].output, { format: "image/webp", quality: 80, anim: false });
  await get("?w=160", base.replace("sample", "different"));
  state.version = "v2";
  await get("?w=160");
  assert.equal(entries.size, 5);
  state.missing = true;
  assert.equal((await get("?w=160")).status, 404);
});
test("unknown, duplicate and malformed options cannot create transform variants", async () => {
  const { get, state } = setup();
  for (const q of ["?w=161", "?w=0160", "?w=160&w=160", "?w=160&q=90", "?url=https://internal/", "?w=", "?w=160.0", "?W=160"]) {
    const res = await get(q);
    assert.equal(res.status, 400, q);
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
  assert.equal(state.gets, 0);
  assert.equal(state.calls.length, 0);
  assert.equal((await get("", "https://poto.example/files/%ZZ")).status, 400);
});
test("missing binding and consumed-stream failures re-read original without caching", async () => {
  const { get, env, state, entries } = setup();
  state.fail = true;
  let res = await get("?w=160");
  assert.equal(await res.text(), "original");
  assert.equal(res.headers.get("x-poto-thumbnail"), "fallback-transform-failed");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(state.gets, 2);
  assert.equal(entries.size, 0);
  delete env.IMAGES;
  res = await get("?w=320");
  assert.equal(res.headers.get("x-poto-thumbnail"), "fallback-binding-missing");
});
test("SVG and large/unsupported sources retain original security headers", async () => {
  const { get, state } = setup();
  state.mime = "image/svg+xml";
  let res = await get("?w=160");
  assert.equal(res.headers.get("content-type"), "image/svg+xml");
  assert.match(res.headers.get("content-security-policy"), /sandbox/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await res.text(), "original");
  state.mime = "image/png";
  state.size = 10 * 1024 * 1024 + 1;
  res = await get("?w=160");
  assert.equal(res.headers.get("x-poto-thumbnail"), "fallback-source-too-large");
  assert.equal(state.calls.length, 0);
});
test("cache match/put failures keep images available", async () => {
  const { get, state } = setup();
  globalThis.caches.default.match = async () => { throw new Error("unavailable"); };
  assert.equal(await (await get("?w=160")).text(), "webp-result");
  globalThis.caches.default.match = async () => undefined;
  globalThis.caches.default.put = async () => { throw new Error("unavailable"); };
  assert.equal(await (await get("?w=320")).text(), "webp-result");
  assert.equal(state.calls.length, 2);
});
test("replacement during read is never cached under previous version", async () => {
  const { get, env, state, entries } = setup();
  const read = env.R2_BUCKET.get;
  env.R2_BUCKET.get = async () => { state.version = "replacement"; return read(); };
  assert.equal((await get("?w=160")).headers.get("x-poto-thumbnail"), "fallback-source-changed");
  assert.equal(entries.size, 0);
  assert.equal(state.calls.length, 0);
});

test("non-image, failed status and broken output streams fall back without cache poisoning", async () => {
  const { get, env, entries } = setup();
  for (const makeResponse of [
    () => new Response("error", { status: 500 }),
    () => new Response("error", { headers: { "content-type": "text/html" } }),
    () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("decode failed")); } }), { headers: { "content-type": "image/webp" } }),
  ]) {
    env.IMAGES.input = () => ({ transform: () => ({ output: async () => ({ response: makeResponse }) }) });
    const res = await get("?w=160");
    assert.equal(res.headers.get("x-poto-thumbnail"), "fallback-transform-failed");
    assert.equal(await res.text(), "original");
    assert.equal(entries.size, 0);
  }
});
