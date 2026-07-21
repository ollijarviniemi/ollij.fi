#!/usr/bin/env python3
"""Protected review pages — publish a post at its REAL URL so ONLY passphrase-holders can read it.

    python3 _protect/protect.py <slug>              encrypt + (re)write the stub p/<slug>.html → /<slug>/
    python3 _protect/protect.py release <slug>      post cleared for real publishing: remove stub + flag
    python3 _protect/protect.py list                show what is currently protected

The plaintext post never enters git: the source stays untracked in _writing/ (the
pre-commit guard blocks `protected: true` files), and only an AES-256-GCM ciphertext
plus an inline WebCrypto decryptor is committed — a Jekyll page p/<slug>.html whose
permalink claims the post's real URL /<slug>/. Visitors get a passphrase prompt at the
exact address the post will eventually live at. In LOCAL builds the untracked draft
renders at the same URL and WINS the destination (collection docs are written after
pages — pinned by test.sh), so localhost:8090/<slug>/ keeps showing the draft; on the
public build only the stub exists. The encrypted payload is the fully rendered page
from a local Jekyll build — identical to the live site — with /assets/ images inlined
as data URIs so unpublished screenshots leak nothing and render for reviewers.

ALL protected posts share ONE passphrase (registry.json), so colleagues save it once in
their password manager and every protected URL autofills; re-runs reuse it, so shared
links keep working across draft revisions. `--fresh` (or a differing `--password`)
rotates it and re-encrypts every registered stub in the same run. See README.md.
"""
import argparse, base64, json, os, re, secrets, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROTECT_DIR = os.path.join(ROOT, '_protect')
REGISTRY = os.path.join(PROTECT_DIR, 'registry.json')
WORDLIST = os.path.join(PROTECT_DIR, 'wordlist.txt')
TEMPLATE = os.path.join(PROTECT_DIR, 'stub-template.html')
SITE_URL = 'https://ollij.fi'
PBKDF2_ITER = 600_000
STUB_MARKER = 'data-protect-stub'

MIME = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
        '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.ico': 'image/x-icon'}


def die(msg):
    print(f'\033[31m✗ {msg}\033[0m', file=sys.stderr)
    sys.exit(1)


def warn(msg):
    print(f'\033[33m⚠ {msg}\033[0m', file=sys.stderr)


def load_registry():
    """{'passphrase': <shared site passphrase>, 'posts': {slug: {created, assets}}}"""
    if not os.path.exists(REGISTRY):
        return {'passphrase': None, 'posts': {}}
    with open(REGISTRY) as f:
        data = json.load(f)
    if 'posts' not in data:
        data = {'passphrase': None, 'posts': data}
    return data


def save_registry(reg):
    fd = os.open(REGISTRY, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(reg, f, indent=2, sort_keys=True)
    os.chmod(REGISTRY, 0o600)


def gen_passphrase():
    with open(WORDLIST) as f:
        words = [w.strip() for w in f if w.strip()]
    if len(words) < 4000:
        return secrets.token_urlsafe(12)
    return '-'.join(secrets.choice(words) for _ in range(4))


def is_tracked(path):
    r = subprocess.run(['git', 'ls-files', '--error-unmatch', path],
                       cwd=ROOT, capture_output=True)
    return r.returncode == 0


def ensure_front_matter(src):
    """Make sure the source carries protected: true + published: false. Returns True if edited."""
    with open(src) as f:
        text = f.read()
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if m:
        fm = m.group(1)
        add = []
        if not re.search(r'^protected:\s*true\s*$', fm, re.M):
            add.append('protected: true')
        if not re.search(r'^published:', fm, re.M):
            add.append('published: false')
        elif re.search(r'^published:\s*true\s*$', fm, re.M):
            die(f'{os.path.basename(src)} has published: true — a protected post must be '
                f'published: false (it goes live ONLY as the encrypted stub). Fix the front matter first.')
        if not add:
            return False
        new = text[:m.end(1)] + '\n' + '\n'.join(add) + text[m.end(1):]
    else:
        new = '---\nprotected: true\npublished: false\n---\n' + text
    with open(src, 'w') as f:
        f.write(new)
    return True


def build_site(dest):
    print('  building site (jekyll --unpublished)…', flush=True)
    r = subprocess.run(['bundle', 'exec', 'jekyll', 'build', '--unpublished', '-d', dest],
                       cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        die('jekyll build failed:\n' + (r.stderr or r.stdout)[-2000:])


def inline_images(html, site_dir):
    """Inline root-relative <img> sources as data URIs. Returns (html, inlined, missing, leftover_uploads)."""
    inlined, missing = [], []

    def repl(tag_match):
        tag = tag_match.group(0)
        src_m = re.search(r'\bsrc\s*=\s*(["\'])(.*?)\1', tag)
        if not src_m:
            return tag
        src = src_m.group(2)
        if not src.startswith('/') or src.startswith('//') or src.startswith('data:'):
            return tag
        path = os.path.join(site_dir, src.lstrip('/').split('?')[0])
        ext = os.path.splitext(path)[1].lower()
        if not os.path.exists(path) or ext not in MIME:
            missing.append(src)
            return tag
        with open(path, 'rb') as f:
            data = base64.b64encode(f.read()).decode()
        inlined.append(src)
        tag = tag[:src_m.start(2)] + f'data:{MIME[ext]};base64,{data}' + tag[src_m.end(2):]
        return re.sub(r'\s+srcset\s*=\s*(["\']).*?\1', '', tag)

    html = re.sub(r'<img\b[^>]*>', repl, html)
    leftover = sorted(set(re.findall(r'/assets/uploads/[^"\'\s<>)]+', html)))
    return html, inlined, missing, leftover


def encrypt(html, passphrase):
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives.hashes import SHA256
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    key = PBKDF2HMAC(algorithm=SHA256(), length=32, salt=salt,
                     iterations=PBKDF2_ITER).derive(passphrase.encode())
    ct = AESGCM(key).encrypt(iv, html.encode(), None)   # ciphertext||tag — WebCrypto layout
    b64 = lambda b: base64.b64encode(b).decode()
    return b64(salt), b64(iv), b64(ct)


def write_stub(out_file, permalink, salt, iv, ct):
    """A Jekyll PAGE claiming the post's real permalink. {% raw %} keeps Liquid inert;
    sitemap: false in front matter (belt) + the p/ defaults scope (suspenders)."""
    with open(TEMPLATE) as f:
        stub = f.read()
    for k, v in (('__ITER__', str(PBKDF2_ITER)), ('__SALT__', salt), ('__IV__', iv), ('__CT__', ct)):
        assert k in stub, f'template missing {k}'
        stub = stub.replace(k, v)
    assert STUB_MARKER in stub, 'template lost its stub marker'
    assert '{% endraw %}' not in stub
    page = f'---\npermalink: {permalink}\nsitemap: false\n---\n{{% raw %}}\n{stub}{{% endraw %}}\n'
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, 'w') as f:
        f.write(page)
    return out_file


def protect_one(slug, site_dir, passphrase, out_file=None, permalink=None):
    """Encrypt one rendered post into its stub. Returns its private asset paths."""
    page = os.path.join(site_dir, slug, 'index.html')
    if not os.path.exists(page):
        die(f'{slug} did not render at /{slug}/ — is the slug right?')
    with open(page) as f:
        html = f.read()
    if STUB_MARKER in html:
        die(f'the build served the STUB at /{slug}/, not the draft — Jekyll\'s page-vs-document '
            f'write order flipped (see test.sh conflict pin). Refusing to encrypt a stub into a stub.')

    html, inlined, missing, leftover = inline_images(html, site_dir)
    salt, iv, ct = encrypt(html, passphrase)
    out = write_stub(out_file or os.path.join(ROOT, 'p', slug + '.html'),
                     permalink or f'/{slug}/', salt, iv, ct)
    kb = os.path.getsize(out) // 1024
    print(f'\033[32m✓ protected: {slug}\033[0m  ({len(inlined)} image(s) inlined, {kb} KB stub)')
    for m in missing:
        warn(f'referenced image not found in build, left as-is: {m}')
    for l in leftover:
        warn(f'non-<img> reference to {l} stays a link — 404s for reviewers until published, '
             f'and must NOT be committed early (the pre-commit guard knows it).')
    return [p.lstrip('/') for p in inlined + leftover]


def cmd_protect(args):
    slug = re.sub(r'\.md$', '', os.path.basename(args.slug))
    src = os.path.join(ROOT, '_writing', slug + '.md')
    if not os.path.exists(src):
        die(f'no such post: _writing/{slug}.md')

    if not args.test:
        if is_tracked(f'_writing/{slug}.md') and not args.force:
            die(f'_writing/{slug}.md is TRACKED in the public repo — its plaintext is already '
                f'(or will be) public on GitHub, so protecting it is moot. For a genuinely '
                f'private post, keep the file untracked. (--force to override, e.g. after a history rewrite.)')
        if ensure_front_matter(src):
            print(f'  added protected/published front matter to _writing/{slug}.md')

    # ONE shared passphrase for every protected post — colleagues save it once and every
    # protected URL autofills. Rotating it re-encrypts all registered stubs below.
    reg = {'passphrase': None, 'posts': {}} if args.test else load_registry()
    stored = reg.get('passphrase')
    passphrase, rotated = stored, False
    if args.fresh:
        passphrase, rotated = gen_passphrase(), stored is not None
        print('  --fresh: rotated the SHARED passphrase — previously shared links are dead')
    if args.password:
        rotated = rotated or (stored is not None and args.password != stored)
        passphrase = args.password
    if not passphrase:
        passphrase = gen_passphrase()

    # render exactly what the live site would serve
    tmp = None
    site_dir = args.site_dir
    if not site_dir:
        tmp = tempfile.mkdtemp(prefix='protect-build-')
        site_dir = os.path.join(tmp, 'site')
        build_site(site_dir)
    try:
        print('')
        assets = protect_one(slug, site_dir, passphrase, args.out_file, args.permalink)
        others = [] if args.test else sorted(s for s in reg['posts'] if s != slug)
        if rotated and others:
            print(f'  passphrase changed → re-encrypting {len(others)} other protected post(s):')
            for s in others:
                extra = protect_one(s, site_dir, passphrase)
                reg['posts'][s]['assets'] = sorted(set(reg['posts'][s].get('assets', []) + extra))
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)

    if not args.test:
        entry = reg['posts'].get(slug, {})
        reg['passphrase'] = passphrase
        reg['posts'][slug] = {'created': entry.get('created') or __import__('datetime').date.today().isoformat(),
                              'assets': sorted(set(entry.get('assets', []) + assets))}
        save_registry(reg)
        print(f'    url:   {SITE_URL}/{slug}/   (the post\'s real URL — passphrase prompt until released)')
        print(f'    pass:  {passphrase}   (SHARED by all protected posts; browsers offer to remember it)')
        print(f'    link:  {SITE_URL}/{slug}/#{passphrase}   (one-click: passphrase rides the #fragment,')
        print(f'           which never reaches any server — but it does land in the recipient\'s history)')
        print(f'    note:  localhost:8090/{slug}/ keeps showing the DRAFT (it wins local builds);')
        print(f'           the stub only serves where the draft doesn\'t exist, i.e. the public site.')
        print(f'  → commit p/{slug}.html with a GENERIC message and push to go live.')
        print(f'    re-run after edits to update in place (same link, same passphrase).')


def cmd_release(args):
    slug = re.sub(r'\.md$', '', os.path.basename(args.slug))
    reg = load_registry()
    entry = reg['posts'].pop(slug, None)
    if entry:
        save_registry(reg)
    else:
        warn(f'{slug} not in registry (nothing shared?) — still sweeping stub + front-matter flag.')
    stub = os.path.join(ROOT, 'p', slug + '.html')
    if os.path.exists(stub):
        os.remove(stub)
        print(f'  removed stub p/{slug}.html — remember to commit the removal.')
    src = os.path.join(ROOT, '_writing', slug + '.md')
    if os.path.exists(src):
        with open(src) as f:
            text = f.read()
        new = re.sub(r'^protected:\s*true\s*\n', '', text, count=1, flags=re.M)
        if new != text:
            with open(src, 'w') as f:
                f.write(new)
            print(f'  removed protected: true from _writing/{slug}.md')
    print(f'\033[32m✓ released: {slug}\033[0m — publish normally now (its assets commit normally too).')


def cmd_list(args):
    reg = load_registry()
    if not reg['posts']:
        print('nothing protected.')
        return
    for slug, e in sorted(reg['posts'].items()):
        print(f'  {slug:30s}  {SITE_URL}/{slug}/   since {e.get("created", "?")}')
    print(f'  shared passphrase: {reg.get("passphrase")}')


def main():
    argv = sys.argv[1:]
    if argv[:1] == ['list']:
        return cmd_list(None)
    if argv[:1] == ['release']:
        ap = argparse.ArgumentParser(prog='protect.py release')
        ap.add_argument('slug')
        return cmd_release(ap.parse_args(argv[1:]))
    if argv[:1] == ['protect']:
        argv = argv[1:]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('slug', help='post slug (file in _writing/); or: release <slug> | list')
    ap.add_argument('--password', help='use this passphrase instead of generating/reusing')
    ap.add_argument('--fresh', action='store_true', help='rotate the passphrase (old link dies)')
    ap.add_argument('--force', action='store_true', help='allow protecting a git-tracked post')
    ap.add_argument('--site-dir', help='use an existing built site instead of building')
    ap.add_argument('--out-file', help='write the stub here instead of p/<slug>.html')
    ap.add_argument('--permalink', help='override the stub permalink (test suite only)')
    ap.add_argument('--test', action='store_true',
                    help='pure mode for the test suite: no source edits, no registry writes; requires --out-file + --password')
    args = ap.parse_args(argv)
    if args.test and not (args.out_file and args.password):
        ap.error('--test requires --out-file and --password (must not touch sources or the registry)')
    cmd_protect(args)


if __name__ == '__main__':
    main()
