#!/usr/bin/env node
/**
 * migrate_from_supabase.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: export all data from Supabase → local SQLite DB.
 *
 * Run ONCE on MBP after first deploy of v1.2:
 *   NODE_ENV=production node migrate_from_supabase.js
 *
 * Or on MBA (dev) to create a local buddhist.db with real data, then scp it:
 *   node migrate_from_supabase.js
 *   scp buddhist.db mbp:~/db/buddhist-footprints/buddhist.db
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { initDb, query } = require('./db');

const SUPABASE_URL  = 'https://qstspcvkaznwvhsuavoo.supabase.co';
const SUPABASE_ANON = 'sb_publishable_5NFAn4Ur369Jysuk_Y_AHw_KHI3IoGS';

async function fetchTable(table) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${table}: HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log('Initialising local SQLite DB…');
  initDb();

  // ── essays ──────────────────────────────────────────────────────────────────
  console.log('Fetching essays from Supabase…');
  const essays = await fetchTable('essays');
  console.log(`  Found ${essays.length} rows`);
  const insEssay = query.bind(null);  // just use query() directly
  for (const e of essays) {
    try {
      query(
        `INSERT OR IGNORE INTO essays (id, title, tag, content, dharma_source, type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.title, e.tag ?? null, e.content, e.dharma_source ?? null, e.type ?? 'essay', e.created_at ?? new Date().toISOString()]
      );
    } catch (err) {
      console.warn(`  Skipped essay ${e.id}: ${err.message}`);
    }
  }
  console.log('  Essays inserted.');

  // ── dharma_history ──────────────────────────────────────────────────────────
  console.log('Fetching dharma_history from Supabase…');
  const history = await fetchTable('dharma_history');
  console.log(`  Found ${history.length} rows`);
  for (const h of history) {
    try {
      query(
        `INSERT OR IGNORE INTO dharma_history (date, source, text, created_at) VALUES (?, ?, ?, ?)`,
        [h.date, h.source, h.text, h.created_at ?? new Date().toISOString()]
      );
    } catch (err) {
      console.warn(`  Skipped history ${h.date}: ${err.message}`);
    }
  }
  console.log('  dharma_history inserted.');

  // ── dharma_en ───────────────────────────────────────────────────────────────
  console.log('Fetching dharma_en from Supabase…');
  const dharmaEn = await fetchTable('dharma_en');
  console.log(`  Found ${dharmaEn.length} rows`);
  for (const d of dharmaEn) {
    try {
      query(
        `INSERT OR REPLACE INTO dharma_en (source, source_en, text_en, reflection_en, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [d.source, d.source_en, d.text_en, d.reflection_en, d.created_at ?? new Date().toISOString()]
      );
    } catch (err) {
      console.warn(`  Skipped dharma_en ${d.source}: ${err.message}`);
    }
  }
  console.log('  dharma_en inserted.');

  // ── gallery ─────────────────────────────────────────────────────────────────
  console.log('Fetching gallery from Supabase…');
  const gallery = await fetchTable('gallery');
  console.log(`  Found ${gallery.length} rows`);
  for (const g of gallery) {
    try {
      query(
        `INSERT OR IGNORE INTO gallery (id, title, caption, image_url, created_at) VALUES (?, ?, ?, ?, ?)`,
        [g.id, g.title, g.caption ?? null, g.image_url, g.created_at ?? new Date().toISOString()]
      );
    } catch (err) {
      console.warn(`  Skipped gallery ${g.id}: ${err.message}`);
    }
  }
  console.log('  Gallery inserted.');

  console.log('\n✅ Migration complete!');
  console.log('   DB location:', require('./db').DB_PATH);
  console.log('\n   If running on MBA, copy to MBP:');
  console.log('   scp buddhist.db mbp:~/db/buddhist-footprints/buddhist.db');
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1); });
