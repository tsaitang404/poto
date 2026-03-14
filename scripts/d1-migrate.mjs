import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "wrangler.toml");
const dbDir = resolve(process.cwd(), "db");
const raw = readFileSync(configPath, "utf8");
const isLocal = process.argv.includes("--local");

const nameMatch = raw.match(/^\s*database_name\s*=\s*"([^"]+)"\s*$/m);
if (!nameMatch) {
  throw new Error("Cannot find database_name in wrangler.toml");
}

const databaseName = nameMatch[1];
const modeFlag = isLocal ? "--local" : "--remote";
console.log(`[d1] Running ${isLocal ? "local" : "remote"} migrate on '${databaseName}'`);

ensureMigrationsTable();
const applied = new Set(getAppliedMigrations());
const files = readdirSync(dbDir)
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const fileName of files) {
  if (applied.has(fileName)) {
    continue;
  }

  if (fileName === "0001_add_upload_limit_settings.sql" && hasUploadLimitColumns()) {
    markMigrationApplied(fileName);
    continue;
  }

  runSqlFile(resolve(dbDir, fileName));
  markMigrationApplied(fileName);
}

function ensureMigrationsTable() {
  runSql(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     )`
  );
}

function getAppliedMigrations() {
  const rows = runSql("SELECT name FROM _migrations ORDER BY name ASC");
  return rows.map((row) => String(row.name));
}

function hasUploadLimitColumns() {
  const rows = runSql("PRAGMA table_info(configuration)");
  const names = new Set(rows.map((row) => String(row.name)));
  return names.has("static_source_max_mb")
    && names.has("gif_source_max_mb")
    && names.has("webp_upload_max_mb")
    && names.has("svg_upload_max_mb");
}

function markMigrationApplied(fileName) {
  runSql(`INSERT INTO _migrations (name) VALUES (${quoteSql(fileName)})`);
}

function runSqlFile(filePath) {
  const command = `npx wrangler d1 execute ${shellEscape(databaseName)} --file=${shellEscape(filePath)} ${modeFlag}`;
  execSync(command, { stdio: "inherit" });
}

function runSql(sql) {
  const command = `npx wrangler d1 execute ${shellEscape(databaseName)} --command=${shellEscape(sql)} --json ${modeFlag}`;
  const output = execSync(command, { encoding: "utf8" });
  const jsonStart = output.indexOf("[");
  if (jsonStart === -1) {
    throw new Error(`Unexpected wrangler output: ${output}`);
  }
  const parsed = JSON.parse(output.slice(jsonStart));
  const first = Array.isArray(parsed) ? parsed[0] : null;
  return Array.isArray(first?.results) ? first.results : [];
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function quoteSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
