export const managePageScriptList = String.raw`
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
        '<div class="ai-box" data-id="' + item.id + '"><span class="ai-hint">AI 分析中...</span></div>' +
        '<div class="actions">' +
          '<button class="btn" data-action="save" data-id="' + item.id + '">保存</button>' +
          '<button class="btn" data-action="ai" data-id="' + item.id + '">重新分析</button>' +
          '<button class="btn danger" data-action="delete" data-id="' + item.id + '">删除</button>' +
          '<button class="btn view-btn" data-action="view" data-id="' + item.id + '">查看</button>' +
        '</div>' +
      '</div>';
    list.appendChild(box);
    loadAiMeta(item.id);
  }
}

async function loadAiMeta(id) {
  const box = list.querySelector('.ai-box[data-id="' + id + '"]');
  if (!box) return;
  try {
    const res = await fetch('/api/images/' + id + '/ai');
    if (!res.ok) {
      box.innerHTML = '<span class="ai-hint">AI 不可用</span>';
      return;
    }
    const d = await res.json();
    if (d.ai_status === 'processing') {
      box.innerHTML = '<span class="ai-hint">AI 分析中...</span>';
      return;
    }
    const desc = escapeHtml(d.description || '');
    const tags = escapeHtml(d.tags || '');
    const ocr = escapeHtml(d.ocr_text || '');
    let html = '';
    if (desc) html += '<div class="ai-desc">📝 ' + desc + '</div>';
    if (tags) html += '<div class="ai-tags">🏷️ ' + tags.split(',').map(function (t) { return '<span class="tag">' + escapeHtml(t.trim()) + '</span>'; }).join('') + '</div>';
    if (ocr) html += '<details class="ai-ocr"><summary>📄 OCR 文字</summary><pre>' + ocr + '</pre></details>';
    if (!html) html = '<span class="ai-hint">' + (d.ai_status === 'failed' ? 'AI 分析失败' : '暂无 AI 结果') + '</span>';
    // 编辑区：描述 + 标签输入（OCR 只读展示）
    html += '<div class="ai-edit"><textarea data-ai-desc="' + id + '" placeholder="描述（可编辑）" rows="1">' + desc + '</textarea>' +
      '<input type="text" data-ai-tags="' + id + '" placeholder="标签（逗号分隔）" value="' + tags + '" /></div>';
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = '<span class="ai-hint">AI 加载失败</span>';
  }
}

async function saveAiMeta(id) {
  const descEl = list.querySelector('textarea[data-ai-desc="' + id + '"]');
  const tagsEl = list.querySelector('input[data-ai-tags="' + id + '"]');
  const res = await fetch('/api/images/' + id + '/ai', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: descEl ? descEl.value : '',
      tags: tagsEl ? tagsEl.value : '',
    }),
  });
  const body = await res.json();
  return res.ok;
}

async function loadTokenInfo() {
  const res = await fetch('/api/token');
  const body = await res.json();
  if (!res.ok) {
    tokenMeta.textContent = '读取 Token 状态失败: ' + (body.error || 'unknown');
    return;
  }
  if (!body.configured) {
    rotateToken.textContent = '轮换 Token';
    tokenMeta.textContent = '当前未配置 Token。点击“轮换 Token”创建。';
    return;
  }
  rotateToken.textContent = '轮换 Token';
  tokenMeta.textContent = '已配置 Token，最近轮换时间：' + fmtDate(body.rotated_at || body.created_at || '');
}

async function rotateUploadToken() {
  if (!confirm('确认轮换 Token 吗？旧 Token 将立即失效。')) {
    return;
  }
  tokenStatus.textContent = '正在轮换 Token...';
  const res = await fetch('/api/token/rotate', { method: 'POST' });
  const body = await res.json();
  if (!res.ok) {
    tokenStatus.textContent = 'Token 轮换失败: ' + (body.error || 'unknown');
    return;
  }
  latestToken = body.token || '';
  tokenValue.textContent = latestToken;
  tokenValue.style.display = latestToken ? 'block' : 'none';
  rotateToken.textContent = '轮换 Token';
  tokenMeta.textContent = 'Token 已轮换，最近轮换时间：' + fmtDate(body.rotated_at || '');
  tokenStatus.textContent = 'Token 轮换成功';
}

async function copyUploadToken() {
  if (!latestToken) {
    tokenStatus.textContent = '请先点击“轮换 Token”';
    return;
  }
  try {
    await navigator.clipboard.writeText(latestToken);
    tokenStatus.textContent = 'Token 已复制';
  } catch (err) {
    // fallback: 兼容不支持 Clipboard API 的环境（非 HTTPS、旧浏览器等）
    try {
      const ta = document.createElement('textarea');
      ta.value = latestToken;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      tokenStatus.textContent = ok ? 'Token 已复制' : '复制失败，请手动选择复制';
    } catch (err2) {
      tokenStatus.textContent = '复制失败，请手动选择复制';
    }
  }
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
    // 保存标题
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
    // 保存 AI 元数据（描述/标签）
    const aiOk = await saveAiMeta(id);
    if (!aiOk) {
      status.textContent = '标题已保存，AI 元数据保存失败';
      return;
    }
    status.textContent = '保存成功';
    await loadImages(currentPage);
  }
`;
