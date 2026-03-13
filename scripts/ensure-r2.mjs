import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "wrangler.toml");
const raw = readFileSync(configPath, "utf8");

const bucketName = readTomlValue(raw, /^\s*bucket_name\s*=\s*"([^"]+)"\s*$/m);
if (!bucketName) {
  throw new Error("Cannot find bucket_name in wrangler.toml");
}

const buckets = listBuckets();
const exists = hasBucketByName(buckets, bucketName);
if (exists) {
  console.log(`[r2] Bucket '${bucketName}' already exists`);
  process.exit(0);
}

console.log(`[r2] Bucket '${bucketName}' not found, creating...`);
createBucket(bucketName);
console.log(`[r2] Bucket '${bucketName}' created`);

function listBuckets() {
  try {
    const output = execSync("npx wrangler r2 bucket list", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Parse text output: lines starting with "name:" hold the bucket name
    const names = [];
    for (const line of output.split("\n")) {
      const m = line.match(/^name:\s+(\S+)/);
      if (m) names.push({ name: m[1] });
    }
    return names;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list R2 buckets: ${detail}`);
  }
}

function createBucket(name) {
  try {
    execSync(`npx wrangler r2 bucket create ${shellEscape(name)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create R2 bucket '${name}': ${detail}`);
  }
}

function hasBucketByName(payload, name) {
  const rows = asArray(payload);
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    if (row.name === name || row.bucket_name === name) {
      return true;
    }
  }
  return false;
}

function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    for (const key of ["result", "results", "buckets"]) {
      const val = payload[key];
      if (Array.isArray(val)) {
        return val;
      }
    }
  }
  return [];
}

function readTomlValue(content, regex) {
  const match = content.match(regex);
  return match ? match[1] : null;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
