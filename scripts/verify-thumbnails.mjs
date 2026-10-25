// Run only against a Worker where this change and the Images binding are enabled.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) throw new Error("Usage: node scripts/verify-thumbnails.mjs https://poto.example [output-directory]");
const out = resolve(process.argv[3] || "/tmp/poto-thumbnail-verification");
await mkdir(out, { recursive: true });
const samples = [
  "images/2026-08-03/e0ada2bdaa6644b5b830419b48a22131.png",
  "images/2026-08-16/789ad57ccbf54fe3bb9579c716ecff2f.png",
];
const results = [];
for (const [index, key] of samples.entries()) {
  const url = `${base.replace(/\/$/, "")}/files/${key}`;
  const original = await fetch(url);
  if (!original.ok) throw new Error(`Original unavailable: HTTP ${original.status}`);
  const source = Buffer.from(await original.arrayBuffer());
  await writeFile(resolve(out, `${index}-original.png`), source);
  for (const width of [160, 320, 640]) {
    const response = await fetch(`${url}?w=${width}`);
    const marker = response.headers.get("x-poto-thumbnail");
    if (!response.ok || !["generated", "hit"].includes(marker) || response.headers.get("content-type") !== "image/webp") {
      throw new Error(`Thumbnail unavailable (${width}): HTTP ${response.status}, marker=${marker}; check binding/quota, not a successful conversion`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") throw new Error("Invalid WebP bytes");
    await writeFile(resolve(out, `${index}-${width}.webp`), bytes);
    results.push({ sample: index, width, sourceBytes: source.length, thumbnailBytes: bytes.length, reductionPercent: +(100 * (1 - bytes.length / source.length)).toFixed(1), marker });
  }
}
await writeFile(resolve(out, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ outputDirectory: out, results }, null, 2));
console.log("Inspect saved originals and WebP files at 150px display width and 2x density for visual quality. Different edge locations may each generate a cache entry.");
