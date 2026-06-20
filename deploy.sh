#!/usr/bin/env bash
# Deploy the latest commit on the box. The static site lives on GitHub Pages;
# this box runs only the realtime games server. Run as the `ollij` user from
# anywhere:  /srv/ollij.fi/deploy.sh
set -euo pipefail

cd /srv/ollij.fi

git pull --ff-only

# Realtime server dependencies (includes the native better-sqlite3 binding).
( cd games-server && npm ci --omit=dev )

sudo systemctl restart games-server
sudo systemctl reload caddy

echo "deployed @ $(git rev-parse --short HEAD)"
