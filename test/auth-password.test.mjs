import test from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers/load-worker.mjs";

const worker = await loadWorker();

test("POST /protected initializes password from ACCESS_PASSWORD when DB is empty", async () => {
  const env = createEnv({ accessPasswordEnv: "abc123" });
  const form = new FormData();
  form.set("password", "abc123");

  const response = await worker.fetch(new Request("https://example.com/protected", {
    method: "POST",
    body: form,
  }), env);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://example.com/");
  assert.match(String(response.headers.get("set-cookie")), /poto_auth=1/);
  assert.ok(env.__state.passwordRow);
});

test("POST /protected uses default potopaas when ACCESS_PASSWORD is empty", async () => {
  const env = createEnv({ accessPasswordEnv: "" });
  const form = new FormData();
  form.set("password", "potopaas");

  const response = await worker.fetch(new Request("https://example.com/protected", {
    method: "POST",
    body: form,
  }), env);

  assert.equal(response.status, 302);
  assert.ok(env.__state.passwordRow);
});

test("PUT /api/password updates DB password and new password can login", async () => {
  const oldHash = await sha256Hex("old-pass");
  const env = createEnv({
    accessPasswordRow: {
      password_hash: oldHash,
      created_at: "2026-03-14T00:00:00.000Z",
      updated_at: "2026-03-14T00:00:00.000Z",
    },
  });

  const updateResponse = await worker.fetch(new Request("https://example.com/api/password", {
    method: "PUT",
    headers: {
      Cookie: "poto_auth=1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: "new-pass" }),
  }), env);
  const updateBody = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updateBody.ok, true);

  const oldForm = new FormData();
  oldForm.set("password", "old-pass");
  const oldLoginResponse = await worker.fetch(new Request("https://example.com/protected", {
    method: "POST",
    body: oldForm,
  }), env);
  assert.equal(oldLoginResponse.status, 401);

  const newForm = new FormData();
  newForm.set("password", "new-pass");
  const newLoginResponse = await worker.fetch(new Request("https://example.com/protected", {
    method: "POST",
    body: newForm,
  }), env);
  assert.equal(newLoginResponse.status, 302);
});

function createEnv(seed = {}) {
  const state = {
    passwordRow: seed.accessPasswordRow ?? null,
  };

  const env = {
    DB: {
      prepare(query) {
        return createStatement(query, state);
      },
    },
    R2_BUCKET: {
      async put() {
        throw new Error("not expected");
      },
      async get() {
        return null;
      },
      async delete() {
        return;
      },
    },
    __state: state,
  };

  if (Object.prototype.hasOwnProperty.call(seed, "accessPasswordEnv")) {
    env.ACCESS_PASSWORD = seed.accessPasswordEnv;
  }

  return env;
}

function createStatement(query, state) {
  let values = [];

  return {
    bind(...args) {
      values = args;
      return this;
    },
    async first() {
      if (query.includes("SELECT password_hash, created_at, updated_at FROM access_password WHERE id = 1")) {
        return state.passwordRow;
      }
      throw new Error(`Unhandled first() query: ${query}`);
    },
    async run() {
      if (query.includes("INSERT INTO access_password")) {
        const [passwordHash, createdAt, updatedAt] = values;
        state.passwordRow = {
          password_hash: passwordHash,
          created_at: createdAt,
          updated_at: updatedAt,
        };
        return {};
      }

      if (query.includes("UPDATE access_password SET password_hash = ?, updated_at = ? WHERE id = 1")) {
        const [passwordHash, updatedAt] = values;
        if (!state.passwordRow) {
          state.passwordRow = {
            password_hash: passwordHash,
            created_at: updatedAt,
            updated_at: updatedAt,
          };
        } else {
          state.passwordRow.password_hash = passwordHash;
          state.passwordRow.updated_at = updatedAt;
        }
        return {};
      }

      throw new Error(`Unhandled run() query: ${query}`);
    },
    async all() {
      throw new Error(`Unhandled all() query: ${query}`);
    },
  };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}
