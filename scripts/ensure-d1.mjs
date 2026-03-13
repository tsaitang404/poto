import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "wrangler.toml");
const raw = readFileSync(configPath, "utf8");

const nameMatch = raw.match(/^\s*database_name\s*=\s*"([^"]+)"\s*$/m);
if (!nameMatch) {
  throw new Error("Cannot find database_name in wrangler.toml");
}
const databaseName = nameMatch[1];

const existing = listDatabases();
let databaseId = findDatabaseIdByName(existing, databaseName);

if (!databaseId) {
  console.log(`[d1] Database '${databaseName}' not found, creating...`);
  const created = createDatabase(databaseName);
  databaseId = extractUuid(created);
}

if (!databaseId) {
  throw new Error(`Cannot resolve database_id for '${databaseName}'`);
}

const databaseIdLine = `database_id = "${databaseId}"`;
const hasDatabaseId = /^\s*database_id\s*=\s*"[^"]*"\s*$/m.test(raw);

const next = hasDatabaseId
  ? raw.replace(/^\s*database_id\s*=\s*"[^"]*"\s*$/m, databaseIdLine)
  : raw.replace(/^\s*database_name\s*=\s*"[^"]+"\s*$/m, (line) => `${line}\n${databaseIdLine}`);

if (next !== raw) {
  writeFileSync(configPath, next, "utf8");
  console.log(`[d1] Updated wrangler.toml database_id => ${databaseId}`);
} else {
  console.log(`[d1] database_id already up to date => ${databaseId}`);
}

function runJson(command) {
  const output = execSync(command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output);
}

function listDatabases() {
  try {
    return runJson("npx wrangler d1 list --json");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list D1 databases: ${detail}`);
  }
}

function createDatabase(name) {
  try {
    const output = execSync(`npx wrangler d1 create ${shellEscape(name)}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Extract UUID from text output: database_id = "xxxx-..."
    const match = output.match(/database_id\s*=\s*"([0-9a-f-]{36})"/i);
    if (!match) {
      throw new Error(`Could not parse database_id from output:\n${output}`);
    }
    return { database_id: match[1] };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create D1 database '${name}': ${detail}`);
  }
}

function findDatabaseIdByName(payload, name) {
  const rows = asArray(payload);
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const rowName = row.name ?? row.database_name;
    if (rowName === name) {
      return extractUuid(row);
    }
  }
  return null;
}

function extractUuid(payload) {
  if (!payload) {
    return null;
  }
  if (typeof payload === "string") {
    return isUuid(payload) ? payload : null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const id = extractUuid(item);
      if (id) {
        return id;
      }
    }
    return null;
  }
  if (typeof payload === "object") {
    const direct = payload.uuid ?? payload.database_id ?? payload.id;
    if (typeof direct === "string" && isUuid(direct)) {
      return direct;
    }
    for (const value of Object.values(payload)) {
      const id = extractUuid(value);
      if (id) {
        return id;
      }
    }
  }
  return null;
}

function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object") {
    for (const key of ["result", "results", "databases"]) {
      const val = payload[key];
      if (Array.isArray(val)) {
        return val;
      }
    }
  }
  return [];
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
