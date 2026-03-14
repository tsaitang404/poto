import { escapeAttr, escapeHtml } from "../lib/text";

export function renderViewPage(image: { id: string; title: string; public_url: string; created_at: string }): string {
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
    img { max-width: 100%; border-radius: 10px; display: block; }
    .url {
      margin-top: 10px;
      padding: 10px;
      border-radius: 8px;
      background: #f3efe8;
      word-break: break-all;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <h2>${escapeHtml(image.title)}</h2>
    <img src="${escapeAttr(image.public_url)}" alt="${escapeAttr(image.title)}" />
    <div class="url" id="copy">${escapeHtml(image.public_url)}</div>
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
