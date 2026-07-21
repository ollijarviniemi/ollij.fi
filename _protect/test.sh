#!/usr/bin/env bash
# Protected-review-pages test suite — run before trusting protect.py output or the guard.
#   _protect/test.sh            full suite (build → protect → real-Firefox e2e → guard)
#   _protect/test.sh --quick    skip the Firefox tier
#   PROTECT_TEST_SHOTS=<dir>    also keep screenshots of the three UI states
# Repo writes: ONLY transient p/zzz-selftest-*.html / p/zzz-conflictpin.html fixtures
# (trap-removed; needed because stubs are Jekyll PAGES — the build must see them).
# Never touches _writing/, writing.yml, _site or :8090; builds go to mktemp.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

# containment + one-at-a-time + snap-Firefox reaping — same rationale as extension/test.sh
# (2026-07-16 near-freeze; snap confinement denies pkill, stop transient scopes instead)
if command -v cw >/dev/null 2>&1 && ! grep -q 'claude-work.slice' /proc/self/cgroup 2>/dev/null \
   && [ -z "${GA_TEST_NO_CW:-}" ]; then
  exec cw "$0" "$@"
fi
exec 9>/tmp/protect-test.lock
flock -n 9 || { echo "✗ another _protect/test.sh is running — refusing to stack." >&2; exit 1; }
reap_stale() {
  local u pid scope
  for u in $(systemctl --user list-units --no-legend 'snap.firefox.geckodriver*' 2>/dev/null | awk '{print $1}'); do
    systemctl --user stop "$u" 2>/dev/null
  done
  for pid in $(pgrep -f -- '-headless' 2>/dev/null); do
    grep -qs 'snap\.firefox\.firefox' "/proc/$pid/cgroup" || continue
    scope=$(grep -o 'snap\.firefox\.firefox[^/]*\.scope' "/proc/$pid/cgroup" 2>/dev/null | head -1)
    [ -n "$scope" ] && systemctl --user stop "$scope" 2>/dev/null
  done
  return 0
}
reap_stale

SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/protect-test.XXXXXX")
STUB_IMG=p/zzz-selftest-proto.html; STUB_MATH=p/zzz-selftest-pyth.html; PIN=p/zzz-conflictpin.html
cleanup(){ reap_stale; rm -f "$STUB_IMG" "$STUB_MATH" "$PIN"; rmdir p 2>/dev/null; rm -rf "$SCRATCH"; }
trap cleanup EXIT
export NODE_PATH="${NODE_PATH:-/home/olli/node_modules}"

PASS='amber-lantern-quill-moss'
SLUG_IMG=proto_angel;  URL_IMG=zzz-selftest-proto; SENT_IMG='Guardian'
SLUG_MATH=pythagoras;  URL_MATH=zzz-selftest-pyth; SENT_MATH='Pythagoras proof'

QUICK=0; for a in "$@"; do [ "$a" = --quick ] && QUICK=1; done
fail=0
run(){ local label="$1"; shift; echo ""; echo "── $label ─────────────────────────────"
       if "$@"; then :; else fail=1; echo "   ↑ $label FAILED"; fi; }

tier0(){
  # build #1: plain site — the plaintext protect.py encrypts from
  bundle exec jekyll build --unpublished -d "$SCRATCH/site" >/dev/null 2>&1 || { echo "  ✗ jekyll build failed"; return 1; }
  # fixture sanity: sentinels really are in the rendered plaintext (else every no-leak grep below is vacuous)
  grep -q "$SENT_IMG"  "$SCRATCH/site/$SLUG_IMG/index.html"  || { echo "  ✗ sentinel drift: $SENT_IMG not in $SLUG_IMG"; return 1; }
  grep -q "$SENT_MATH" "$SCRATCH/site/$SLUG_MATH/index.html" || { echo "  ✗ sentinel drift: $SENT_MATH not in $SLUG_MATH"; return 1; }
  python3 _protect/protect.py "$SLUG_IMG"  --test --password "$PASS" --site-dir "$SCRATCH/site" \
      --out-file "$STUB_IMG"  --permalink "/$URL_IMG/"  || return 1
  python3 _protect/protect.py "$SLUG_MATH" --test --password "$PASS" --site-dir "$SCRATCH/site" \
      --out-file "$STUB_MATH" --permalink "/$URL_MATH/" || return 1
  # the stub sources leak nothing
  ! grep -q "$SENT_IMG"  "$STUB_IMG"  || { echo "  ✗ PLAINTEXT LEAK in $STUB_IMG"; return 1; }
  ! grep -q "$SENT_MATH" "$STUB_MATH" || { echo "  ✗ PLAINTEXT LEAK in $STUB_MATH"; return 1; }
  ! grep -q 'assets/uploads' "$STUB_IMG" || { echo "  ✗ upload path visible in stub"; return 1; }
  # conflict pin: a stub-like PAGE claiming a REAL post's URL — the collection doc must win
  # (this is what keeps localhost:8090/<slug>/ showing the DRAFT while a stub exists)
  printf -- '---\npermalink: /%s/\nsitemap: false\n---\n<!-- ZZZCONFLICTPIN -->stub-lost-goes-here\n' "$SLUG_IMG" > "$PIN"
  # build #2: the repo WITH stubs — what GitHub Pages (and his local rebuild) would see
  bundle exec jekyll build --unpublished -d "$SCRATCH/site2" >/dev/null 2>&1 || { echo "  ✗ jekyll build #2 failed"; return 1; }
  grep -q "$SENT_IMG" "$SCRATCH/site2/$SLUG_IMG/index.html" || { echo "  ✗ draft lost /$SLUG_IMG/ to the pin page"; return 1; }
  ! grep -q 'ZZZCONFLICTPIN' "$SCRATCH/site2/$SLUG_IMG/index.html" || { echo "  ✗ WRITE-ORDER FLIP: stub page beat the collection doc"; return 1; }
  # the stubs render at their permalinks, Liquid-inert, still leak-free
  for u in "$URL_IMG" "$URL_MATH"; do
    b="$SCRATCH/site2/$u/index.html"
    [ -f "$b" ] || { echo "  ✗ stub did not build at /$u/"; return 1; }
    grep -q 'data-protect-stub' "$b" || { echo "  ✗ built stub lost its marker"; return 1; }
    grep -q "const D" "$b" || { echo "  ✗ built stub lost its decryptor"; return 1; }
    ! grep -q '{% raw' "$b" || { echo "  ✗ Liquid raw tags leaked into output"; return 1; }
  done
  ! grep -q "$SENT_IMG" "$SCRATCH/site2/$URL_IMG/index.html" || { echo "  ✗ PLAINTEXT LEAK in built stub"; return 1; }
  # sitemap: stub permalinks stay out; nothing under /p/ ever appears
  ! grep -q 'zzz-selftest' "$SCRATCH/site2/sitemap.xml" || { echo "  ✗ stub URL in sitemap.xml"; return 1; }
  ! grep -q '/p/' "$SCRATCH/site2/sitemap.xml" || { echo "  ✗ /p/ URLs in sitemap.xml"; return 1; }
  python3 - <<'EOF' || return 1
import yaml
d = yaml.safe_load(open('_config.yml'))
assert any(s.get('scope', {}).get('path') == 'p' and s.get('values', {}).get('sitemap') is False
           for s in d.get('defaults', [])), 'sitemap:false defaults scope for p/ missing from _config.yml'
EOF
  [ "$(wc -l < _protect/wordlist.txt)" -ge 4000 ] || { echo "  ✗ wordlist too small"; return 1; }
  echo "  ✓ build ×2 + protect + no-leak + draft-wins-conflict + sitemap checks"
}

run "Tier 0 · real pipeline: build → protect → no-leak → conflict pin" tier0
[ "$fail" = 1 ] && { echo; echo "✗ Tier 0 failed — skipping the rest."; exit 1; }

run "Tier 1 · crypto round-trip + tamper (node WebCrypto)" \
  node _protect/test-crypto.mjs "$SCRATCH/site2/$URL_IMG/index.html" "$PASS" "$SENT_IMG"

if [ "$QUICK" = 0 ]; then
  run "Tier 2 · real headless Firefox e2e (reviewer's path)" \
    node _protect/test-e2e.mjs "$SCRATCH/site2" \
      "$URL_IMG:$SENT_IMG:images" "$URL_MATH:$SENT_MATH:math" \
      --pass "$PASS" ${PROTECT_TEST_SHOTS:+--shots "$PROTECT_TEST_SHOTS"}
fi

run "Tier 3 · pre-commit guard blocks every leak channel" bash _protect/test-guard.sh "$SCRATCH"

echo ""
if [ "$fail" = 1 ]; then echo "✗ PROTECT SUITE FAILED"; exit 1; fi
echo "✓ protect suite passed"
