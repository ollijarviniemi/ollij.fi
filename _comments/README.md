# ollij.fi comments — private, end-to-end-encrypted margin comments

Google-Docs-style comments on posts for capability-link holders; the public site is
untouched. Design doc (flows, visuals, identity model):
`~/.claude/plans/purrfect-zooming-lantern.md` (2026-08-04, Olli-approved). Status: built +
gated locally; **deployment blocked on a Cloudflare API token from Olli** (see Deploy).

## How it works

- A share link is `https://ollij.fi/<slug>/#<32-hex token>`. The fragment never reaches any
  server. HKDF splits it: the **auth half** is the API bearer (stored server-side only as a
  sha256 hash), the **kek half** unwraps the master key **K** in the browser.
- Everything sensitive — bodies, commenter names, anchor quotes — is AES-256-GCM ciphertext
  under K, wrapped per-link in `tokens.wrapped_key`. Cloudflare sees thread shape,
  timestamps, and counts. **Plaintext exists only in holders' browsers and on this laptop.**
- Identity is per-browser (`cmt_author` uuid) + a self-chosen name; renames propagate via
  the author record. Honor-system, sized for a trusted circle.
- **The gate panel (2026-08-04, Olli's spec):** a first visit with a valid link shows only a
  right-side panel (info text + name field) — no comments, washes, or masthead until a name
  is saved. The ⓘ next to the masthead `comments` item reopens the same panel afterwards
  (info + rename). Comments are **anchored-only** (no post-level composer), and delete =
  edit-to-empty; a deleted root with replies shows `[deleted]`.
- Revocation re-keys: fresh K, all rows re-encrypted, re-wrapped for surviving links
  (`cli.py revoke` does the whole dance; ex-holders can't read even a future D1 leak).
- **Protected-post integration (2026-08-23):** the same 32-hex capability can also *decrypt a
  protected post* — `_protect/protect.py <slug> --friend-label <label>` bakes a second,
  independent ciphertext keyed `HKDF(token, info="protect-read")` (distinct from `auth`/`kek`)
  into the encrypted stub, so ONE shared link reads the post AND lights up comments here, with
  no passphrase. See `_protect/README.md` → "Friend read-links".

## Files

| file | role |
|---|---|
| `worker.js` + `schema.sql` + `wrangler.toml` | Cloudflare Worker + D1 at `ollij.fi/api/comments/*` (public code, zero secrets) |
| `../assets/js/comments.js` | the whole client: crypto, anchoring, rail UI, all flows |
| `../_layouts/w-base.html` | ~10-line bootstrap; inert unless a token exists |
| `cli.py` | admin affordance: `setup` / `mint` / `revoke` / `tokens` / `links` / `export` / `status` |
| `local/` | **gitignored + pre-commit-guarded (rule 1f)**: master key, capabilities, seeds, exports |
| `../dashboard/design/comments-mockup.html` | design harness: REAL client + fake in-memory API (`?admin=1`, `?public=1`, fail toggle) |
| `test.sh` | the gate (below) — run after ANY change here |

## Testing (`bash _comments/test.sh`)

Tier 0 syntax + Python↔WebCrypto interop · tier 1 full UI matrix in headless Chromium over
the mockup (gate panel, auto-open composer, copy interception, sweep semantics, drafts,
reply-by-card/highlight, edit/delete, panel + inline rename, toggle, anchored-only,
fail-retry, admin, public) · tier 2 real headless Firefox core pass · tier 3 full stack against `wrangler dev`
local D1 + the real built `_site` page: fragment intake, cross-link decrypt, reply, index
counts, revoke+re-key, and the **§6 infosec invariants asserted mechanically** (no
plaintext/token/bearer bytes in D1 at rest; re-key re-encrypts every served row; export is
ciphertext; no stageable file carries a comment string) · tier 4 pre-commit guard fires on
planted `local/` state. Browsers always headless.

## Deploy (once, needs Olli)

1. Olli: Cloudflare API token with Workers+D1 edit on the ollij.fi zone → `~/.config/ga/cloudflare.env` as `CLOUDFLARE_API_TOKEN=…`
2. `cd _comments && npx wrangler d1 create ollij-comments` → paste `database_id` into wrangler.toml
3. `npx wrangler d1 execute ollij-comments --remote --file schema.sql`
4. `python3 cli.py setup` (writes `local/comments.env` + `local/seed.sql`), then
   `npx wrangler d1 execute ollij-comments --remote --file local/seed.sql`
5. `npx wrangler deploy` → commit + push the site changes (bootstrap + client) → mint links.

## Invariants (do not weaken)

- No comment data in the repo, the Jekyll build, or any `_data/` file — counts come from
  the API at runtime.
- `local/` never staged (gitignore + pre-commit 1f + tier-4 test).
- The Worker never logs bodies or headers; errors never echo internals.
- Bodies decrypt only in browsers holding a link. Agent tooling uses counts/ciphertext
  (`cli.py status|export`); comment bodies are other people's words — same respect as
  their messages elsewhere in this system.
