import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envPath = resolve(root, ".env");
const devVarsPath = resolve(root, ".dev.vars");

const envValues = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
const devVarsValues = existsSync(devVarsPath) ? parseEnv(readFileSync(devVarsPath, "utf8")) : {};

let changed = false;

for (const key of ["CLOUDFLARE_API_TOKEN"]) {
  const envValue = envValues[key]?.trim();
  if (!envValue) {
    continue;
  }
  if (devVarsValues[key] === envValue) {
    continue;
  }
  devVarsValues[key] = envValue;
  changed = true;
}

if (changed || !existsSync(devVarsPath)) {
  writeFileSync(devVarsPath, stringifyEnv(devVarsValues));
  console.log("[dev-vars] synced CLOUDFLARE_API_TOKEN from .env into .dev.vars");
} else {
  console.log("[dev-vars] .dev.vars already up to date");
}

function parseEnv(raw) {
  const result = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result[key] = unquote(value);
  }
  return result;
}

function stringifyEnv(values) {
  const keys = Object.keys(values).sort((left, right) => {
    if (left === "ACCESS_PASSWORD") return -1;
    if (right === "ACCESS_PASSWORD") return 1;
    return left.localeCompare(right);
  });
  return keys.map((key) => `${key}=${quote(values[key])}`).join("\n") + "\n";
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function quote(value) {
  return JSON.stringify(String(value ?? ""));
}