#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 box (Hetzner CAX11/CX22). Run as root.
#
#   1. Create the box, add your SSH key, ssh in as root.
#   2. Edit REPO_URL below, then:  bash bootstrap.sh
#   3. Point ollij.fi (+ www) DNS A records at this box's IP (DNS-only at first).
#
# Idempotent-ish: safe to re-run. After this, deploys are just /srv/ollij.fi/deploy.sh.
set -euo pipefail

REPO_URL="https://github.com/ollijarviniemi/ollij.fi.git"   # public repo: https clone needs no deploy key

# --- 1. unprivileged user -----------------------------------------------------
id ollij &>/dev/null || adduser --disabled-password --gecos '' ollij
usermod -aG sudo ollij
install -d -o ollij -g ollij -m 700 /home/ollij/.ssh
[ -f /root/.ssh/authorized_keys ] && install -o ollij -g ollij -m 600 /root/.ssh/authorized_keys /home/ollij/.ssh/authorized_keys
# Let ollij restart the services without a password prompt (for deploy.sh).
echo 'ollij ALL=(root) NOPASSWD: /usr/bin/systemctl restart games-server, /usr/bin/systemctl reload caddy' > /etc/sudoers.d/ollij-deploy

# --- 2. packages: node, caddy, git, ruby/jekyll ------------------------------
apt-get update
apt-get install -y git build-essential ca-certificates curl xz-utils debian-keyring debian-archive-keyring apt-transport-https

# Node.js LTS — official static build (version-proof: no apt-repo codename
# dependency, so it works even on a brand-new Ubuntu release). Lands in /usr/local/bin.
NARCH=x64; [ "$(dpkg --print-architecture)" = arm64 ] && NARCH=arm64
NODE_TGZ=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/ | grep -oE "node-v22[0-9.]+-linux-${NARCH}\.tar\.xz" | head -1)
curl -fsSL "https://nodejs.org/dist/latest-v22.x/${NODE_TGZ}" | tar -xJ -C /usr/local --strip-components=1
node --version

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update
apt-get install -y caddy

# Static build toolchain (drop if you build the site elsewhere and rsync _site).
apt-get install -y ruby-full
gem install --no-document jekyll bundler

# --- 3. firewall + unattended security updates --------------------------------
apt-get install -y unattended-upgrades ufw
ufw allow OpenSSH; ufw allow 80; ufw allow 443; ufw --force enable

# --- 4. clone + wire services -------------------------------------------------
install -d -o ollij -g ollij /srv
[ -d /srv/ollij.fi ] || sudo -u ollij git clone "$REPO_URL" /srv/ollij.fi
cd /srv/ollij.fi
sudo -u ollij bash -lc 'cd games-server && npm ci --omit=dev'
sudo -u ollij bash -lc 'bundle install 2>/dev/null || true; jekyll build'

install -m 644 games-server/games-server.service /etc/systemd/system/games-server.service
install -m 644 Caddyfile /etc/caddy/Caddyfile
chmod +x deploy.sh

systemctl daemon-reload
systemctl enable --now games-server
systemctl reload caddy || systemctl restart caddy

echo
echo "Bootstrap done. Health check:  curl -s localhost:8787/health"
echo "Point ollij.fi + www DNS at this box (DNS-only), then visit https://ollij.fi/aumann"
