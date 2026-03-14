import type { Env } from "../types";

export const MAX_WEBP_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_SVG_UPLOAD_BYTES = 1 * 1024 * 1024;

const ACCEPTED_IMAGE_MIMES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

export function isAcceptedUploadMime(mime: string): boolean {
  return ACCEPTED_IMAGE_MIMES.includes(mime);
}

export function getMaxUploadBytes(mime: string): number {
  if (mime === "image/svg+xml") {
    return MAX_SVG_UPLOAD_BYTES;
  }
  return MAX_WEBP_UPLOAD_BYTES;
}

export function normalizeStoredMime(mime: string): string {
  return mime;
}

export function extensionByMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? "bin";
}

export function validateSvgContent(bytes: Uint8Array): string | null {
  const source = new TextDecoder().decode(bytes).trim();

  if (!source.startsWith("<svg") && !source.startsWith("<?xml")) {
    return "invalid svg content";
  }

  const blockedPatterns = [
    /<script[\s>]/i,
    /<foreignObject[\s>]/i,
    /on[a-z]+\s*=/i,
    /javascript\s*:/i,
    /data\s*:\s*text\/html/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(source)) {
      return "unsafe svg content is not allowed";
    }
  }

  return null;
}

export function getWorkerBaseUrl(request: Request, env: Env): string {
  return normalizeBaseUrl(env.WORKER_BASE_URL) ?? new URL(request.url).origin;
}

export function getPublicBaseUrl(workerBaseUrl: string, env: Env, mimeType = "image/webp"): string {
  if (mimeType === "image/svg+xml") {
    return `${workerBaseUrl}/files`;
  }
  const explicit = normalizeBaseUrl(env.PUBLIC_BASE_URL);
  if (explicit) {
    return explicit;
  }
  return `${workerBaseUrl}/files`;
}

export function encodeObjectKeyForUrl(key: string): string {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export async function sha256Hex(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", input as unknown as BufferSource);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function normalizeBaseUrl(input: string | undefined): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/$/, "");
}
