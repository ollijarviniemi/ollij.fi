#!/usr/bin/env bash
# go-live.sh — one-shot "play with friends right now" script.
#
# 1. Starts node server.js on :8787.
# 2. Opens a Cloudflare quick tunnel exposing :8787 to the public.
# 3. Parses the assigned trycloudflare.com URL.
# 4. Updates aumann/config.js to point SERVER_URL_PROD at that URL.
# 5. Commits + pushes so ollij.fi/aumann immediately goes live.
# 6. Stays in foreground holding the tunnel + server open.
#
# Quit with Ctrl-C — that tears down the tunnel + server. The live site
# will then show the "Server URL not configured" error until you either
# re-run this script (new random URL again) or revert config.js.

set -euo pipefail

cd "$(dirname "$0")"      # aumann/server/
REPO_ROOT="$(git -C .. rev-parse --show-toplevel)"
CONFIG_JS="${REPO_ROOT%/}/aumann/config.js"

command -v cloudflared >/dev/null || {
    echo "Error: cloudflared not installed. Install: https://github.com/cloudflare/cloudflared/releases" >&2
    exit 1
}

# Start the Aumann server in the background.
echo "starting node server.js on :8787…"
node server.js > /tmp/aumann-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
    echo
    echo "shutting down…"
    kill "$TUNNEL_PID" 2>/dev/null || true
    kill "$SERVER_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for server to listen
for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -sS -m 1 -o /dev/null http://localhost:8787/health && break
    sleep 0.5
done

# Start the Cloudflare quick tunnel, log to a file so we can parse the URL.
echo "starting Cloudflare quick tunnel…"
cloudflared tunnel --url http://localhost:8787 \
    --no-autoupdate > /tmp/aumann-tunnel.log 2>&1 &
TUNNEL_PID=$!

# Cloudflared prints the assigned URL like "https://foo-bar-baz.trycloudflare.com"
# within ~10 seconds. Poll the log for it.
TUNNEL_URL=""
for _ in $(seq 1 60); do
    TUNNEL_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/aumann-tunnel.log | head -1 || true)"
    [[ -n "$TUNNEL_URL" ]] && break
    sleep 0.5
done

if [[ -z "$TUNNEL_URL" ]]; then
    echo "Error: never saw a trycloudflare URL. Last tunnel log:" >&2
    tail -20 /tmp/aumann-tunnel.log >&2
    exit 1
fi

echo "tunnel up: $TUNNEL_URL"

# Update config.js's SERVER_URL_PROD line in place.
echo "updating aumann/config.js …"
python3 - "$CONFIG_JS" "$TUNNEL_URL" <<'EOF'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1])
url  = sys.argv[2]
text = path.read_text()
new  = re.sub(r"const SERVER_URL_PROD\s*=\s*'[^']*';",
              f"const SERVER_URL_PROD = '{url}';",
              text)
if new == text:
    print("warning: no SERVER_URL_PROD line replaced", file=sys.stderr)
path.write_text(new)
EOF

# Commit + push only if config.js actually changed.
cd "$REPO_ROOT"
if ! git diff --quiet aumann/config.js; then
    echo "committing + pushing config.js…"
    git add aumann/config.js
    git commit -m "Aumann: point client at tunnel (live session)"
    git push
    echo "pushed. Jekyll usually rebuilds within 1–3 min."
else
    echo "config.js already had this URL; no push needed."
fi

echo
echo "═══════════════════════════════════════════════"
echo "  Aumann is live."
echo
echo "  Players visit: https://ollij.fi/aumann/"
echo "  Tunnel:        $TUNNEL_URL"
echo "  Server log:    /tmp/aumann-server.log"
echo "  Tunnel log:    /tmp/aumann-tunnel.log"
echo
echo "  Ctrl-C to take it down."
echo "═══════════════════════════════════════════════"

# Keep the script alive while the tunnel runs. trap cleanup() handles teardown.
wait "$TUNNEL_PID"
