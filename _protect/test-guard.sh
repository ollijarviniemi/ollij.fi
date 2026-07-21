#!/usr/bin/env bash
# Tier 3 — the pre-commit guard actually BLOCKS every leak channel of a protected post,
# proven in a throwaway git repo (never the real one): the source itself, its
# writing.yml index entry, and its registered private assets. Plus a control commit
# so we know the guard isn't just failing everything.
#   test-guard.sh <scratch-dir>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
R="$1/guard-repo"
rm -rf "$R"; mkdir -p "$R"
cd "$R"
git init -q
git config user.email t@t; git config user.name t; git config commit.gpgsign false
mkdir -p .githooks _writing _data _protect assets/uploads
cp "$ROOT/.githooks/pre-commit" "$ROOT/.githooks/protected-leak-check.py" .githooks/
git config core.hooksPath .githooks

fails=0
ok(){ echo "  ✓  $1"; }
bad(){ echo "  ✗ FAIL  $1"; fails=1; }
# expect_block <label> — commit must FAIL (guard blocks) with staged state as-is
expect_block(){ if git commit -q -m x >/dev/null 2>&1; then bad "$1 — commit went THROUGH"; git reset -q --hard HEAD^; else ok "$1"; git reset -q; fi; }

# control first: a normal file commits fine
echo hi > README.md; git add README.md
if git commit -q -m ok >/dev/null 2>&1; then ok "control: normal commit passes"; else bad "control: normal commit blocked"; fi

# A) the protected source itself — deliberately WITHOUT `published: false`, so this
#    isolates the protected-rule: the old draft rule must not be what saves us here
printf -- '---\nprotected: true\n---\n# Secret post\n' > _writing/secretpost.md
git add -f _writing/secretpost.md
expect_block "protected source file is blocked"
git rm -q --cached _writing/secretpost.md 2>/dev/null || true

# B) a writing.yml entry naming the protected slug (file stays untracked on disk)
printf 'sections:\n  - name: New\n    posts:\n      - { title: "Secret post", url: "/secretpost/" }\n' > _data/writing.yml
git add _data/writing.yml
expect_block "writing.yml entry for a protected slug is blocked"
git reset -q

# C) a registered private asset (screenshot of a protected post)
printf '{"passphrase": "x", "posts": {"secretpost": {"assets": ["assets/uploads/secret-shot.png"]}}}' > _protect/registry.json
: > assets/uploads/secret-shot.png
git add -f assets/uploads/secret-shot.png
expect_block "registered private asset is blocked"
git reset -q

# D) same files are fine once the post is no longer protected (release path)
rm _writing/secretpost.md _protect/registry.json
printf 'sections:\n  - name: New\n    posts:\n      - { title: "Secret post", url: "/secretpost/" }\n' > _data/writing.yml
git add _data/writing.yml assets/uploads/secret-shot.png
if git commit -q -m released >/dev/null 2>&1; then ok "after release, the same commits pass"; else bad "release path still blocked"; fi

exit $fails
