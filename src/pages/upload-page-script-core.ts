export const uploadPageScriptCore = String.raw`

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
const DND_CAPTURE = { capture: true, passive: false };

// Prevent browser from opening dropped images/links as a new page.
document.addEventListener('dragenter', blockBrowserDropNavigation, DND_CAPTURE);
document.addEventListener('dragover', blockBrowserDropNavigation, DND_CAPTURE);
document.addEventListener('drop', handleGlobalDrop, DND_CAPTURE);

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) return;
  pendingNormalize = settingsReady.then(() => normalizeAndAssignMany(files));
});

drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('drag');
});
drop.addEventListener('dragenter', (e) => {
  e.preventDefault();
  drop.classList.add('drag');
});
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));

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
  if (e.isComposing || e.keyCode === 229) {
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    setTimeout(() => {
      target.blur();
    }, 0);
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelQueueTitle(target);
    target.blur();
  }
});

preview.addEventListener('input', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains('queue-name')) return;
  updateQueueDraftTitle(target);
});

preview.addEventListener('focusout', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains('queue-name')) return;
  saveQueueTitle(target);
});

preview.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const copyBtn = target.closest('.copy-btn');
  if (copyBtn instanceof HTMLElement) {
    const url = copyBtn.dataset.url;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      const orig = copyBtn.textContent;
      copyBtn.textContent = '已复制！';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = orig; copyBtn.classList.remove('copied'); }, 1500);
    });
    return;
  }
  const viewBtn = target.closest('.view-btn');
  if (viewBtn instanceof HTMLElement) {
    const id = viewBtn.dataset.id;
    if (id) window.open('/i/' + id, '_blank', 'noreferrer');
  }
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
      item.message = '';
      duplicated += 1;
    } else if (body.restored) {
      item.status = 'restored';
      item.message = '';
      restored += 1;
    } else {
      item.status = 'success';
      item.message = '';
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
`;
