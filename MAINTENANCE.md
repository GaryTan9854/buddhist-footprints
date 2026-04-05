# Buddhist Footprints 專案維護手冊 (v2.0)

## 1. 版本控制規範 (Versioning)
- **格式**：採用 `major.minor` 格式（例：v1.20, v2.0）。
- **進位規則**：當 `minor` 達到 **20** 時，下一版本強制進位至 `major + 1.0`。
- **連動機制**：執行 `./deploy.sh` 會自動同步以下三處的版本號：
  1. `package.json` 的 `version` 欄位。
  2. `server.js` 中的 `const VERSION` 變數（影響 API Health Check）。
  3. `index.html` 中的 `<span class="site-version" id="versionBadge">` 標籤。

## 2. 佛典隨機選取邏輯 (Dharma Logic)
- **架構**：採用「三藏 × 十二部」分層抽樣。
  - **三藏**：經、律、論。
  - **十二部**：修多羅、祇夜、伽陀等形式。
- **演算法**：
  - 以「當天日期」為 SHA-256 哈希種子，進行非線性隨機跳轉。
  - **近期避重**：自動檢查過去 **20 天** 的歷史紀錄，確保短期內不出現重複內容。
- **更新時間**：伺服器每分鐘檢查一次日期，確保午夜精準更新。

## 3. 資料安全與備份 (Backup)
- **MBP 伺服器端**：每天 0:05 執行 `/Users/gary/db/buddhist-footprints/backup_script.sh`，保留最近 **5 份** 帶日期的 `.db` 備份。
- **MBA 本地端**：每次執行 `./deploy.sh` 時，會自動將 MBP 上的整個 `backups/` 資料夾同步回本地 `/Users/user/Documents/.db-backups/buddhist-footprints/`。
- **Git 安全**：`.gitignore` 已嚴格排除所有 `*.db` 檔案，確保數據不會上傳至 GitHub。

## 4. 部署標準程序
- 始終使用 `./deploy.sh` 進行部署。
- 若需更新 `APP_PASSWORD`，請修改本地 `.env` 檔案後再次部署。
