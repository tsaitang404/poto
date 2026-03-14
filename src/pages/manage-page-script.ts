export const managePageScript = `
const list = document.getElementById('list');
const status = document.getElementById('status');
const filter = document.getElementById('filter');
const reload = document.getElementById('reload');
const rotateToken = document.getElementById('rotateToken');
const copyToken = document.getElementById('copyToken');
const tokenMeta = document.getElementById('tokenMeta');
const tokenValue = document.getElementById('tokenValue');
const pageInfo = document.getElementById('pageInfo');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const pageSizeSelect = document.getElementById('pageSizeSelect');
const webpMode = document.getElementById('webpMode');
const webpParams = document.getElementById('webpParams');
const staticWebpQuality = document.getElementById('staticWebpQuality');
const gifWebpQuality = document.getElementById('gifWebpQuality');
const saveSettings = document.getElementById('saveSettings');
const settingsSaveStatus = document.getElementById('settingsSaveStatus');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const settingsDrawer = document.getElementById('settingsDrawer');
let allItems = [];
let latestToken = '';
let currentPage = 1;
let totalItems = 0;
let totalPages = 1;
let hasNextPage = false;

loadImages();
loadTokenInfo();
loadSettings();
filter.addEventListener('input', renderCurrent);
reload.addEventListener('click', () => loadImages(currentPage));
pageSizeSelect.addEventListener('change', () => loadImages(1));
settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });
webpMode.addEventListener('change', syncWebpParamVisibility);
saveSettings.addEventListener('click', saveUploadSettings);
rotateToken.addEventListener('click', rotateUploadToken);
copyToken.addEventListener('click', copyUploadToken);
prevPage.addEventListener('click', () => {
  if (currentPage > 1) {
    loadImages(currentPage - 1);
  }
});
nextPage.addEventListener('click', () => {
  if (hasNextPage) {
    loadImages(currentPage + 1);
  }
});

function openSettings() {
  settingsOverlay.hidden = false;
  settingsDrawer.scrollTop = 0;
  settingsClose.focus();
}

function closeSettings() {
  settingsOverlay.hidden = true;
  settingsBtn.focus();
}

async function loadSettings() {
  settingsSaveStatus.textContent = '正在读取设置...';
  const res = await fetch('/api/settings');
  const body = await res.json();
  if (!res.ok) {
    settingsSaveStatus.textContent = '读取设置失败: ' + (body.error || 'unknown');
    return;
  }
  webpMode.value = body.webp_mode || 'smart';
  staticWebpQuality.value = String(body.static_webp_quality || 86);
  gifWebpQuality.value = String(body.gif_webp_quality || 80);
  syncWebpParamVisibility();
  settingsSaveStatus.textContent = '设置已加载';
}

function syncWebpParamVisibility() {
  webpParams.hidden = webpMode.value === 'original';
}

async function saveUploadSettings() {
  settingsSaveStatus.textContent = '正在保存设置...';
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webp_mode: webpMode.value,
      static_webp_quality: Number(staticWebpQuality.value) || 86,
      gif_webp_quality: Number(gifWebpQuality.value) || 80,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    settingsSaveStatus.textContent = '保存失败: ' + (body.error || 'unknown');
    return;
  }
  webpMode.value = body.webp_mode || 'smart';
  staticWebpQuality.value = String(body.static_webp_quality || 86);
  gifWebpQuality.value = String(body.gif_webp_quality || 80);
  syncWebpParamVisibility();
  settingsSaveStatus.textContent = '设置已保存';
}

async function loadImages(page = 1) {
  status.textContent = '正在获取数据...';
  const pageSize = Number(pageSizeSelect.value) || 10;
  const res = await fetch('/api/images?page=' + String(page) + '&page_size=' + String(pageSize));
  const body = await res.json();
  if (!res.ok) {
    status.textContent = '加载失败: ' + (body.error || 'unknown');
    return;
  }

  allItems = body.items || [];
  currentPage = body.page || 1;
  totalItems = body.total || 0;
  totalPages = body.total_pages || 1;
  hasNextPage = Boolean(body.has_next);
  renderCurrent();
}

function renderCurrent() {
  const keyword = (filter.value || '').trim().toLowerCase();
  const items = keyword
    ? allItems.filter((item) => {
        const itemTitle = String(item.title || '').toLowerCase();
        const id = String(item.id || '').toLowerCase();
        return itemTitle.includes(keyword) || id.includes(keyword);
      })
    : allItems;

  status.textContent = '当前页显示 ' + items.length + ' 张，第 ' + currentPage + ' / ' + totalPages + ' 页，共 ' + totalItems + ' 张';
  pageInfo.textContent = '第 ' + currentPage + ' / ' + totalPages + ' 页';
  prevPage.disabled = currentPage <= 1;
  nextPage.disabled = !hasNextPage;
  list.innerHTML = '';

  if (!items.length) {
    list.innerHTML = '<div class="empty">没有匹配结果，试试换个关键词。</div>';
    return;
  }

  for (const item of items) {
    const box = document.createElement('article');
    box.className = 'item';
    const safeTitle = escapeHtml(item.title || '');
    const safeId = escapeHtml(String(item.id || '').slice(0, 12));
    box.innerHTML =
      '<div class="thumb-wrap"><img class="thumb" src="' + escapeAttr(item.public_url) + '" alt="thumb" loading="lazy" /></div>' +
      '<div>' +
        '<div class="row"><span class="meta">' + escapeHtml(item.mime_type || 'unknown') + ' · ' + fmtSize(item.size_bytes || 0) + ' · ' + fmtDate(item.created_at || '') + '</span><span class="meta id">' + safeId + '</span></div>' +
        '<input type="text" maxlength="120" value="' + safeTitle + '" data-id="' + item.id + '" />' +
        '<div class="actions">' +
          '<button class="btn" data-action="save" data-id="' + item.id + '">保存标题</button>' +
          '<button class="btn danger" data-action="delete" data-id="' + item.id + '">删除</button>' +
          '<a class="view-link" href="/i/' + item.id + '" target="_blank" rel="noreferrer">查看页</a>' +
        '</div>' +
      '</div>';
    list.appendChild(box);
  }
}

async function loadTokenInfo() {
  const res = await fetch('/api/token');
  const body = await res.json();
  if (!res.ok) {
    tokenMeta.textContent = '读取 Token 状态失败: ' + (body.error || 'unknown');
    return;
  }
  if (!body.configured) {
    rotateToken.textContent = '生成 Token';
    tokenMeta.textContent = '当前未配置 Token。点击“生成 Token”创建。';
    return;
  }
  rotateToken.textContent = '轮换 Token';
  tokenMeta.textContent = '已配置 Token，最近轮换时间：' + fmtDate(body.rotated_at || body.created_at || '');
}

async function rotateUploadToken() {
  if (!confirm('确认生成新 Token 吗？旧 Token 将立即失效。')) {
    return;
  }
  status.textContent = '正在生成 Token...';
  const res = await fetch('/api/token/rotate', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) {
    status.textContent = 'Token 生成失败: ' + (body.error || 'unknown');
    return;
  }
  latestToken = body.token || '';
  tokenValue.textContent = latestToken;
  tokenValue.style.display = latestToken ? 'block' : 'none';
  copyToken.disabled = !latestToken;
  rotateToken.textContent = '轮换 Token';
  tokenMeta.textContent = 'Token 已轮换，最近轮换时间：' + fmtDate(body.rotated_at || '');
  status.textContent = 'Token 生成成功';
}

async function copyUploadToken() {
  if (!latestToken) {
    return;
  }
  await navigator.clipboard.writeText(latestToken);
  status.textContent = 'Token 已复制';
}

list.addEventListener('click', async (e) => {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  if (!action || !id) return;

  if (action === 'save') {
    const input = list.querySelector('input[data-id="' + id + '"]');
    const nextTitle = input ? input.value.trim() : '';
    if (!nextTitle) {
      status.textContent = '标题不能为空';
      return;
    }
    status.textContent = '保存中...';
    const res = await fetch('/api/images/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: nextTitle }),
    });
    const body = await res.json();
    if (!res.ok) {
      status.textContent = '保存失败: ' + (body.error || 'unknown');
      return;
    }
    status.textContent = '保存成功';
  }

  if (action === 'delete') {
    if (!confirm('确定删除这张图片吗？此操作不可恢复。')) return;
    status.textContent = '删除中...';
    const res = await fetch('/api/images/' + id, { method: 'DELETE' });
    const body = await res.json();
    if (!res.ok) {
      status.textContent = '删除失败: ' + (body.error || 'unknown');
      return;
    }
    status.textContent = '删除成功';
    const nextPageNumber = allItems.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
    await loadImages(nextPageNumber);
  }
});

function fmtSize(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(2) + ' MB'
    : (bytes / 1024).toFixed(1) + ' KB';
}

function fmtDate(input) {
  if (!input) return '-';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString('zh-CN', { hour12: false });
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
`;
