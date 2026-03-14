export const managePageScript = `
const list = document.getElementById('list');
const status = document.getElementById('status');
const filter = document.getElementById('filter');
const reload = document.getElementById('reload');
const statsToggle = document.getElementById('statsToggle');
const statsPanel = document.getElementById('statsPanel');
const statsSummary = document.getElementById('statsSummary');
const statsTopFiles = document.getElementById('statsTopFiles');
const statsMimeBreakdown = document.getElementById('statsMimeBreakdown');
const statsMonthlyAccess = document.getElementById('statsMonthlyAccess');
const statsMeta = document.getElementById('statsMeta');
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
const staticSourceMaxMb = document.getElementById('staticSourceMaxMb');
const gifSourceMaxMb = document.getElementById('gifSourceMaxMb');
const webpUploadMaxMb = document.getElementById('webpUploadMaxMb');
const svgUploadMaxMb = document.getElementById('svgUploadMaxMb');
const cloudflareApiToken = document.getElementById('cloudflareApiToken');
const cloudflareApiTokenMeta = document.getElementById('cloudflareApiTokenMeta');
const saveSettings = document.getElementById('saveSettings');
const settingsSaveStatus = document.getElementById('settingsSaveStatus');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const settingsDrawer = document.getElementById('settingsDrawer');
const accessPassword = document.getElementById('accessPassword');
const accessPasswordMeta = document.getElementById('accessPasswordMeta');
const saveAccessPassword = document.getElementById('saveAccessPassword');
const passwordSaveStatus = document.getElementById('passwordSaveStatus');
let allItems = [];
let latestToken = '';
let currentPage = 1;
let totalItems = 0;
let totalPages = 1;
let hasNextPage = false;
let statsLoaded = false;

loadImages();
loadTokenInfo();
loadSettings();
loadPasswordInfo();
filter.addEventListener('input', renderCurrent);
reload.addEventListener('click', () => {
  loadImages(currentPage);
  if (!statsPanel.hidden) {
    loadStats(true);
  }
});
statsToggle.addEventListener('click', toggleStatsPanel);
pageSizeSelect.addEventListener('change', () => loadImages(1));
settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });
webpMode.addEventListener('change', syncWebpParamVisibility);
saveSettings.addEventListener('click', saveUploadSettings);
saveAccessPassword.addEventListener('click', updateAccessPassword);
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
  staticSourceMaxMb.value = String(body.static_source_max_mb || 10);
  gifSourceMaxMb.value = String(body.gif_source_max_mb || 20);
  webpUploadMaxMb.value = String(body.webp_upload_max_mb || 20);
  svgUploadMaxMb.value = String(body.svg_upload_max_mb || 1);
  cloudflareApiToken.value = body.cloudflare_api_token || '';
  syncCloudflareTokenMeta(body.cloudflare_api_token_source || 'missing');
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
      static_source_max_mb: Number(staticSourceMaxMb.value) || 10,
      gif_source_max_mb: Number(gifSourceMaxMb.value) || 20,
      webp_upload_max_mb: Number(webpUploadMaxMb.value) || 20,
      svg_upload_max_mb: Number(svgUploadMaxMb.value) || 1,
      cloudflare_api_token: cloudflareApiToken.value || '',
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
  staticSourceMaxMb.value = String(body.static_source_max_mb || 10);
  gifSourceMaxMb.value = String(body.gif_source_max_mb || 20);
  webpUploadMaxMb.value = String(body.webp_upload_max_mb || 20);
  svgUploadMaxMb.value = String(body.svg_upload_max_mb || 1);
  cloudflareApiToken.value = body.cloudflare_api_token || '';
  syncCloudflareTokenMeta(body.cloudflare_api_token_source || 'missing');
  syncWebpParamVisibility();
  settingsSaveStatus.textContent = '设置已保存';
}

function syncCloudflareTokenMeta(source) {
  if (source === 'configured') {
    cloudflareApiTokenMeta.textContent = '当前优先使用这里保存的 Token；会覆盖 Worker 默认环境变量。';
    return;
  }
  if (source === 'env') {
    cloudflareApiTokenMeta.textContent = '当前未设置覆盖值，正在使用 Worker 默认环境变量中的 Token。';
    return;
  }
  cloudflareApiTokenMeta.textContent = '当前未配置 Token，统计接口将直接报错。';
}

async function loadPasswordInfo() {
  accessPasswordMeta.textContent = '正在读取密码状态...';
  passwordSaveStatus.textContent = '';
  const res = await fetch('/api/password');
  const body = await res.json();
  if (!res.ok) {
    accessPasswordMeta.textContent = '读取失败: ' + (body.error || 'unknown');
    return;
  }
  if (!body.configured) {
    accessPasswordMeta.textContent = '尚未配置密码，首次登录会自动初始化默认密码。';
    return;
  }
  const updated = body.updated_at ? new Date(body.updated_at).toLocaleString() : '-';
  accessPasswordMeta.textContent = '密码已配置，最后更新: ' + updated;
}

async function updateAccessPassword() {
  const nextPassword = String(accessPassword.value || '').trim();
  if (!nextPassword) {
    passwordSaveStatus.textContent = '请输入新密码';
    accessPassword.focus();
    return;
  }

  passwordSaveStatus.textContent = '正在更新密码...';
  const res = await fetch('/api/password', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: nextPassword }),
  });
  const body = await res.json();

  if (!res.ok) {
    passwordSaveStatus.textContent = '更新失败: ' + (body.error || 'unknown');
    return;
  }

  accessPassword.value = '';
  passwordSaveStatus.textContent = '密码已更新';
  await loadPasswordInfo();
}

async function loadStats(forceReload) {
  if (statsLoaded && !forceReload) {
    return;
  }
  statsMeta.textContent = '正在获取统计...';
  statsSummary.innerHTML = '<div class="empty">正在读取统计...</div>';
  statsTopFiles.innerHTML = '<div class="stats-empty">正在读取...</div>';
  statsMimeBreakdown.innerHTML = '<div class="stats-empty">正在读取...</div>';
  statsMonthlyAccess.innerHTML = '<div class="stats-empty">正在读取...</div>';

  const res = await fetch('/api/stats');
  const body = await res.json();
  if (!res.ok) {
    statsMeta.textContent = '读取统计失败: ' + (body.error || 'unknown');
    statsSummary.innerHTML = '<div class="empty">统计加载失败</div>';
    statsTopFiles.innerHTML = '<div class="stats-empty">统计加载失败</div>';
    statsMimeBreakdown.innerHTML = '<div class="stats-empty">统计加载失败</div>';
    statsMonthlyAccess.innerHTML = '<div class="stats-empty">统计加载失败</div>';
    return;
  }

  statsLoaded = true;

  renderStatsSummary(body.summary || {}, (body.meta && body.meta.sources) || {});
  renderTopFilesTable(body.top_files || []);
  renderMimeTable(body.mime_breakdown || []);
  renderMonthlyAccessTable(body.monthly_access || []);

  statsMeta.textContent = '已使用 Cloudflare 平台统计。';
}

async function toggleStatsPanel() {
  const willOpen = statsPanel.hidden;
  statsPanel.hidden = !willOpen;
  statsToggle.textContent = willOpen ? '收起统计' : '查看统计';
  statsToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  if (willOpen) {
    await loadStats(false);
  }
}

function renderStatsSummary(summary, sources) {
  const cards = [
    {
      label: 'R2 总使用量',
      value: fmtSize(summary.r2_total_usage_bytes || 0),
      source: fmtSourceLabel(sources.r2_total_usage),
    },
    {
      label: 'D1 总使用量',
      value: fmtSize(summary.d1_total_usage_bytes || 0),
      source: fmtSourceLabel(sources.d1_total_usage),
    },
    {
      label: 'R2 本月下载量',
      value: fmtCount(summary.r2_monthly_downloads || 0),
      source: fmtSourceLabel(sources.r2_monthly_downloads),
    },
    {
      label: 'D1 本月查询量',
      value: fmtCount(summary.d1_monthly_queries || 0),
      source: fmtSourceLabel(sources.d1_monthly_queries),
    },
  ];

  statsSummary.innerHTML = cards.map((card) => {
    return '<article class="stat-card">' +
      '<div class="stat-label">' + escapeHtml(card.label) + '</div>' +
      '<div class="stat-value">' + escapeHtml(card.value) + '</div>' +
      '<div class="stat-source">来源：' + escapeHtml(card.source) + '</div>' +
    '</article>';
  }).join('');
}

function renderTopFilesTable(items) {
  renderTable(statsTopFiles, ['文件', '类型', '大小'], items.map((item) => [
    '<a href="/i/' + escapeAttr(item.id) + '" target="_blank" rel="noreferrer">' + escapeHtml(item.title || item.id) + '</a>',
    escapeHtml(item.mime_type || '-'),
    escapeHtml(fmtSize(item.size_bytes || 0)),
  ]), '暂无文件数据');
}

function renderMimeTable(items) {
  renderTable(statsMimeBreakdown, ['类型', '数量', '总大小'], items.map((item) => [
    escapeHtml(item.mime_type || 'unknown'),
    escapeHtml(fmtCount(item.file_count || 0)),
    escapeHtml(fmtSize(item.total_bytes || 0)),
  ]), '暂无类型统计');
}

function renderMonthlyAccessTable(items) {
  renderTable(statsMonthlyAccess, ['文件', '下载量', '链接'], items.map((item) => [
    escapeHtml(item.title || item.id),
    escapeHtml(fmtCount(item.downloads || 0)),
    '<a href="/i/' + escapeAttr(item.id) + '" target="_blank" rel="noreferrer">查看</a>',
  ]), '本月暂无访问记录');
}

function renderTable(container, headers, rows, emptyText) {
  if (!rows.length) {
    container.innerHTML = '<div class="stats-empty">' + escapeHtml(emptyText) + '</div>';
    return;
  }

  container.innerHTML = '<table class="stats-table"><thead><tr>' +
    headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join('') +
    '</tr></thead><tbody>' +
    rows.map((cells) => '<tr>' + cells.map((cell) => '<td>' + cell + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>';
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
    if (!statsPanel.hidden) {
      await loadStats(true);
    }
  }
});

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  if (bytes >= 1024 * 1024) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  if (bytes >= 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
  return String(bytes || 0) + ' B';
}

function fmtCount(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

function fmtSourceLabel(source) {
  if (source === 'cloudflare-r2-graphql') return 'Cloudflare R2 GraphQL';
  if (source === 'cloudflare-d1-graphql') return 'Cloudflare D1 GraphQL';
  if (source === 'cloudflare-d1-rest') return 'Cloudflare D1 REST';
  if (source === 'images-sum') return '图片表汇总';
  if (source === 'd1-pragma') return 'D1 PRAGMA 估算';
  return '不可用';
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
