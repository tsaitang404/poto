export const uploadPageScriptPolicy = String.raw`
  if (file.type === 'image/gif') {
    return {
      kind: 'gif',
      mode,
      needsConvert: mode !== 'original' && file.type !== 'image/webp',
      maxSourceBytes: megabytesToBytes(uploadSettings.gif_source_max_mb),
      maxUploadBytes: megabytesToBytes(uploadSettings.webp_upload_max_mb),
      webpQuality: uploadSettings.gif_webp_quality,
      label: 'GIF',
    };
  }
  if (file.type === 'image/svg+xml') {
    return {
      kind: 'svg',
      needsConvert: false,
      maxSourceBytes: megabytesToBytes(uploadSettings.svg_upload_max_mb),
      maxUploadBytes: megabytesToBytes(uploadSettings.svg_upload_max_mb),
      label: 'SVG',
    };
  }
  return {
    kind: 'static',
    mode,
    needsConvert: mode !== 'original' && file.type !== 'image/webp',
    maxSourceBytes: file.type === 'image/webp' ? megabytesToBytes(uploadSettings.webp_upload_max_mb) : megabytesToBytes(uploadSettings.static_source_max_mb),
    maxUploadBytes: mode === 'original'
      ? (file.type === 'image/webp' ? megabytesToBytes(uploadSettings.webp_upload_max_mb) : megabytesToBytes(uploadSettings.static_source_max_mb))
      : megabytesToBytes(uploadSettings.webp_upload_max_mb),
    webpQuality: uploadSettings.static_webp_quality,
    label: file.type === 'image/webp' ? 'WebP' : '静态图',
  };
}

function buildOriginalMessage(file, policy) {
  if (file.type === 'image/svg+xml') {
    return 'SVG 原样上传，并在服务端做安全校验';
  }
  if (file.type === 'image/webp') {
    return '已是 WebP，直接上传';
  }
  if (policy.mode === 'original') {
    return '按设置保留原始格式上传';
  }
  return '原图直传';
}

function buildConvertedMessage(sourceFile, normalizedFile, mode, isGif) {
  const saved = sourceFile.size - normalizedFile.size;
  const ratio = sourceFile.size > 0 ? Math.round((saved / sourceFile.size) * 100) : 0;
  const prefix = isGif ? 'GIF 已转为动态 WebP' : (mode === 'smart' ? '智能模式选择 WebP' : '已按设置转为 WebP');
  return prefix + (saved > 0 ? '，节省 ' + ratio + '%' : '');
}

function normalizeMode(value) {
  return value === 'force' || value === 'smart' || value === 'original' ? value : DEFAULT_UPLOAD_SETTINGS.webp_mode;
}

function clampQuality(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(1, Math.min(100, Math.round(num)));
}

function clampMegabytes(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0.1, Math.min(500, Math.round(num * 10) / 10));
}

function megabytesToBytes(megabytes) {
  return Math.round(megabytes * 1024 * 1024);
}

function formatMegabytes(bytes) {
  const megabytes = bytes / 1024 / 1024;
  return Number.isInteger(megabytes) ? String(megabytes) : String(Number(megabytes.toFixed(1)));
}

`;
