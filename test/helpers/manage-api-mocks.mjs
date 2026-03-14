export function createEnv(seed = { images: {} }) {
  const state = {
    images: { ...seed.images },
    configurationRow: seed.configurationRow ?? null,
    deletedKeys: [],
  };

  return {
    DB: createMockDB(state),
    R2_BUCKET: {
      async put() {
        return { etag: "mock-etag" };
      },
      async get() {
        return null;
      },
      async delete() {
        const key = arguments[0];
        state.deletedKeys.push(key);
        return;
      },
    },
    ACCESS_PASSWORD: "123456",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CLOUDFLARE_API_TOKEN: "test-token",
    R2_BUCKET_NAME: "poto",
    D1_DATABASE_ID: "db-id",
    __state: state,
  };
}

export function buildImage(id, createdAt) {
  return {
    id,
    title: id,
    object_key: `images/2026-03-14/${id}.webp`,
    public_url: `https://example.com/files/images/2026-03-14/${id}.webp`,
    mime_type: "image/webp",
    size_bytes: 1234,
    deleted_at: null,
    created_at: createdAt,
  };
}

function createMockDB(state) {
  return {
    prepare(query) {
      return createStatement(query, state);
    },
  };
}

function createStatement(query, state) {
  let values = [];
  return {
    bind(...args) {
      values = args;
      return this;
    },
    async first() {
      if (query.includes("SELECT webp_mode") && query.includes("FROM configuration") && query.includes("WHERE id = 1")) {
        return state.configurationRow;
      }
      if (query.includes("SELECT COUNT(*) AS total") && query.includes("FROM images")) {
        const total = Object.values(state.images).filter((row) => !row.deleted_at).length;
        return { total };
      }
      if (query.includes("SELECT id, deleted_at FROM images WHERE id = ?")) {
        const id = values[0];
        return state.images[id] ?? null;
      }
      if (query.includes("SELECT object_key, deleted_at FROM images WHERE id = ?")) {
        const id = values[0];
        const row = state.images[id];
        if (!row) {
          return null;
        }
        return {
          object_key: row.object_key,
          deleted_at: row.deleted_at,
        };
      }
      throw new Error(`Unhandled first() query: ${query}`);
    },
    async run() {
      if (query.includes("UPDATE images SET title = ? WHERE id = ?")) {
        const [title, id] = values;
        if (state.images[id]) {
          state.images[id].title = title;
        }
        return {};
      }
      if (query.includes("UPDATE images SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")) {
        const [id] = values;
        if (state.images[id]) {
          state.images[id].deleted_at = new Date().toISOString();
        }
        return {};
      }
      throw new Error(`Unhandled run() query: ${query}`);
    },
    async all() {
      if (query.includes("SELECT id, title, public_url, object_key, mime_type, size_bytes, created_at") && query.includes("ORDER BY size_bytes DESC")) {
        const rows = Object.values(state.images)
          .filter((row) => !row.deleted_at)
          .sort((left, right) => Number(right.size_bytes || 0) - Number(left.size_bytes || 0) || String(right.created_at).localeCompare(String(left.created_at)))
          .slice(0, 10)
          .map((row) => ({
            id: row.id,
            title: row.title,
            public_url: row.public_url,
            object_key: row.object_key,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            created_at: row.created_at,
          }));
        return { results: rows };
      }
      if (query.includes("SELECT mime_type,") && query.includes("GROUP BY mime_type")) {
        const grouped = new Map();
        for (const row of Object.values(state.images).filter((item) => !item.deleted_at)) {
          const key = row.mime_type;
          const entry = grouped.get(key) || { mime_type: key, file_count: 0, total_bytes: 0 };
          entry.file_count += 1;
          entry.total_bytes += Number(row.size_bytes || 0);
          grouped.set(key, entry);
        }
        return {
          results: Array.from(grouped.values()).sort((left, right) => right.file_count - left.file_count || right.total_bytes - left.total_bytes),
        };
      }
      if (query.includes("SELECT id, title, public_url, object_key, mime_type, size_bytes, created_at") && query.includes("WHERE deleted_at IS NULL") && !query.includes("ORDER BY size_bytes DESC") && !query.includes("LIMIT ? OFFSET ?")) {
        const rows = Object.values(state.images)
          .filter((row) => !row.deleted_at)
          .map((row) => ({
            id: row.id,
            title: row.title,
            public_url: row.public_url,
            object_key: row.object_key,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            created_at: row.created_at,
          }));
        return { results: rows };
      }
      if (query.includes("SELECT id, title, public_url, mime_type, size_bytes, created_at") && query.includes("LIMIT ? OFFSET ?")) {
        const [limit, offset] = values;
        const rows = Object.values(state.images)
          .filter((row) => !row.deleted_at)
          .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
          .slice(offset, offset + limit)
          .map((row) => ({
            id: row.id,
            title: row.title,
            public_url: row.public_url,
            mime_type: row.mime_type,
            size_bytes: row.size_bytes,
            created_at: row.created_at,
          }));
        return { results: rows };
      }
      throw new Error(`Unhandled all() query: ${query}`);
    },
  };
}

