# _protect/ — password-protected review pages

**Why this exists (2026-07-20):** Olli's employer (UK AISI) wants pre-publication
visibility into AI-related posts. He needs to send a post *as it appears on the site*,
readable **only** with a passphrase — and unreadable on GitHub too, because the repo is
public and GitHub Pages builds from source (a `published: false` WIP is still plaintext
on GitHub). So the gate must sit *before* git, not in front of the site.

## Mechanism

`python3 _protect/protect.py <slug>`:

1. Ensures `_writing/<slug>.md` carries `protected: true` + `published: false`
   (added if missing), and refuses if the file is already git-tracked (then its
   plaintext is public anyway — protection would be theater).
2. Builds the site locally (`jekyll build --unpublished` into a temp dir) and takes the
   fully rendered `/<slug>/index.html` — byte-identical to how the live site would
   render it (same CSS, KaTeX, masthead).
3. Inlines every root-relative `<img>` as a `data:` URI, so unpublished screenshots
   under `assets/uploads/` neither leak nor 404 for reviewers.
4. Encrypts the page: AES-256-GCM, key = PBKDF2-HMAC-SHA256(passphrase, 600k iterations).
5. Writes `p/<slug>.html` — a Jekyll page whose `permalink` claims **the post's real
   URL `/<slug>/`**: ciphertext + an inline WebCrypto decryptor styled to the site
   (bare passphrase field on paper). Right passphrase → `document.write` swaps in the
   real page; site scripts (KaTeX, theme) run normally.
   `https://ollij.fi/<slug>/#<passphrase>` auto-unlocks — the fragment never reaches
   any server. That stub is the ONLY thing that gets committed. When the post is later
   released, the same URL simply starts serving the real page.

**Local vs public at the shared URL:** locally the untracked draft renders at
`/<slug>/` too — and wins (Jekyll writes collection docs after pages; empirically
pinned on 3.9.5 by test.sh's conflict pin, and protect.py refuses to encrypt if it
ever finds a stub where the draft should be). So `localhost:8090/<slug>/` always shows
the draft; the public build has no draft, so the stub serves.

**One shared passphrase for ALL protected posts** (`registry.json`), so colleagues save
it once and every protected URL autofills. The stub carries real credential semantics —
a hidden `username` field + `autocomplete="current-password"`, plus
`navigator.credentials.store` on Chrome — so browsers offer "remember this"; a
password-manager autofill (no keystrokes) auto-unlocks the page. Re-runs reuse the
passphrase, so shared links keep working across draft revisions; `--fresh` (or a
differing `--password`) rotates it and re-encrypts every registered stub in one run —
remember to commit ALL regenerated stubs, and tell the holders.

## Guarantees & honest limits

- GitHub, site visitors, Cloudflare, crawlers: see AES-GCM ciphertext only. The stub is
  `noindex` and carries `sitemap: false` (plus the `p/` defaults-scope backstop in
  `_config.yml`).
- **The URL itself is now the post's real slug — that's the point (same address before
  and after release), but it means the slug/topic is visible** in the repo (`p/<slug>.html`)
  and to anyone who tries the URL (they get a bare passphrase field). Content stays
  ciphertext; existence does not.
- The pre-commit guard (`.githooks/pre-commit` + `protected-leak-check.py`) blocks every
  known leak channel: the source file (`protected: true`), a `_data/writing.yml` entry
  naming the slug (writing.yml is committed → titles leak), and any asset registered to
  a protected post.
- **Security equals passphrase strength** (offline-attackable ciphertext): generated
  passphrases are 4 dice-words (~55 bits + 600k-iteration KDF). Don't hand-pick weak ones.
- The `#fragment` link lands in the recipient's browser history; send the passphrase
  separately if that matters.
- Old ciphertext stays in git history after updates — same passphrase, same content
  lineage. Fine for this use (content eventually publishes); a truly burned passphrase
  → `--fresh` for future revisions, but history keeps what it has.
- `registry.json` (slug → token, passphrase, assets) is gitignored, chmod 600, local
  only — same machine that already holds the plaintext.

## Discipline

- **Commit stubs with a GENERIC message** ("protected review page"). The filename shows
  the slug by design (same-URL requirement); the message needn't advertise more.
- Updates propagate in ~1–10 min (GitHub Pages build + its `max-age=600`; Cloudflare
  doesn't cache the HTML). A brand-new stub is live as soon as Pages deploys.
- When the post is cleared: `python3 _protect/protect.py release <slug>` — removes the
  stub (commit the removal) + registry entry + front-matter flag; then publish through
  the normal flow. No vestigial parallel copies.

## Tests — run before trusting any change to protect.py / stub-template.html / the hook

`_protect/test.sh` (self-contained in `cw`; repo writes limited to transient
`p/zzz-*.html` fixtures, trap-removed; headless only):
Tier 0 real pipeline (build → protect → second build with stubs present →
no-plaintext/no-sitemap greps + the **conflict pin**: a stub-like page claiming a real
post's URL must LOSE to the collection doc — the invariant that keeps local previews
showing the draft), Tier 1 Node-WebCrypto round-trip + wrong-pass + GCM tamper, Tier 2
**real headless Firefox** driving the reviewer's path (locked → wrong pass → unlock →
content + inlined images render + KaTeX; `#fragment` auto-unlock), Tier 3 the guard in
a throwaway git repo (all three leak channels block; release path passes). `--quick`
skips Firefox; `PROTECT_TEST_SHOTS=<dir>` keeps screenshots. The guard test was
verified to FAIL against the pre-feature hook (all three channels leaked) before being
trusted.
