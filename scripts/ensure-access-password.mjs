import "./load-env.mjs";

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_ACCESS_PASSWORD = "potopaas";

const configPath = resolve(process.cwd(), "wrangler.toml");
const raw = readFileSync(configPath, "utf8");
const isLocal = process.argv.includes("--local");
const resetPassword = readResetPasswordArg(process.argv);

const nameMatch = raw.match(/^\s*database_name\s*=\s*"([^"]+)"\s*$/m);
if (!nameMatch) {
  throw new Error("Cannot find database_name in wrangler.toml");
}

const databaseName = nameMatch[1];
const modeFlag = isLocal ? "--local" : "--remote";
const seedPassword = normalizePassword(process.env.ACCESS_PASSWORD) || DEFAULT_ACCESS_PASSWORD;
const nextPassword = normalizePassword(resetPassword) || seedPassword;
const now = new Date().toISOString();
const nextHash = sha256Hex(nextPassword);

if (normalizePassword(resetPassword)) {
  runSql(
    `INSERT INTO access_password (id, password_hash, created_at, updated_at)
     VALUES (1, ${quoteSql(nextHash)}, ${quoteSql(now)}, ${quoteSql(now)})
     ON CONFLICT(id) DO UPDATE SET
       password_hash = excluded.password_hash,
       updated_at = excluded.updated_at`
  );
  console.log("[access-password] password reset applied");
} else {
  runSql(
    `INSERT INTO access_password (id, password_hash, created_at, updated_at)
     VALUES (1, ${quoteSql(nextHash)}, ${quoteSql(now)}, ${quoteSql(now)})
     ON CONFLICT(id) DO NOTHING`
  );
  console.log("[access-password] password ensured in DB");
}

function readResetPasswordArg(argv) {
  const eqArg = argv.find((arg) => arg.startsWith("--reset-password="));
  if (eqArg) {
    return eqArg.slice("--reset-password=".length);
  }

  const idx = argv.indexOf("--reset-password");
  if (idx >= 0 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }

  return "";
}

function normalizePassword(value) {
  return String(value ?? "").trim();
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function runSql(sql) {
  const command = `npx wrangler d1 execute ${shellEscape(databaseName)} --command=${shellEscape(sql)} --json ${modeFlag}`;
  execSync(command, { stdio: "inherit" });
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `"'"'`)}'`;
}

function quoteSql(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
