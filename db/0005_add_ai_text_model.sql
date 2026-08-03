-- 0005_add_ai_text_model.sql
-- 用途：poto 增加文本模型配置（标签总结用）
-- 创建时间：2026-08-03  opencode

ALTER TABLE configuration ADD COLUMN ai_text_model TEXT NOT NULL DEFAULT '@cf/meta/llama-3.1-8b-fast-v2';
