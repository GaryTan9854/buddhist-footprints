-- ════════════════════════════════════════
-- Buddhist Footprints — Supabase Migration v2
-- 在 Supabase Dashboard → SQL Editor 貼入並執行
-- ════════════════════════════════════════

-- ① 為 essays 表加入 type 欄位（區分心得 vs 佛咒）
ALTER TABLE essays ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'essay';

-- ② 建立 dharma_en 表（英文翻譯，對應 dharmaPool source 欄位）
CREATE TABLE IF NOT EXISTS dharma_en (
  source       TEXT PRIMARY KEY,
  source_en    TEXT NOT NULL,
  text_en      TEXT NOT NULL,
  reflection_en TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ③ 匯入 5 筆英文翻譯
INSERT INTO dharma_en (source, source_en, text_en, reflection_en) VALUES
(
  '《般若波羅蜜多心經》',
  'Heart of the Prajñāpāramitā Sūtra',
  'Form is not other than emptiness; emptiness is not other than form. Form is emptiness; emptiness is form.',
  'Emptiness is not nothingness — it is the open field of infinite possibility. To see emptiness is not to be lost, but to be freed from being trapped by appearances. The clear, unobscured awareness you already possess has always been present.'
),
(
  '《維摩詰所說經》佛國品第一',
  'Vimalakīrti Sūtra · Chapter One: The Buddha Land',
  'If a bodhisattva wishes to obtain a pure land, he must first purify his mind; as his mind becomes pure, so too does the Buddha land become pure.',
  'The purity of the outer world mirrors the purity of the inner mind. What we perceive is often a projection of our own state. Ask yourself today: is my mind clear or clouded in this moment?'
),
(
  '《臨濟錄》示眾',
  'Record of Linji · Teachings to the Assembly',
  'Be master wherever you are; wherever you stand becomes the ground of truth.',
  'In whatever circumstance you find yourself, you can be the sovereign of your own being. Nothing outside you can diminish what you truly are. Each moment of today is an opportunity for practice.'
),
(
  '《圓覺經》',
  'Sutra of Perfect Enlightenment',
  'When you recognize illusion, you are already free from it — no further method is needed. When illusion falls away, awakening is present — no gradual steps required.',
  'Recognition itself is liberation. No elaborate technique is needed — simply seeing clearly that something is an illusion dissolves it. Today, try to notice one belief you have been holding that may itself be illusion.'
),
(
  '洞山良价禪師《寶鏡三昧》',
  'Chan Master Dongshan Liangjie · Song of the Precious Mirror Samādhi',
  'This teaching has been transmitted in secret by all Buddhas and patriarchs. Now that you have received it, guard it well.',
  'The phrase "guard it well" is the heart of it: insight received must be carefully protected in daily life, lest it be washed away by the world''s endless currents. Receiving is only the beginning — preserving it in each ordinary moment is the real practice.'
)
ON CONFLICT (source) DO NOTHING;

-- ④ 完成後可在 Table Editor 確認：
--    · essays 表有 type 欄位
--    · dharma_en 表有 5 筆翻譯資料
