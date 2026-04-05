const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { initDb, query } = require('./db');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}
loadEnvFile(path.join(__dirname, '.env'));

const APP = 'buddhist-footprints';
const VERSION = '2.1';
const PORT = process.env.PORT || 3004;
const ROOT = __dirname;
const APP_PASSWORD = process.env.APP_PASSWORD || 'casper88';

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml'
};

function sendJson(res, status, data) {
  res.writeHead(status, { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(e); }
    });
  });
}

const requireAuth = (req) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.split(' ')[1];
  return token === APP_PASSWORD;
};

// ── DHARMA POOL (三藏 × 十二部結構) ──
const dharmaPool = [
  // --- 經藏 (Sutra) ---
  { s:'《金剛經》', t:'凡所有相，皆是虛妄。若見諸相非相，則見如來。', r:'世間表象皆是幻影。看透表象，即見本質。', trip:'經', div:'1修多羅', se:'Diamond Sutra', te:'All forms are illusive. Seeing through them is seeing reality.', re:'Worldly appearances are but transient phantoms. When you look through these appearances without being deceived by them, you perceive the true nature of reality.' },
  { s:'《法華經》方便品', t:'諸法從本來，常自寂滅相。', r:'萬法本自寂靜，動的是心，不動的是性。', trip:'經', div:'2祇夜', se:'Lotus Sutra', te:'All phenomena, from their very origin, are constantly characterized by the mark of quiet extinction.', re:'Beneath the surface of constant change and noise, every thing is inherently at peace.' },
  { s:'《心經》', t:'色不異空，空不異色；色即是空，空即是色。', r:'現象與本質不二，空性即是無限可能。', trip:'經', div:'3伽陀', se:'Heart Sutra', te:'Form is not other than emptiness; emptiness is not other than form. Form is emptiness; emptiness is form.', re:'Emptiness is not nothingness — it is the open field of infinite possibility.' },
  { s:'《阿彌陀經》', t:'不可以少善根福德因緣，得生彼國。', r:'成就任何事都需要因緣具足，非一時之功。', trip:'經', div:'4優陀那', se:'Amitabha Sutra', te:'One cannot be born in that land with few good roots, blessings, virtues, and causal conditions.', re:'Every result is a convergence of many conditions; it is not achieved by a single effort.' },
  { s:'《圓覺經》', t:'知幻即離，不作方便；離幻即覺，亦無漸次。', r:'認出幻相即是解脫，覺悟就在當下。', trip:'經', div:'11毘佛略', se:'Sutra of Perfect Enlightenment', te:'Recognizing illusion, one is instantly free; free from illusion, one is enlightened.', re:'To recognize the illusory is to be free of it; enlightenment is found in the very moment of recognition.' },
  { s:'《華嚴經》', t:'若人欲了知，三世一切佛，應觀法界性，一切唯心造。', r:'世界由心念編織，轉變心念即轉變世界。', trip:'經', div:'11毘佛略', se:'Avatamsaka Sutra', te:'If one wishes to understand all Buddhas, one should contemplate: everything is made by mind alone.', re:'The world we perceive is essentially woven by our own thoughts.' },
  { s:'《楞嚴經》', t:'一切浮塵諸幻化相，當處出生，隨處滅盡。', r:'一切現象在其發生處生起，又在原處消散。', trip:'經', div:'1修多羅', se:'Shurangama Sutra', te:'All drifting dust and illusory appearances arise where they are and vanish right there.', re:'Every phenomenon is like a phantom—appearing and disappearing within the same space of awareness.' },
  { s:'《維摩詰經》', t:'若菩薩欲得淨土，當淨其心；隨其心淨，則佛土淨。', r:'內心的清淨程度決定了你眼中的世界。', trip:'經', div:'11毘佛略', se:'Vimalakirti Sutra', te:'If a Bodhisattva wishes to attain the Pure Land, they should first purify their mind.', re:'The purity of our environment stems from the purity of our inner state.' },
  { s:'《法句經》', t:'諸惡莫作，眾善奉行；自淨其意，是諸佛教。', r:'修行的核心：止惡、行善、清淨內心。', trip:'經', div:'3伽陀', se:'Dhammapada', te:'To avoid all evil, to cultivate good, and to cleanse one\'s mind — this is the teaching of the Buddhas.', re:'Practice is found in ceasing harm, performing kindness, and maintaining a clear, purified mind.' },
  { s:'《佛說八大人覺經》', t:'世間無常，國土危脆；四大苦空，五陰無我。', r:'正視無常與無我，是通往智慧的第一步。', trip:'經', div:'1修多羅', se:'Sutra on the Eight Great Awakenings', te:'The world is impermanent; the self is empty.', re:'Realizing impermanence and non-self is the first step toward wisdom.' },
  { s:'《地藏經》', t:'閻浮提眾生，舉心動念，無非是罪，無非是業。', r:'時刻觀照自己的每一個念頭，微小處皆是因果。', trip:'經', div:'5尼陀那', se:'Ksitigarbha Sutra', te:'Every thought of sentient beings creates karma.', re:'Watch your thoughts constantly; even the smallest one carries the weight of cause and effect.' },
  { s:'《藥師經》', t:'願我來世得菩提時，身如琉璃，內外明澈，淨無瑕穢。', r:'追求內在的透明與清淨，如同琉璃般無雜質。', trip:'經', div:'12授記', se:'Medicine Buddha Sutra', te:'May my body be like crystal, pure and transparent.', re:'Strive for internal clarity and purity, devoid of any defilement.' },

  // --- 律藏 (Vinaya) ---
  { s:'《四分律》', t:'譬如大海，不宿死屍；佛法大海，亦復如是，不宿破戒之人。', r:'清淨的教法中容不下虛偽與毀禁。', trip:'律', div:'9阿波陀那', se:'Four-Part Vinaya', te:'As the ocean rejects a corpse, the Dharma rejects the impure.', re:'Pure teachings cannot coexist with hypocrisy or the violation of precepts.' },
  { s:'《根本說一切有部毗奈耶》', t:'勤修清淨戒，以求解脫處。', r:'持戒是為了建立內心的秩序，從而獲得真正的自由。', trip:'律', div:'5尼陀那', se:'Mulasarvastivada Vinaya', te:'Practice the precepts to find the place of liberation.', re:'Precepts are established to create inner order, which leads to true freedom.' },
  { s:'《五分律》', t:'若不持戒，雖在山中，亦非修行。', r:'修行不在於地點，而在於對自我的規範。', trip:'律', div:'5尼陀那', se:'Five-Part Vinaya', te:'Without precepts, even in mountains, one is not practicing.', re:'Spiritual practice is not about where you are, but how you discipline yourself.' },
  { s:'《大比丘三千威儀》', t:'行步當視地，無傷微命。', r:'在日常細微處培養慈悲心，尊重所有生命。', trip:'律', div:'4優陀那', se:'Great Bhikshu Precepts', te:'Walk with care to avoid harming small lives.', re:'Cultivate compassion in the smallest details of life by respecting all living beings.' },

  // --- 論藏 (Abhidharma) ---
  { s:'龍樹菩薩《中論》', t:'因緣所生法，我說即是空，亦為是假名，亦是中道義。', r:'世間萬物皆依因緣而生，沒有獨立永恆的實體。', trip:'論', div:'10優婆提舍', se:'Madhyamaka-sastra', te:'Dependent origination is emptiness, a mere label, the Middle Way.', re:'Everything arises through conditions; nothing possesses an independent, eternal self.' },
  { s:'彌勒菩薩《瑜伽師地論》', t:'一切唯識，萬法唯心。', r:'所有的感知皆是心識的顯現，外境不離內心。', trip:'論', div:'10優婆提舍', se:'Yogacarabhumi-sastra', te:'Everything is representation-only; all is mind.', re:'All perceptions are manifestations of consciousness; the external world does not exist apart from the mind.' },
  { s:'馬鳴菩薩《大乘起信論》', t:'一心二門：心真如門，心生滅門。', r:'心既是永恆的真理，也是瞬息萬變的現象。', trip:'論', div:'10優婆提舍', se:'Awakening of Faith in Mahayana', te:'One mind, two aspects: Thusness and arising-ceasing.', re:'The mind is both the eternal truth and the constantly changing phenomena.' },
  { s:'僧璨禪師《信心銘》', t:'至道無難，唯嫌揀擇。', r:'通往真理的路並不艱難，難在於我們總是帶著好惡去挑選。', trip:'論', div:'3伽陀', se:'Inscribed on the Believing Mind', te:'The Great Way is not difficult for those who have no preferences.', re:'The path to truth is not arduous; the difficulty lies in our constant choosing based on likes and dislikes.' },
  { s:'馬祖道一禪師', t:'平常心是道。', r:'真理不在玄妙處，就在日常的喝茶、吃飯、睡眠之中。', trip:'論', div:'10優婆提舍', se:'Zen Master Mazu Daoyi', te:'Ordinary mind is the Way.', re:'Truth is not found in the mysterious, but in the ordinary acts of daily life.' },
  { s:'黃檗希運禪師', t:'無心是道。', r:'放下分別執著，讓心回歸無事的本然。', trip:'論', div:'10優婆提舍', se:'Zen Master Huangbo Xiyun', te:'Non-mind is the Way.', re:'Let go of discriminatory attachment and return to the mind\'s original, unburdened state.' },
  { s:'臨濟義玄禪師', t:'隨處作主，立處皆真。', r:'做自己的主人，則任何地方都是真實的道場。', trip:'論', div:'10優婆提舍', se:'Zen Master Linji Yixuan', te:'Be the master everywhere, then truth is where you stand.', re:'If you can remain master of yourself, every place becomes a place of truth.' },
  { s:'百丈懷海禪師', t:'一日不作，一日不食。', r:'修行與生活不二，勞動亦是悟道的契機。', trip:'論', div:'10優婆提舍', se:'Zen Master Baizhang Huaihai', te:'A day without work is a day without food.', re:'Spiritual practice and daily life are one; labor is an opportunity for realization.' },
  { s:'趙州從諗禪師', t:'吃茶去。', r:'不要在文字上糾纏，回到當下的體會。', trip:'論', div:'10優婆提舍', se:'Zen Master Zhao Zhou', te:'Go drink some tea.', re:'Do not get entangled in words; return to the direct experience of the present moment.' },
  { s:'龐蘊居士', t:'好事不如無。', r:'即使是善行，生出執著心亦是負擔。', trip:'論', div:'10優婆提舍', se:'Layman Pang', te:'Better than a good thing is nothing.', re:'Even good deeds become a burden if the mind clings to them.' },
  { s:'永嘉玄覺禪師', t:'夢裡明明有六趣，覺後空空無大千。', r:'醒後方知夢是空，覺後方知世如夢。', trip:'論', div:'3伽陀', se:'Zen Master Yongjia Xuanjue', te:'The dream is clear until you wake; then all is empty.', re:'Upon waking, one knows the dream was empty; upon awakening, one knows the world is like a dream.' },
  { s:'寒山詩', t:'吾心似秋月，碧潭清皎潔。', r:'修行者的心境應如秋月般明徹無染。', trip:'論', div:'3伽陀', se:'Poetry of Hanshan', te:'My mind is like the autumn moon, bright and pure.', re:'A practitioner\'s mind should be like the autumn moon—pure and reflected without defilement.' },
  { s:'雲門文偃禪師', t:'日日是好日。', r:'以覺醒之心面對順逆，則天天皆是良辰。', trip:'論', div:'10優婆提舍', se:'Zen Master Yunmen Wenyan', te:'Every day is a good day.', re:'If faced with an awakened mind, every single day is the perfect time for practice.' },
  { s:'洞山良价禪師', t:'如是之法，佛祖密付；汝今得之，宜善保護。', r:'得到的洞見需要在生活中細心護持。', trip:'論', div:'3伽陀', se:'Zen Master Dongshan Liangjie', te:'This teaching is a secret gift; guard it well.', re:'After receiving insight, one must carefully protect it in the midst of daily life.' },
  { s:'蘇東坡', t:'溪聲便是廣長舌，山色豈非清淨身。', r:'大自然的一切景觀，皆在訴說著真理。', trip:'論', div:'10優婆提舍', se:'Su Dongpo', te:'The creek sound is Buddha\'s voice; the mountains his pure body.', re:'All the sights and sounds of nature are proclaiming the ultimate truth.' },
  { s:'《信心銘》', t:'唯嫌揀擇。', r:'道就在眼前，難在我們總是帶著偏見去挑選。', trip:'論', div:'3伽陀', se:'Inscribed on the Believing Mind', te:'The Way reveals itself when choosing based on preference stops.', re:'The only difficulty is our constant selecting based on likes and dislikes.' }
];

async function getDharmaForDate(iso) {
  // 取得近期歷史避重 (20天)
  const recentSourcesRows = await query(`
    SELECT source, text FROM dharma_history 
    WHERE date < ? AND date >= date(?, '-20 days')
  `, [iso, iso]);
  const recentSources = new Set(recentSourcesRows.map(r => r.source));  const recentTexts = new Set(recentSourcesRows.map(r => r.text));

  // 1. 生成日期哈希作為基礎種子
  const hash = crypto.createHash('sha256').update(iso + 'buddhist-structure-salt-2026').digest('hex');
  const mainSeed = parseInt(hash.substring(0, 8), 16);

  // 2. 抽「藏」: 經(0), 律(1), 論(2)
  const tripitakaList = ['經', '律', '論'];
  
  for (let offset = 0; offset < 100; offset++) {
    const currentSeed = mainSeed + offset;
    const tripIndex = currentSeed % 3;
    const targetTrip = tripitakaList[tripIndex];

    const tripPool = dharmaPool.filter(p => p.trip === targetTrip);
    if (tripPool.length === 0) continue;

    const dharmaIndex = (currentSeed >> 2) % tripPool.length;
    const candidate = tripPool[dharmaIndex];

    if (!recentSources.has(candidate.s) && !recentTexts.has(candidate.t)) {
      return candidate;
    }
  }
  return dharmaPool[mainSeed % dharmaPool.length];
}

async function autoRecordToday() {
  const today = new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Kuala_Lumpur'});
  const dharma = await getDharmaForDate(today);
  try {
    query(`
      INSERT INTO dharma_history (date, source, text, reflection, tripitaka, division) 
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        source = excluded.source, text = excluded.text,
        reflection = excluded.reflection, tripitaka = excluded.tripitaka, division = excluded.division
    `, [today, dharma.s, dharma.t, dharma.r, dharma.trip, dharma.div]);
    
    query(`
      INSERT INTO dharma_en (source, source_en, text_en, reflection_en)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        source_en = excluded.source_en, text_en = excluded.text_en, reflection_en = excluded.reflection_en
    `, [dharma.s, dharma.se, dharma.te, dharma.re]);
    console.log('[cron] Structured Daily Dharma recorded: ' + today);
  } catch(e) { console.error('[cron] Error:', e.message); }
}

// ── API HANDLERS ──
async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  if (pathname === '/api/health') return sendJson(res, 200, { status:'ok', app:APP, version:VERSION, authRequired:!!APP_PASSWORD });

  if (pathname === '/api/auth/login' && method === 'POST') {
    const { password } = await readBody(req);
    if (password === APP_PASSWORD) return sendJson(res, 200, { token: APP_PASSWORD });
    return sendJson(res, 401, { error: 'Invalid password' });
  }

  if (pathname.startsWith('/api/dharma/history')) {
    if (method === 'GET') {
      const parts = pathname.split('/');
      const dateParam = parts[parts.length - 1];
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        const row = query("SELECT * FROM dharma_history WHERE date = ?", [dateParam])[0];
        return sendJson(res, row ? 200 : 404, row || { error: 'Not found' });
      }
      return sendJson(res, 200, query("SELECT * FROM dharma_history ORDER BY date DESC"));
    }
    if (method === 'POST') {
      const { date, source, text, reflection } = await readBody(req);
      query("INSERT OR IGNORE INTO dharma_history (date, source, text, reflection) VALUES (?, ?, ?, ?)", [date, source, text, reflection]);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (pathname === '/api/dharma/en') {
    const src = url.searchParams.get('source');
    const rows = src ? query("SELECT * FROM dharma_en WHERE source = ?", [src]) : query("SELECT * FROM dharma_en ORDER BY created_at DESC");
    return sendJson(res, 200, rows);
  }

  if (pathname === '/api/essays' || pathname === '/api/mantras') {
    const type = pathname.includes('mantras') ? 'mantra' : 'essay';
    const src = url.searchParams.get('dharma_source');
    let rows;
    if (src) rows = query("SELECT * FROM essays WHERE type = ? AND dharma_source = ? ORDER BY created_at DESC", [type, src]);
    else rows = query("SELECT * FROM essays WHERE type = ? ORDER BY created_at DESC", [type]);
    return sendJson(res, 200, rows);
  }

  if (pathname.startsWith('/api/essays/') && (method === 'GET' || method === 'PUT' || method === 'DELETE')) {
    const id = pathname.split('/').pop();
    if (method === 'GET') return sendJson(res, 200, query("SELECT * FROM essays WHERE id = ?", [id])[0]);
    if (!requireAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    if (method === 'DELETE') { query("DELETE FROM essays WHERE id = ?", [id]); return sendJson(res, 200, { ok: true }); }
    const { title, tag, content, dharma_source } = await readBody(req);
    query("UPDATE essays SET title=?, tag=?, content=?, dharma_source=? WHERE id=?", [title, tag, content, dharma_source, id]);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/essays' && method === 'POST') {
    if (!requireAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const { title, tag, content, dharma_source } = await readBody(req);
    query("INSERT INTO essays (title, tag, content, dharma_source, type) VALUES (?, ?, ?, ?, 'essay')", [title, tag, content, dharma_source]);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/mantras' && method === 'POST') {
    if (!requireAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const { title, tag, content } = await readBody(req);
    query("INSERT INTO essays (title, tag, content, type) VALUES (?, ?, ?, 'mantra')", [title, tag, content]);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/gallery') {
    if (method === 'GET') return sendJson(res, 200, query("SELECT * FROM gallery ORDER BY created_at DESC"));
    if (!requireAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    const { title, caption, image_url } = await readBody(req);
    query("INSERT INTO gallery (title, caption, image_url) VALUES (?, ?, ?)", [title, caption, image_url]);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith('/api/gallery/') && method === 'DELETE') {
    if (!requireAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });
    query("DELETE FROM gallery WHERE id = ?", [pathname.split('/').pop()]);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Not found' });
}

autoRecordToday();
setInterval(autoRecordToday, 60000);
initDb();

http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS' });
    return res.end();
  }
  if (pathname.startsWith('/api/')) return handleApi(req, res).catch(e => { console.error(e); sendJson(res, 500, {error:'Server error'}); });
  const filePath = path.join(ROOT, pathname);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, 'index.html'), (fErr, fData) => {
        if (fErr) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fData);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }); res.end(data);
  });
}).listen(PORT, () => console.log(`${APP} v${VERSION} on port ${PORT}`));
