#!/usr/bin/env python3
"""ollij.fi comments — admin CLI (the agent affordance; see CLAUDE.md "AI affordances").

    python3 _comments/cli.py setup                      # one-time: K + admin capability + seed.sql
    python3 _comments/cli.py mint --label aisi [--slug /proto_angel/]
    python3 _comments/cli.py tokens                     # list tokens (server view)
    python3 _comments/cli.py links                      # list share URLs held locally
    python3 _comments/cli.py revoke <label-or-id>       # revoke + RE-KEY everything
    python3 _comments/cli.py export                     # ciphertext backup → local/export-<ts>.json
    python3 _comments/cli.py status

State lives in _comments/local/ (gitignored, guarded by the pre-commit hook): comments.env
holds the master key K and the admin capability; links.json holds minted capabilities so a
link can be re-shared or re-wrapped at re-key time. Plaintext comment bodies exist on this
machine only transiently inside `revoke` (decrypt → re-encrypt); they are never written to
disk. Crypto interops byte-for-byte with assets/js/comments.js:
  HKDF-SHA256(token, salt='ollij.fi/comments/v1', info='auth'|'kek') → bearer hex / AES key;
  blobs are base64(iv[12] || ciphertext+tag); auth_hash = sha256(hex-string of the bearer).
"""
import argparse, base64, datetime, hashlib, hmac, json, os, secrets, sys, urllib.request
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SALT = b'ollij.fi/comments/v1'
DIR = Path(os.environ.get('CMT_DIR', Path(__file__).parent / 'local'))
ENV = DIR / 'comments.env'
LINKS = DIR / 'links.json'


def hkdf_sha256(key: bytes, info: bytes, length: int = 32) -> bytes:
    prk = hmac.new(SALT, key, hashlib.sha256).digest()          # extract (salt as HMAC key)
    out, t, i = b'', b'', 1
    while len(out) < length:
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
        out += t; i += 1
    return out[:length]


def halves(token_hex: str):
    tok = bytes.fromhex(token_hex)
    auth = hkdf_sha256(tok, b'auth').hex()
    kek = hkdf_sha256(tok, b'kek')
    return auth, kek


def enc(key: bytes, data: bytes) -> str:
    iv = secrets.token_bytes(12)
    return base64.b64encode(iv + AESGCM(key).encrypt(iv, data, None)).decode()


def dec(key: bytes, b64: str) -> bytes:
    b = base64.b64decode(b64)
    return AESGCM(key).decrypt(b[:12], b[12:], None)


def load_env():
    if not ENV.exists():
        sys.exit(f'no {ENV} — run: python3 _comments/cli.py setup')
    env = {}
    for line in ENV.read_text().splitlines():
        if '=' in line and not line.strip().startswith('#'):
            k, v = line.split('=', 1); env[k.strip()] = v.strip()
    return env


def save_env(api, admin_token, k_bytes):
    DIR.mkdir(parents=True, exist_ok=True)
    ENV.write_text(f'CMT_API={api}\nCMT_ADMIN_TOKEN={admin_token}\nCMT_K={base64.b64encode(k_bytes).decode()}\n')
    ENV.chmod(0o600)


def api_call(env, path, body=None):
    auth, _ = halves(env['CMT_ADMIN_TOKEN'])
    req = urllib.request.Request(
        env['CMT_API'] + path,
        data=json.dumps(body).encode() if body is not None else None,
        method='POST' if body is not None else 'GET',
        # Cloudflare's managed WAF 403s the default "Python-urllib" user-agent; a normal UA
        # passes (the deployed comments API sits behind CF). Browsers are unaffected.
        headers={'Authorization': 'Bearer ' + auth, 'Content-Type': 'application/json',
                 'User-Agent': 'ollij-comments-cli/1.0'})
    with urllib.request.urlopen(req, timeout=30) as f:
        return json.loads(f.read().decode())


def load_links():
    if LINKS.exists():
        return json.loads(LINKS.read_text())
    return {}


def save_links(links):
    DIR.mkdir(parents=True, exist_ok=True)
    LINKS.write_text(json.dumps(links, indent=1))
    LINKS.chmod(0o600)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def cmd_setup(args):
    if ENV.exists() and not args.force:
        sys.exit(f'{ENV} exists — refusing to overwrite the master key (use --force only if you mean it)')
    k = secrets.token_bytes(32)
    admin = secrets.token_hex(16)
    auth, kek = halves(admin)
    save_env(args.api, admin, k)
    seed = DIR / 'seed.sql'
    auth_hash = hashlib.sha256(auth.encode()).hexdigest()
    seed.write_text(
        "INSERT INTO tokens (id, label, auth_hash, wrapped_key, admin, revoked, created)\n"
        f"VALUES ('admin', 'admin', '{auth_hash}', '{enc(kek, k)}', 1, 0, '{now()}');\n")
    seed.chmod(0o600)
    print(f'K + admin capability written to {ENV}')
    print(f'seed SQL (admin token row) written to {seed}')
    print('deploy: npx wrangler d1 execute ollij-comments --remote --file local/seed.sql')
    print(f'your admin link (any post): https://ollij.fi/<slug>/#{admin}')


def cmd_mint(args):
    env = load_env()
    k = base64.b64decode(env['CMT_K'])
    token = secrets.token_hex(16)
    auth, kek = halves(token)
    res = api_call(env, '/admin/mint', {
        'label': args.label,
        'auth_hash': hashlib.sha256(auth.encode()).hexdigest(),
        'wrapped_key': enc(kek, k)})
    links = load_links()
    links[args.label] = {'id': res['id'], 'token': token, 'created': now()}
    save_links(links)
    slug = args.slug or '/proto_angel/'
    print(f'https://ollij.fi{slug}#{token}')
    print(f'(label={args.label}, id={res["id"]} — revoke with: python3 _comments/cli.py revoke {args.label})')


def cmd_tokens(_):
    env = load_env()
    for t in api_call(env, '/admin/tokens')['tokens']:
        state = 'REVOKED' if t['revoked'] else ('admin' if t['admin'] else 'active')
        print(f"  {t['label']:16} {state:8} created {t['created'][:16]}  id={t['id']}")


def cmd_links(_):
    env = load_env()
    for label, l in load_links().items():
        print(f"  {label:16} https://ollij.fi/<slug>/#{l['token']}")
    print(f"  admin            https://ollij.fi/<slug>/#{env['CMT_ADMIN_TOKEN']}")


def cmd_export(_):
    env = load_env()
    dump = api_call(env, '/admin/export')
    out = DIR / f"export-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    out.write_text(json.dumps(dump, indent=1))   # ciphertext as-is: safe at rest, restic covers it
    out.chmod(0o600)
    counts = {t: len(v) for t, v in dump.items()}
    print(f'{out}  {counts}')


def cmd_revoke(args):
    env = load_env()
    old_k = base64.b64decode(env['CMT_K'])
    links = load_links()
    target = None
    for label, l in list(links.items()):
        if label == args.which or l['id'] == args.which:
            target = (label, l)
    if not target:
        sys.exit(f'unknown label/id {args.which!r} — see: cli.py links / cli.py tokens')
    label, l = target
    print(f'revoking {label} ({l["id"]}) …')
    api_call(env, '/admin/revoke', {'id': l['id']})
    links.pop(label); save_links(links)

    # RE-KEY: the ex-holder once held K, so a future ciphertext leak must not be readable
    # to them. Fresh K, everything re-encrypted, re-wrapped for every remaining capability.
    print('re-keying …')
    dump = api_call(env, '/admin/export')
    new_k = secrets.token_bytes(32)
    body = {'tokens': [], 'authors': [], 'comments': []}
    for t in dump['tokens']:
        if t['revoked']:
            continue
        if t['id'] == 'admin' or t['admin']:
            _, kek = halves(env['CMT_ADMIN_TOKEN'])
        else:
            local = next((x for x in links.values() if x['id'] == t['id']), None)
            if not local:
                print(f"  WARNING: no local capability for token {t['label']} ({t['id']}) — that link will stop decrypting")
                continue
            _, kek = halves(local['token'])
        body['tokens'].append({'id': t['id'], 'wrapped_key': enc(kek, new_k)})
    for a in dump['authors']:
        if a['name_ct']:
            body['authors'].append({'id': a['id'], 'name_ct': enc(new_k, dec(old_k, a['name_ct']))})
    for c in dump['comments']:
        if c['payload_ct']:
            body['comments'].append({'id': c['id'], 'payload_ct': enc(new_k, dec(old_k, c['payload_ct']))})
    res = api_call(env, '/admin/rekey', body)
    save_env(env['CMT_API'], env['CMT_ADMIN_TOKEN'], new_k)
    print(f"revoked + re-keyed ({res['updated']} rows). Existing browsers re-fetch the wrap on next load.")


def cmd_status(_):
    env = load_env()
    idx = api_call(env, '/index')
    total = sum(v['n'] for v in idx['slugs'].values())
    print(f"{env['CMT_API']}: {total} comments across {len(idx['slugs'])} posts")
    for s, v in sorted(idx['slugs'].items(), key=lambda kv: kv[1]['latest'] or '', reverse=True):
        print(f"  {s:40} {v['n']:3}  latest {v['latest'][:16] if v['latest'] else '-'}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('setup'); s.add_argument('--api', default='https://ollij.fi/api/comments')
    s.add_argument('--force', action='store_true')
    m = sub.add_parser('mint'); m.add_argument('--label', required=True); m.add_argument('--slug')
    sub.add_parser('tokens'); sub.add_parser('links'); sub.add_parser('export'); sub.add_parser('status')
    r = sub.add_parser('revoke'); r.add_argument('which')
    args = ap.parse_args()
    {'setup': cmd_setup, 'mint': cmd_mint, 'tokens': cmd_tokens, 'links': cmd_links,
     'export': cmd_export, 'revoke': cmd_revoke, 'status': cmd_status}[args.cmd](args)


if __name__ == '__main__':
    main()
