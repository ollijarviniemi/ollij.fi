#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu box (Hetzner CX23, Ubuntu 26.04). Run as root.
#
#   1. Create the box, add your SSH key, ssh in as root.
#   2. bash bootstrap.sh   (REPO_URL is set below)
#   3. Add a Cloudflare DNS record  ws.ollij.fi A -> <this box IP>  (DNS-only).
#
# The static site is served by GitHub Pages; this box runs only the realtime
# games server, reached at wss://ws.ollij.fi. Idempotent-ish: safe to re-run.
# After this, deploys are just /srv/ollij.fi/deploy.sh.
set -euo pipefail

REPO_URL="https://github.com/ollijarviniemi/ollij.fi.git"   # public repo: https clone needs no deploy key

# --- 1. unprivileged user -----------------------------------------------------
id ollij &>/dev/null || adduser --disabled-password --gecos '' ollij
usermod -aG sudo ollij
install -d -o ollij -g ollij -m 700 /home/ollij/.ssh
[ -f /root/.ssh/authorized_keys ] && install -o ollij -g ollij -m 600 /root/.ssh/authorized_keys /home/ollij/.ssh/authorized_keys
# Let ollij restart the services without a password prompt (for deploy.sh).
echo 'ollij ALL=(root) NOPASSWD: /usr/bin/systemctl restart games-server, /usr/bin/systemctl reload caddy' > /etc/sudoers.d/ollij-deploy

# --- 2. packages: node, caddy, git -------------------------------------------
apt-get update
apt-get install -y git build-essential ca-certificates curl xz-utils debian-keyring debian-archive-keyring apt-transport-https

# Node.js — official static build (version-proof: no apt-repo codename
# dependency, so it works even on a brand-new Ubuntu release). Lands in /usr/local/bin.
# build-essential above lets npm compile the better-sqlite3 binding if no
# prebuilt binary is available for this platform/Node.
NARCH=x64; [ "$(dpkg --print-architecture)" = arm64 ] && NARCH=arm64
NODE_TGZ=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/ | grep -oE "node-v22[0-9.]+-linux-${NARCH}\.tar\.xz" | head -1)
curl -fsSL "https://nodejs.org/dist/latest-v22.x/${NODE_TGZ}" | tar -xJ -C /usr/local --strip-components=1
node --version

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# --- 3. firewall + unattended security updates --------------------------------
apt-get install -y unattended-upgrades ufw
ufw allow OpenSSH; ufw allow 80; ufw allow 443; ufw --force enable

# --- 4. clone + wire services -------------------------------------------------
install -d -o ollij -g ollij /srv
[ -d /srv/ollij.fi ] || sudo -u ollij git clone "$REPO_URL" /srv/ollij.fi
cd /srv/ollij.fi
sudo -u ollij bash -lc 'cd games-server && npm ci --omit=dev'

install -m 644 games-server/games-server.service /etc/systemd/system/games-server.service
install -m 644 Caddyfile /etc/caddy/Caddyfile
chmod +x deploy.sh

systemctl daemon-reload
systemctl enable --now games-server
systemctl reload caddy || systemctl restart caddy

echo
echo "Bootstrap done. Health check:  curl -s localhost:8787/health"
echo "Add Cloudflare DNS:  ws.ollij.fi A -> $(curl -s ifconfig.me || echo '<box IP>')  (DNS-only),"
echo "then the page at ollij.fi/aumann (GitHub Pages) will reach this box over wss://ws.ollij.fi."
