export const managePageTemplateStyleComponents = `
      font-size: 12px;
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
    .settings-grid {
      display: grid;
      gap: 12px;
      margin-bottom: 18px;
    }
    .settings-field {
      display: grid;
      gap: 6px;
    }
    .settings-field label {
      font-size: 13px;
      color: var(--text);
      font-weight: 600;
    }
    .settings-help {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
      margin: 0;
    }
    .settings-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .settings-save-status {
      font-size: 12px;
      color: var(--muted);
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
      font-family: inherit;
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
    .token-status {
      font-size: 12px;
      margin-top: 8px;
      min-height: 16px;
      color: var(--muted);
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
    .id { font-family: inherit; color: #866753; }
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
      .stats-grid,
      .stats-tables {
`;
