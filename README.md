# Poto Worker

基于 Cloudflare Worker + R2 + D1 的图床实现。

## 架构

- Worker：上传接口、鉴权、页面渲染、文件代理
- R2：图片对象存储
- D1：图片元数据与系统配置

## 上传格式策略

当前采用尽量统一为 WebP、SVG 单独保留的策略：

- JPEG、PNG、BMP 等静态图片：前端先转 WebP 再上传
- GIF：前端转动态 WebP 再上传
- SVG：保留原格式上传，但在 Worker 端做安全校验

设计目标：

- 降低平均体积，稳定存储与带宽成本
- 统一产物格式，便于后续治理
- 保留 SVG 的可缩放特性，同时控制脚本风险

默认大小限制：

- 静态图源文件：10MB
- GIF 源文件：20MB
- 最终上传 WebP：20MB
- SVG：1MB

SVG 安全约束：

- 拒绝 script、foreignObject、内联事件属性、javascript: 等高风险内容
- 返回 SVG 时增加更严格的响应头

## 数据库设计

初始化 SQL 在 db/0000_init.sql。

images 表核心字段：

- sha256 唯一：防重复上传
- object_key 唯一：稳定映射 R2 对象
- deleted_at：软删除
- created_at 索引：提升列表查询性能

## 主要路由

- GET / 上传页（需登录）
- GET /manage 管理页（需登录）
- GET /protected 密码页（公开）
- POST /protected 密码验证（公开）
- POST /logout 退出登录（公开）
- POST /api/upload 上传图片（需上传鉴权）
- GET /api/token 查看上传 Token 状态（需登录）
- POST /api/token/rotate 轮换上传 Token（需登录）
- GET /api/settings 读取设置（需登录）
- PUT /api/settings 更新设置（需登录）
- GET /api/stats 管理页统计（需登录）
- GET /api/images 图片列表（公开，支持 page、page_size）
- GET /api/images/:id 单图元数据（公开）
- PUT /api/images/:id 更新标题（需登录）
- DELETE /api/images/:id 删除图片（需登录）
- GET /i/:id 图片查看页（公开）
- GET /files/:object_key 文件代理访问（公开）

上传接口约束：

- POST /api/upload 仅接受 image/webp、image/svg+xml
- 鉴权方式：
  - 浏览器登录态 Cookie（poto_auth=1）
  - API Token（Authorization: Bearer <token> 或 X-API-Token: <token>）

## 配置说明

### wrangler.toml 关键项

- workers_dev = true（保留 workers.dev 访问）
- r2_buckets.bucket_name
- d1_databases.database_name
- d1_databases.database_id
- vars.WORKER_BASE_URL
- vars.PUBLIC_BASE_URL

### 环境变量

本地开发读取 .dev.vars。
部署脚本会加载 .env。

建议最少配置：

```bash
ACCESS_PASSWORD=replace_with_strong_password
CLOUDFLARE_API_TOKEN=replace_with_cloudflare_api_token
```

部署环境还需要：

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN

说明：

- 管理页统计依赖 CLOUDFLARE_API_TOKEN
- 若在设置页填写 cloudflare_api_token，会优先于环境变量

### 自定义域名路由（WORKER_ROUTES）

项目不在 wrangler.toml 写死 routes，部署时通过环境变量 WORKER_ROUTES 注入。
WORKER_ROUTES 必须是 JSON 数组，数组项建议使用完整 pattern（包含 `/*`）。

```bash
WORKER_ROUTES='["poto.example-a.com/*","poto.example-b.com/*"]'
```

workers.dev 与 WORKER_ROUTES 可并存：

- workers_dev = true 时，workers.dev 仍可访问
- WORKER_ROUTES 仅用于附加自定义域名路由

## 本地开发

```bash
npm install
npm run dev
```

说明：

- npm run dev 会先执行 npm run init:local，再启动 wrangler dev
- npm run dev / npm run dev:raw 启动前会同步 .env 的 CLOUDFLARE_API_TOKEN 到 .dev.vars
- 本地固定监听 http://localhost:8788
- npm run dev 会覆盖本地 URL 变量为 localhost，避免联调误用线上域名

## 初始化与部署

初始化脚本：

- npm run init
- npm run init:local

资源检查与准备：

- npm run perm:check
- npm run d1:ensure
- npm run r2:ensure
- npm run vars:ensure
- npm run d1:migrate

部署：

```bash
npm run deploy
```

带自定义 routes 的命令行部署示例：

```bash
WORKER_ROUTES='["poto.example-a.com/*","poto.example-b.com/*"]' npm run deploy
```

## GitHub Actions 自动发布

工作流文件：.github/workflows/deploy-worker.yml

触发条件：

- 仅 tag push 触发（例如 v0.3.1）

仓库 Secrets：

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN

仓库 Variables：

- WORKER_ROUTES（可选，JSON 数组）

示例值：

["poto.example-a.com/*","poto.example-b.com/*"]

## 安全建议

- 不要把 CLOUDFLARE_API_TOKEN 提交到仓库
- .env 与 .dev.vars 应保持在 .gitignore 中
- 线上建议使用 wrangler secret put CLOUDFLARE_API_TOKEN
- Token 使用最小权限并定期轮换
