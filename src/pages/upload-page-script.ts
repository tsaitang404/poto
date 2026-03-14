export const uploadPageScript = `
const GIF2WEBP_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@libwebp-wasm/gif2webp@1.0.8/es/gif2webp.js';
const DEFAULT_UPLOAD_SETTINGS = {
  webp_mode: 'smart',
  static_webp_quality: 86,
  gif_webp_quality: 80,
  static_source_max_mb: 10,
  gif_source_max_mb: 20,
  webp_upload_max_mb: 20,
  svg_upload_max_mb: 1,
};

const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('image');
const drop = document.getElementById('dropZone');
const preview = document.getElementById('preview');
const result = document.getElementById('result');
let pendingNormalize = Promise.resolve();
let gif2webpToolsPromise;
let uploadQueue = [];
let uploadSettings = { ...DEFAULT_UPLOAD_SETTINGS };
const settingsReady = loadUploadSettings();

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) return;
  pendingNormalize = settingsReady.then(() => normalizeAndAssignMany(files));
});

drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('drag');
});
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('drag');
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return;
  pendingNormalize = settingsReady.then(() => normalizeAndAssignMany(Array.from(files)));
});

preview.addEventListener('dblclick', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const titleNode = target.closest('.queue-name');
  if (!(titleNode instanceof HTMLElement)) return;
  titleNode.contentEditable = 'true';
  titleNode.classList.add('editing');
  placeCaretAtEnd(titleNode);
});

preview.addEventListener('keydown', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains('queue-name')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    saveQueueTitle(target);
    target.blur();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelQueueTitle(target);
    target.blur();
  }
});

preview.addEventListener('focusout', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains('queue-name')) return;
  saveQueueTitle(target);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await settingsReady;
  await pendingNormalize;
  if (!uploadQueue.length) {
    result.textContent = '请先选择图片';
    return;
  }
  const readyItems = uploadQueue.filter((item) => item.normalizedFile && !item.error);
  if (!readyItems.length) {
    result.textContent = '没有可上传的图片，请检查失败项后重试';
    return;
  }

  let uploaded = 0;
  let duplicated = 0;
  let restored = 0;
  let failed = 0;
  result.textContent = '上传中...';

  for (const item of readyItems) {
    item.status = 'uploading';
    item.message = '正在上传...';
    renderQueue();

    const data = new FormData();
    data.set('image', item.normalizedFile);
    data.set('title', item.title);
    const res = await fetch('/api/upload', { method: 'POST', body: data });
    const body = await res.json();

    if (!res.ok) {
      item.status = 'error';
      item.message = '上传失败: ' + (body.error || 'unknown');
      failed += 1;
      renderQueue();
      continue;
    }

    item.id = body.id || '';
    item.url = body.url || '';
    if (body.duplicate) {
      item.status = 'duplicate';
      item.message = '重复图片，已存在记录';
      duplicated += 1;
    } else if (body.restored) {
      item.status = 'restored';
      item.message = '曾删除，已恢复并覆盖';
      restored += 1;
    } else {
      item.status = 'success';
      item.message = '上传成功';
      uploaded += 1;
    }
    renderQueue();
  }

  result.textContent = '完成：新增 ' + uploaded + '，重复 ' + duplicated + '，恢复 ' + restored + '，失败 ' + failed;
});

async function normalizeAndAssignMany(files) {
  revokeQueueUrls();
  uploadQueue = [];
  renderQueue();

  result.textContent = files.length > 1 ? '正在处理 ' + files.length + ' 张图片...' : '正在处理图片...';

  for (const file of files) {
    const title = buildTitle(file);
    const queueItem = {
      originalName: file.name,
      title,
      originalTitle: title,
      sourceSize: file.size,
      normalizedSize: file.size,
      sourceType: file.type,
      normalizedType: file.type,
      normalizedFile: null,
      previewUrl: '',
      status: 'pending',
      message: '',
      id: '',
      url: '',
      error: false,
    };
    uploadQueue.push(queueItem);
    renderQueue();

    const policy = getUploadPolicy(file);
    if (file.size > policy.maxSourceBytes) {
      queueItem.status = 'error';
      queueItem.error = true;
      queueItem.message = policy.label + ' 超过 ' + formatMegabytes(policy.maxSourceBytes) + 'MB 限制';
      continue;
    }

    try {
      const normalizedResult = await normalizeUploadFile(file, policy);
      const normalized = normalizedResult.file;
      if (normalized.size > policy.maxUploadBytes) {
        queueItem.status = 'error';
        queueItem.error = true;
        queueItem.message = '最终上传文件超过 ' + formatMegabytes(policy.maxUploadBytes) + 'MB';
        continue;
      }
      queueItem.normalizedFile = normalized;
      queueItem.normalizedSize = normalized.size;
      queueItem.normalizedType = normalized.type;
      queueItem.previewUrl = URL.createObjectURL(normalized);
      queueItem.message = normalizedResult.message;
    } catch (err) {
      const msg = (err && err.message) ? err.message : '转码失败';
      queueItem.status = 'error';
      queueItem.error = true;
      queueItem.message = '上传前处理失败: ' + msg;
    }
    renderQueue();
  }

  const validCount = uploadQueue.filter((item) => item.normalizedFile && !item.error).length;
  result.textContent = validCount
    ? '已准备 ' + validCount + ' 张图片，点击上传开始提交'
    : '没有可上传的图片，请重新选择';
}

function renderQueue() {
  if (!uploadQueue.length) {
    preview.className = 'queue-empty';
    preview.innerHTML = '暂未选择图片';
    return;
  }

  preview.className = 'queue';
  preview.innerHTML = uploadQueue.map((item, index) => {
    return '<article class="queue-item">' +
      '<div class="queue-thumb">' +
        (item.previewUrl ? '<img alt="preview" src="' + escapeAttr(item.previewUrl) + '" />' : '<span class="queue-line">无预览</span>') +
      '</div>' +
      '<div class="queue-meta">' +
        '<div class="queue-top">' +
          '<div class="queue-name" data-index="' + String(index) + '" tabindex="0">' + escapeHtml(item.title) + '</div>' +
          '<span class="badge ' + badgeClass(item.status) + '">' + escapeHtml(statusLabel(item.status)) + '</span>' +
        '</div>' +
        '<div class="queue-line">原文件：' + escapeHtml(item.originalName) + '</div>' +
        '<div class="queue-line">类型：' + escapeHtml(item.sourceType || 'unknown') + ' → ' + escapeHtml(item.normalizedType || '-') + '</div>' +
        '<div class="queue-line">大小：' + fmtSize(item.sourceSize) + ' → ' + fmtSize(item.normalizedSize) + '</div>' +
        '<div class="queue-line">' + escapeHtml(item.message || '等待处理') + linkHtml(item) + '</div>' +
      '</div>' +
    '</article>';
  }).join('');
}

function buildTitle(file) {
  return file.name.replace(/\.[^.]+$/, '');
}

function saveQueueTitle(node) {
  const index = Number(node.dataset.index);
  const item = uploadQueue[index];
  if (!item) return;
  const nextTitle = sanitizeQueueTitle(node.textContent, item.originalTitle);
  item.title = nextTitle;
  node.textContent = nextTitle;
  node.contentEditable = 'false';
  node.classList.remove('editing');
}

function cancelQueueTitle(node) {
  const index = Number(node.dataset.index);
  const item = uploadQueue[index];
  if (!item) return;
  node.textContent = item.title;
  node.contentEditable = 'false';
  node.classList.remove('editing');
}

function sanitizeQueueTitle(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return text || fallback;
}

function placeCaretAtEnd(node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function badgeClass(status) {
  if (status === 'success' || status === 'duplicate' || status === 'restored') return 'success';
  if (status === 'error') return 'error';
  return 'pending';
}

function statusLabel(status) {
  if (status === 'success') return '成功';
  if (status === 'duplicate') return '重复';
  if (status === 'restored') return '已恢复';
  if (status === 'uploading') return '上传中';
  if (status === 'error') return '失败';
  return '待上传';
}

function linkHtml(item) {
  if (!item.url || !item.id) {
    return '';
  }
  return ' <a href="' + escapeAttr(item.url) + '" target="_blank" rel="noreferrer">原图</a> · <a href="/i/' + escapeAttr(item.id) + '" target="_blank" rel="noreferrer">查看页</a>';
}

function revokeQueueUrls() {
  for (const item of uploadQueue) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
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
