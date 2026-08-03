-- 0004_add_ai_metadata.sql
-- 用途：poto 图床 AI 元数据（描述/标签/OCR）
-- 创建时间：2026-08-03  opencode

-- images 表：AI 元数据列
ALTER TABLE images ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE images ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE images ADD COLUMN ocr_text TEXT NOT NULL DEFAULT '';
ALTER TABLE images ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE images ADD COLUMN ai_processed_at TEXT;

-- configuration 表：AI 配置
ALTER TABLE configuration ADD COLUMN ai_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE configuration ADD COLUMN ai_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.2-11b-vision-instruct';
ALTER TABLE configuration ADD COLUMN ai_max_daily INTEGER NOT NULL DEFAULT 200;

-- 索引
CREATE INDEX IF NOT EXISTS idx_images_ai_status ON images(ai_status);
