// 用途：poto 图床 Workers AI 调用封装（描述/OCR/标签）
// 创建时间：2026-08-03  opencode

import type { Env } from "../types";

export const AI_MODELS = {
  vision: "@cf/meta/llama-3.2-11b-vision-instruct",
  visionLight: "@cf/moondream/moondream3.1-9B-A2B",
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

  const prompt = `你是图片分析助手。请分析这张图片，严格输出 JSON（不要 markdown 代码块）：
{
  "description": "用一句中文简要描述图片内容（不超过50字）",
  "tags": "3-5个中文标签，用逗号分隔",
  "ocr": "图片中的所有文字，逐行提取；如果没有文字则返回空字符串"
}`;

  const base64 = btoa(String.fromCharCode(...imageBytes));

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
          {
            role: "user",
            content: [
              { type: "image_url", image_url: `data:${mimeType};base64,${base64}` },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    }
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Workers AI 调用失败: ${resp.status} ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { result?: { response?: string } };
  const raw = data?.result?.response || "";

  return parseAiResponse(raw);
}

function parseAiResponse(raw: string): AiResult {
  // 提取 JSON（可能包裹在 markdown 代码块里）
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
      tags: parseJsonText(parsed.tags),
      ocrText: parseJsonText(parsed.ocr),
    };
  } catch {
    // JSON 解析失败，返回原始文本作为描述
    return {
      description: raw.slice(0, 100),
      tags: "",
      ocrText: "",
    };
  }
}
