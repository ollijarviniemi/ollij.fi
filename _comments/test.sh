#!/usr/bin/env bash
# Comment-layer gate — run after ANY change to assets/js/comments.js, _comments/worker.js,
# _comments/cli.py, the w-base bootstrap, or the pre-commit guard's 1f rule.
#
#   tier 0  syntax + Python↔WebCrypto interop (fast)
#   tier 1  UI behavior matrix — headless Chromium driving the REAL client via the mockup
#   tier 2  REAL Firefox core pass (snap binary + raw geckodriver, always -headless)
#   tier 3  full stack — wrangler dev (local D1) + CLI mint/revoke/re-key + the real built
#           post page; asserts the §6 infosec invariants mechanically
#   tier 4  the pre-commit guard fires on planted comment-layer private state
#
# Browsers are ALWAYS headless. Leaked geckodrivers are reaped via
#   systemctl --user stop 'snap.firefox.geckodriver-*.scope'   (never pkill).
set -euo pipefail
cd "$(dirname "$0")/.."
HARNESS_PORT=8790

cleanup() { kill $(jobs -p) 2>/dev/null || true; }
trap cleanup EXIT

echo "== tier 0: syntax + crypto interop =="
node --check assets/js/comments.js
T0=$(mktemp -d); cp _comments/worker.js "$T0/worker.mjs"; node --check "$T0/worker.mjs"; rm -rf "$T0"
python3 -m py_compile _comments/cli.py
node _comments/test-interop.mjs

# tiers 1–3 need the compiled css + the bootstrap baked into _site — and the built
# client must MATCH source (a marker-only check once served a stale comments.js to tier 3)
if ! grep -q cmt_token _site/proto_angel/index.html 2>/dev/null \
   || ! diff -q _site/assets/js/comments.js assets/js/comments.js >/dev/null 2>&1; then
  echo "(_site stale — rebuilding with --unpublished)"
  bundle exec jekyll build --unpublished >/dev/null
fi

python3 _comments/serve-harness.py $HARNESS_PORT &
sleep 1

echo "== tier 1: UI matrix (chromium) =="
node _comments/test-ui.mjs --base "http://localhost:$HARNESS_PORT"

echo "== tier 2: real Firefox =="
node _comments/test-ui-ff.mjs --base "http://localhost:$HARNESS_PORT"

echo "== tier 3: full stack (wrangler dev + CLI + built page) =="
node _comments/test-e2e.mjs

echo "== tier 4: pre-commit guard fires on planted private state =="
mkdir -p _comments/local
echo 'CMT_K=planted-not-a-real-key' > _comments/local/test-planted.env
IDX=$(mktemp)
if GIT_INDEX_FILE="$IDX" git add -f _comments/local/test-planted.env 2>/dev/null &&
   GIT_INDEX_FILE="$IDX" .githooks/pre-commit >/dev/null 2>&1; then
  rm -f _comments/local/test-planted.env "$IDX"
  echo "  FAIL: guard did NOT block planted _comments/local file"; exit 1
fi
rm -f _comments/local/test-planted.env "$IDX"
echo "  ok guard blocks planted _comments/local file"

echo
echo "COMMENTS GATE: ALL TIERS PASS"
