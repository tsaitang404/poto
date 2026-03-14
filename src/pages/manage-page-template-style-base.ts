export const managePageTemplateStyleBase = `
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>__MANAGE_TITLE__ 管理</title>
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
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .title {
      flex: 1;
      min-width: 0;
    }
    .title h2 { margin: 0; font-size: 24px; }
    .subtitle-line {
      margin: 6px 0 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
    }
    .subtitle { margin: 0; color: var(--muted); font-size: 13px; }
    .top-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .toolbar-main {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: min(360px, 100%);
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
      flex: 1;
      min-width: 220px;
    }
    .tool-btn {
      padding: 0 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      font-size: 13px;
      line-height: 1;
    }
    .list {
      display: grid;
      gap: 14px;
      margin-top: 12px;
    }
    .stats-panel {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      background: linear-gradient(180deg, #fffaf4 0%, #fff 100%);
      margin-bottom: 16px;
    }
    .stats-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .stats-head h3 {
      margin: 0;
      font-size: 18px;
    }
    .stats-meta {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat-card {
      border: 1px solid #ead9c9;
      border-radius: 14px;
      padding: 14px;
      background: #fff;
      min-height: 108px;
    }
    .stat-label {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 28px;
      line-height: 1.05;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
    }
    .stat-source {
      margin-top: 8px;
      font-size: 12px;
      color: var(--primary);
    }
    .stats-tables {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .stats-block {
      border: 1px solid #ead9c9;
      border-radius: 14px;
      background: #fff;
      overflow: hidden;
      min-width: 0;
    }
    .stats-block-head {
      padding: 12px 14px;
      border-bottom: 1px solid #f1e4d7;
      font-size: 14px;
      font-weight: 700;
    }
    .stats-table-wrap {
      overflow-x: auto;
    }
    .stats-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .stats-table th,
    .stats-table td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #f5eadf;
      vertical-align: top;
    }
    .stats-table th {
      color: var(--muted);
      font-weight: 600;
      background: #fffaf4;
      white-space: nowrap;
    }
    .stats-table tr:last-child td {
      border-bottom: none;
    }
    .stats-empty {
      padding: 18px 14px;
      color: var(--muted);
`;
