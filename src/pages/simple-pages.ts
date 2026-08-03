import { escapeAttr, escapeHtml } from "../lib/text";

export function renderViewPage(image: {
  id: string;
  title: string;
  public_url: string;
  created_at: string;
  description?: string;
  tags?: string;
  ocr_text?: string;
}): string {
  const desc = String(image.description || "").trim();
  const tags = String(image.tags || "").trim();
  const ocr = String(image.ocr_text || "").trim();
  const tagHtml = tags
    ? '<div class="ai-block"><div class="ai-label">🏷️ 标签</div><div class="tags">' +
      tags.split(",").map((t) => '<span class="tag">' + escapeHtml(t.trim()) + "</span>").join("") +
      "</div></div>"
    : "";
  const descHtml = desc
    ? '<div class="ai-block"><div class="ai-label">📝 描述</div><div class="desc">' + escapeHtml(desc) + "</div></div>"
    : "";
  const ocrHtml = ocr
    ? '<div class="ai-block"><div class="ai-label">📄 OCR 文字</div><pre class="ocr">' + escapeHtml(ocr) + "</pre></div>"
    : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(image.title)}</title>
  <style>
    body {
      margin: 0;
      font-family: "Noto Sans SC", sans-serif;
      background: #f8f7f4;
      color: #242424;
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .wrap {
      background: #fff;
      border: 1px solid #ece7df;
      border-radius: 14px;
      padding: 16px;
      width: min(860px, 100%);
    }
    img { max-width: 100%; border-radius: 10px; display: block; margin: 0 auto; }
    .url {
      margin-top: 10px;
      padding: 10px;
      border-radius: 8px;
      background: #f3efe8;
      word-break: break-all;
      cursor: pointer;
    }
    .ai-block {
      margin-top: 12px;
      padding: 10px;
      border-radius: 8px;
      background: #faf8f5;
      border: 1px solid #ece7df;
    }
    .ai-label {
      font-size: 13px;
      font-weight: 600;
      color: #6b5ce7;
      margin-bottom: 6px;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tag {
      display: inline-block;
      background: rgba(107, 92, 231, 0.12);
      color: #6b5ce7;
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 12px;
    }
    .desc {
      font-size: 13px;
      line-height: 1.6;
      color: #444;
    }
    .ocr {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
      color: #555;
    }
    small { display: block; margin-top: 8px; color: #999; }
  </style>
</head>
<body>
  <main class="wrap">
    <h2>${escapeHtml(image.title)}</h2>
    <img src="${escapeAttr(image.public_url)}" alt="${escapeAttr(image.title)}" />
    <div class="url" id="copy">${escapeHtml(image.public_url)}</div>
    ${descHtml}
    ${tagHtml}
    ${ocrHtml}
    <small>上传时间: ${escapeHtml(image.created_at)}</small>
  </main>
  <script>
    document.getElementById('copy').addEventListener('click', async () => {
      const text = document.getElementById('copy').textContent;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      alert('链接已复制');
    });
  </script>
</body>
</html>`;
}

export function renderProtectedPage(error = ""): string {
  const msg = error ? `<p style="color:#b42318;">${escapeHtml(error)}</p>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>访问验证</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; font-family: sans-serif; display: grid; place-items: center; min-height: 100vh; background: #f4efe6; }
    form { background: #fff; border-radius: 12px; padding: 20px; width: min(360px, 100%); border: 1px solid #e7dece; }
    input, button { width: 100%; padding: 10px; margin-top: 8px; }
    button { background: #8f3f23; color: #fff; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <form method="post" action="/protected">
    <h3>输入上传密码</h3>
    ${msg}
    <input type="password" name="password" required />
    <button type="submit">进入上传页</button>
  </form>
</body>
</html>`;
}
