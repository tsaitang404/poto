import test from "node:test";
import assert from "node:assert/strict";
import { resolveInitMode } from "../scripts/lib/init-mode.mjs";

test("explicit local mode wins", () => {
  const out = resolveInitMode({
    explicitLocal: true,
    env: {
      CLOUDFLARE_ACCOUNT_ID: "acc",
      CLOUDFLARE_API_TOKEN: "token",
    },
  });

  assert.equal(out.isLocal, true);
  assert.equal(out.reason, "explicit-local");
});

test("cloud mode when creds exist", () => {
  const out = resolveInitMode({
    explicitLocal: false,
    env: {
      CLOUDFLARE_ACCOUNT_ID: "acc",
      CLOUDFLARE_API_TOKEN: "token",
    },
  });

  assert.equal(out.isLocal, false);
  assert.equal(out.hasCloudCreds, true);
  assert.equal(out.reason, "cloud-creds-present");
});

test("fallback local when creds missing", () => {
  const out = resolveInitMode({
    explicitLocal: false,
    env: {},
  });

  assert.equal(out.isLocal, true);
  assert.equal(out.hasCloudCreds, false);
  assert.equal(out.reason, "missing-cloud-creds");
});
