const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initDb, query } = require('./db');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const PORT    = parseInt(process.env.PORT || '3001', 10);
const APP     = process.env.APP_NAME || 'buddhist-footprints';
const { version: PKG_VERSION } = require('./package.json');
const VERSION = PKG_VERSION || '1.2.0';
const DISPLAY_VERSION = String(VERSION).replace(/\.0$/, ''); // 1.3.0 → 1.3
const ROOT    = __dirname;

const APP_PASSWORD = process.env.APP_PASSWORD || '';
const VALID_TOKEN  = crypto
  .createHash('sha256')
  .update(APP_PASSWORD + ':buddhist-footprints-salt')
  .digest('hex');

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

function isAuthorized(req) {
  if (!APP_PASSWORD) return true; // no password set → open
  return getToken(req) === VALID_TOKEN;
}

function newId() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Route Dispatcher ─────────────────────────────────────────────────────────

async function handleApi(req, res) {
  const url      = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;
  const method   = req.method;

  // ── Health ────────────────────────────────────────────────────────────────
  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok', app: APP, version: DISPLAY_VERSION,
      authRequired: Boolean(APP_PASSWORD),
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/auth/login' && method === 'POST') {
    try {
      const data = await readBody(req);
      if (!APP_PASSWORD) return sendJson(res, 503, { error: '尚未設定管理密碼' });
      if (data.password === APP_PASSWORD) return sendJson(res, 200, { token: VALID_TOKEN });
      return sendJson(res, 401, { error: '密碼錯誤' });
    } catch (_) {
      return sendJson(res, 400, { error: '無效請求' });
    }
  }

  // ── Essays ────────────────────────────────────────────────────────────────
  // GET /api/essays  — list essays (type != 'mantra'), optional ?dharma_source=X
  if (pathname === '/api/essays' && method === 'GET') {
    const ds = url.searchParams.get('dharma_source');
    const rows = ds
      ? query("SELECT * FROM essays WHERE dharma_source = ? ORDER BY created_at DESC", [ds])
      : query("SELECT * FROM essays WHERE type != 'mantra' ORDER BY created_at DESC");
    return sendJson(res, 200, rows);
  }

  // POST /api/essays  — create essay
  if (pathname === '/api/essays' && method === 'POST') {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    try {
      const { title, tag = null, content, dharma_source = null } = await readBody(req);
      if (!title || !content) return sendJson(res, 400, { error: '缺少必填欄位' });
      const id = newId();
      query(
        "INSERT INTO essays (id, title, tag, content, dharma_source, type) VALUES (?, ?, ?, ?, ?, 'essay')",
        [id, title, tag, content, dharma_source]
      );
      const rows = query("SELECT * FROM essays WHERE id = ?", [id]);
      return sendJson(res, 201, rows[0]);
    } catch (_) { return sendJson(res, 400, { error: '無效請求' }); }
  }

  // GET /api/essays/:id
  const essayIdMatch = pathname.match(/^\/api\/essays\/([^/]+)$/);
  if (essayIdMatch && method === 'GET') {
    const rows = query("SELECT * FROM essays WHERE id = ?", [essayIdMatch[1]]);
    if (!rows.length) return sendJson(res, 404, { error: '找不到' });
    return sendJson(res, 200, rows[0]);
  }

  // PUT /api/essays/:id
  if (essayIdMatch && method === 'PUT') {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    try {
      const body = await readBody(req);
      const id   = essayIdMatch[1];
      const current = query("SELECT * FROM essays WHERE id = ?", [id]);
      if (!current.length) return sendJson(res, 404, { error: '找不到' });
      const merged = { ...current[0], ...body };
      query(
        "UPDATE essays SET title=?, tag=?, content=?, dharma_source=?, type=? WHERE id=?",
        [merged.title, merged.tag ?? null, merged.content, merged.dharma_source ?? null, merged.type ?? 'essay', id]
      );
      const updated = query("SELECT * FROM essays WHERE id = ?", [id]);
      return sendJson(res, 200, updated[0]);
    } catch (_) { return sendJson(res, 400, { error: '無效請求' }); }
  }

  // DELETE /api/essays/:id
  if (essayIdMatch && method === 'DELETE') {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const id = essayIdMatch[1];
    query("DELETE FROM essays WHERE id = ?", [id]);
    return sendJson(res, 200, { ok: true });
  }

  // ── Mantras ───────────────────────────────────────────────────────────────
  // GET /api/mantras  — list mantras (type = 'mantra')
  if (pathname === '/api/mantras' && method === 'GET') {
    const rows = query("SELECT * FROM essays WHERE type = 'mantra' ORDER BY created_at DESC");
    return sendJson(res, 200, rows);
  }

  // POST /api/mantras  — create mantra
  if (pathname === '/api/mantras' && method === 'POST') {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    try {
      const { title, tag = null, content } = await readBody(req);
      if (!title || !content) return sendJson(res, 400, { error: '缺少必填欄位' });
      const id = newId();
      query(
        "INSERT INTO essays (id, title, tag, content, type) VALUES (?, ?, ?, ?, 'mantra')",
        [id, title, tag, content]
      );
      const rows = query("SELECT * FROM essays WHERE id = ?", [id]);
      return sendJson(res, 201, rows[0]);
    } catch (_) { return sendJson(res, 400, { error: '無效請求' }); }
  }

  // ── Dharma History ────────────────────────────────────────────────────────
  // GET /api/dharma/history  — all records, newest first
  if (pathname === '/api/dharma/history' && method === 'GET') {
    const rows = query("SELECT * FROM dharma_history ORDER BY date DESC");
    return sendJson(res, 200, rows);
  }

  // POST /api/dharma/history  — record today (idempotent; public — no auth needed)
  if (pathname === '/api/dharma/history' && method === 'POST') {
    try {
      const { date, source, text } = await readBody(req);
      if (!date || !source || !text) return sendJson(res, 400, { error: '缺少必填欄位' });
      query(
        "INSERT OR IGNORE INTO dharma_history (date, source, text) VALUES (?, ?, ?)",
        [date, source, text]
      );
      return sendJson(res, 200, { ok: true });
    } catch (_) { return sendJson(res, 400, { error: '無效請求' }); }
  }

  // GET /api/dharma/history/:date
  const historyDateMatch = pathname.match(/^\/api\/dharma\/history\/([^/]+)$/);
  if (historyDateMatch && method === 'GET') {
    const rows = query("SELECT * FROM dharma_history WHERE date = ?", [historyDateMatch[1]]);
    return sendJson(res, 200, rows[0] || null);
  }

  // ── Dharma EN ─────────────────────────────────────────────────────────────
  // GET /api/dharma/en  — all rows, optional ?source=X
  if (pathname === '/api/dharma/en' && method === 'GET') {
    const src = url.searchParams.get('source');
    const rows = src
      ? query("SELECT * FROM dharma_en WHERE source = ?", [src])
      : query("SELECT * FROM dharma_en ORDER BY created_at DESC");
    return sendJson(res, 200, rows);
  }

  // POST /api/dharma/en  — save translation (Upsert)
  if (pathname === '/api/dharma/en' && method === 'POST') {
    try {
      const { source, source_en, text_en, reflection_en } = await readBody(req);
      if (!source) return sendJson(res, 400, { error: '缺少 source' });
      // SQLite Upsert logic (requires node:sqlite context)
      query(`
        INSERT INTO dharma_en (source, source_en, text_en, reflection_en)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source) DO UPDATE SET
          source_en = excluded.source_en,
          text_en = excluded.text_en,
          reflection_en = excluded.reflection_en
      `, [source, source_en, text_en, reflection_en]);
      return sendJson(res, 200, { ok: true });
    } catch (_) { return sendJson(res, 400, { error: '無效請求' }); }
  }

  // ── Gallery ───────────────────────────────────────────────────────────────
  // GET /api/gallery
  if (pathname === '/api/gallery' && method === 'GET') {
    const rows = query("SELECT * FROM gallery ORDER BY created_at DESC");
    return sendJson(res, 200, rows);
  }

  // POST /api/gallery
  if (pathname === '/api/gallery' && method === 'POST') {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    try {
      const { title, caption = null, image_url } = await readBody(req);
      if (!title || !image_url) return sendJson(res, 400, { error: '缺少必填欄位' });
      const id = newId();
      query(
        "INSERT INTO gallery (id, title, caption, image_url) VALUES (?, ?, ?, ?)",
        [id, title, caption, image_url]
      );
      const rows = query("SELECT * FROM gallery WHERE id = ?", [id]);
      return sendJson(res, 201, rows[0]);
    } catch (_) { return sendJson(res, 400, { error: '無效請求' }); }
  }

  // GET /api/gallery/:id
  const galleryIdMatch = pathname.match(/^\/api\/gallery\/([^/]+)$/);
  if (galleryIdMatch && method === 'GET') {
    const rows = query("SELECT * FROM gallery WHERE id = ?", [galleryIdMatch[1]]);
    if (!rows.length) return sendJson(res, 404, { error: '找不到' });
    return sendJson(res, 200, rows[0]);
  }

  // PUT /api/gallery/:id
  if (galleryIdMatch && method === 'PUT') {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    try {
      const body = await readBody(req);
      const id   = galleryIdMatch[1];
      const current = query("SELECT * FROM gallery WHERE id = ?", [id]);
      if (!current.length) return sendJson(res, 404, { error: '找不到' });
      const merged = { ...current[0], ...body };
      query(
        "UPDATE gallery SET title=?, caption=?, image_url=? WHERE id=?",
        [merged.title, merged.caption ?? null, merged.image_url, id]
      );
      const updated = query("SELECT * FROM gallery WHERE id = ?", [id]);
      return sendJson(res, 200, updated[0]);
    } catch (_) { return sendJson(res, 400, { error: '無效請求' }); }
  }

  // DELETE /api/gallery/:id
  if (galleryIdMatch && method === 'DELETE') {
    if (!isAuthorized(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const id = galleryIdMatch[1];
    query("DELETE FROM gallery WHERE id = ?", [id]);
    return sendJson(res, 200, { ok: true });
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  return sendJson(res, 404, { error: 'Not found' });
}

// ── DHARMA POOL & AUTOMATION ──
const dharmaPool = [
  { s:'《金剛般若波羅蜜經》第十品', se:'The Diamond Prajñāpāramitā Sūtra · Chapter 10', te:'Abide nowhere, and thus give rise to the mind.', re:'All attachments are fetters. To observe without clinging is true freedom. Today, try facing all situations with a mind that "abides nowhere"—letting all things arise without being bound by them.' },
  { s:'《般若波羅蜜多心經》', se:'The Heart of the Prajñāpāramitā Sūtra', te:'Form is not other than emptiness; emptiness is not other than form. Form is emptiness; emptiness is form.', re:'All phenomena are transient and ever-changing, yet emptiness is not nothingness—it is the field of infinite possibility. Seeing emptiness allows us to remain unclouded by appearances or temporary gains and losses.' },
  { s:'《六祖壇經》行由品第一', se:'The Platform Sutra of the Sixth Patriarch · Chapter 1', te:'Originally there is not a single thing; where could any dust alight?', re:'Master Huineng attained enlightenment through this verse. A pure mind is not about continuous cleaning, but about realizing that our fundamental nature was never defiled to begin with.' },
  { s:'《維摩詰所說經》佛國品第一', se:'The Vimalakīrti Nirdeśa Sūtra · Chapter 1', te:'If a Bodhisattva wishes to attain the Pure Land, they should first purify their mind. As the mind is purified, the Buddha-land is purified.', re:'The purity of our environment stems from the purity of our inner state. The world we see is often a projection of our mind. Today, ask yourself: is my mind clear or clouded in this moment?' },
  { s:'《臨濟錄》示眾', se:'The Record of Linji · Sermons', te:'At all times and in all places, be the master; then wherever you stand is the truth.', re:'Regardless of your circumstances, if you can remain master of yourself, every place becomes a place of practice. Every present moment today is an opportunity for cultivation.' },
  { s:'《妙法蓮華經》方便品第二', se:'The Lotus Sūtra · Chapter 2: Expedient Means', te:'All phenomena, from their very origin, are constantly characterized by the mark of quiet extinction.', re:'Beneath the surface of change and noise, all things are inherently at peace. Today, try to find that stillness amidst the bustle—it has always been there, never leaving.' },
  { s:'《趙州錄》公案', se:'The Record of Zhao Zhou · Gōng\'àn', te:'Go drink some tea.', re:'Zhao Zhou guided many students with these four words. The "ordinary mind" is the Way; the simple act of drinking tea contains the entirety of practice.' },
  { s:'《大佛頂首楞嚴經》卷一', se:'The Śūraṅgama Sūtra · Volume 1', te:'All drifting dust and illusory appearances arise where they are and vanish right there.', re:'Every phenomenon is like a phantom—appearing and disappearing within the same space of awareness. Understanding this, one is neither elated by temporary peaks nor despaired by troughs.' },
  { s:'黃檗希運禪師《傳心法要》', se:'Zen Master Huangbo Xiyun: Essentials of Transmitting the Mind', te:'Non-mind is the Way.', re:'"Non-mind" is not numbness, but a state free from discriminatory attachment. Only by observing the world with a mind free of fabrications can we see the true face of reality.' },
  { s:'《六祖壇經》般若品第二', se:'The Platform Sutra of the Sixth Patriarch · Chapter 2: Prajna', te:'The nature of Bodhi is originally pure; simply use this mind to directly attain Buddhahood.', re:'Pure wisdom is our inherent nature, not something to be sought externally. Today, trust the natural clarity that resides within you.' },
  { s:'《阿彌陀經》（姚秦鳩摩羅什譯）', se:'The Amitābha Sūtra (Translated by Kumārajīva)', te:'One cannot be born in that land with few good roots, blessings, virtues, and causal conditions.', re:'The law of cause and effect is the fundamental language of the universe. Every result is a convergence of many conditions; it is not achieved by a single effort at a single moment.' },
  { s:'《永嘉證道歌》玄覺禪師', se:'Song of Enlightenment by Chan Master Yongjia Xuanjue', te:'In a dream, the six realms are clearly seen; after awakening, the great universe is empty.', re:'The joys and sorrows of a dream are empty upon waking. Yet, while in the dream, one must still live earnestly. The emptiness after awakening is a "Great Emptiness" that encompasses everything.' },
  { s:'《普賢行願品》', se:'The Vows of Samantabhadra', te:'When the realm of space is exhausted, my vows will be exhausted; but because the realm of space is inexhaustible, my great vows have no end.', re:'The ten great vows of Samantabhadra are as vast as infinite space. With such a great resolve, our actions find a support that transcends personal gain or loss.' },
  { s:'雲門文偃禪師語錄', se:'The Record of Zen Master Yunmen Wenyan', te:'It covers heaven and earth; it cuts off all flows; it follows the waves and surges with the tide.', re:'Yunmen\'s three phrases: embrace all with a holistic view; decisively cut off discriminatory thoughts; and flexibly follow the flow of conditions. Combined, they are harmonious and unobstructed.' },
  { s:'《圓覺經》', se:'The Sūtra of Perfect Enlightenment', te:'Recognizing illusion, one is instantly free, without needing expedient means; free from illusion, one is enlightened, without gradual stages.', re:'To recognize the illusory is to be free of it; enlightenment is found in the very moment of recognition. Today, try to recognize one illusion you have long believed in.' },
  { s:'洞山良价禪師《寶鏡三昧》', se:'Song of the Precious Mirror Samādhi by Chan Master Dongshan Liangjie', te:'This teaching has been transmitted in secret by all Buddhas and patriarchs. Now that you have received it, guard it well.', re:'The phrase "guard it well" means that after receiving insight, one must carefully protect it in daily life, ensuring it is not washed away by worldly currents.' }
];

function getDharmaForDate(iso) {
  const d = new Date(iso);
  const start = new Date(d.getFullYear(), 0, 0);
  const day = Math.floor((d - start) / 86400000);
  return dharmaPool[day % dharmaPool.length];
}

async function autoRecordToday() {
  const today = new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Kuala_Lumpur'});
  const dharma = getDharmaForDate(today);
  try {
    // 1. 記錄歷史
    query("INSERT OR IGNORE INTO dharma_history (date, source, text) VALUES (?, ?, ?)", [today, dharma.s, dharma.te]);
    // 2. 確保翻譯在 DB 中
    query(`
      INSERT INTO dharma_en (source, source_en, text_en, reflection_en)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        source_en = excluded.source_en,
        text_en = excluded.text_en,
        reflection_en = excluded.reflection_en
    `, [dharma.s, dharma.se, dharma.te, dharma.re]);
    console.log(`[cron] Daily dharma recorded: ${today}`);
  } catch(e) { console.error('[cron] Error:', e.message); }
}

// 啟動與每日檢查
autoRecordToday();
setInterval(autoRecordToday, 3600000); // 每小時檢查一次日期

// ── Main HTTP Server ─────────────────────────────────────────────────────────

initDb();

http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    });
    return res.end();
  }

  // All /api/* routes go to the API handler
  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res);
    } catch (err) {
      console.error('API error:', err);
      sendJson(res, 500, { error: 'Internal server error' });
    }
    return;
  }

  // Static file serving
  const filePath = path.join(ROOT, pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, 'index.html'), (fallbackErr, fallbackData) => {
        if (fallbackErr) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fallbackData);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`${APP} v${VERSION} on port ${PORT}`));
