-- ════════════════════════════════════════
-- Buddhist Footprints — Supabase Migration
-- 在 Supabase Dashboard → SQL Editor 貼入並執行
-- ════════════════════════════════════════

-- ① 建立 dharma_history 表
CREATE TABLE IF NOT EXISTS dharma_history (
  date    TEXT PRIMARY KEY,
  source  TEXT NOT NULL,
  text    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ② essays 加入 dharma_source 欄位（關聯佛法主題）
ALTER TABLE essays ADD COLUMN IF NOT EXISTS dharma_source TEXT;

-- ③ 匯入從 Netlify localStorage 取出的歷史紀錄
INSERT INTO dharma_history (date, source, text) VALUES
  ('2026-03-08', '《維摩詰所說經》佛國品第一', '若菩薩欲得淨土，當淨其心；隨其心淨，則佛土淨。'),
  ('2026-03-09', '《臨濟錄》示眾',               '隨處作主，立處皆真。'),
  ('2026-03-19', '《圓覺經》',                    '知幻即離，不作方便；離幻即覺，亦無漸次。'),
  ('2026-03-20', '洞山良价禪師《寶鏡三昧》',      '如是之法，佛祖密付；汝今得之，宜善保護。')
ON CONFLICT (date) DO NOTHING;

-- 完成後可在 Table Editor 確認 dharma_history 有 4 筆資料，essays 有 dharma_source 欄位
