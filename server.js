const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

const PORT = parseInt(process.env.PORT || '3001', 10);
const APP = process.env.APP_NAME || 'buddhist-footprints';
const VERSION = process.env.APP_VERSION || '1.1';
const ROOT = __dirname;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const VALID_TOKEN = crypto
  .createHash('sha256')
  .update(APP_PASSWORD + ':buddhist-footprints-salt')
  .digest('hex');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(payload));
}

http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];

  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      app: APP,
      version: VERSION,
      authRequired: Boolean(APP_PASSWORD),
    });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        if (!APP_PASSWORD) {
          return sendJson(res, 503, { error: '尚未設定管理密碼' });
        }
        if (data.password === APP_PASSWORD) {
          return sendJson(res, 200, { token: VALID_TOKEN });
        }
        return sendJson(res, 401, { error: '密碼錯誤' });
      } catch (_err) {
        return sendJson(res, 400, { error: '無效請求' });
      }
    });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }

  const filePath = path.join(ROOT, pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, 'index.html'), (fallbackErr, fallbackData) => {
        if (fallbackErr) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fallbackData);
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`${APP} v${VERSION} on port ${PORT}`));
