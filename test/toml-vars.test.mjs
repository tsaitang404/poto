import test from "node:test";
import assert from "node:assert/strict";
import { readTomlVar, upsertTomlVar } from "../scripts/lib/toml-vars.mjs";

test("readTomlVar reads existing value", () => {
  const src = "[vars]\nSITE_TITLE = \"Poto\"\n";
  assert.equal(readTomlVar(src, "SITE_TITLE"), "Poto");
});

test("upsertTomlVar updates existing key", () => {
  const src = "[vars]\nSITE_TITLE = \"Poto\"\n";
  const out = upsertTomlVar(src, "SITE_TITLE", "New");
  assert.match(out, /SITE_TITLE = \"New\"/);
});

test("upsertTomlVar inserts under [vars]", () => {
  const src = "name = \"poto\"\n\n[vars]\nSITE_TITLE = \"Poto\"\n";
  const out = upsertTomlVar(src, "WORKER_BASE_URL", "https://a.workers.dev");
  assert.match(out, /\[vars\]\nWORKER_BASE_URL = \"https:\/\/a.workers.dev\"\nSITE_TITLE = \"Poto\"/);
});

test("upsertTomlVar creates [vars] when absent", () => {
  const src = "name = \"poto\"\n";
  const out = upsertTomlVar(src, "WORKER_BASE_URL", "https://a.workers.dev");
  assert.match(out, /\[vars\]\nWORKER_BASE_URL = \"https:\/\/a.workers.dev\"/);
});

test("deployment variable rewriting preserves optional Images binding", () => {
  const src = 'name = "poto"\n[images]\nbinding = "IMAGES"\n[vars]\nSITE_TITLE = "Poto"\n';
  const out = upsertTomlVar(upsertTomlVar(src, "WORKER_BASE_URL", "https://poto.example"), "PUBLIC_BASE_URL", "https://poto.example/files");
  assert.match(out, /\[images\]\nbinding = "IMAGES"/);
});
