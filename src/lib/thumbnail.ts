import type { Env } from "../types";

const WIDTHS = new Set(["160", "320", "640"]);
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const VERSION = "v1-webp-q80-static";
const SOURCE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

type Original = (reason?: string) => Promise<Response>;

// Only this query interface can reach Images; no user-provided URL or transform options.
export async function serveThumbnail(request: Request, env: Env, objectKey: string, original: Original): Promise<Response> {
  const url = new URL(request.url);
  const params: [string, string][] = [];
  url.searchParams.forEach((value, key) => params.push([key, value]));
  if (!params.length) return original();
  if (params.length !== 1 || params[0][0] !== "w" || !WIDTHS.has(params[0][1])) {
    return new Response(JSON.stringify({ error: "invalid_thumbnail_parameters", allowed_widths: [160, 320, 640] }), {
      status: 400, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  const width = Number(params[0][1]);
  // HEAD on every request: deleted sources cannot hit old derivatives, replacements get new keys.
  const source = await env.R2_BUCKET.head(objectKey);
  if (!source) return original();
  if (!SOURCE_TYPES.has(source.httpMetadata?.contentType ?? "")) return original("unsupported-type");
  if (!Number.isFinite(source.size) || source.size > MAX_SOURCE_BYTES) return original("source-too-large");
  if (!env.IMAGES) return original("binding-missing");

  let cache: Cache | undefined;
  let key: Request | undefined;
  try {
    cache = (caches as CacheStorage & { default: Cache }).default;
    // Origin + decoded object key + R2 version + policy identify the source and transform.
    const identity = JSON.stringify([url.origin, objectKey, source.version, source.etag, width, VERSION]);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
    key = new Request(`${url.origin}/__poto_thumbnail_cache/${hash}`);
    const hit = await cache?.match(key);
    if (hit) {
      const response = new Response(hit.body, hit);
      response.headers.set("cache-control", "public, max-age=0, must-revalidate");
      response.headers.set("x-poto-thumbnail", "hit");
      return response;
    }
  } catch {
    // Cache outages must not prevent delivery.
    cache = undefined;
  }

  const object = await env.R2_BUCKET.get(objectKey);
  if (!object) return original();
  // A replacement between HEAD and GET must not populate the previous version's key.
  if (object.version !== source.version || object.etag !== source.etag) {
    return original("source-changed");
  }
  if (!object.body) return original("empty-source");
  try {
    const output = await env.IMAGES.input(object.body)
      .transform({ width, fit: "scale-down" })
      .output({ format: "image/webp", quality: 80, anim: false });
    const converted = output.response();
    if (!converted.ok || !converted.body || converted.headers.get("content-type")?.split(";")[0] !== "image/webp") {
      throw new Error("invalid_output");
    }
    // Materialize the bounded derivative so stream errors are caught before sending success.
    const bytes = await converted.arrayBuffer();
    if (!bytes.byteLength) throw new Error("empty_output");
    const response = new Response(bytes, { headers: {
      "content-type": "image/webp", "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=0, must-revalidate", "x-poto-thumbnail": "generated",
    } });
    if (cache && key) {
      try {
        const cached = response.clone();
        cached.headers.set("cache-control", "public, max-age=2592000");
        await cache.put(key, cached);
      } catch { /* Cache failures do not change a valid image response. */ }
    }
    return response;
  } catch {
    // Images may consume the input before failing (including quota errors): re-read R2.
    return original("transform-failed");
  }
}
