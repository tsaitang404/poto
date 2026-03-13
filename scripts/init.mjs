import { execSync } from "node:child_process";
import { resolveInitMode } from "./lib/init-mode.mjs";

const explicitLocal = process.argv.includes("--local") || process.env.INIT_LOCAL === "1";
const { isLocal, hasCloudCreds } = resolveInitMode({ explicitLocal, env: process.env });

if (!explicitLocal && !hasCloudCreds) {
  console.log("[init] Cloudflare credentials missing, falling back to local init mode");
}

const steps = isLocal
  ? ["node scripts/d1-migrate.mjs --local"]
  : [
      "node scripts/check-permissions.mjs",
      "node scripts/ensure-d1.mjs",
      "node scripts/ensure-r2.mjs",
      "node scripts/ensure-worker-domain.mjs",
      "node scripts/d1-migrate.mjs",
    ];

for (const step of steps) {
  console.log(`[init] running: ${step}`);
  execSync(step, { stdio: "inherit" });
}

console.log("[init] done");
