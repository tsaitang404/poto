import "./load-env.mjs";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId) {
  throw new Error("Missing CLOUDFLARE_ACCOUNT_ID");
}
if (!apiToken) {
  throw new Error("Missing CLOUDFLARE_API_TOKEN");
}

const checks = [
  {
    name: "D1 access",
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`,
    method: "GET",
    okStatuses: [200],
  },
  {
    name: "R2 access",
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets`,
    method: "GET",
    okStatuses: [200],
  },
  {
    name: "Workers subdomain access",
    url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
    method: "GET",
    okStatuses: [200, 404],
  },
];

for (const check of checks) {
  const response = await fetch(check.url, {
    method: check.method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!check.okStatuses.includes(response.status)) {
    const body = await safeText(response);
    throw new Error(`[perm] ${check.name} failed: HTTP ${response.status} ${body}`);
  }

  console.log(`[perm] ${check.name}: ok (${response.status})`);
}

console.log("[perm] all required permissions look good");

async function safeText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
