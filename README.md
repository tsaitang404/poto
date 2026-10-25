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

## 动态缩略图（可选）

原图 `/files/<R2 object key>` 的字节、MIME 和一年 `immutable` 缓存行为保持不变。
新增 `?w=160`、`?w=320`、`?w=640`，固定输出 WebP，质量 80，等比缩小、不放大。
GIF/动画 WebP 的缩略图固定为静态图；原图仍保留动画。SVG 不转换，保留原始安全响应头。
只有单个 `w` 参数有效；重复、未知、非白名单参数统一返回 400，且不缓存。
URL 编码后的等价值（如 `?%77=%31%36%30`）规范化为同一变体。
仅从绑定的 R2 读取，不支持外部 URL、任意质量/高度/格式。源文件上限 10 MiB。

### 配置与部署条件

确认账号 Images 状态和额度后，在实际部署使用的 `wrangler.toml` 添加：

```toml
[images]
binding = "IMAGES"
```

示例配置已启用该 binding，使用 Images Free，不会自动升级付费。
如不使用缩略图，可注释 `[images]` 段。GitHub Actions 每次从 `wrangler.toml.example` 生成配置，模板中须保留该段。
`ensure-worker-domain.mjs` 只插入/更新变量，`ensure-d1.mjs` 只更新数据库 ID；
`deploy.mjs` 的路由写入也会保留 `[images]`。新增测试覆盖变量重写保留 binding。
已通过锁定的 Wrangler 4.73.0 dry-run，能识别该配置；无须升级依赖。
本地依赖安装若 sharp 被系统 libvips 干扰，可运行 `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci`。

依据 [Images binding 官方文档](https://developers.cloudflare.com/images/optimization/binding/)，直接输入 R2 字节流，
转换结果不会自动缓存。本实现显式使用 Workers Cache API，无须启用额外的自动缓存功能。
[官方定价](https://developers.cloudflare.com/images/pricing/)（2026-10-25 核对）说明 Free 每月包含 5,000 个独立转换，
超额的新转换可能返回 9422；本项目会回退原图，不自动购买额度。
账号是否已启用 Images、所属套餐和剩余额度需要部署前在 Cloudflare 确认。

### 缓存与故障行为

- 变体缓存键包含请求 origin、解码后的完整 R2 key、R2 version/etag、宽度和转换策略版本。
  编码等价的路径/参数不创建额外变体；不同图、宽度和对象版本互不混用。
- 每次缩略图请求先 R2 HEAD，再查当前节点 Cache API。命中跳过 GET 和 Images 转换。
  缓存保留 30 天；Cache API 是各数据中心本地缓存，可能提前驱逐，并发冷请求也可能重复转换。
- 缩略图发给浏览器的策略为 `public, max-age=0, must-revalidate`，每次校验源对象。
  删除后后续请求返回 404；替换产生新 version，不命中旧变体。
  HEAD/GET 之间替换时回退原图，不写旧版本缓存。旧版本条目留待过期。
  已发送的响应不追溯撤回；原始 URL 原有的一年 immutable 行为仍存在，替换原图建议换 key。
  不要另外配置忽略 query 的 CDN Cache Everything 规则绕过 Worker 校验。
- 缺 binding、非支持格式、源文件过大、额度耗尽、转换/输出流失败都会重新读取原图并返回，
  MIME 与原图一致，带 `no-store`，不污染成功变体缓存。缓存读取/写入失败不妨碍图片返回。
- `X-Poto-Thumbnail: generated` / `hit` 表示转换成功 / 缓存命中；
  `fallback-binding-missing`、`fallback-transform-failed`、`fallback-unsupported-type`、
  `fallback-source-too-large`、`fallback-source-changed`、`fallback-empty-source` 表示回退原因。
  不将服务错误详情或密钥放入响应。404 保持原来的 JSON 响应。

### 博客接入示例（接口部署验收后再修改主题）

完整 URL：

```text
https://poto.tsaitang.workers.dev/files/images/2026-08-03/e0ada2bdaa6644b5b830419b48a22131.png?w=160
https://poto.tsaitang.workers.dev/files/images/2026-08-03/e0ada2bdaa6644b5b830419b48a22131.png?w=320
```

约 150px 宽卡片的 HTML（生产模板按原有规则转义属性）：

```html
<img
  src="https://poto.tsaitang.workers.dev/files/images/2026-08-03/e0ada2bdaa6644b5b830419b48a22131.png?w=160"
  srcset="https://poto.tsaitang.workers.dev/files/images/2026-08-03/e0ada2bdaa6644b5b830419b48a22131.png?w=160 160w, https://poto.tsaitang.workers.dev/files/images/2026-08-03/e0ada2bdaa6644b5b830419b48a22131.png?w=320 320w"
  sizes="150px"
  decoding="async"
  loading="eager"
  alt="文章封面"
>
```

首屏封面用 `eager`（或省略 loading），折叠以下用 `lazy`。
如 CSS 卡片宽度改变，`sizes` 必须同步实际布局；需要更高密度时可加 640w。
模板应使用 URL API 的 `searchParams.set('w', '160')` 等构造各尺寸 URL，
只对本服务 `/files/` 的受信任图片使用此接口；不要对带其他查询参数或第三方图片直接拼接参数。
本次不修改 Trilium 线上主题。

### 验证

```sh
npm test
npm run typecheck
node scripts/verify-thumbnails.mjs https://poto.tsaitang.workers.dev
```

最后一条必须在启用本版本和 binding 的服务上运行，会下载两张博客原图及三个实际 WebP 变体到
`/tmp/poto-thumbnail-verification`，输出字节数和缩减比例，并拒绝将回退原图算作成功。
随后以 150px 和高密度显示查看原图/变体清晰度，并重复请求观察 `hit`；跨节点不保证命中。
当前自动测试使用 Images/Cache mocks，证明路由、转换参数、缓存和回退行为；
Wrangler dry-run 只证明打包及 binding 配置兼容。
2026-10-25 已获授权部署至 `https://poto.tsaitang.workers.dev`，版本
`1b40e558-ebe2-48a3-bc9a-1f980ab23313`，Images binding 实测可用，未购买付费套餐。
两张样例实际 Cloudflare 输出如下（由上述脚本下载，并用 sharp 读取尺寸；没有本地重编码）：

- 样例 0：原图 322,889 字节、1024×512；160px 为 2,998 字节（减少 99.1%），
  320px 为 9,086 字节（减少 97.2%），640px 为 29,022 字节（减少 91.0%）。
- 样例 1：原图 31,433 字节、512×512；160px 为 3,542 字节（减少 88.7%），
  320px 为 8,084 字节（减少 74.3%），640 变体为 12,924 字节且仍是 512×512，确认不放大。
- 重复请求观察到 `X-Poto-Thumbnail: hit`。人工查看实际 160px 文件，主体和颜色保留，适合约 150px 的卡片；
  高密度屏应通过 srcset 使用 320px。主题接入尚未执行。

线上临时 R2 测试对象验证通过：缓存命中、替换后重新生成、SVG 安全回退、非法参数 400、删除后 404；临时对象已清理。
部署后核对现有绑定和变量，除新增 IMAGES 外保持一致，密码 secret 保留。
