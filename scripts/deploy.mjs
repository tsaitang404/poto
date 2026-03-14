import "./load-env.mjs";
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const preDeploySteps = [
  "npm run perm:check",
  "npm run d1:ensure",
  "npm run r2:ensure",
  "npm run vars:ensure",
  "npm run d1:migrate",
];

for (const step of preDeploySteps) {
  console.log(`\n[deploy] ${step}`);
  execSync(step, {
    stdio: "inherit",
    env: process.env,
  });
}

// Inject routes with zone_name into wrangler.toml AFTER vars:ensure rewrites it
const routes = parseRoutes(process.env.WORKER_ROUTES);
if (routes.length > 0) {
  injectRoutesIntoToml(routes);
}

console.log("\n[deploy] wrangler deploy");
const deployResult = spawnSync("wrangler", ["deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (deployResult.status !== 0 && routes.length > 0) {
  console.warn(
    "\n[deploy] ⚠ Deploy with custom routes failed. Falling back to workers.dev domain..."
  );
  removeRoutesFromToml();
  console.log("\n[deploy] wrangler deploy (fallback, no custom routes)");
  execSync("wrangler deploy", { stdio: "inherit", env: process.env });
} else if (deployResult.status !== 0) {
  process.exit(deployResult.status ?? 1);
}

const accessPassword = process.env.ACCESS_PASSWORD;
if (accessPassword) {
  console.log("\n[deploy] wrangler secret put ACCESS_PASSWORD");
  const result = spawnSync("wrangler", ["secret", "put", "ACCESS_PASSWORD"], {
    input: accessPassword,
    stdio: ["pipe", "inherit", "inherit"],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("Failed to set ACCESS_PASSWORD secret");
  }
} else {
  console.log("\n[deploy] ACCESS_PASSWORD not set, skipping secret upload");
}

function injectRoutesIntoToml(routes) {
  const configPath = resolve(process.cwd(), "wrangler.toml");
  let content = readFileSync(configPath, "utf8");

  // Remove any existing [[routes]] blocks
  content = content.replace(/\n?\[\[routes\]\][^\[]*(?=\[\[|$)/gs, "");

  // Append [[routes]] blocks with zone_name
  const routeBlocks = routes
    .map((pattern) => {
      const zoneName = extractZoneName(pattern);
      return `\n[[routes]]\npattern = "${pattern}"\nzone_name = "${zoneName}"`;
    })
    .join("\n");

  writeFileSync(configPath, content.trimEnd() + "\n" + routeBlocks + "\n", "utf8");
  console.log(`[deploy] Injected ${routes.length} route(s) into wrangler.toml`);
}

function removeRoutesFromToml() {
  const configPath = resolve(process.cwd(), "wrangler.toml");
  let content = readFileSync(configPath, "utf8");
  content = content.replace(/\n?\[\[routes\]\][^\[]*(?=\[\[|$)/gs, "");
  writeFileSync(configPath, content.trimEnd() + "\n", "utf8");
  console.log("[deploy] Removed custom routes from wrangler.toml");
}

function extractZoneName(pattern) {
  // Strip path portion and any protocol prefix
  const host = pattern.replace(/\/.*$/, "").replace(/^https?:\/\//, "");
  // Take last 2 dot-separated parts as zone name (e.g. poto.aketer.me -> aketer.me)
  const parts = host.split(".");
  return parts.slice(-2).join(".");
}

function parseRoutes(rawRoutes) {
  if (!rawRoutes || !String(rawRoutes).trim()) {
    return [];
  }

  const text = String(rawRoutes).trim();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("WORKER_ROUTES must be a JSON array, e.g. [\"poto.example-a.com/*\",\"poto.example-b.com/*\"]");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("WORKER_ROUTES JSON must be an array");
  }

  return parsed
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}
