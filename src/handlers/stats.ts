import { json } from "../lib/http";
import { getEffectiveCloudflareApiToken, getUploadSettings } from "./settings";
import type { Env } from "../types";

type SummarySources = {
  r2_total_usage: string;
  d1_total_usage: string;
  r2_monthly_downloads: string;
  d1_monthly_queries: string;
  monthly_access: string;
};

type StatsImageRow = {
  id: string;
  title: string;
  public_url: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

const R2_STORAGE_QUERY = `query($accountTag: string!, $bucketName: string!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2StorageAdaptiveGroups(
        limit: 1
        orderBy: [datetime_DESC]
        filter: { bucketName: $bucketName, datetime_geq: $start, datetime_leq: $end }
      ) {
        max {
          payloadSize
          metadataSize
          objectCount
        }
        dimensions {
          datetime
        }
      }
    }
  }
}`;

const R2_DOWNLOADS_QUERY = `query($accountTag: string!, $bucketName: string!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2OperationsAdaptiveGroups(
        limit: 1000
        filter: {
          bucketName: $bucketName
          actionType: "GetObject"
          actionStatus: "success"
          datetime_geq: $start
          datetime_leq: $end
        }
      ) {
        sum {
          requests
        }
        dimensions {
          objectName
        }
      }
    }
  }
}`;

const D1_ANALYTICS_QUERY = `query($accountTag: string!, $databaseId: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(
        limit: 1
        filter: { databaseId: $databaseId, date_geq: $start, date_leq: $end }
      ) {
        sum {
          readQueries
          writeQueries
        }
      }
    }
  }
}`;

export async function handleGetStats(env: Env): Promise<Response> {
  try {
    const [dbStats, platformStats] = await Promise.all([getDatabaseStats(env), getPlatformStats(env)]);

    const summary = {
      r2_total_usage_bytes: platformStats.r2TotalUsageBytes,
      d1_total_usage_bytes: platformStats.d1TotalUsageBytes,
      r2_monthly_downloads: platformStats.r2MonthlyDownloads,
      d1_monthly_queries: platformStats.d1MonthlyQueries,
    };

    const sources: SummarySources = {
      r2_total_usage: "cloudflare-r2-graphql",
      d1_total_usage: "cloudflare-d1-rest",
      r2_monthly_downloads: "cloudflare-r2-graphql",
      d1_monthly_queries: "cloudflare-d1-graphql",
      monthly_access: "cloudflare-r2-graphql",
    };

    const monthlyAccess = dbStats.activeImages
      .map((item) => ({
        id: item.id,
        title: item.title,
        public_url: item.public_url,
        object_key: item.object_key,
        downloads: platformStats.downloadsByObjectKey.get(item.object_key) ?? 0,
      }))
      .filter((item) => item.downloads > 0)
      .sort((left, right) => right.downloads - left.downloads || left.title.localeCompare(right.title))
      .slice(0, 30);

    return json({
      summary,
      top_files: dbStats.topFiles,
      mime_breakdown: dbStats.mimeBreakdown,
      monthly_access: monthlyAccess,
      meta: {
        generated_at: new Date().toISOString(),
        month_start: getMonthStartUtc().toISOString(),
        platform_stats_enabled: true,
        sources,
        warnings: [],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "stats_unavailable";
    const status = message.startsWith("missing_config:") ? 500 : 502;
    return json({ error: message }, status);
  }
}

async function getDatabaseStats(env: Env) {
  const [topFilesResult, mimeBreakdownResult, activeImagesResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, title, public_url, object_key, mime_type, size_bytes, created_at
       FROM images
       WHERE deleted_at IS NULL
       ORDER BY size_bytes DESC, created_at DESC
       LIMIT 10`
    ).all<StatsImageRow>(),
    env.DB.prepare(
      `SELECT mime_type,
              COUNT(*) AS file_count,
              COALESCE(SUM(size_bytes), 0) AS total_bytes
       FROM images
       WHERE deleted_at IS NULL
       GROUP BY mime_type
       ORDER BY file_count DESC, total_bytes DESC, mime_type ASC`
    ).all<{ mime_type: string; file_count: number | string; total_bytes: number | string }>(),
    env.DB.prepare(
      `SELECT id, title, public_url, object_key, mime_type, size_bytes, created_at
       FROM images
       WHERE deleted_at IS NULL`
    ).all<StatsImageRow>(),
  ]);

  return {
    topFiles: normalizeRows(topFilesResult.results),
    mimeBreakdown: (mimeBreakdownResult.results ?? []).map((row) => ({
      mime_type: row.mime_type,
      file_count: Number(row.file_count ?? 0),
      total_bytes: Number(row.total_bytes ?? 0),
    })),
    activeImages: normalizeRows(activeImagesResult.results),
  };
}

async function getPlatformStats(env: Env) {
  const accountId = requireConfig(env.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID");
  const bucketName = requireConfig(env.R2_BUCKET_NAME, "R2_BUCKET_NAME");
  const databaseId = requireConfig(env.D1_DATABASE_ID, "D1_DATABASE_ID");
  const settings = await getUploadSettings(env);
  const apiToken = requireConfig(getEffectiveCloudflareApiToken(env, settings), "CLOUDFLARE_API_TOKEN");

  const monthStart = getMonthStartUtc();
  const now = new Date();

  const [r2StorageResult, r2DownloadsResult, d1InfoResult, d1AnalyticsResult] = await Promise.all([
    queryGraphql(apiToken, R2_STORAGE_QUERY, {
      accountTag: accountId,
      bucketName,
      start: monthStart.toISOString(),
      end: now.toISOString(),
    }),
    queryGraphql(apiToken, R2_DOWNLOADS_QUERY, {
      accountTag: accountId,
      bucketName,
      start: monthStart.toISOString(),
      end: now.toISOString(),
    }),
    fetchCloudflareJson(apiToken, `/accounts/${accountId}/d1/database/${databaseId}`),
    queryGraphql(apiToken, D1_ANALYTICS_QUERY, {
      accountTag: accountId,
      databaseId,
      start: monthStart.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    }),
  ]);

  const downloadsByObjectKey = new Map<string, number>();
  const bucket = r2StorageResult?.viewer?.accounts?.[0];
  const latest = bucket?.r2StorageAdaptiveGroups?.[0]?.max;
  if (!latest) {
    throw new Error("missing_r2_storage_metrics");
  }

  const groups = r2DownloadsResult?.viewer?.accounts?.[0]?.r2OperationsAdaptiveGroups ?? [];
  let r2MonthlyDownloads = 0;
  for (const group of groups) {
    const objectName = String(group?.dimensions?.objectName ?? "");
    const requests = Number(group?.sum?.requests ?? 0);
    r2MonthlyDownloads += requests;
    if (objectName && requests > 0) {
      downloadsByObjectKey.set(objectName, requests);
    }
  }

  const d1FileSize = Number(d1InfoResult?.result?.file_size ?? NaN);
  if (!Number.isFinite(d1FileSize)) {
    throw new Error("missing_d1_file_size");
  }

  const d1Summary = d1AnalyticsResult?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups?.[0]?.sum;
  if (!d1Summary) {
    throw new Error("missing_d1_query_metrics");
  }

  return {
    r2TotalUsageBytes: Number(latest.payloadSize ?? 0) + Number(latest.metadataSize ?? 0),
    d1TotalUsageBytes: d1FileSize,
    r2MonthlyDownloads,
    d1MonthlyQueries: Number(d1Summary.readQueries ?? 0) + Number(d1Summary.writeQueries ?? 0),
    downloadsByObjectKey,
  };
}

async function queryGraphql(apiToken: string, query: string, variables: Record<string, unknown>) {
  return fetchCloudflareJson(apiToken, "/graphql", { query, variables });
}

async function fetchCloudflareJson(apiToken: string, path: string, body?: unknown) {
  const url = path === "/graphql"
    ? "https://api.cloudflare.com/client/v4/graphql"
    : `https://api.cloudflare.com/client/v4${path}`;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`cloudflare_http_${response.status}`);
  }

  const payload = await response.json() as { success?: boolean; errors?: Array<{ message?: string }>; data?: unknown; result?: unknown };
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(payload.errors.map((item) => item.message || "graphql_error").join("; "));
  }
  return payload.data ? payload.data : payload;
}

function requireConfig(value: string | undefined, key: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`missing_config:${key}`);
  }
  return normalized;
}

function normalizeRows(rows: StatsImageRow[] | undefined): StatsImageRow[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    public_url: row.public_url,
    object_key: row.object_key,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes ?? 0),
    created_at: row.created_at,
  }));
}

function getMonthStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}