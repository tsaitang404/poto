import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const configPath = resolve(process.cwd(), "wrangler.toml");
const sqlFile = resolve(process.cwd(), "db/0000_init.sql");
const raw = readFileSync(configPath, "utf8");
const isLocal = process.argv.includes("--local");

const nameMatch = raw.match(/^\s*database_name\s*=\s*"([^"]+)"\s*$/m);
if (!nameMatch) {
  throw new Error("Cannot find database_name in wrangler.toml");
}

const databaseName = nameMatch[1];
const modeFlag = isLocal ? "--local" : "--remote";
const command = `npx wrangler d1 execute ${shellEscape(databaseName)} --file=${shellEscape(sqlFile)} ${modeFlag}`;
console.log(`[d1] Running ${isLocal ? "local" : "remote"} migrate on '${databaseName}'`);
execSync(command, { stdio: "inherit" });

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
