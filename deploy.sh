#!/bin/bash
# Deploy Buddhist Footprints: auto-bump version → git → rsync → pm2 restart → DB backup

set -euo pipefail

REMOTE_HOST="mbp"
REMOTE_DIR="buddhist-footprints-dist"
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

# ── 1. Auto-bump version (major.minor) ─────────────────────────────────────────
# Read current version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")

# Calculate NEXT version based on TunaTCM logic: 1.20 -> 2.0, else 1.x -> 1.x+1
NEXT=$(node -e "
  const v = '$VERSION'.split('.');
  let major = parseInt(v[0]);
  let minor = parseInt(v[1]);
  if (minor >= 20) {
    major++;
    minor = 0;
  } else {
    minor++;
  }
  process.stdout.write(\`\${major}.\${minor}\`);
")

echo "🔢 Version bump: v$VERSION → v$NEXT"

# Update package.json
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
  pkg.version = '$NEXT';
  fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Update server.js (const VERSION = '...')
perl -pi -e "s/const VERSION = '[^']+';/const VERSION = '$NEXT';/" server.js

# Update index.html (id="versionBadge")
# Match either <span class="site-version">v...</span> OR <span class="site-version" id="versionBadge">v...</span>
perl -pi -e "s|<span class=\"site-version\"[^>]*>v[^<]+</span>|<span class=\"site-version\" id=\"versionBadge\">v$NEXT</span>|" index.html

echo "🚀 Deploying Buddhist Footprints v$NEXT..."

# ── 2. Git commit & push ───────────────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  echo "📦 Git commit & push..."
  git add -A
  git commit -m "Deploy Buddhist Footprints v$NEXT"
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
echo "✅ Deploy 完成！v$NEXT"
echo "🌐 https://buddhist.visadelab.xyz"
