const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

// Production DB: ~/db/buddhist-footprints/buddhist.db  (same ~/db/ pattern as other projects)
const DEFAULT_DB_PATH = path.join(os.homedir(), 'db', 'buddhist-footprints', 'buddhist.db');
const DB_PATH = process.env.DB_PATH || (process.env.NODE_ENV === 'production' ? DEFAULT_DB_PATH : path.join(__dirname, 'buddhist.db'));

let db = null;

function getDb() {
  if (db) return db;
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `);
  return db;
}

function closeDb() {
  if (!db) return;
  db.close();
  db = null;
}

// Simple query helper: SELECT → returns rows array, others → returns run info
function query(sql, params = []) {
  const database = getDb();
  const stmt = database.prepare(sql);
  const upper = sql.trim().toUpperCase();
  if (/^(SELECT|WITH|PRAGMA)/.test(upper) || /\bRETURNING\b/i.test(sql)) {
    return stmt.all(...params);
  }
  return stmt.run(...params);
}

function initDb() {
  const database = getDb();

  // ── Schema ──────────────────────────────────────────────────────────────────
  database.exec(`
    CREATE TABLE IF NOT EXISTS essays (
      id          TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      title       TEXT NOT NULL,
      tag         TEXT,
      content     TEXT NOT NULL,
      dharma_source TEXT,
      type        TEXT NOT NULL DEFAULT 'essay',
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dharma_history (
      date        TEXT PRIMARY KEY NOT NULL,
      source      TEXT NOT NULL,
      text        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dharma_en (
      source        TEXT PRIMARY KEY NOT NULL,
      source_en     TEXT NOT NULL,
      text_en       TEXT NOT NULL,
      reflection_en TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id          TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
      title       TEXT NOT NULL,
      caption     TEXT,
      image_url   TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_essays_type_created ON essays(type, created_at);
    CREATE INDEX IF NOT EXISTS idx_essays_dharma_source ON essays(dharma_source);
    CREATE INDEX IF NOT EXISTS idx_dharma_history_date ON dharma_history(date);
    CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery(created_at);
  `);

  // ── Seed dharma_en (5 English translations) ────────────────────────────────
  // Uses INSERT OR IGNORE so re-running initDb is safe
  const seedDharmaEn = database.prepare(`
    INSERT OR IGNORE INTO dharma_en (source, source_en, text_en, reflection_en) VALUES (?, ?, ?, ?)
  `);
  const dharmaEnSeed = [
    [
      '《般若波羅蜜多心經》',
      'Heart of the Prajñāpāramitā Sūtra',
      'Form is not other than emptiness; emptiness is not other than form. Form is emptiness; emptiness is form.',
      'Emptiness is not nothingness — it is the open field of infinite possibility. To see emptiness is not to be lost, but to be freed from being trapped by appearances. The clear, unobscured awareness you already possess has always been present.'
    ],
    [
      '《維摩詰所說經》佛國品第一',
      'Vimalakīrti Sūtra · Chapter One: The Buddha Land',
      'If a bodhisattva wishes to obtain a pure land, he must first purify his mind; as his mind becomes pure, so too does the Buddha land become pure.',
      'The purity of the outer world mirrors the purity of the inner mind. What we perceive is often a projection of our own state. Ask yourself today: is my mind clear or clouded in this moment?'
    ],
    [
      '《臨濟錄》示眾',
      'Record of Linji · Teachings to the Assembly',
      'Be master wherever you are; wherever you stand becomes the ground of truth.',
      'In whatever circumstance you find yourself, you can be the sovereign of your own being. Nothing outside you can diminish what you truly are. Each moment of today is an opportunity for practice.'
    ],
    [
      '《圓覺經》',
      'Sutra of Perfect Enlightenment',
      'When you recognize illusion, you are already free from it — no further method is needed. When illusion falls away, awakening is present — no gradual steps required.',
      'Recognition itself is liberation. No elaborate technique is needed — simply seeing clearly that something is an illusion dissolves it. Today, try to notice one belief you have been holding that may itself be illusion.'
    ],
    [
      '洞山良价禪師《寶鏡三昧》',
      'Chan Master Dongshan Liangjie · Song of the Precious Mirror Samādhi',
      'This teaching has been transmitted in secret by all Buddhas and patriarchs. Now that you have received it, guard it well.',
      "The phrase \"guard it well\" is the heart of it: insight received must be carefully protected in daily life, lest it be washed away by the world's endless currents. Receiving is only the beginning — preserving it in each ordinary moment is the real practice."
    ],
  ];
  for (const row of dharmaEnSeed) seedDharmaEn.run(...row);

  // ── Seed dharma_history (initial 4 records from Supabase migration) ─────────
  const seedHistory = database.prepare(`
    INSERT OR IGNORE INTO dharma_history (date, source, text) VALUES (?, ?, ?)
  `);
  const historySeed = [
    ['2026-03-08', '《維摩詰所說經》佛國品第一', '若菩薩欲得淨土，當淨其心；隨其心淨，則佛土淨。'],
    ['2026-03-09', '《臨濟錄》示眾',              '隨處作主，立處皆真。'],
    ['2026-03-19', '《圓覺經》',                   '知幻即離，不作方便；離幻即覺，亦無漸次。'],
    ['2026-03-20', '洞山良价禪師《寶鏡三昧》',     '如是之法，佛祖密付；汝今得之，宜善保護。'],
  ];
  for (const row of historySeed) seedHistory.run(...row);
}

module.exports = { DB_PATH, getDb, closeDb, initDb, query };
