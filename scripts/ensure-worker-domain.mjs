import "./load-env.mjs";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readTomlVar, readTomlValue, upsertTomlVar } from "./lib/toml-vars.mjs";

const configPath = resolve(process.cwd(), "wrangler.toml");
const templatePath = resolve(process.cwd(), "wrangler.toml.example");

if (!existsSync(configPath)) {
  if (!existsSync(templatePath)) {
    throw new Error("wrangler.toml not found and wrangler.toml.example template is missing");
  }
  writeFileSync(configPath, readFileSync(templatePath, "utf8"), "utf8");
  console.log("[vars] Generated wrangler.toml from wrangler.toml.example");
}

let raw = readFileSync(configPath, "utf8");

const workerName = readTomlValue(raw, /^\s*name\s*=\s*"([^"]+)"\s*$/m);
if (!workerName) {
  throw new Error("Cannot find worker name in wrangler.toml");
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !apiToken) {
  throw new Error("[vars] CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing");
}

const currentWorkerBase = readTomlVar(raw, "WORKER_BASE_URL");
let workerBaseUrl = currentWorkerBase;
if (!workerBaseUrl) {
  const subdomain = await getWorkersSubdomain(accountId, apiToken);
  if (!subdomain) {
    throw new Error("[vars] workers.dev subdomain is not enabled for this account");
  }
  workerBaseUrl = `https://${workerName}.${subdomain}.workers.dev`;
  raw = upsertTomlVar(raw, "WORKER_BASE_URL", workerBaseUrl);
  console.log(`[vars] Set WORKER_BASE_URL => ${workerBaseUrl}`);
} else {
  console.log("[vars] WORKER_BASE_URL already set");
}

const currentPublicBase = readTomlVar(raw, "PUBLIC_BASE_URL");
if (!currentPublicBase) {
  const publicBaseUrl = `${workerBaseUrl}/files`;
  raw = upsertTomlVar(raw, "PUBLIC_BASE_URL", publicBaseUrl);
  console.log(`[vars] Set PUBLIC_BASE_URL => ${publicBaseUrl}`);
} else {
  console.log("[vars] PUBLIC_BASE_URL already set");
}

writeFileSync(configPath, raw, "utf8");

async function getWorkersSubdomain(accountId, apiToken) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to query workers subdomain: ${response.status} ${text}`);
  }

  const payload = await response.json();
  return payload?.result?.subdomain ?? null;
}

