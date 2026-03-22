#!/bin/bash
# ════════════════════════════════════════
# Supabase Keep-Alive Script
# 每 5 天 ping 一次 Supabase，防止 free tier 被 pause
#
# 安裝方式（在 Mac Mini Terminal 執行）：
#   cp supabase-keepalive.sh ~/supabase-keepalive.sh
#   chmod +x ~/supabase-keepalive.sh
#   crontab -e
#   加入這行：0 9 */5 * * /bin/bash ~/supabase-keepalive.sh
# ════════════════════════════════════════

SUPABASE_URL="https://qstspcvkaznwvhsuavoo.supabase.co"
SUPABASE_ANON="sb_publishable_5NFAn4Ur369Jysuk_Y_AHw_KHI3IoGS"
LOG="$HOME/supabase-keepalive.log"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  "${SUPABASE_URL}/rest/v1/dharma_history?select=date&limit=1" \
  -H "apikey: ${SUPABASE_ANON}" \
  -H "Authorization: Bearer ${SUPABASE_ANON}")

if [ "$RESPONSE" = "200" ]; then
  echo "[$TIMESTAMP] ✅ Supabase ping OK (HTTP $RESPONSE)" >> "$LOG"
else
  echo "[$TIMESTAMP] ⚠️  Supabase ping failed (HTTP $RESPONSE)" >> "$LOG"
fi
