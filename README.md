# Poto Worker

基于 Cloudflare Worker + R2 + D1 的图床实现，内置 AI 图片分析（描述 / 标签 / OCR）。

## 架构

- Worker：上传接口、鉴权、页面渲染、文件代理、AI 分析调度
- R2：图片对象存储
- D1：图片元数据与系统配置
- Workers AI：视觉模型生成描述 + OCR，文本模型总结标签

## 功能特性

### 上传与存储
- SHA-256 去重（同一图片不重复存储）
- 软删除（deleted_at）
- 分页列表查询
- 静态图 / GIF / SVG 分类型大小限制

### AI 图片分析（v0.4.0+）
上传图片后自动异步分析（不阻塞上传响应）：

1. **视觉模型**（默认 `llama-3.2-11b-vision-instruct`）生成中文描述 + OCR 文字
2. **文本模型**（默认 `llama-3.1-8b-fast-v2`）从描述总结独立短标签

管理页可查看/编辑 AI 结果，支持手动触发重新分析。设置页可配置：

- AI 启用开关（关闭后上传不触发分析）
- 视觉模型选择（Llama 3.2 Vision / Moondream 3.1）
- 文本模型选择（Llama 3.1 8B Fast / Llama 3.3 70B）
- 每日分析上限（默认 200 张，保护 Neurons 额度）

> 注意：使用前需在 Workers AI 同意 Meta Llama 视觉模型协议
> （`POST /ai/run/@cf/meta/llama-3.2-11b-vision-instruct`，body `{"prompt":"agree"}`）。

## 上传格式策略

- JPEG、PNG、BMP 等静态图片：前端转 WebP 再上传（浏览器 Canvas / wasm）
- GIF：前端转动态 WebP 再上传
- SVG：保留原格式上传，Worker 端安全校验

默认大小限制：

- 静态图源文件：10MB
- GIF 源文件：20MB
- 最终上传 WebP：20MB
- SVG：1MB

SVG 安全约束：拒绝 script、foreignObject、内联事件属性、javascript: 等高风险内容；返回时附加严格响应头（CSP sandbox）。

## 数据库设计

初始化 SQL 在 `db/0000_init.sql`，迁移按序在 `db/000N_*.sql`。

### images 表
| 字段 | 说明 |
|---|---|
| id | 主键（UUID 去横线） |
| title | 标题 |
| object_key | R2 对象键（唯一） |
| public_url | 公开访问 URL |
| mime_type / size_bytes / sha256 | 类型 / 大小 / 内容哈希（唯一，防重复） |
| description / tags / ocr_text | AI 分析结果 |
| ai_status | pending / processing / done / failed / disabled / quota_exceeded |
| ai_processed_at | AI 分析时间 |
| deleted_at | 软删除标记 |

### configuration 表
上传限制、WebP 策略、Cloudflare token、AI 配置（ai_enabled / ai_model / ai_text_model / ai_max_daily）。

## 主要路由

| 路由 | 说明 |
|---|---|
| GET / | 上传页（需登录） |
| GET /manage | 管理页（需登录） |
| GET /protected | 密码页（公开） |
| POST /protected | 密码验证（公开） |
| POST /logout | 退出登录（公开） |
| POST /api/upload | 上传图片（需上传鉴权） |
| GET /api/token | 查看 Token 状态（需登录） |
| POST /api/token/rotate | 轮换 Token（需登录） |
| GET/PUT /api/password | 访问密码管理（需登录） |
| GET/PUT /api/settings | 读取/更新设置（需登录） |
| GET /api/stats | 管理页统计（需登录） |
| GET /api/images | 图片列表（公开，page / page_size） |
| GET /api/images/:id | 单图元数据（公开） |
| PUT/DELETE /api/images/:id | 更新标题 / 删除（需登录） |
| GET/PUT/POST /api/images/:id/ai | AI 元数据读取 / 编辑 / 重新分析（需登录） |
| GET /i/:id | 图片查看页（公开，含 AI 信息） |
| GET /files/:object_key | 文件代理访问（公开） |

上传鉴权方式：

- 浏览器登录态 Cookie（HMAC 签名，`poto_auth=<expiry>.<sig>`）
- API Token（`Authorization: Bearer <token>` 或 `X-API-Token: <token>`）

## 配置说明

### wrangler.toml 关键项
- `r2_buckets.bucket_name`
- `d1_databases.database_name` / `database_id`
- `[ai] binding = "AI"`（Workers AI binding）
- `vars.WORKER_BASE_URL` / `vars.PUBLIC_BASE_URL`

### 环境变量
```bash
ACCESS_PASSWORD=replace_with_strong_password
CLOUDFLARE_API_TOKEN=replace_with_cloudflare_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
```

说明：管理页统计依赖 CLOUDFLARE_API_TOKEN；若在设置页填写 cloudflare_api_token 会优先于环境变量。

### 自定义域名路由（WORKER_ROUTES）
```bash
WORKER_ROUTES='["poto.example-a.com/*","poto.example-b.com/*"]'
```

## 本地开发

```bash
npm install
npm run dev        # 本地固定 http://localhost:8788
npm test           # 单元测试（node --test）
```

## 初始化与部署

```bash
npm run init            # 初始化资源
npm run d1:migrate      # 执行 D1 迁移
npm run deploy          # wrangler deploy
```

## GitHub Actions 自动发布

工作流：`.github/workflows/deploy-worker.yml`

触发条件：

- push 到 main / master（自动部署）
- push tag（例如 v0.4.0）

仓库 Secrets：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

仓库 Variables：

- `WORKER_ROUTES`（可选，JSON 数组）

### Pre-commit 钩子
`.git/hooks/pre-commit` 在提交前自动检查：

- TypeScript 类型（过滤已知 lib target 噪音）
- 改动文件 ES6 语法（node --check）
- 构建产物语法（管理页脚本拼接完整性）

## 安全建议

- 不要把 CLOUDFLARE_API_TOKEN 提交到仓库
- .env 与 .dev.vars 应保持在 .gitignore 中
- 登录 Cookie 为 HMAC 签名（防伪造），ACCESS_PASSWORD 请设置强密码
- 管理 API 均需登录态；上传 API 用 Token 或登录态
- AI 调用有每日限额保护，防止 Neurons 超额

## Changelog

### v0.4.0
- AI 图片分析：视觉模型描述 + OCR，文本模型标签
- 管理页 AI 面板（展示/编辑/重新分析）
- 详情页显示 AI 元数据
- 设置页 AI 配置（开关 / 模型下拉 / 每日限额）
- HMAC 签名 Cookie 安全修复
- push main 自动部署 + pre-commit 语法检查

### v0.3.x
- 基础图床功能（上传 / 管理 / Token / 设置 / 统计）
