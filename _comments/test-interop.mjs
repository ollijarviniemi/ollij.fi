/* Crypto interop: the Python CLI and the browser client must agree byte-for-byte on
   HKDF halves, K wrapping, payload/name encryption, and the auth hash — a silent drift
   here would brick every share link. Python generates vectors; node (WebCrypto, the same
   API the browser uses) must consume them. */
import { execSync } from 'child_process';
import { webcrypto } from 'crypto';
const subtle = webcrypto.subtle;

const py = `
import base64, hashlib, json, secrets, sys
sys.path.insert(0, '/home/olli/ollij.fi/_comments')
from cli import halves, enc
token = secrets.token_hex(16)
auth, kek = halves(token)
k = secrets.token_bytes(32)
print(json.dumps({
  "token": token, "auth": auth,
  "auth_hash": hashlib.sha256(auth.encode()).hexdigest(),
  "k": base64.b64encode(k).decode(),
  "wrapped": enc(kek, k),
  "payload": enc(k, json.dumps({"b": "hei maailma — interop ✓", "q": "quote"}).encode()),
  "name_ct": enc(k, "Väinö".encode())}))
`;
const v = JSON.parse(execSync('python3', { input: py, encoding: 'utf8' }));

const te = new TextEncoder(), td = new TextDecoder();
const hex2b = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const b2hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const b642b = s => Uint8Array.from(Buffer.from(s, 'base64'));
const SALT = te.encode('ollij.fi/comments/v1');

const km = await subtle.importKey('raw', hex2b(v.token), 'HKDF', false, ['deriveBits', 'deriveKey']);
const auth = b2hex(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: te.encode('auth') }, km, 256));
if (auth !== v.auth) throw new Error('AUTH HALF MISMATCH');
const kek = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: te.encode('kek') }, km,
  { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
const dec = async (key, b64) => { const b = b642b(b64);
  return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, key, b.slice(12))); };
const kBytes = await dec(kek, v.wrapped);
if (Buffer.from(kBytes).toString('base64') !== v.k) throw new Error('K UNWRAP MISMATCH');
const K = await subtle.importKey('raw', kBytes, { name: 'AES-GCM' }, false, ['decrypt']);
if (JSON.parse(td.decode(await dec(K, v.payload))).b !== 'hei maailma — interop ✓') throw new Error('PAYLOAD MISMATCH');
if (td.decode(await dec(K, v.name_ct)) !== 'Väinö') throw new Error('NAME MISMATCH');
if (b2hex(await subtle.digest('SHA-256', te.encode(v.auth))) !== v.auth_hash) throw new Error('AUTH_HASH MISMATCH');
console.log('  ok crypto interop (hkdf auth+kek, wrap/unwrap, payload, name, auth-hash)');
