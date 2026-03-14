export const managePageScriptSettings = String.raw`

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
`;
