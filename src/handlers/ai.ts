// 用途：poto AI 元数据处理（描述/标签/OCR）
// 创建时间：2026-08-03  opencode
import { analyzeImage, generateTagsFromDescription } from "../lib/ai";
import { json } from "../lib/http";
import type { Env, ImageRow } from "../types";

export async function handleGetAiMeta(env: Env, id: string): Promise<Response> {
  if (!id) {
    return json({ error: "invalid_id" }, 400);
  }
  const row = await env.DB.prepare(
    `SELECT id, description, tags, ocr_text, ai_status, ai_processed_at FROM images WHERE id = ?`
  )
    .bind(id)
    .first<{
      id: string;
      description: string;
      tags: string;
      ocr_text: string;
      ai_status: string;
      ai_processed_at: string | null;
    }>();

  if (!row) {
    return json({ error: "not_found" }, 404);
  }

  return json({
    id: row.id,
    description: row.description,
    tags: row.tags,
    ocr_text: row.ocr_text,
    ai_status: row.ai_status,
    ai_processed_at: row.ai_processed_at,
  });
}

export async function handleUpdateAiMeta(env: Env, id: string, body: unknown): Promise<Response> {
  if (!id) {
    return json({ error: "invalid_id" }, 400);
  }
  const b = (body ?? {}) as { description?: string; tags?: string };

  const existing = await env.DB.prepare(`SELECT id FROM images WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!existing) {
    return json({ error: "not_found" }, 404);
  }

  const description = String(b.description ?? "").slice(0, 500);
  const tags = String(b.tags ?? "").slice(0, 200);

  await env.DB.prepare(
    `UPDATE images SET description = ?, tags = ?, ai_status = 'done', ai_processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
  )
    .bind(description, tags, id)
    .run();

  return json({ ok: true, id, description, tags });
}

/**
 * 触发 AI 分析（异步）。上传后调用，不阻塞上传响应。
 * 使用 event.waitUntil 让 Worker 在响应后继续执行。
 */
export async function scheduleAiAnalysis(
  ctx: { waitUntil(p: Promise<unknown>): void },
  env: Env,
  id: string
): Promise<void> {
  ctx.waitUntil(runAiAnalysis(env, id));
}

export async function runAiAnalysis(env: Env, id: string): Promise<void> {
  try {
    // 标记处理中
    await env.DB.prepare(
      `UPDATE images SET ai_status = 'processing', ai_processed_at = NULL WHERE id = ?`
    )
      .bind(id)
      .run();

    // 读取图片字节
    const row = await env.DB.prepare(
      `SELECT object_key, mime_type FROM images WHERE id = ?`
    )
      .bind(id)
      .first<{ object_key: string; mime_type: string }>();

    if (!row) {
      return;
    }

    const obj = await env.R2_BUCKET.get(row.object_key);
    if (!obj) {
      await env.DB.prepare(`UPDATE images SET ai_status = 'failed' WHERE id = ?`).bind(id).run();
      return;
    }

    const bytes = new Uint8Array(await obj.arrayBuffer());

    // 获取配置的模型
    const settings = await getAiSettings(env);

    const result = await analyzeImage(env, bytes, row.mime_type, settings.ai_model);

    // 用文本 LLM 从描述生成标签（更可靠的关键词提取）
    let tags = "";
    try {
      tags = await generateTagsFromDescription(env, result.description);
    } catch (tagErr) {
      console.error(`[ai] ${id} tag generation failed: ${tagErr}`);
      tags = "";
    }

    await env.DB.prepare(
      `UPDATE images SET description = ?, tags = ?, ocr_text = ?, ai_status = 'done', ai_processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
    )
      .bind(result.description, tags || result.tags, result.ocrText, id)
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 失败原因存到 description 字段（方便排查），同时标记 failed
    await env.DB.prepare(
      `UPDATE images SET ai_status = 'failed', description = ?, ai_processed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`
    )
      .bind(`AI错误: ${msg.slice(0, 200)}`, id)
      .run();
    console.error(`[ai] ${id} failed: ${msg}`);
  }
}

async function getAiSettings(env: Env): Promise<{ ai_model: string; ai_enabled: number }> {
  const row = await env.DB.prepare(
    `SELECT ai_model, ai_enabled FROM configuration WHERE id = 1`
  ).first<{ ai_model: string; ai_enabled: number }>();
  return {
    ai_model: row?.ai_model || "@cf/meta/llama-3.2-11b-vision-instruct",
    ai_enabled: row?.ai_enabled ?? 1,
  };
}

// 重新分析接口（覆盖已有结果）
export async function handleReanalyze(env: Env, id: string, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
  const row = await env.DB.prepare(`SELECT id FROM images WHERE id = ?`).bind(id).first<{ id: string }>();
  if (!row) {
    return json({ error: "not_found" }, 404);
  }
  if (ctx) {
    scheduleAiAnalysis(ctx, env, id);
  }
  return json({ ok: true, id, message: "AI 重新分析已触发" });
}

export type { ImageRow };
