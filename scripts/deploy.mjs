import "./load-env.mjs";
import { execSync } from "node:child_process";

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
