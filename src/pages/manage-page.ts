import { escapeHtml } from "../lib/text";
import { managePageScript } from "./manage-page-script";

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
    .pager {
      margin-top: 14px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .page-info {
      color: var(--muted);
      font-size: 12px;
      min-width: 96px;
      text-align: center;
    }
    .settings-overlay {
      position: fixed;
      inset: 0;
      background: rgba(42, 31, 26, 0.4);
      display: flex;
      align-items: flex-start;
      justify-content: flex-end;
      z-index: 100;
    }
    .settings-overlay[hidden] { display: none; }
    .settings-drawer {
      background: var(--card);
      width: min(420px, 100vw);
      height: 100%;
      overflow-y: auto;
      box-shadow: -4px 0 28px rgba(70, 44, 28, 0.18);
      display: flex;
      flex-direction: column;
    }
    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
    }
    .settings-header strong { font-size: 16px; }
    .settings-close {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 20px;
      color: var(--muted);
      padding: 4px 8px;
      border-radius: 8px;
      line-height: 1;
    }
    .settings-close:hover { background: var(--primary-soft); }
    .settings-body { padding: 18px; flex: 1; }
    .settings-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 0 0 12px;
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
        <button id="settingsBtn" class="tool-btn" type="button">设置</button>
        <a href="/">返回上传页</a>
      </div>
    </div>
    <section id="list" class="list"></section>
    <div class="pager">
      <button id="prevPage" class="tool-btn" type="button">上一页</button>
      <span id="pageInfo" class="page-info">第 1 / 1 页</span>
      <button id="nextPage" class="tool-btn" type="button">下一页</button>
      <select id="pageSizeSelect" class="tool-btn" style="padding:0 8px;">
        <option value="10" selected>10 / 页</option>
        <option value="20">20 / 页</option>
        <option value="50">50 / 页</option>
        <option value="100">100 / 页</option>
        <option value="500">500 / 页</option>
      </select>
    </div>
  </main>

  <div id="settingsOverlay" class="settings-overlay" hidden>
    <div class="settings-drawer" id="settingsDrawer">
      <div class="settings-header">
        <strong>设置</strong>
        <button id="settingsClose" class="settings-close" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="settings-body">
        <p class="settings-section-title">上传 API Token</p>
        <div class="token-panel">
          <div class="token-head">
            <strong class="token-title">API Token</strong>
            <div class="token-actions">
              <button id="rotateToken" class="tool-btn" type="button">生成 Token</button>
              <button id="copyToken" class="tool-btn" type="button" disabled>复制 Token</button>
            </div>
          </div>
          <p class="token-hint">用于无 Cookie 场景调用上传接口。请求头可用 <code>Authorization: Bearer &lt;token&gt;</code> 或 <code>X-API-Token: &lt;token&gt;</code>。</p>
          <div id="tokenMeta" class="token-meta">正在读取 Token 状态...</div>
          <div id="tokenValue" class="token-value"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
${managePageScript}
  </script>
</body>
</html>`;
}
