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
