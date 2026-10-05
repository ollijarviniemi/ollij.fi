#!/usr/bin/env python3
"""Tier 1b — a --friends-only stub: the shared (AISI) passphrase must NOT open it, the friend
link must. Drives the real CLI (--test mode) against an already-built site.
    python3 test-friends-only.py <site-dir> <slug> <shared-passphrase> <sentinel> <scratch-dir>"""
import base64, os, re, subprocess, sys
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

site, slug, pw, sentinel, scratch = sys.argv[1:6]
here = os.path.dirname(os.path.abspath(__file__))
tok = 'ab' * 16
out = os.path.join(scratch, 'friends-only-stub.html')
fails = 0
def ok(name, cond):
    global fails
    print(f'  {"✓" if cond else "✗ FAIL"}  {name}'); fails += (not cond)

r = subprocess.run([sys.executable, os.path.join(here, 'protect.py'), slug, '--test', '--password', pw,
                    '--friends-only', '--friend-token', tok, '--site-dir', site, '--out-file', out],
                   capture_output=True, text=True)
ok('protect.py --friends-only exits 0', r.returncode == 0)
if r.returncode:
    print(r.stdout, r.stderr); sys.exit(1)
ok('shared passphrase not printed', pw not in r.stdout)
stub = open(out).read()
g = lambda pat: re.search(pat, stub).group(1)
b = lambda s: base64.b64decode(s)
D = dict(iter=int(g(r"iter:\s*(\d+)")), salt=g(r"const D = \{[^}]*salt: '([^']*)'"),
         iv=g(r"const D = \{[^}]*iv: '([^']*)'"), ct=g(r"const D = \{[^}]*ct: '([^']*)'"))
F = dict(salt=g(r"const F = \{ salt: '([^']*)'"), iv=g(r"const F = \{[^}]*iv: '([^']*)'"),
         ct=g(r"const F = \{[^}]*ct: '([^']*)'"))
ok('passphrase block present (stubs stay uniform)', bool(D['ct']))
k = PBKDF2HMAC(algorithm=SHA256(), length=32, salt=b(D['salt']), iterations=D['iter']).derive(pw.encode())
try:
    AESGCM(k).decrypt(b(D['iv']), b(D['ct']), None); locked = False
except InvalidTag:
    locked = True
ok('shared passphrase does NOT decrypt the friends-only post', locked)
fk = HKDF(algorithm=SHA256(), length=32, salt=b(F['salt']), info=b'protect-read').derive(bytes.fromhex(tok))
html = AESGCM(fk).decrypt(b(F['iv']), b(F['ct']), None).decode()
ok('friend link decrypts it', sentinel in html)
ok('stub leaks no plaintext', sentinel not in stub)
r2 = subprocess.run([sys.executable, os.path.join(here, 'protect.py'), slug, '--test', '--password', pw,
                     '--friends-only', '--site-dir', site, '--out-file', out + '.2'], capture_output=True, text=True)
ok('--friends-only without a friend link is refused', r2.returncode != 0)
sys.exit(1 if fails else 0)
