// 用途：poto 图床 Workers AI 调用封装（描述/OCR/标签）
// 创建时间：2026-08-03  opencode
// 使用 Workers AI binding（env.AI），无需 API token

import type { Env } from "../types";

export const AI_MODELS = {
  vision: "@cf/meta/llama-3.2-11b-vision-instruct",
  visionLight: "@cf/moondream/moondream3.1-9B-A2B",
  text: "@cf/meta/llama-3.1-8b-fast-v2",
} as const;

export type AiResult = {
  description: string;
  tags: string;
  ocrText: string;
};

function parseJsonText(text: string): string {
  return String(text || "").trim();
}

/**
 * 规范化标签：只保留 1-6 字的短关键词，过滤描述性句子
 */
function normalizeTags(raw: unknown): string {
  const text = String(raw || "").trim();
  if (!text) {
    return "";
  }
  const parts = text
    .split(/[,，、;；\s]+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t) return false;
      // 过滤长句（超过 8 字或含描述性词汇）
      if (t.length > 8) return false;
      // 过滤含标点的句子
      if (/[。！？!?：:；;]/.test(t)) return false;
      // 过滤描述性句子特征（数词+量词、判断词、方位/背景词）
      if (/\d+[张个只条棵朵].{0,4}/.test(t)) return false;      // "一张白色圆形的"
      if (/^(一张|一个|一只|一条|这幅|这张|图中|图片|画面|背景|前景|颜色|色彩|整体|画面中)/.test(t)) return false;
      if (/是|有|在|着|了|的.{2}/.test(t) && t.length >= 5) return false;  // "背景是渐变色"
      return true;
    })
    .slice(0, 8);
  // 去重
  const seen = new Set<string>();
  const uniq = parts.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (uniq.length) {
    return uniq.join(",");
  }
  // 保底：如果全被过滤（空），提取描述中的名词性短词
  const words = text.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  const wordUniq = Array.from(new Set(words)).slice(0, 5);
  return wordUniq.join(",");
}

/**
 * 调用 Workers AI 视觉模型，一次请求完成描述+标签+OCR
 * 使用单个 prompt 让模型输出结构化 JSON
 */
export async function analyzeImage(
  env: Env,
  imageBytes: Uint8Array,
  mimeType: string,
  modelName?: string
): Promise<AiResult> {
  const model = modelName || AI_MODELS.vision;

  const prompt = `你是图片分析助手。请分析这张图片，只输出一个 JSON 对象，不要任何其他文字、不要 markdown 代码块、不要前后缀。

必须严格使用这个格式（键名固定）：
{"description":"一句话中文描述，不超过50字","ocr":"图片中所有文字逐行提取，无文字则为空字符串"}

示例输出：
{"description":"一只橘猫在窗台上晒太阳","ocr":""}

现在分析这张图片：`;

  const base64 = btoa(String.fromCharCode(...imageBytes));

  const messages = [
    { role: "system", content: "你是图片分析助手，严格输出 JSON。" },
    { role: "user", content: prompt },
  ];

  let raw = "";
  if (env.AI) {
    // 使用 Workers AI binding（推荐，无需 token）
    // 注意：llama vision 的 binding 用顶层 image 字段（base64），不是 content 数组
    const aiBinding = env.AI as { run: (model: string, opts: unknown) => Promise<unknown> };
    const result = await aiBinding.run(model, {
      messages,
      image: base64,
      max_tokens: 1024,
      temperature: 0.2,
    });
    const anyResult = result as {
      response?: string | { description?: string; ocr?: string; tags?: string };
      result?: string | { response?: string | { description?: string; ocr?: string; tags?: string } } | { choices?: Array<{ message?: { content?: string } }> };
    };
    // 兼容多种返回格式：
    // 1) {response: string}
    // 2) {result: {response: {description, ocr, tags}}}  ← vision 模型实际格式
    // 3) {result: string}
    // 4) OpenAI 风格 {result: {choices:[{message:{content}}]}}
    if (typeof anyResult?.response === "string") {
      raw = anyResult.response;
    } else if (anyResult?.response && typeof anyResult.response === "object") {
      // vision 模型返回对象：直接构造 JSON
      const r = anyResult.response as { description?: string; ocr?: string; tags?: string };
      raw = JSON.stringify({
        description: r.description || "",
        ocr: r.ocr || "",
        tags: r.tags || "",
      });
    } else if (typeof anyResult?.result === "string") {
      raw = anyResult.result;
    } else {
      const rr = anyResult?.result as { response?: string | { description?: string; ocr?: string; tags?: string } } | { choices?: Array<{ message?: { content?: string } }> } | undefined;
      if (rr && typeof rr === "object") {
        if ("response" in rr) {
          if (typeof rr.response === "string") {
            raw = rr.response;
          } else if (rr.response && typeof rr.response === "object") {
            const r = rr.response as { description?: string; ocr?: string; tags?: string };
            raw = JSON.stringify({
              description: r.description || "",
              ocr: r.ocr || "",
              tags: r.tags || "",
            });
          }
        } else if ("choices" in rr) {
          const ch = rr.choices as Array<{ message?: { content?: string } }> | undefined;
          raw = ch?.[0]?.message?.content || "";
        }
      }
    }
  } else {
    // fallback：直接用 fetch CF API（需要 env.CLOUDFLARE_API_TOKEN）
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("Workers AI binding 未配置且缺少 CF token");
    }
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      }
    );
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Workers AI 调用失败: ${resp.status} ${errText.slice(0, 200)}`);
    }
    const data = (await resp.json()) as { result?: { response?: string } };
    raw = data?.result?.response || "";
  }

  return parseAiResponse(raw);
}

/**
 * 用文本 LLM 从描述总结标签（文本模型更擅长关键词提取）
 */
export async function generateTagsFromDescription(
  env: Env,
  description: string,
  modelName?: string
): Promise<string> {
  const model = modelName || AI_MODELS.text;
  const prompt = `根据下面的图片描述，提取 3-5 个中文标签。只输出标签，用英文逗号分隔，不要其他文字、不要编号、不要句号。

描述：${description}

标签：`;

  let raw = "";
  if (env.AI) {
    const aiBinding = env.AI as { run: (model: string, opts: unknown) => Promise<unknown> };
    const result = await aiBinding.run(model, {
      messages: [
        { role: "system", content: "你是图片标签生成助手，只输出逗号分隔的中文标签。" },
        { role: "user", content: prompt },
      ],
      max_tokens: 100,
      temperature: 0.3,
    });
    const anyResult = result as {
      response?: string;
      result?: string | { choices?: Array<{ message?: { content?: string } }> };
    };
    // 兼容多种返回格式：{response: string} / {result: string} / OpenAI 风格 {result: {choices:[{message:{content}}]}}
    if (typeof anyResult?.response === "string") {
      raw = anyResult.response;
    } else if (typeof anyResult?.result === "string") {
      raw = anyResult.result;
    } else {
      const r = anyResult?.result as { choices?: Array<{ message?: { content?: string } }> } | undefined;
      raw = r?.choices?.[0]?.message?.content || "";
    }
  } else {
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("Workers AI binding 未配置且缺少 CF token");
    }
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "你是图片标签生成助手，只输出逗号分隔的中文标签。" },
            { role: "user", content: prompt },
          ],
        }),
      }
    );
    if (!resp.ok) {
      throw new Error(`标签生成失败: ${resp.status}`);
    }
    const data = (await resp.json()) as { result?: { response?: string } };
    raw = data?.result?.response || "";
  }

  // 清理输出：只保留逗号分隔的词
  const tags = raw
    .split(/[,，、\s]+/)
    .map((t) => t.trim())
    .filter((t) => t && t.length <= 8 && !/[。！？!?]/.test(t))
    .slice(0, 8);
  return Array.from(new Set(tags)).join(",");
}

function parseAiResponse(raw: string): AiResult {  // 提取 JSON（可能包裹在 markdown 代码块里）
  let jsonStr = raw.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }
  // 找第一个 { 到最后一个 }
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start >= 0 && end > start) {
    jsonStr = jsonStr.slice(start, end + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      description: parseJsonText(parsed.description),
      tags: normalizeTags(parsed.tags),
      ocrText: parseJsonText(parsed.ocr),
    };
  } catch {
    // JSON 解析失败：尝试从纯文本提取
    // 描述 = 第一行；标签 = 提取 # 后内容或逗号分隔词
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    let description = lines[0] || "";
    if (description.length > 100) {
      description = description.slice(0, 100);
    }
    // 尝试找标签（#tag 格式）
    const tagMatches = raw.match(/#[\w\u4e00-\u9fa5]+/g);
    let tags = "";
    if (tagMatches && tagMatches.length) {
      tags = tagMatches.map((t) => t.replace(/^#/, "")).join(",");
    } else {
      // 尝试逗号分隔词作为标签
      const words = description.split(/[,，、\s]+/).filter((w) => w && w.length >= 2);
      tags = words.slice(0, 5).join(",");
    }
    return {
      description,
      tags,
      ocrText: "",
    };
  }
}
