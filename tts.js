// tts.js — 零依賴 Edge TTS 客戶端（Node 22+ 內建 WebSocket）
// 發布文章時產生全文 MP3 + 段落時間戳（供前端同步反白、點段續播）。
// 協定與 token 對齊 python edge-tts（token 若失效，更新 TRUSTED_CLIENT_TOKEN / SEC_MS_GEC_VERSION）。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DB_PATH, query } = require('./db');

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SEC_MS_GEC_VERSION = '1-143.0.3650.75';
const WSS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

const DEFAULT_VOICE = 'zh-TW-HsiaoChenNeural';
// audio-24khz-48kbitrate-mono-mp3 是 CBR 48kbps：時長 = bytes / 6000
const CBR_BYTES_PER_SEC = 6000;
const MAX_CHUNK_CHARS = 800; // 單一 WS 請求的字數上限（過長段落按句切分）

const AUDIO_DIR = path.join(path.dirname(DB_PATH), 'audio');

function secMsGec() {
  let ticks = Math.floor(Date.now() / 1000) + 11644473600; // Windows epoch
  ticks -= ticks % 300;
  ticks *= 1e7;
  return crypto.createHash('sha256').update(ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN).digest('hex').toUpperCase();
}

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// 單次 WS 合成：回傳 mp3 Buffer
function synthesizeChunk(text, voice) {
  return new Promise((resolve, reject) => {
    const reqId = crypto.randomUUID().replace(/-/g, '');
    const url = `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${reqId}`;
    const ws = new WebSocket(url, {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': USER_AGENT,
        'Cookie': `muid=${crypto.randomBytes(16).toString('hex').toUpperCase()};`
      }
    });
    ws.binaryType = 'arraybuffer';
    const audioChunks = [];
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      err ? reject(err) : resolve(val);
    };
    const timer = setTimeout(() => finish(new Error('TTS timeout (60s)')), 60000);

    ws.onerror = () => finish(new Error('TTS websocket error'));
    ws.onclose = (e) => finish(new Error(`TTS closed early code=${e.code}`));
    ws.onopen = () => {
      const ts = new Date().toString();
      ws.send(`X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
          outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
        } } } }));
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-TW'><voice name='${voice}'>${escXml(text)}</voice></speak>`;
      ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        if (ev.data.includes('Path:turn.end')) {
          if (!audioChunks.length) return finish(new Error('TTS returned no audio'));
          finish(null, Buffer.concat(audioChunks));
        }
      } else {
        const buf = Buffer.from(ev.data);
        const headerLen = buf.readUInt16BE(0);
        if (buf.slice(2, 2 + headerLen).toString().includes('Path:audio')) {
          audioChunks.push(buf.slice(2 + headerLen));
        }
      }
    };
  });
}

async function synthesizeText(text, voice) {
  // 過長文字按句切分，各自合成後串接（CBR 串接可直接播放）
  const chunks = [];
  if (text.length <= MAX_CHUNK_CHARS) {
    chunks.push(text);
  } else {
    let cur = '';
    for (const sentence of text.split(/(?<=[。！？；\n])/)) {
      if (cur.length + sentence.length > MAX_CHUNK_CHARS && cur) { chunks.push(cur); cur = ''; }
      cur += sentence;
    }
    if (cur.trim()) chunks.push(cur);
  }
  const bufs = [];
  for (const c of chunks) {
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { bufs.push(await synthesizeChunk(c, voice)); lastErr = null; break; }
      catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); }
    }
    if (lastErr) throw lastErr;
  }
  return Buffer.concat(bufs);
}

// Markdown → 朗讀文字。回傳 null 表示此段落不朗讀（程式碼、圖片、分隔線等）
function blockToSpeech(block) {
  let t = block.trim();
  if (!t) return null;
  if (/^```/.test(t) || /^~~~/.test(t)) return null;        // code fence
  if (/^!\[/.test(t)) return null;                            // image
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return null;          // hr
  if (/^\$\$[\s\S]*\$\$$/.test(t)) return null;               // display math
  t = t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                     // inline images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                  // links → text
    .replace(/^#{1,6}\s*/gm, '')                              // headings
    .replace(/^>\s?/gm, '')                                   // blockquote
    .replace(/^\s*[-*+]\s+/gm, '')                            // ul markers
    .replace(/^\s*\d+[.)]\s+/gm, '')                          // ol markers
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$\$?[^$]*\$\$?/g, '')                          // math
    .replace(/<[^>]+>/g, '')                                  // html tags
    .replace(/[ \t]+/g, ' ')
    .trim();
  return t || null;
}

// 段落切分——前端 index.html 的 splitBlocks() 必須與此完全一致
function splitBlocks(content) {
  return (content || '').split(/\n{2,}/);
}

let _queue = Promise.resolve();

// 發布/編輯後排入背景產生任務（同時間只跑一件）
function queueEssayAudio(essayId) {
  query(`UPDATE essays SET audio_status='pending' WHERE id=?`, [essayId]);
  _queue = _queue.then(() => generateEssayAudio(essayId)).catch(e => {
    console.error(`[tts] ${essayId} failed:`, e.message);
  });
  return _queue;
}

async function generateEssayAudio(essayId) {
  const essay = query(`SELECT * FROM essays WHERE id=?`, [essayId])[0];
  if (!essay) return;
  const voice = essay.audio_voice || DEFAULT_VOICE;
  console.log(`[tts] generating audio for "${essay.title}" (${essayId})`);
  try {
    const blocks = splitBlocks(essay.content);
    const speakable = [];
    // 標題先朗讀
    const titleText = blockToSpeech(essay.title);
    const parts = [];
    if (titleText) parts.push({ idx: -1, text: titleText + '。' });
    blocks.forEach((b, i) => { const s = blockToSpeech(b); if (s) parts.push({ idx: i, text: s }); });
    if (!parts.length) throw new Error('無可朗讀內容');

    const timings = []; // [{i: blockIndex, t: 起始秒}]，i=-1 代表標題
    const bufs = [];
    let cursor = 0;
    for (const p of parts) {
      const buf = await synthesizeText(p.text, voice);
      timings.push({ i: p.idx, t: Math.round(cursor * 100) / 100 });
      bufs.push(buf);
      cursor += buf.length / CBR_BYTES_PER_SEC;
    }
    const full = Buffer.concat(bufs);
    const duration = Math.round((full.length / CBR_BYTES_PER_SEC) * 100) / 100;

    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    fs.writeFileSync(path.join(AUDIO_DIR, `${essayId}.mp3`), full);
    query(`UPDATE essays SET audio_status='ready', audio_duration=?, audio_timings=?, audio_voice=? WHERE id=?`,
      [duration, JSON.stringify(timings), voice, essayId]);
    console.log(`[tts] done "${essay.title}" — ${Math.round(duration)}s, ${(full.length / 1024).toFixed(0)}KB`);
  } catch (e) {
    query(`UPDATE essays SET audio_status='error' WHERE id=?`, [essayId]);
    throw e;
  }
}

function audioFilePath(essayId) {
  // essayId 已由呼叫端驗證格式（hex），避免路徑跳脫
  return path.join(AUDIO_DIR, `${essayId}.mp3`);
}

function deleteEssayAudio(essayId) {
  try { fs.unlinkSync(audioFilePath(essayId)); } catch {}
}

module.exports = { queueEssayAudio, audioFilePath, deleteEssayAudio, DEFAULT_VOICE, splitBlocks };
