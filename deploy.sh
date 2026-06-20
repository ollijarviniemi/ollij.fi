#!/usr/bin/env bash
# Deploy the latest commit on the box: pull, install server deps, rebuild the
# static site, restart the games server, reload Caddy. Run as the `ollij` user
# from anywhere:  /srv/ollij.fi/deploy.sh
set -euo pipefail

cd /srv/ollij.fi

git pull --ff-only

# Realtime server dependencies.
( cd games-server && npm ci --omit=dev )

# --- Static build -------------------------------------------------------------
# Currently Jekyll → _site. Swap this one line if you move off Jekyll; Caddy
# just serves whatever ends up in _site/.
bundle exec jekyll build
# -----------------------------------------------------------------------------

sudo systemctl restart games-server
sudo systemctl reload caddy

echo "deployed @ $(git rev-parse --short HEAD)"
