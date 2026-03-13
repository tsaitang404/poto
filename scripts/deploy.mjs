import "./load-env.mjs";
import { execSync } from "node:child_process";

const steps = [
  "npm run perm:check",
  "npm run d1:ensure",
  "npm run r2:ensure",
  "npm run vars:ensure",
  "npm run d1:migrate",
  "wrangler deploy",
];

for (const step of steps) {
  console.log(`\n[deploy] ${step}`);
  execSync(step, {
    stdio: "inherit",
    env: process.env,
  });
}
