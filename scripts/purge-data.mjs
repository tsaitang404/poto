/**
 * ⚠️  危险操作脚本 —— 请仔细阅读后再执行
 *
 * 本脚本会永久删除：
 *   1. R2 存储桶中的 **所有** 对象（图片文件）
 *   2. D1 数据库 images 表中的 **所有** 行记录
 *
 * 此操作不可撤销。如果你不清楚这个脚本的用途，请立即停止。
 *
 * 适用场景：清理调试 / 测试阶段产生的脏数据。
 *
 * 用法：
 *   node scripts/purge-data.mjs            # 交互式确认后执行
 *   node scripts/purge-data.mjs --confirm  # 跳过确认（CI / 管道中使用）
 *
 * 依赖环境变量（通过 .env 加载或直接 export）：
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN
 */

import { createInterface } from "node:readline";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "./load-env.mjs";

// ── 读取配置 ────────────────────────────────────────────────────────────────

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;

if (!accountId) throw new Error("缺少环境变量 CLOUDFLARE_ACCOUNT_ID");
if (!apiToken) throw new Error("缺少环境变量 CLOUDFLARE_API_TOKEN");

const configPath = resolve(process.cwd(), "wrangler.toml");
const raw = readFileSync(configPath, "utf8");

const bucketName = readToml(raw, /^\s*bucket_name\s*=\s*"([^"]+)"\s*$/m);
const dbName = readToml(raw, /^\s*database_name\s*=\s*"([^"]+)"\s*$/m);

if (!bucketName) throw new Error("wrangler.toml 中找不到 bucket_name");
if (!dbName) throw new Error("wrangler.toml 中找不到 database_name");

// ── 确认提示 ─────────────────────────────────────────────────────────────────

const skipConfirm = process.argv.includes("--confirm");

console.log("\n⚠️  ⚠️  ⚠️  危险操作警告  ⚠️  ⚠️  ⚠️");
console.log("─────────────────────────────────────────");
console.log(`  R2 存储桶：${bucketName}  → 清空所有对象`);
console.log(`  D1 数据库：${dbName}      → 清空 images 表`);
console.log("─────────────────────────────────────────");
console.log("此操作 不可撤销，生产数据将永久丢失。\n");

if (!skipConfirm) {
  const answer = await prompt('确认执行？请输入 "yes" 继续，其他任意键退出：');
  if (answer.trim() !== "yes") {
    console.log("已取消。");
    process.exit(0);
  }
}

// ── 清空 R2 ──────────────────────────────────────────────────────────────────

console.log("\n[r2] 开始列举对象...");
let totalDeleted = 0;
let cursor = null;

do {
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`
  );
  url.searchParams.set("per_page", "1000");
  if (cursor) url.searchParams.set("cursor", cursor);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[r2] 列举对象失败 HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const objects = data?.result?.objects ?? [];
  cursor = data?.result?.cursor ?? null;

  if (objects.length === 0) break;

  console.log(`[r2] 本批 ${objects.length} 个对象，批量删除中...`);

  // Cloudflare R2 支持批量删除（最多 1000 个 key 一次）
  const deleteRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/bulk-delete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ objects: objects.map((o) => ({ key: o.key })) }),
    }
  );

  if (!deleteRes.ok) {
    const text = await deleteRes.text();
    throw new Error(`[r2] 批量删除失败 HTTP ${deleteRes.status}: ${text}`);
  }

  totalDeleted += objects.length;
  console.log(`[r2] 已删除 ${totalDeleted} 个对象`);
} while (cursor);

console.log(`[r2] ✅ 完成，共删除 ${totalDeleted} 个对象`);

// ── 清空 D1 ──────────────────────────────────────────────────────────────────

console.log("\n[d1] 清空 images 表...");
try {
  execSync(
    `npx wrangler d1 execute ${shellEscape(dbName)} --remote --command="DELETE FROM images"`,
    { stdio: "inherit" }
  );
  console.log("[d1] ✅ images 表已清空");
} catch (err) {
  throw new Error(`[d1] 清空失败: ${err.message}`);
}

console.log("\n✅ 全部清理完成。\n");

// ── 工具函数 ──────────────────────────────────────────────────────────────────

function readToml(content, regex) {
  const m = content.match(regex);
  return m ? m[1] : null;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + " ", (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
