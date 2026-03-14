import "./load-env.mjs";
import { execSync, spawnSync } from "node:child_process";

const deployCommand = buildDeployCommand(process.env.WORKER_ROUTES);

const steps = [
  "npm run perm:check",
  "npm run d1:ensure",
  "npm run r2:ensure",
  "npm run vars:ensure",
  "npm run d1:migrate",
  deployCommand,
];

for (const step of steps) {
  console.log(`\n[deploy] ${step}`);
  execSync(step, {
    stdio: "inherit",
    env: process.env,
  });
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

function buildDeployCommand(rawRoutes) {
  const routes = parseRoutes(rawRoutes);
  if (routes.length === 0) {
    return "wrangler deploy";
  }
  const args = routes.map((route) => `--routes ${shellQuote(route)}`).join(" ");
  return `wrangler deploy ${args}`;
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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
