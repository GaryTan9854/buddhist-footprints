#!/bin/bash
# Deploy Buddhist Footprints: auto-bump version → git → rsync → pm2 restart → DB backup

set -euo pipefail

REMOTE_HOST="mbp"
REMOTE_DIR="buddhist-dist"
PM2_APP_NAME="buddhist"
HEALTH_URL="https://buddhist.visadelab.xyz/api/health"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$REPO_DIR"

# Load local .env for APP_PASSWORD
if [[ -f "$REPO_DIR/.env" ]]; then
  set -a; source "$REPO_DIR/.env"; set +a
fi

if [[ -z "${APP_PASSWORD:-}" ]]; then
  echo "APP_PASSWORD is not set. Add it to $REPO_DIR/.env before deploying."
  exit 1
fi

# ── 1. Auto-bump minor version in package.json + update index.html badge ──────
VERSION="$(node <<'EOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const parts = pkg.version.split('.');
parts[1] = Number(parts[1]) + 1;
parts[2] = '0';
const next = parts.join('.');
pkg.version = next;
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
process.stdout.write(next);
EOF
)"

DISPLAY="$(node -e "process.stdout.write('$VERSION'.replace(/\\.0\$/, ''))")"  # 1.3.0 → 1.3

# Sync version badge in index.html
perl -pi -e "s|<span class=\"site-version\">v[^<]+</span>|<span class=\"site-version\">v${DISPLAY}</span>|" index.html

echo "🚀 Deploying Buddhist Footprints v${DISPLAY}..."

# ── 2. Git commit & push ───────────────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  echo "📦 Git commit & push..."
  git add -A
  git commit -m "Deploy Buddhist Footprints v${DISPLAY}"
  git push origin main
else
  echo "✅ Git: 無變更，跳過 commit"
fi

# ── 3. rsync to MBP ───────────────────────────────────────────────────────────
echo "📡 Syncing to MBP..."
rsync -av --delete \
  --exclude='.DS_Store' \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='*.db' \
  --exclude='*.db-shm' \
  --exclude='*.db-wal' \
  "$REPO_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

# ── 4. Update APP_PASSWORD on MBP + restart PM2 ───────────────────────────────
echo "🔑 Updating remote APP_PASSWORD..."
ssh "$REMOTE_HOST" "zsh -lic 'cd ~/$REMOTE_DIR && touch .env && if grep -q \"^APP_PASSWORD=\" .env; then perl -0pi -e \"s/^APP_PASSWORD=.*/APP_PASSWORD=$APP_PASSWORD/m\" .env; else printf \"\\nAPP_PASSWORD=$APP_PASSWORD\\n\" >> .env; fi'"

echo "♻️  Restarting PM2 $PM2_APP_NAME..."
ssh "$REMOTE_HOST" "zsh -lic 'cd ~/$REMOTE_DIR && set -a && source .env && set +a && NODE_ENV=production pm2 restart $PM2_APP_NAME --update-env && sleep 2 && curl -fsSL $HEALTH_URL'"

# ── 5. DB backup MBP → MBA ────────────────────────────────────────────────────
echo ""
echo "🗄️  Pulling DB backup MBP → MBA..."
rsync -az "$REMOTE_HOST:~/db/buddhist-footprints/" "$HOME/Documents/.db-backups/buddhist-footprints/"
echo "   ✓ Backed up to ~/Documents/.db-backups/buddhist-footprints/"

echo ""
echo "✅ Deploy 完成！v${DISPLAY}"
echo "🌐 https://buddhist.visadelab.xyz"
