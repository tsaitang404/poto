export const uploadPageScriptCodec = String.raw`
      files.push(file);
    }
  }
  return files;
}

async function extractStringsFromItems(items) {
  if (!items) {
    return [];
  }
  const tasks = [];
  for (const item of Array.from(items)) {
    if (!item || item.kind !== 'string') continue;
    tasks.push(new Promise((resolve) => {
      item.getAsString((value) => resolve(String(value || '')));
    }));
  }

  const values = await Promise.all(tasks);
  const valuesOut = [];
  for (const value of values) {
    valuesOut.push(String(value || ''));
  }
  return valuesOut;
}

function isMaybeImageFile(file) {
  if (!file) {
    return false;
  }
  if (file.type && file.type.startsWith('image/')) {
    return true;
  }
  return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(String(file.name || ''));
}

function isLikelyImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) {
    return false;
  }
  if (value.startsWith('blob:') || value.startsWith('data:image/')) {
    return true;
  }
  return /^https?:\/\//i.test(value);
}

async function fetchImageAsFile(url) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) {
    throw new Error('failed to fetch dropped image');
  }

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    return null;
  }

  const name = inferFileName(url, blob.type);
  return new File([blob], name, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

function inferFileName(url, mimeType) {
  const fallbackExt = mimeTypeToExt(mimeType);
  try {
    const parsed = new URL(url, window.location.href);
    const raw = parsed.pathname.split('/').pop() || '';
    const safe = decodeURIComponent(raw).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (safe && /\.[a-zA-Z0-9]+$/.test(safe)) {
      return safe;
    }
    if (safe) {
      return safe + fallbackExt;
    }
  } catch {
  }
  return 'dropped-image-' + Date.now() + fallbackExt;
}

function mimeTypeToExt(mimeType) {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/svg+xml') return '.svg';
  if (mimeType === 'image/avif') return '.avif';
  return '.img';
}

function fmtSize(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
    : (bytes / 1024).toFixed(1) + ' KB';
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

async function convertToWebp(file, quality) {
  if (!file.type.startsWith('image/')) {
    throw new Error('仅支持图片文件');
  }
  if (file.type === 'image/webp') {
    return file;
  }
  if (!window.createImageBitmap) {
    throw new Error('当前浏览器不支持自动转码，请直接上传 WebP');
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('浏览器不支持 Canvas 转码');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) {
        reject(new Error('WebP 编码失败'));
        return;
      }
      resolve(b);
    }, 'image/webp', quality);
  });

  const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
  return new File([blob], name, { type: 'image/webp', lastModified: Date.now() });
}

async function convertGifToAnimatedWebp(file, quality) {
  const tools = await loadGif2WebpTools();
  const module = await tools.Gif2Webp(tools.initLocateFile(new URL('gif2webp.wasm', GIF2WEBP_MODULE_URL).href));
  const cwd = '/workspace';
  const inputPath = cwd + '/input.gif';
  const outputPath = cwd + '/output.webp';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const gifQuality = String(Math.max(1, Math.min(100, Math.round(quality * 100))));

  tools.initFS(module, cwd);
  tools.writeFileWithUint8ArrayData(module, inputPath, bytes);
  tools.runGif2Webp(module, undefined, inputPath, '-q', gifQuality, '-mixed', '-mt', '-o', outputPath);

  const blob = tools.getFileWithBlobData(module, outputPath, 'image/webp');
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
    type: 'image/webp',
    lastModified: Date.now(),
  });
}

async function loadGif2WebpTools() {
  if (!gif2webpToolsPromise) {
    gif2webpToolsPromise = import(GIF2WEBP_MODULE_URL);
  }
  return gif2webpToolsPromise;
}

async function loadUploadSettings() {
  try {
    const res = await fetch('/api/settings');
    const body = await res.json();
    if (!res.ok) {
      return;
    }
    uploadSettings = {
      webp_mode: normalizeMode(body.webp_mode),
      static_webp_quality: clampQuality(body.static_webp_quality, DEFAULT_UPLOAD_SETTINGS.static_webp_quality),
      gif_webp_quality: clampQuality(body.gif_webp_quality, DEFAULT_UPLOAD_SETTINGS.gif_webp_quality),
      static_source_max_mb: clampMegabytes(body.static_source_max_mb, DEFAULT_UPLOAD_SETTINGS.static_source_max_mb),
      gif_source_max_mb: clampMegabytes(body.gif_source_max_mb, DEFAULT_UPLOAD_SETTINGS.gif_source_max_mb),
      webp_upload_max_mb: clampMegabytes(body.webp_upload_max_mb, DEFAULT_UPLOAD_SETTINGS.webp_upload_max_mb),
      svg_upload_max_mb: clampMegabytes(body.svg_upload_max_mb, DEFAULT_UPLOAD_SETTINGS.svg_upload_max_mb),
    };
  } catch {
  }
}

async function normalizeUploadFile(file, policy) {
  if (!policy.needsConvert) {
    return { file, message: buildOriginalMessage(file, policy) };
  }
  const quality = policy.kind === 'gif' ? policy.webpQuality : policy.webpQuality / 100;
  if (policy.kind === 'gif') {
    try {
      const convertedGif = await convertGifToAnimatedWebp(file, quality);
      if (policy.mode === 'smart' && convertedGif.size >= file.size) {
        return { file, message: '智能模式保留原始 GIF，转 WebP 后未更小' };
      }
      return { file: convertedGif, message: buildConvertedMessage(file, convertedGif, policy.mode, true) };
    } catch (err) {
      const msg = (err && err.message) ? err.message : 'GIF 转动态 WebP 失败';
      throw new Error(msg + '，请稍后重试或先手动转为动态 WebP');
    }
  }
  const converted = await convertToWebp(file, quality);
  if (policy.mode === 'smart' && converted.size >= file.size) {
    return { file, message: '智能模式保留原图，转 WebP 后未更小' };
  }
  return { file: converted, message: buildConvertedMessage(file, converted, policy.mode, false) };
}

function getUploadPolicy(file) {
  const mode = uploadSettings.webp_mode;
`;
