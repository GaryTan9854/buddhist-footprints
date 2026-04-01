# Buddhist Footprints 維護指南 (Maintenance Guide)

本文件記錄專案的部署、資料庫同步規範及常見錯誤排除，旨在確保 MBA (開發機) 與 MBP (生產機) 之間的資料一致性。

## 1. 資料庫同步三大金律 (Database Sync Rules)

### ⚠️ 規則一：同步前必先確認檔案大小 (Validate Size)
*   **風險：** 誤將 MBA 本機剛初始化 (約 60KB) 的空資料庫覆蓋 MBP 上累積的正式資料庫 (約 12MB+)。
*   **規範：** 在執行 `scp` 或 `rsync` 覆蓋 MBP 資料庫前，必須確認 `.db` 檔案大小符合預期。
*   **檢查指令：** `ls -lh buddhist.db`

### ⚠️ 規則二：停機再傳輸 (Stop before Upload)
*   **風險：** SQLite 在 WAL 模式下會有 `.db-shm` 與 `.db-wal` 暫存檔。若在程式運行中直接覆蓋 `.db`，會造成 `database disk image is malformed` 損毀。
*   **正確手動同步流程：**
    1.  `ssh mbp "pm2 stop buddhist"` (停止服務)
    2.  `ssh mbp "rm -f ~/db/buddhist-footprints/buddhist.db*"` (刪除舊檔及所有暫存檔)
    3.  `scp buddhist.db mbp:~/db/buddhist-footprints/` (上傳新檔)
    4.  `ssh mbp "pm2 start buddhist"` (重啟服務)

### ⚠️ 規則三：操作前必先備份 (Backup First)
*   **風險：** 任何資料庫寫入操作（如批次翻譯更新）若發生邏輯錯誤，可能導致資料遺失。
*   **規範：** 執行 `deploy.sh` 會自動將 MBP 資料拉回 MBA 備份目錄。
*   **備份路徑：** `/Users/user/Documents/.db-backups/buddhist-footprints/`

---

## 2. 常見錯誤排除 (Troubleshooting)

### Q: 網頁顯示 502 Bad Gateway 或 PM2 狀態為 `errored`
*   **原因：** 通常是資料庫損毀導致程式無法啟動。
*   **檢查：** 執行 `ssh mbp "pm2 logs buddhist"` 查看是否有 `ERR_SQLITE_ERROR: database disk image is malformed`。
*   **修復：** 依據「規則二」重新上傳健康的資料庫檔案。

### Q: 發現佛法心得或圖集消失
*   **原因：** 誤用了初始化的空資料庫覆蓋了正式資料庫。
*   **修復：** 從 `.db-backups` 目錄找回大小正確的 `buddhist.db`，並重新執行同步。

---

## 3. 部署流程 (Deployment Flow)
建議統一套用 `./deploy.sh` 進行部署，該腳本已包含：
1. 版本號自動遞增 (v1.x)。
2. UI 版本標記更新。
3. Git Commit & Push。
4. 程式碼同步 (不包含 DB，避免誤蓋)。
5. 從 MBP 回傳 DB 備份至 MBA。

---
*最後更新日期：2026-03-30*
