# Poto Worker

基于 Cloudflare Worker + R2 + D1 的图床实现。

## 架构

- Worker 负责上传接口、密码验证、页面渲染。
- R2 负责图片对象存储。
- D1 存储图片元数据（标题、哈希、大小、URL、软删除时间）。

## 上传格式策略（核心逻辑）

当前上传链路采用“尽量统一成 WebP，SVG 单独保留”的策略：

- JPEG、PNG、BMP 等静态图片会在浏览器端先转为 WebP，再提交到 `/api/upload`。
- GIF 会在浏览器端转为动态 WebP，再提交到 `/api/upload`，这样最终存储层不再保留 GIF。
- SVG 保留原格式上传，但会在 Worker 端做安全检查，并固定走 Worker `/files/*` 返回路径，避免直接暴露在不受控的静态域名上。
- Worker 端会再次校验 MIME 与大小，避免绕过前端提交不符合规则的文件。

这样设计的原因：

- 静态图统一 WebP：显著降低平均体积，存储和带宽更稳定。
- GIF 也转动态 WebP：在多数场景下体积更小、缓存更统一、后续治理更简单。
- SVG 单独保留：矢量图强制转位图会丢失可伸缩性，但 SVG 天然带脚本风险，所以必须额外限制。

实现说明：

- GIF 转动态 WebP 不是在 Worker 运行时完成，而是在上传页里通过浏览器加载 wasm 版 `gif2webp` 完成。
- 这样做的原因是当前 Cloudflare Worker 运行时不适合直接运行这个浏览器向 wasm 包，但浏览器端转码后再上传，仍然能保证 R2 中只落最终格式。

当前默认大小限制：

- 静态图源文件：10MB
- GIF 源文件：20MB
- 最终上传的 WebP：20MB
- SVG：1MB

这些阈值是比较保守、也更接近行业常见默认值的配置：

- 普通图床或后台系统，静态图常见限制一般在 5MB 到 10MB。
- 动图文件常见限制一般在 10MB 到 20MB。
- SVG 由于安全和滥用风险更高，通常会压到 0.5MB 到 2MB。

本项目选用 10MB / 20MB / 20MB / 1MB，目的是先保证可用性、成本和风险的平衡；如果后续业务明确偏向动图站或设计素材站，再放大限制更合适。

SVG 安全约束：

- 拒绝包含 `script`、`foreignObject`、内联事件属性、`javascript:` 等高风险内容的 SVG。
- 返回 SVG 时会追加更严格的响应头，降低脚本执行风险。

## 表结构设计（D1）

SQL 文件在 `db/0000_init.sql`。

### images

```sql
CREATE TABLE IF NOT EXISTS images (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL DEFAULT '',
	object_key TEXT NOT NULL UNIQUE,
	public_url TEXT NOT NULL,
	mime_type TEXT NOT NULL,
	size_bytes INTEGER NOT NULL,
	sha256 TEXT NOT NULL UNIQUE,
	r2_etag TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_images_deleted_at ON images(deleted_at);
```

设计说明：

- `sha256` 唯一：避免重复上传同一图片。
- `deleted_at`：软删除，保留审计与恢复空间。
- `object_key` 唯一：保障 R2 对象映射稳定。
- `created_at` 索引：提高列表查询性能。

## 目录

- `src/index.ts`: Worker 入口与路由逻辑
- `db/0000_init.sql`: D1 初始化 SQL
- `wrangler.toml`: Cloudflare 绑定配置
- `.dev.vars.example`: 本地开发环境变量模板

## 路由

- `GET /` 上传页（需要验证）
- `GET /manage` 管理页（需要验证）
- `GET /protected` 密码页
- `POST /protected` 密码验证
- `POST /logout` 退出登录
- `POST /api/upload` 上传图片
- `GET /api/token` 查看上传 API Token 状态（需管理登录）
- `POST /api/token/rotate` 生成/轮换上传 API Token（需管理登录）
- `GET /api/settings` 读取上传与统计相关设置（需管理登录）
- `PUT /api/settings` 更新上传与统计相关设置（需管理登录）
- `GET /api/stats` 管理页统计数据（需管理登录）
- `GET /api/images` 图片记录列表（支持分页参数 `page` / `page_size`）
- `GET /api/images/:id` 查询单图元数据
- `DELETE /api/images/:id` 删除图片（软删除 + R2 删除）
- `GET /i/:id` 图片查看页
- `GET /files/:object_key` 文件代理访问（Worker 转发 R2）

上传接口约束：

- `POST /api/upload` 仅接受 `image/webp`、`image/svg+xml`。
- 鉴权支持两种方式：
	- 浏览器登录态 Cookie（`poto_auth=1`）
	- API Token（`Authorization: Bearer <token>` 或 `X-API-Token: <token>`）
- 使用系统自带上传页时，静态图会自动转 WebP，GIF 会自动转动态 WebP，SVG 原样提交。
- 直连接口时同样要满足大小限制：WebP 20MB、SVG 1MB。

## 环境变量

复制 `.dev.vars.example` 为 `.dev.vars` 并填写：

```bash
ACCESS_PASSWORD=replace_with_strong_password
CLOUDFLARE_API_TOKEN=replace_with_cloudflare_api_token
```

`wrangler.toml` 里需要确认：

- `WORKER_BASE_URL`：可选。Worker 对外访问域名（例如 `https://poto.example.com`）
- `PUBLIC_BASE_URL`：可选。R2 文件访问域名（r2.dev 或自定义域）
- `d1_databases.database_id`
- `r2_buckets.bucket_name`（默认 `poto`，可改）
- `d1_databases.database_name`（默认 `poto`，可改）
- `CLOUDFLARE_API_TOKEN`：用于管理页统计读取 Cloudflare 平台指标

如果你希望已部署的管理页统计直接读取 Cloudflare 平台指标，还需要把它注入为 Worker secret：

```bash
wrangler secret put CLOUDFLARE_API_TOKEN
```

域名默认策略：

- 不配置 `WORKER_BASE_URL` 时，运行时使用当前请求域名。
- 部署时 `npm run vars:ensure` 会尝试通过 Cloudflare API 查询 workers.dev 子域，并自动回填 `WORKER_BASE_URL = https://<worker-name>.<subdomain>.workers.dev`。
- 不配置 `PUBLIC_BASE_URL` 时，图片 URL 自动回退为 `${WORKER_BASE_URL}/files/<object_key>`（由 Worker 代理 R2 文件）。

说明：`database_name` 和 `database_id` 不是重复配置。

- `database_name`：逻辑名称（你可自定义）
- `database_id`：Cloudflare D1 的唯一标识（UUID）

统计页说明：

- R2 总使用量、R2 本月下载量直接来自 Cloudflare R2 GraphQL Analytics。
- D1 总使用量直接来自 Cloudflare D1 REST `file_size`。
- D1 本月查询量直接来自 Cloudflare D1 GraphQL Analytics。
- 文件最大 Top 10、各类型文件数量来自业务表聚合，因为这些属于应用元数据统计。
- 如果 `CLOUDFLARE_API_TOKEN` 或相关 Cloudflare 绑定缺失，`/api/stats` 会直接报错，不会回退到本地估算。
- 设置组件中可单独保存 `CLOUDFLARE_API_TOKEN`；当该值非空时，它的优先级高于 Worker 默认环境变量中的 `CLOUDFLARE_API_TOKEN`。

Token 安全建议：

- 不要把 `CLOUDFLARE_API_TOKEN` 写进源码或提交到 Git。
- `.env` 和 `.dev.vars` 已在 `.gitignore` 中忽略。
- 线上环境建议使用 `wrangler secret put CLOUDFLARE_API_TOKEN` 注入。
- 如果在管理页设置里填写了覆盖 Token，会写入 D1 `configuration.cloudflare_api_token`；未填写时回退使用 Worker 环境变量。

本项目提供自动化：

- `npm run perm:check` 会检查 Cloudflare API 权限（D1 / R2 / Workers 子域）
- `npm run d1:ensure` 会按 `database_name` 查询 D1
- `npm run r2:ensure` 会按 `bucket_name` 查询 R2，不存在自动创建
- `npm run vars:ensure` 会自动配置域名（缺少 `WORKER_BASE_URL` 时自动查询 workers.dev 并写入；缺少 `PUBLIC_BASE_URL` 时自动写入 `${WORKER_BASE_URL}/files`）
- `npm run init` 会根据环境自动选择初始化模式
- `npm run init:local` 会强制本地初始化（无 Cloudflare 凭据也可执行）

等幂性说明：

- `init` 可以重复执行，不会重复创建已存在的 D1/R2 资源。
- `vars:ensure` 仅在变量缺失时写入；已配置值会保留。
- `d1:migrate` 使用 `CREATE TABLE IF NOT EXISTS`，可重复执行。


## 本地开发

```bash
npm install
npm run dev
```

说明：

- `npm run dev` 会先自动执行 `npm run init:local`，确保本地 D1 表结构已初始化，再启动 `wrangler dev`。
- `npm run dev` / `npm run dev:raw` 会在启动前把 `.env` 里的 `CLOUDFLARE_API_TOKEN` 同步到 `.dev.vars`，这样本地 Worker 也能读取统计平台接口。
- `npm run dev` / `npm run dev:raw` 会固定监听 `http://localhost:8788`。
- `npm run dev` 会显式覆盖本地运行的 URL 变量为 localhost：`WORKER_BASE_URL=http://localhost:8788`、`PUBLIC_BASE_URL=http://localhost:8788/files`，避免联调时误用线上域名。
- 如果你只想直接启动 Worker（跳过自动初始化），可以使用 `npm run dev:raw`。

本地测试建议：

- 没有 Cloudflare 凭据时，`npm run init` 会自动回退到本地模式。
- 也可以显式执行 `npm run init:local`。
- 本地模式只会初始化本地 D1（`wrangler d1 ... --local`），不会触发云端资源创建。

云端初始化建议：

- 设置 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`。
- 执行 `npm run init`，会依次完成权限检查、D1/R2 注册、域名变量自动写入、远程 D1 初始化。

## 初始化 D1

```bash
wrangler d1 execute poto --file=./db/0000_init.sql --remote
```

如果你修改了 D1 库名，把命令中的 `poto` 替换成新库名即可。

或者使用 package script：

```bash
npm run d1:ensure
npm run r2:ensure
npm run d1:migrate
npm run d1:migrate:local
```

## 部署

```bash
npm run deploy
```

## GitHub Actions 自动发布

工作流文件：`.github/workflows/deploy-worker.yml`

触发条件：

- push 到 `main` 或 `master`
- 手动触发 `workflow_dispatch`

需要在 GitHub 仓库 Secrets 中配置：

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
