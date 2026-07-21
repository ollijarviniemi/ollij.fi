// Tier 1 — crypto round-trip against a REAL generated stub, in Node's WebCrypto
// (the same API the browser decryptor uses, so format drift between protect.py
// and stub-template.html fails here before it can false-green in a browser).
//   node test-crypto.mjs <stub-index.html> <passphrase> <sentinel>
import { readFileSync } from 'fs';
import { webcrypto as crypto } from 'node:crypto';

const [stubPath, passphrase, sentinel] = process.argv.slice(2);
const stub = readFileSync(stubPath, 'utf8');
const grab = (re) => { const m = stub.match(re); if (!m) throw new Error('stub parse: ' + re); return m[1]; };
const D = {
  iter: parseInt(grab(/iter:\s*(\d+)/), 10),
  salt: grab(/salt:\s*'([^']+)'/),
  iv: grab(/iv:\s*'([^']+)'/),
  ct: grab(/ct:\s*'([^']+)'/),
};
const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));

async function unlock(pw, ctB64) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(D.salt), iterations: D.iter },
    km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(D.iv) }, key, b64(ctB64));
  return new TextDecoder().decode(pt);
}

let fails = 0;
const ok = (name, cond) => { console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${name}`); if (!cond) fails++; };

const html = await unlock(passphrase, D.ct);
ok('decrypts with the right passphrase', true);
ok(`plaintext contains sentinel "${sentinel}"`, html.includes(sentinel));
ok('stub itself does NOT contain the sentinel', !stub.includes(sentinel));

let wrongOk = false;
try { await unlock('wrong-horse-battery-staple', D.ct); } catch { wrongOk = true; }
ok('wrong passphrase is rejected', wrongOk);

// tamper: flip one ciphertext byte → GCM auth must fail even WITH the right passphrase
const raw = Buffer.from(D.ct, 'base64');
raw[Math.floor(raw.length / 2)] ^= 0xff;
let tamperOk = false;
try { await unlock(passphrase, raw.toString('base64')); } catch { tamperOk = true; }
ok('tampered ciphertext is rejected (GCM auth)', tamperOk);

process.exit(fails ? 1 : 0);
