export function resolveInitMode({ explicitLocal = false, env = process.env } = {}) {
  const hasCloudCreds = Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
  const isLocal = explicitLocal || !hasCloudCreds;
  const reason = explicitLocal ? "explicit-local" : hasCloudCreds ? "cloud-creds-present" : "missing-cloud-creds";
  return { isLocal, hasCloudCreds, reason };
}
