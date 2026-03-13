import { escapeHtml } from "../lib/text";
import { uploadPageScript } from "./upload-page-script";

export function renderUploadPage(title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} 上传</title>
  <style>
    :root {
      --bg: #f5f0e6;
      --card: #fffdf7;
      --text: #2a1f1a;
      --primary: #b3472a;
      --line: #e5d8c5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Noto Serif SC", "Source Han Serif SC", serif;
      color: var(--text);
      background:
        radial-gradient(circle at 20% 10%, #fff5de 0, transparent 30%),
        radial-gradient(circle at 80% 80%, #f3d7b6 0, transparent 25%),
        var(--bg);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(720px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(66, 44, 30, 0.12);
      padding: 24px;
      animation: rise .5s ease-out;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    h1 { margin: 0; }
    .manage-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: 10px;
      border: 1px solid var(--line);
      color: var(--primary);
      text-decoration: none;
      background: #fff7ee;
      font-size: 14px;
      white-space: nowrap;
    }
    .manage-link:hover { background: #fbe9d7; }
    .drop {
      border: 2px dashed var(--line);
      border-radius: 12px;
      padding: 28px 20px;
      text-align: center;
      margin-bottom: 12px;
      transition: .2s border-color, .2s transform, .2s background-color;
      cursor: pointer;
      display: grid;
      gap: 8px;
      justify-items: center;
      background: linear-gradient(180deg, rgba(255, 248, 238, 0.9), rgba(255, 252, 246, 0.98));
      min-height: 148px;
    }
    .drop:hover {
      border-color: var(--primary);
      background: linear-gradient(180deg, rgba(255, 242, 226, 0.95), rgba(255, 250, 243, 1));
      transform: translateY(-1px);
    }
    .drop.drag {
      border-color: var(--primary);
      background: linear-gradient(180deg, rgba(255, 238, 218, 1), rgba(255, 248, 238, 1));
    }
    .drop-title {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.4;
      color: var(--text);
    }
    .drop-sub {
      max-width: 460px;
      color: #735d50;
      font-size: 13px;
      line-height: 1.6;
    }
    .drop-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 12px;
      border-radius: 999px;
      background: #fff;
      border: 1px solid var(--line);
      color: var(--primary);
      font-size: 13px;
      line-height: 1;
    }
    input, button {
      width: 100%;
      padding: 10px 12px;
      font-size: 16px;
      border-radius: 10px;
      border: 1px solid var(--line);
      margin-top: 10px;
    }
    button {
      background: var(--primary);
      color: #fff;
      border: none;
      cursor: pointer;
      font-weight: 700;
    }
    .hint {
      margin: 10px 0 0;
      color: #6a5548;
      font-size: 13px;
      line-height: 1.5;
    }
    .file-input {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .queue {
      display: grid;
      gap: 10px;
      margin-top: 14px;
    }
    .queue-item {
      display: grid;
      grid-template-columns: 132px 1fr;
      gap: 12px;
      align-items: stretch;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fffaf4;
      padding: 10px;
      min-height: 112px;
    }
    .queue-thumb {
      width: 132px;
      min-height: 90px;
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
      border: 1px solid var(--line);
      display: grid;
      place-items: center;
    }
    .queue-thumb img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .queue-meta {
      display: grid;
      align-content: start;
      gap: 6px;
      min-width: 0;
    }
    .queue-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
    .queue-name {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.4;
      word-break: break-word;
      padding: 2px 6px;
      border-radius: 6px;
      outline: none;
      cursor: text;
    }
    .queue-name.editing {
      background: #fff;
      box-shadow: inset 0 0 0 1px #d7b79f;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      white-space: nowrap;
      background: #efe3d5;
      color: #7a4b32;
    }
    .badge.success { background: #dff3e4; color: #1b6b3a; }
    .badge.error { background: #f8d8d3; color: #912018; }
    .badge.pending { background: #efe3d5; color: #7a4b32; }
    .queue-line {
      color: #6a5548;
      font-size: 13px;
      line-height: 1.45;
      word-break: break-word;
    }
    .queue-empty {
      margin-top: 14px;
      border: 1px dashed var(--line);
      border-radius: 12px;
      padding: 18px;
      text-align: center;
      color: #7c6658;
      background: #fffaf4;
    }
    #result { margin-top: 8px; font-size: 13px; word-break: break-all; color: #5a4a42; text-align: center; }
    @media (max-width: 640px) {
      .queue-item {
        grid-template-columns: 1fr;
      }
      .queue-thumb {
        width: 100%;
        min-height: 180px;
      }
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="card-head">
      <h1>图床上传</h1>
      <a class="manage-link" href="/manage">进入管理页</a>
    </div>
    <form id="uploadForm">
      <label class="drop" id="dropZone" for="image">
        <span class="drop-chip">选择文件 / 拖拽上传</span>
        <span class="drop-title">把图片拖到这里，或点击这里选择</span>
        <span class="drop-sub">支持单图和多图。选中后会在下方生成预览列表，你可以逐张修改标题再上传。</span>
      </label>
      <p class="hint">JPEG/PNG/静态图会自动转为 WebP；GIF 会自动转为动态 WebP；SVG 原样上传但会做安全检查。默认大小限制：静态图源文件 10MB，GIF 源文件 20MB，最终 WebP 20MB，SVG 1MB。选择后可在下方列表中双击标题修改，回车保存。</p>
      <input class="file-input" id="image" name="image" type="file" accept="image/*" multiple required />
      <button type="submit">上传到 R2</button>
    </form>
    <div id="preview" class="queue-empty">暂未选择图片</div>
    <div id="result"></div>
  </main>
  <script type="module">
${uploadPageScript}
  </script>
</body>
</html>`;
}
