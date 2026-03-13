import { escapeAttr, escapeHtml } from "../lib/text";

export function renderManagePage(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} 管理</title>
  <style>
    :root {
      --bg: #f7efe2;
      --card: #fffdf8;
      --text: #2a1f1a;
      --line: #e5d8c5;
      --primary: #8f3f23;
      --primary-soft: #f4e1d3;
      --danger: #b42318;
      --muted: #6a5548;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 8% 5%, #fff6e7 0, transparent 34%),
        radial-gradient(circle at 90% 88%, #efd4b2 0, transparent 26%),
        var(--bg);
      color: var(--text);
      font-family: "Noto Sans SC", sans-serif;
      padding: 18px;
    }
    .wrap {
      width: min(1040px, 100%);
      margin: 0 auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 22px 56px rgba(70, 44, 28, 0.12);
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .title h2 { margin: 0; font-size: 24px; }
    .subtitle { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .status-pill {
      background: var(--primary-soft);
      color: var(--primary);
      border: 1px solid #e5c9b3;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      min-height: 28px;
      display: inline-flex;
      align-items: center;
    }
    .control, .tool-btn {
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      color: var(--text);
      min-height: 36px;
    }
    .control {
      width: min(260px, 70vw);
      padding: 0 12px;
    }
    .tool-btn {
      padding: 0 12px;
      cursor: pointer;
    }
    .list {
      display: grid;
      gap: 14px;
      margin-top: 12px;
    }
    .token-panel {
      border: 1px solid #e7d8c8;
      border-radius: 12px;
      padding: 12px;
      background: #fff8ef;
      margin-bottom: 12px;
    }
    .token-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .token-title {
      font-size: 14px;
      font-weight: 700;
    }
    .token-hint {
      font-size: 12px;
      color: var(--muted);
      margin: 0;
      line-height: 1.45;
    }
    .token-value {
      margin-top: 8px;
      padding: 10px;
      border-radius: 8px;
      background: #fff;
      border: 1px solid #ecdccc;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      word-break: break-all;
      display: none;
    }
    .token-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .token-meta {
      font-size: 12px;
      color: var(--muted);
      margin-top: 6px;
    }
    .item {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      display: grid;
      grid-template-columns: 118px 1fr;
      gap: 12px;
      align-items: start;
      background: #fff;
    }
    .thumb-wrap {
      width: 118px;
      height: 84px;
      border-radius: 10px;
      border: 1px solid var(--line);
      display: grid;
      place-items: center;
      background: #fff;
      overflow: hidden;
    }
    .thumb {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      object-fit: contain;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }
    .meta { font-size: 12px; color: var(--muted); }
    .id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #866753; }
    input[type="text"] {
      width: 100%;
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      border: none;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      color: #fff;
      background: var(--primary);
      font-size: 13px;
      line-height: 1;
    }
    .btn.danger { background: var(--danger); }
    .view-link {
      color: var(--primary);
      text-decoration: none;
      font-size: 13px;
      padding: 7px 0;
    }
    .view-link:hover { text-decoration: underline; }
    .empty {
      border: 1px dashed #dfcdbb;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      color: var(--muted);
      background: #fffaf2;
    }
    a { color: var(--primary); }
    @media (max-width: 680px) {
      .wrap { padding: 14px; }
      .item {
        grid-template-columns: 1fr;
      }
      .thumb-wrap {
        width: 100%;
        height: 180px;
      }
      .control { width: 100%; }
      .toolbar { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="topbar">
      <div class="title">
        <h2>图片管理</h2>
        <p class="subtitle">在这里快速预览、改标题、删除历史图片</p>
      </div>
      <div class="toolbar">
        <span id="status" class="status-pill">加载中...</span>
        <input id="filter" class="control" type="search" placeholder="搜索标题或 ID" />
        <button id="reload" class="tool-btn" type="button">刷新</button>
        <a href="/">返回上传页</a>
      </div>
    </div>
    <section class="token-panel">
      <div class="token-head">
        <strong class="token-title">上传 API Token</strong>
        <div class="token-actions">
          <button id="rotateToken" class="tool-btn" type="button">生成 Token</button>
          <button id="copyToken" class="tool-btn" type="button" disabled>复制 Token</button>
        </div>
      </div>
      <p class="token-hint">用于无 Cookie 场景调用上传接口。请求头可用 <code>Authorization: Bearer &lt;token&gt;</code> 或 <code>X-API-Token: &lt;token&gt;</code>。</p>
      <div id="tokenMeta" class="token-meta">正在读取 Token 状态...</div>
      <div id="tokenValue" class="token-value"></div>
    </section>
    <section id="list" class="list"></section>
  </main>
  <script>
    const list = document.getElementById('list');
    const status = document.getElementById('status');
    const filter = document.getElementById('filter');
    const reload = document.getElementById('reload');
    const rotateToken = document.getElementById('rotateToken');
    const copyToken = document.getElementById('copyToken');
    const tokenMeta = document.getElementById('tokenMeta');
    const tokenValue = document.getElementById('tokenValue');
    let allItems = [];
    let latestToken = '';

    loadImages();
    loadTokenInfo();
    filter.addEventListener('input', renderCurrent);
    reload.addEventListener('click', loadImages);
    rotateToken.addEventListener('click', rotateUploadToken);
    copyToken.addEventListener('click', copyUploadToken);

    async function loadImages() {
      status.textContent = '正在获取数据...';
      const res = await fetch('/api/images');
      const body = await res.json();
      if (!res.ok) {
        status.textContent = '加载失败: ' + (body.error || 'unknown');
        return;
      }

      allItems = body.items || [];
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

      status.textContent = '显示 ' + items.length + ' / ' + allItems.length + ' 张图片';
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
        await loadImages();
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
  </script>
</body>
</html>`;
}
