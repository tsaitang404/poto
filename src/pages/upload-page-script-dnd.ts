export const uploadPageScriptDnd = String.raw`
        '<div class="queue-top">' +
          '<div class="queue-name" data-index="' + String(index) + '" tabindex="0">' + escapeHtml(item.title) + '</div>' +
          '<span class="badge ' + badgeClass(item.status) + '">' + escapeHtml(statusLabel(item.status)) + '</span>' +
        '</div>' +
        '<div class="queue-line">原文件：' + escapeHtml(item.originalName) + '</div>' +
        '<div class="queue-line">类型：' + escapeHtml(item.sourceType || 'unknown') + ' → ' + escapeHtml(item.normalizedType || '-') + '</div>' +
        '<div class="queue-line">大小：' + fmtSize(item.sourceSize) + ' → ' + fmtSize(item.normalizedSize) + '</div>' +
        (item.message || !item.url ? '<div class="queue-line">' + escapeHtml(item.message || '等待处理') + '</div>' : '') +
        linkHtml(item) +
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
  const rawText = typeof item.draftTitle === 'string'
    ? item.draftTitle
    : readEditableNodeText(node);
  const nextTitle = sanitizeQueueTitle(rawText, item.originalTitle);
  item.title = nextTitle;
  delete item.draftTitle;
  node.textContent = nextTitle;
  node.contentEditable = 'false';
  node.classList.remove('editing');
}

function cancelQueueTitle(node) {
  const index = Number(node.dataset.index);
  const item = uploadQueue[index];
  if (!item) return;
  delete item.draftTitle;
  node.textContent = item.title;
  node.contentEditable = 'false';
  node.classList.remove('editing');
}

function updateQueueDraftTitle(node) {
  const index = Number(node.dataset.index);
  const item = uploadQueue[index];
  if (!item) return;
  item.draftTitle = readEditableNodeText(node);
}

function readEditableNodeText(node) {
  return String(node.innerText || node.textContent || '')
    .replaceAll('\\u200B', '')
    .replaceAll('\\r', '');
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
  return '<div class="queue-url">' +
    '<span class="url-text">' + escapeHtml(item.url) + '</span>' +
    '<div class="url-actions">' +
      '<button class="copy-btn" type="button" data-url="' + escapeAttr(item.url) + '">复制链接</button>' +
      '<button class="view-btn" type="button" data-id="' + escapeAttr(item.id) + '">查看</button>' +
    '</div>' +
  '</div>';
}

function revokeQueueUrls() {
  for (const item of uploadQueue) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}

function blockBrowserDropNavigation(event) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function handleGlobalDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  drop.classList.remove('drag');
  queueDroppedPayload(captureDropPayload(event.dataTransfer));
}

function queueDroppedPayload(payload) {
  pendingNormalize = settingsReady.then(async () => {
    const files = await getDroppedFiles(payload);
    if (!files.length) {
      result.textContent = '未检测到可上传的图片文件（请尽量拖原图或右键图片后拖动）';
      return;
    }
    await normalizeAndAssignMany(files);
  });
}

function captureDropPayload(transfer) {
  if (!transfer) {
    return {
      files: [],
      urls: [],
      itemStringsPromise: Promise.resolve([]),
    };
  }

  const itemFiles = extractImageFilesFromItems(transfer.items);
  const directFiles = Array.from(transfer.files || []).filter(isMaybeImageFile);
  const uriList = transfer.getData('text/uri-list');
  const html = transfer.getData('text/html');
  const text = transfer.getData('text/plain');

  return {
    files: itemFiles.length ? itemFiles : directFiles,
    urls: getDroppedImageUrlsFromText({ uriList, html, text }),
    itemStringsPromise: extractStringsFromItems(transfer.items),
  };
}

async function getDroppedFiles(payload) {
  if (!payload) {
    return [];
  }

  if (payload.files && payload.files.length) {
    return payload.files;
  }

  const itemStrings = await payload.itemStringsPromise;
  const itemUrls = getDroppedImageUrlsFromText({
    uriList: '',
    html: itemStrings.join('\\n'),
    text: itemStrings.join('\\n'),
  });
  const urls = (payload.urls || []).concat(itemUrls);
  const uniqueUrls = Array.from(new Set(urls));
  if (!uniqueUrls.length) {
    return [];
  }

  const fetchedFiles = [];
  for (const url of uniqueUrls) {
    try {
      const file = await fetchImageAsFile(url);
      if (file) {
        fetchedFiles.push(file);
      }
    } catch {
      // Ignore individual URL failures and continue trying the rest.
    }
  }
  return fetchedFiles;
}

function getDroppedImageUrlsFromText({ uriList, html, text }) {
  const urls = new Set();

  for (const line of splitTextLines(uriList)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    if (isLikelyImageUrl(value)) {
      urls.add(value);
    }
  }

  if (html) {
    for (const url of extractImageSrcFromHtml(html)) {
      if (isLikelyImageUrl(url)) {
        urls.add(url);
      }
    }
  }

  for (const line of splitTextLines(text)) {
    const value = line.trim();
    if (!value) continue;
    if (isLikelyImageUrl(value)) {
      urls.add(value);
    }
  }

  return Array.from(urls);
}

function splitTextLines(value) {
  return String(value || '')
    .replaceAll(String.fromCharCode(13), '')
    .split(String.fromCharCode(10));
}

function extractImageSrcFromHtml(html) {
  try {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return Array.from(doc.querySelectorAll('img'))
      .map((img) => String(img.getAttribute('src') || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractImageFilesFromItems(items) {
  if (!items) {
    return [];
  }
  const files = [];
  for (const item of Array.from(items)) {
    if (!item || item.kind !== 'file') continue;
    const file = item.getAsFile && item.getAsFile();
    if (file && isMaybeImageFile(file)) {
`;
