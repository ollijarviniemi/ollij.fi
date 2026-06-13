#!/usr/bin/env bash
# go-live.sh — one-shot "run a session right now" for the factory-market game.
#
# 1. Starts node server.js on :8788.
# 2. Opens a Cloudflare quick tunnel exposing :8788 to the public.
# 3. Parses the assigned trycloudflare.com URL.
# 4. Rewrites factory-market/config.js SERVER_URL_PROD to that URL.
# 5. Commits + pushes so ollij.fi/factory-market/ goes live.
# 6. Holds the tunnel + server open until Ctrl-C.
#
# Mirrors aumann/server/go-live.sh. The trycloudflare subdomain is random per
# session; re-running gives a new URL (and a fresh push).

set -euo pipefail

cd "$(dirname "$0")"      # factory-market/server/
REPO_ROOT="$(git -C .. rev-parse --show-toplevel)"
CONFIG_JS="${REPO_ROOT%/}/factory-market/config.js"
PORT="${PORT:-8788}"

command -v cloudflared >/dev/null || {
    echo "Error: cloudflared not installed. Install: https://github.com/cloudflare/cloudflared/releases" >&2
    exit 1
}

echo "starting node server.js on :${PORT}…"
PORT="$PORT" node server.js > /tmp/factory-market-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
    echo; echo "shutting down…"
    kill "$TUNNEL_PID" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -sS -m 1 -o /dev/null "http://localhost:${PORT}/health" && break
    sleep 0.5
done

echo "starting Cloudflare quick tunnel…"
cloudflared tunnel --url "http://localhost:${PORT}" \
    --no-autoupdate > /tmp/factory-market-tunnel.log 2>&1 &
TUNNEL_PID=$!

TUNNEL_URL=""
for _ in $(seq 1 60); do
    TUNNEL_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/factory-market-tunnel.log | head -1 || true)"
    [[ -n "$TUNNEL_URL" ]] && break
    sleep 0.5
done
if [[ -z "$TUNNEL_URL" ]]; then
    echo "Error: never saw a trycloudflare URL. Last tunnel log:" >&2
    tail -20 /tmp/factory-market-tunnel.log >&2
    exit 1
fi
echo "tunnel up: $TUNNEL_URL"

echo "updating factory-market/config.js …"
python3 - "$CONFIG_JS" "$TUNNEL_URL" <<'EOF'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1]); url = sys.argv[2]
text = path.read_text()
new = re.sub(r"const SERVER_URL_PROD\s*=\s*'[^']*';",
             f"const SERVER_URL_PROD = '{url}';", text)
if new == text: print("warning: no SERVER_URL_PROD line replaced", file=sys.stderr)
path.write_text(new)
EOF

cd "$REPO_ROOT"
if ! git diff --quiet factory-market/config.js; then
    echo "committing + pushing config.js…"
    git add factory-market/config.js
    git commit -m "factory-market: point client at tunnel (live session)"
    git push
    echo "pushed. GitHub Pages usually rebuilds within 1–3 min."
else
    echo "config.js already had this URL; no push needed."
fi

echo
echo "═══════════════════════════════════════════════"
echo "  Factory Market is live."
echo "  Players visit: https://ollij.fi/factory-market/"
echo "  Tunnel:        $TUNNEL_URL"
echo "  Server log:    /tmp/factory-market-server.log"
echo "  Ctrl-C to take it down."
echo "═══════════════════════════════════════════════"

wait "$TUNNEL_PID"
