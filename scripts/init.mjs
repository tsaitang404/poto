import { execSync } from "node:child_process";
import { resolveInitMode } from "./lib/init-mode.mjs";

const explicitLocal = process.argv.includes("--local") || process.env.INIT_LOCAL === "1";
const resetPasswordArg = getResetPasswordArg(process.argv);
const resetPasswordCmdArg = resetPasswordArg ? ` --reset-password='${shellArg(resetPasswordArg)}'` : "";
const { isLocal, hasCloudCreds } = resolveInitMode({ explicitLocal, env: process.env });

if (!explicitLocal && !hasCloudCreds) {
  console.log("[init] Cloudflare credentials missing, falling back to local init mode");
}

const steps = isLocal
  ? [
      "node scripts/d1-migrate.mjs --local",
      `node scripts/ensure-access-password.mjs --local${resetPasswordCmdArg}`,
    ]
  : [
      "node scripts/check-permissions.mjs",
      "node scripts/ensure-d1.mjs",
      "node scripts/ensure-r2.mjs",
      "node scripts/ensure-worker-domain.mjs",
      "node scripts/d1-migrate.mjs",
      `node scripts/ensure-access-password.mjs${resetPasswordCmdArg}`,
    ];

for (const step of steps) {
  console.log(`[init] running: ${step}`);
  execSync(step, { stdio: "inherit" });
}

console.log("[init] done");

function getResetPasswordArg(argv) {
  const eqArg = argv.find((arg) => arg.startsWith("--reset-password="));
  if (eqArg) {
    return eqArg.slice("--reset-password=".length);
  }

  const index = argv.indexOf("--reset-password");
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return "";
}

function shellArg(value) {
  return String(value).replace(/'/g, `'"'"'`);
}
