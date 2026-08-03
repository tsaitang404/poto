export const managePageScriptUtils = String.raw`
    const body = await res.json();
    if (!res.ok) {
      status.textContent = '保存失败: ' + (body.error || 'unknown');
      return;
    }
    status.textContent = '保存成功';
  }

  if (action === 'view') {
    window.open('/i/' + id, '_blank', 'noreferrer');
    return;
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

  if (action === 'ai') {
    status.textContent = '触发 AI 重新分析...';
    const res = await fetch('/api/images/' + id + '/ai', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) {
      status.textContent = 'AI 触发失败: ' + (body.error || 'unknown');
      return;
    }
    status.textContent = 'AI 重新分析已触发';
    setTimeout(function () { loadAiMeta(id); }, 1500);
    return;
  }

  if (action === 'ai-save') {
    await saveAiMeta(id);
    return;
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
