export const managePageTemplateMarkup = `
        grid-template-columns: 1fr;
      }
      .item {
        grid-template-columns: 1fr;
      }
      .thumb-wrap {
        width: 100%;
        height: 180px;
      }
      .toolbar,
      .toolbar-main,
      .top-actions {
        width: 100%;
      }
      .toolbar {
        justify-content: flex-start;
      }
      .top-actions {
        justify-content: flex-start;
      }
      .control {
        width: 100%;
        min-width: 0;
      }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <div class="topbar">
      <div class="title">
        <h2>图片管理</h2>
        <div class="subtitle-line">
          <p class="subtitle">在这里快速预览、改标题、删除历史图片</p>
        </div>
      </div>
      <div class="top-actions">
        <button id="reload" class="tool-btn" type="button">刷新</button>
        <button id="statsToggle" class="tool-btn" type="button" aria-expanded="false">查看统计</button>
        <button id="settingsBtn" class="tool-btn" type="button">设置</button>
        <a class="tool-btn" href="/">返回上传页</a>
      </div>
    </div>
    <div class="toolbar">
      <div class="toolbar-main">
        <span id="status" class="status-pill">加载中...</span>
        <input id="filter" class="control" type="search" placeholder="搜索标题或 ID" />
      </div>
    </div>
    <section id="statsPanel" class="stats-panel" hidden>
      <div class="stats-head">
        <div>
          <h3>统计概览</h3>
          <div id="statsMeta" class="stats-meta">正在读取统计...</div>
        </div>
      </div>
      <div id="statsSummary" class="stats-grid">
        <div class="empty">正在读取统计...</div>
      </div>
      <div class="stats-tables">
        <section class="stats-block">
          <div class="stats-block-head">文件最大 Top 10</div>
          <div id="statsTopFiles" class="stats-table-wrap"></div>
        </section>
        <section class="stats-block">
          <div class="stats-block-head">各类型文件数量</div>
          <div id="statsMimeBreakdown" class="stats-table-wrap"></div>
        </section>
        <section class="stats-block">
          <div class="stats-block-head">各文件本月访问量</div>
          <div id="statsMonthlyAccess" class="stats-table-wrap"></div>
        </section>
      </div>
    </section>
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
        <p class="settings-section-title">上传策略</p>
        <div class="settings-grid">
          <div class="settings-field">
            <label for="webpMode">图片转 WebP</label>
            <select id="webpMode" class="control">
              <option value="force">强制</option>
              <option value="smart">智能</option>
              <option value="original">原始</option>
            </select>
            <p class="settings-help">强制：除 SVG 外全部转为 WebP。智能：转成 WebP 后仅在更小时使用。原始：保留原格式。</p>
          </div>
          <div id="webpParams" class="settings-grid">
            <div class="settings-field">
              <label for="staticWebpQuality">静态图 WebP 质量</label>
              <input id="staticWebpQuality" class="control" type="number" min="1" max="100" value="86" />
            </div>
            <div class="settings-field">
              <label for="gifWebpQuality">GIF 转 WebP 质量</label>
              <input id="gifWebpQuality" class="control" type="number" min="1" max="100" value="80" />
            </div>
          </div>
          <div class="settings-grid">
            <div class="settings-field">
              <label for="staticSourceMaxMb">静态图源文件上限（MB）</label>
              <input id="staticSourceMaxMb" class="control" type="number" min="0.1" max="500" step="0.1" value="10" />
            </div>
            <div class="settings-field">
              <label for="gifSourceMaxMb">GIF 源文件上限（MB）</label>
              <input id="gifSourceMaxMb" class="control" type="number" min="0.1" max="500" step="0.1" value="20" />
            </div>
            <div class="settings-field">
              <label for="webpUploadMaxMb">最终 WebP 上限（MB）</label>
              <input id="webpUploadMaxMb" class="control" type="number" min="0.1" max="500" step="0.1" value="20" />
            </div>
            <div class="settings-field">
              <label for="svgUploadMaxMb">SVG 上限（MB）</label>
              <input id="svgUploadMaxMb" class="control" type="number" min="0.1" max="500" step="0.1" value="1" />
            </div>
            <div class="settings-field">
              <label for="cloudflareApiToken">CLOUDFLARE_API_TOKEN</label>
              <input id="cloudflareApiToken" class="control" type="password" spellcheck="false" autocomplete="off" placeholder="留空时使用默认环境变量" />
              <p id="cloudflareApiTokenMeta" class="settings-help">留空则使用 Worker 默认注入的 Token；填写后优先使用这里保存的值。</p>
            </div>
          </div>

          <p class="settings-section-title">AI 图片分析</p>
          <div class="settings-grid">
            <div class="settings-field">
              <label class="checkbox-label">
                <input id="aiEnabled" type="checkbox" />
                启用 AI 自动分析（描述 / 标签 / OCR）
              </label>
              <p class="settings-help">上传图片后自动调用 Workers AI 视觉模型生成描述和标签。</p>
            </div>
            <div class="settings-field">
              <label for="aiVisionModel">视觉模型（描述 + OCR）</label>
              <select id="aiVisionModel" class="control">
                <option value="@cf/meta/llama-3.2-11b-vision-instruct">Llama 3.2 11B Vision (推荐)</option>
                <option value="@cf/moondream/moondream3.1-9B-A2B">Moondream 3.1 9B (轻量)</option>
              </select>
            </div>
            <div class="settings-field">
              <label for="aiTextModel">文本模型（标签总结）</label>
              <select id="aiTextModel" class="control">
                <option value="@cf/meta/llama-3.1-8b-fast-v2">Llama 3.1 8B Fast (推荐)</option>
                <option value="@cf/meta/llama-3.3-70b-instruct-fp8-fast">Llama 3.3 70B (高质量)</option>
              </select>
            </div>
            <div class="settings-field">
              <label for="aiMaxDaily">每日分析上限（张）</label>
              <input id="aiMaxDaily" class="control" type="number" min="0" max="10000" value="200" />
              <p class="settings-help">0 表示不限。Workers AI 免费额度约 10,000 Neurons/天。</p>
            </div>
          </div>
          <div class="settings-actions">
            <button id="saveSettings" class="tool-btn" type="button">保存设置</button>
            <span id="settingsSaveStatus" class="settings-save-status">正在读取设置...</span>
          </div>
        </div>

        <p class="settings-section-title">访问密码</p>
        <div class="settings-grid">
          <div class="settings-field">
            <label for="accessPassword">新密码</label>
            <input id="accessPassword" class="control" type="password" spellcheck="false" autocomplete="new-password" placeholder="留空不修改" />
            <p id="accessPasswordMeta" class="settings-help">正在读取密码状态...</p>
          </div>
          <div class="settings-actions">
            <button id="saveAccessPassword" class="tool-btn" type="button">修改密码</button>
            <span id="passwordSaveStatus" class="settings-save-status"></span>
          </div>
        </div>

        <p class="settings-section-title">上传 API Token</p>
        <div class="token-panel">
          <div class="token-head">
            <strong class="token-title">API Token</strong>
            <div class="token-actions">
              <button id="rotateToken" class="tool-btn" type="button">轮换 Token</button>
              <button id="copyToken" class="tool-btn" type="button">复制 Token</button>
            </div>
          </div>
          <p class="token-hint">用于无 Cookie 场景调用上传接口。请求头可用 <code>Authorization: Bearer &lt;token&gt;</code> 或 <code>X-API-Token: &lt;token&gt;</code>。</p>
          <p id="tokenStatus" class="token-status" role="status"></p>
          <div id="tokenMeta" class="token-meta">正在读取 Token 状态...</div>
          <div id="tokenValue" class="token-value"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
__MANAGE_SCRIPT__
  </script>
</body>
</html>
`;
