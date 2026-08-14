# 佛咒（Mantra）功能施工簡報 — 給 AI Coder

> 對象：接手施工「佛咒」按鈕功能的 AI coder
> 基準版本：v3.18.1 (build 80) · 撰寫日 2026-08-14
> 專案根目錄（MBA，唯一真實來源）：`~/Documents/Buddhist-footprints/`

**動工前請完整讀完本文件。**本專案有數個「看起來像 bug，其實是慣例」與「看起來能動，其實會靜默失敗」的地方，寫在第 6、8、10 節。

---

## 1. 一頁速覽

| 項目 | 值 |
|---|---|
| 網站 | 佛法足跡 Buddhist Footprints — https://buddhist.visadelab.xyz |
| Stack | **零依賴**：Node 原生 `http` + `node:sqlite`（Node ≥ 22.5）；前端是**單一 `index.html`**，無框架、無 build step |
| 執行埠 | 3004 |
| 部署 | MBA 開發 → `./deploy.sh` → rsync 到 MBP `~/buddhist-footprints-dist` → PM2 app 名稱 `buddhist` |
| DB | dev：repo 內 `buddhist.db`；prod：`~/db/buddhist-footprints/buddhist.db`（由 `NODE_ENV=production` 切換） |
| 語音檔 | prod：`~/db/buddhist-footprints/audio/<essayId>.mp3`；dev：repo 內 `audio/`（已 gitignore） |
| 管理員 | 密碼在 `.env` 的 `APP_PASSWORD`；前端**雙擊 / 長按 Logo** 才會出現登入入口 |
| 版本規範 | SemVer `MAJOR.MINOR.PATCH` + build（= git commit 數），由 `deploy.sh` 自動 bump 並寫回三處 |

> ⚠️ `~/Documents/CLAUDE.md` 舊表格寫 buddhist 用 Supabase — **已過時**，實際是 `node:sqlite`。
> ⚠️ `MAINTENANCE.md` 第 1 節的「minor 到 20 就進位」也**已作廢**，現行是 SemVer。以本文件為準。

---

## 2. 檔案地圖

```
Buddhist-footprints/
├── server.js        (~40KB) 路由 + 每日佛典抽樣池 + DeepSeek 翻譯 + 靜態檔
├── db.js            schema、欄位遷移（ALTER TABLE 慣例）、seed
├── tts.js           零依賴 Edge TTS（WebSocket 直連），產生 MP3 + 段落時間軸
├── index.html       (~65KB) 全部前端：CSS + HTML + JS 都在這一檔
├── deploy.sh        版本 bump → git commit/tag → rsync → PM2 restart → health check → DB 備份回抓
├── docs/            ← 本文件
└── MAINTENANCE.md   舊維護筆記（版本規範一節已作廢）
```

**沒有 build step、沒有 TypeScript、沒有 npm 套件。**不要引入任何 dependency，不要拆檔案成 modules，不要加打包工具。維持單檔前端是這個專案的既定風格。

---

## 3. 資料模型（佛咒與文章共用一張表）

`essays` 表以 `type` 欄位區分：`'essay'`（佛法心得）/ `'mantra'`（佛咒）。

```sql
essays(
  id TEXT PK (hex random),
  title TEXT NOT NULL,
  tag TEXT,
  content TEXT NOT NULL,        -- Markdown（前端有簡易 renderMarkdown + KaTeX）
  dharma_source TEXT,           -- 關聯到每日佛典的來源字串（佛咒目前不用）
  type TEXT NOT NULL DEFAULT 'essay',
  created_at TEXT,
  -- 語音（essay 現用，mantra 可直接沿用）
  audio_status TEXT,            -- null | pending | ready | error
  audio_duration REAL,          -- 秒
  audio_timings TEXT,           -- JSON [{i:段落index(-1=標題), t:起始秒}]
  audio_voice TEXT,
  -- 英文版
  title_en TEXT, content_en TEXT, translate_status TEXT
)
```

**要加欄位就照 `db.js` 既有慣例做**（[db.js:89-105](../db.js)）：讀 `PRAGMA table_info`，缺的才 `ALTER TABLE ADD COLUMN`。這個模式讓 prod 既有資料庫能無痛升級 —— **絕不可** drop / rebuild 表，prod DB 裡有 Gary 累積的真實內容。

現況：**`type='mantra'` 的資料筆數 = 0**，佛咒是一塊乾淨的地。

---

## 4. 現有 API（`server.js`）

| Method | Path | 權限 | 說明 |
|---|---|---|---|
| GET | `/api/health` | 公開 | `{status, app, version, build, authRequired}` — portal 聚合用，**格式不可變** |
| POST | `/api/auth/login` | 公開 | body `{password}`，回 token（其實就是密碼字串） |
| GET | `/api/mantras` | 公開 | `SELECT * FROM essays WHERE type='mantra'` |
| POST | `/api/mantras` | 需 auth | 新增佛咒（**目前前端沒呼叫它 — 見第 6 節**） |
| GET | `/api/essays` | 公開 | 同上但 `type='essay'` |
| GET/PUT/DELETE | `/api/essays/:id` | GET 公開，其餘需 auth | 單筆讀寫刪（佛咒也走這條） |
| POST/DELETE | `/api/essays/:id/audio` | 需 auth | 產生 / 刪除語音 |
| GET | `/api/essays/:id/audio.mp3` | 公開 | 串流 MP3，**支援 Range**（可 seek）；`?download=1` 下載 |
| POST | `/api/essays/:id/translate` | 公開 | 訪客觸發 DeepSeek 英譯，非同步 |
| GET/POST | `/api/dharma/history`, `/api/dharma/en`, `/api/gallery` | — | 每日佛典 / 圖集 |

驗證方式極簡：`Authorization: Bearer <APP_PASSWORD>`，見 `requireAuth()`（[server.js:66-71](../server.js)）。新增需寫入的端點**一定要**先 `if (!requireAuth(req)) return sendJson(res, 401, ...)`。

---

## 5. 佛咒現況（前端）

佛咒目前只有「文章列表」的最陽春複製版，全部在 `index.html`：

| 位置 | 內容 |
|---|---|
| `index.html:366` | 導覽列按鈕 `<button class="nav-btn" onclick="showPage('mantras',this)">佛咒</button>` |
| `index.html:398` | 頁面容器 `<div class="page" id="page-mantras"><div id="mantraContent"></div></div>`（**沒有 page-hero**，其他頁有） |
| `index.html:884` | `renderMantraList()` — 卡片列表，admin 才看得到「＋ 新增佛咒」 |
| `index.html:890` | `showMantraPageDetail(id)` — 詳情頁：標題 + Markdown 內文 + 分享 + admin 編輯/刪除 |
| `index.html:910-912` | `openMantraEditor()` / `editMantra()` / `deleteMantra()` |
| `index.html:928` | `showPage()` 分派 |
| `index.html:968, 981` | hash 路由：`#mantras`（列表）、`#mantra/<id>`（詳情） |

**分享網址規則**：`#mantras` 與 `#mantra/<id>` 是對外可分享的固定網址，`routeFromHash()` 負責還原。新增子頁一律沿用這個 hash 慣例，不要引入 History API 的 path 路由（伺服器是 SPA fallback，但慣例是 hash）。

---

## 6. 已知缺陷（施工時必須順手修掉）

1. **新增佛咒會被存成「佛法心得」** — `openMantraEditor()` 設了 `_editingType='mantra'`，但 `saveEssay()`（[index.html:870](../index.html)）永遠打 `POST /api/essays`，後端硬寫 `type='essay'`。結果：新佛咒跑到佛法心得頁。`POST /api/mantras` 端點存在卻沒人呼叫。
   → 修法：`saveEssay()` 依 `_editingType` 決定 endpoint；並讓 `POST /api/mantras` 回傳 `RETURNING id`（目前沒回 id，前端拿不到新建 id）。
2. **`openMantraEditor()` 沒清空 `essayTagInput` 與 `essayDharmaSource`** — 先開文章編輯器再開佛咒編輯器，會把上一筆的 tag / dharma_source 帶進佛咒。
3. **佛咒列表卡片沒有日期／標籤／語音 badge**，與佛法心得列表視覺不一致。
4. **佛咒詳情頁沒有語音區塊**（`renderAudioSection()` / `apBindPlayer()` 沒被呼叫），也沒有 `apCleanup()`；`showPage()` 進佛咒頁時雖有 cleanup，但 `renderMantraList()` 內部沒有。

---

## 7. 可直接複用的資產（**先找再造**）

| 需求 | 已有的東西 | 位置 |
|---|---|---|
| 產生語音 MP3 | `queueEssayAudio(id)`（非同步佇列，重啟會續跑 pending） | `tts.js:144`；預設音色 `zh-TW-YunJheNeural`（男聲） |
| 播放器 UI | `renderAudioSection(e)` + `apBindPlayer(e)`：播放/暫停、±15 秒、0.8–1.5× 變速、進度條 seek、下載、段落同步反白、點段落續播 | `index.html:655-782` |
| Markdown + 數學 | `renderMarkdown()` / `initMathRendering()` | `index.html:448-473` |
| 分享 | `shareUrl('#mantra/<id>')`（navigator.share，退回複製連結） | `index.html:944` |
| 提示訊息 | `showToast(msg)` | `index.html:939` |
| Modal | `openModal/closeModal`，Esc 關閉已統一在檔尾 keydown handler | `index.html:510` |
| 管理員判斷 | 全域 `isAdmin`；API 呼叫用 `apiGet/apiPost/apiPut/apiDelete`（自動帶 Bearer） | `index.html:474-485` |
| 視覺 token | CSS 變數 `--gold #b8952a` / `--gold-lt` / `--gold-pale` / `--verm`；標題字型 Cinzel + Noto Serif TC | `index.html:13-30` |

**語音段落切分 `splitBlocks()` 前後端各有一份（`tts.js:137` 與 `index.html:642`），必須逐字一致**，否則播放時的段落反白會錯位。改一邊就要改另一邊。

**鍵盤導覽是本系統最高原則**：新做的任何介面，上下左右 + Enter + ESC 一開始就要能用（Esc 已有全域處理：先關 lightbox → 再關 modal → 再退回列表，新增的層要接進這個順序）。

---

## 8. 施工規約

1. **零依賴**：不得 `npm install` 任何東西。需要什麼就用 Node 內建（`node:sqlite`、內建 `WebSocket`、`crypto`）。
2. **單檔前端**：改 `index.html` 本體，不要新增 `.js` / `.css` 檔。
3. **不要改 `/api/health` 的回傳格式**（portal 靠它聚合版本）。
4. **不要碰 prod DB 的既有資料**；schema 只能用 `ALTER TABLE ADD COLUMN` 增量遷移。
5. **不要 commit 秘密與 DB**：`.env`、`*.db*`、`audio/` 已在 `.gitignore`，保持原樣。
6. **部署一律 `./deploy.sh`**，不要手動 rsync。commit message 用 `feat:` 會自動 bump minor，其餘 patch。Gary 的慣例是**改完直接 deploy，不必每次問**。
7. **版本號三處連動**由 deploy.sh 自動處理（`package.json` / `server.js` 的 `const VERSION`、`const BUILD` / `index.html` 的 `#versionBadge`）—— 不要手改，但**改動 `index.html` 的 version badge 那行結構時要小心**，deploy.sh 用 perl 正規式比對。

---

## 9. 驗收步驟

```bash
cd ~/Documents/Buddhist-footprints && node server.js
```

1. 開 `http://localhost:3004`，走完：佛咒列表 → 詳情 → 分享連結重新載入（`#mantra/<id>` 要能直接還原畫面）。
2. 雙擊 Logo 登入管理員（密碼見 `.env`），新增一筆佛咒 → **確認它出現在佛咒頁而不是佛法心得頁**（`curl -s localhost:3004/api/mantras | head`）。
3. 若動到語音：確認 `audio_status` 從 `pending` 走到 `ready`，MP3 可播放且可 seek（Range）。
4. `curl -s localhost:3004/api/health` 應回 `{status:'ok', app:'buddhist-footprints', version, build}`。
5. 部署後再驗一次線上 health，並**強制重新整理**（見第 10 節快取）。

自動化測不出來就直接跟 Gary 說並照樣 deploy，不要卡在測試工具上耗時間 —— 他寧可自己測。

---

## 10. 陷阱清單

- **Cloudflare 快取**：deploy 後「看起來沒變」十之八九是快取。zone 已設 Respect Existing Headers；先 hard reload / 換無痕視窗再懷疑程式碼。
- **`deploy.sh` 不會因前端錯誤中止**（沒有 build step，語法錯誤只有瀏覽器 console 看得到）—— 本地一定要先在瀏覽器跑過。
- **SQLite WAL**：dev 的 `buddhist.db-wal` 可能藏著尚未 checkpoint 的資料；用 `db.js` 的 `query()` 讀，不要直接開檔案硬解。
- **DB 路徑會依 `NODE_ENV` 切換**：本地測試不會動到 prod 資料，但**在 MBP 上跑腳本時要小心**。
- **Edge TTS 401/403**：Microsoft 換 token 了。對照 `uvx edge-tts` 的 `constants.py`（`TRUSTED_CLIENT_TOKEN`、`SEC_MS_GEC_VERSION`）更新 `tts.js` 頂部常數。
- **MBP 連不到**：不在同網路時用 `REMOTE_HOST=100.85.142.38 ./deploy.sh`（Tailscale）。
- **prod DB 備份**：MBP 每天 0:05 備份，deploy 時自動同步回 MBA `~/Documents/.db-backups/buddhist-footprints/`。動 schema 前先確認最近一份備份存在。

---

## 11. 本次施工需求（Gary 已定案 2026-08-14）

> 範圍由 Gary 指定，AI coder **不得自行擴張或縮減**。有疑問先問，不要自己發明功能。

### 一句話規格

**佛咒 = 佛法心得的 95% 複製，只是歸類不同。唯一的新功能是「管理員可上傳 MP3」，讓訪客聽到咒的念法。**

### A. 照抄「佛法心得」的部分（佔工作量 8 成）

佛咒頁要具備佛法心得**現有的全部功能**，一項不少：

| 功能 | 現有實作 | 佛咒要求 |
|---|---|---|
| 列表卡片（日期 / 標籤 / 🎧 時長 badge / 摘要） | `renderEssayList()` [index.html:632](../index.html) | 一模一樣 |
| 詳情頁（日期、標題、分隔線、Markdown 內文、KaTeX） | `showEssayPageDetail()` [index.html:784](../index.html) | 一模一樣 |
| 語音播放器（播放/暫停、±15 秒、0.8–1.5×、進度條 seek、下載 MP3、段落同步反白、點段落續播） | `renderAudioSection()` + `apBindPlayer()` | 一模一樣（**段落反白在上傳 MP3 時自動失效，屬正常降級**，見 B-6） |
| Edge TTS 產生語音（編輯器勾選「發布後自動產生語音」、admin 重新產生 / 刪除語音） | `queueEssayAudio()` + `apAdminButtons()` | 一模一樣（現在佛咒編輯器把這區塊 `display:none` 藏起來了，要打開） |
| EN 英文版切換（有英文版直接切；沒有則按 EN 觸發 DeepSeek 即時翻譯並存檔） | `toggleEssayLang()` / `requestEssayTranslation()` / `POST /api/essays/:id/translate` | 一模一樣 |
| 分享連結、admin 編輯 / 刪除、未存檔離開確認、Esc 返回 | 既有 | 一模一樣 |

**施工方式（重要指令）：把既有函式參數化，不要複製貼上第二份。**

- `renderEssayList()`、`showEssayPageDetail()`、`openEssayEditor()`、`saveEssay()`、`toggleEssayLang()` 等一律加上 `type`（`'essay' | 'mantra'`）參數，內部以 type 決定：API 路徑、容器 id（`essayContent` / `mantraContent`）、hash 前綴（`#essay/` / `#mantra/`）、按鈕文案（「＋ 新增心得」/「＋ 新增佛咒」）。
- 現有的 `renderMantraList()` / `showMantraPageDetail()` / `openMantraEditor()` / `editMantra()` / `deleteMantra()` **保留為薄 wrapper**（一行轉呼叫），因為 `showPage()`、`routeFromHash()` 和一堆 inline `onclick` 都在用這些名字。
- 後端幾乎不用動：`GET /api/mantras` 已存在；`/api/essays/:id` 的 GET/PUT/DELETE、`/audio`、`/translate` 全都與 type 無關，佛咒直接共用。只要修好 `POST /api/mantras`（見第 6 節缺陷 1，並補 `RETURNING id`）。
- 佛咒頁目前沒有 page-hero（其他頁都有），請補一個同風格的（英文小標 `MANTRA`／中文標題「佛咒」／`☸` 裝飾），與佛法心得頁一致。

### B. 唯一的新功能：上傳 MP3

Gary 要能上傳現成的唸誦音檔（例如師父唸咒的錄音），而不是只能用 Edge TTS 合成。

1. **新增 API**：`POST /api/essays/:id/audio/upload`，需 `requireAuth`。
   - Body 直接吃 **raw binary**（`Content-Type: audio/mpeg`），不要 base64、不要 multipart —— 專案零依賴，沒有 multer，base64 進 DB 更不可取。
   - 另寫一個 `readRawBody(req, maxBytes)`（現有 `readBody()` 是 JSON 專用，且**沒有大小上限**）。上限訂 **30 MB**，超過回 413。
   - 驗證 magic bytes：開頭 `ID3` 或 `0xFF` + (`0xFB`/`0xF3`/`0xF2`)；不符回 400。
   - 時長由前端量好，用 query string `?duration=<秒>` 帶上（後端零依賴解不了 MP3 時長）。
2. **寫檔**：覆寫 `audioFilePath(id)`（即 `~/db/buddhist-footprints/audio/<id>.mp3`，dev 為 repo 內 `audio/`），沿用 `tts.js` 匯出的 `audioFilePath`，不要自己組路徑。
3. **DB 更新**：`audio_status='ready'`、`audio_duration=<前端量的秒數>`、`audio_timings=NULL`、`audio_voice=NULL`、`audio_source='upload'`、`audio_updated_at=<ISO 時間>`。
4. **新增兩個欄位**（照 `db.js` 既有 `ALTER TABLE ADD COLUMN` 慣例，不可 rebuild 表）：
   - `audio_source TEXT` — `'tts' | 'upload'`；`tts.js` 產生成功時要寫入 `'tts'`。
   - `audio_updated_at TEXT` — 給快取破壞用（見第 6 點）。
5. **前端 UI**：詳情頁的 admin 按鈕列（`apAdminButtons()`）加一顆「⬆ 上傳 MP3」，觸發隱藏的 `<input type="file" accept="audio/mpeg,.mp3">`。
   - 上傳前先用 `new Audio(URL.createObjectURL(file))` 等 `loadedmetadata` 讀 `duration`，連同檔案一起送（`fetch(url, {method:'POST', body:file, headers:{'Content-Type':'audio/mpeg','Authorization':'Bearer '+token}})`）。
   - 上傳中顯示進度或至少 disable 按鈕 + `showToast()`；完成後重新 render 詳情頁。
   - **若該篇已有 `audio_source='upload'` 的檔案，按「🎧 重新產生語音」(TTS) 前要二次確認**，避免辛苦上傳的唸誦被合成語音蓋掉。
6. **快取破壞（必做，否則換檔後聽到舊的）**：`serveAudio()` 送出 `Cache-Control: public, max-age=3600`，同一個 id 覆蓋新檔後瀏覽器與 Cloudflare 都會餵舊檔。播放器與下載連結的 src 一律改成 `/api/essays/${id}/audio.mp3?v=${encodeURIComponent(e.audio_updated_at||'')}`。
7. **段落反白降級**：上傳的 MP3 沒有 `audio_timings`。已確認 `apBindPlayer()` 在 timings 為空時會安全降級（不反白、段落不可點），**不用特別處理，但不要為此改壞既有 TTS 路徑**。播放器標題文案「🎧 聆聽全文」在佛咒頁請改為「🎧 聆聽咒音」。
8. **刪除語音**：`DELETE /api/essays/:id/audio` 要一併清掉 `audio_source`、`audio_updated_at`。

> 上傳的 MP3 存在 `~/db/buddhist-footprints/audio/`，`deploy.sh` 的 rsync 已 `--exclude='audio/'`，**部署不會刪掉音檔**，這點無需處理。

### C. 明確不做的事

- ❌ 不做循環播放、唸誦計數器、計時器。
- ❌ 不做羅馬轉寫、功德說明、出處等佛咒專屬欄位 —— 欄位與佛法心得完全相同（標題／標籤／內文）。
- ❌ 不做分類、置頂、搜尋。排序照佛法心得（`created_at DESC`）。
- ❌ 不引入任何 npm 套件、不拆檔、不加 build step。

### D. 施工順序與驗收增補

1. 先修第 6 節的四個既有缺陷（尤其缺陷 1：新增佛咒會存成文章），單獨 commit。
2. 再做 A 的參數化重構，確認佛法心得**完全沒有 regression**（列表 / 詳情 / 語音 / EN / 編輯 / 刪除逐項走一遍）—— 這是重構最大的風險點。
3. 最後做 B 的 MP3 上傳。

驗收（接在第 9 節之後）：

- [ ] 新增佛咒 → 出現在佛咒頁，`curl -s localhost:3004/api/mantras` 看得到，佛法心得頁**沒有**它。
- [ ] 佛咒勾選「產生語音」→ `audio_status` 由 pending 到 ready，播放器可播、可 seek、段落會反白。
- [ ] 佛咒上傳 MP3 → 立即可播；重新整理後**聽到的是新檔不是舊檔**（快取破壞有效）。
- [ ] 已上傳 MP3 的佛咒按 TTS 重新產生 → 有二次確認。
- [ ] 佛咒按 EN → 觸發翻譯並可切換語言。
- [ ] 分享 `#mantra/<id>` 貼到新分頁 → 直接還原到該篇詳情。
- [ ] 佛法心得所有既有功能不變。
- [ ] `curl -s localhost:3004/api/health` 正常。
