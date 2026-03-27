#!/bin/bash
# Deploy Buddhist Footprints from local source repo to GitHub and MBP runtime copy.

set -euo pipefail

REMOTE_HOST="mbp"
REMOTE_DIR="buddhist-footprints-dist"
PM2_APP_NAME="buddhist"
HEALTH_URL="http://127.0.0.1:3004/api/health"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$REPO_DIR"

HTML_VERSION="$(perl -ne 'print "$1\n" if /<span class="site-version">v([^<]+)<\/span>/' index.html | head -n 1)"
SERVER_VERSION="$(perl -ne "print qq{\$1\n} if /APP_VERSION \|\| '([^']+)'/" server.js | head -n 1)"

if [[ -z "$HTML_VERSION" || -z "$SERVER_VERSION" ]]; then
  echo "Unable to detect version from index.html or server.js"
  exit 1
fi

if [[ "$HTML_VERSION" != "$SERVER_VERSION" ]]; then
  echo "Version mismatch: index.html=$HTML_VERSION server.js=$SERVER_VERSION"
  exit 1
fi

VERSION="$HTML_VERSION"

echo "Staging deploy files for Buddhist Footprints v$VERSION..."
git add index.html server.js deploy.sh

if ! git diff --cached --quiet; then
  git commit -m "Deploy Buddhist Footprints v$VERSION"
else
  echo "No new tracked changes to commit."
fi

echo "Pushing to GitHub..."
git push origin main

echo "Syncing files to ${REMOTE_HOST}:${REMOTE_DIR}..."
scp "$REPO_DIR/index.html" "$REMOTE_HOST:$REMOTE_DIR/index.html"
scp "$REPO_DIR/server.js" "$REMOTE_HOST:$REMOTE_DIR/server.js"

echo "Restarting PM2 app: $PM2_APP_NAME"
ssh "$REMOTE_HOST" "zsh -lic 'cd ~/$REMOTE_DIR && APP_VERSION=$VERSION pm2 restart $PM2_APP_NAME --update-env && sleep 2 && curl -fsSL $HEALTH_URL'"

echo "Deploy complete for Buddhist Footprints v$VERSION."
