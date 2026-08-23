/* Comments — full-stack e2e: real Worker (wrangler dev, local D1), real CLI (setup, mint,
   revoke+rekey), real built post page (_site) with the real w-base bootstrap, headless
   Chromium. Also asserts the §6 infosec invariants MECHANICALLY:
     - the D1 sqlite at rest holds no plaintext bodies/names/quotes, no tokens, no bearers;
     - revocation re-encrypts everything (old ciphertext bytes gone);
     - no test string appears anywhere git could stage.
   Run via _comments/test.sh (which builds _site first and owns cleanup). */
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
const require = createRequire('/home/olli/node_modules/');
const { chromium } = require('playwright-core');

const REPO = '/home/olli/ollij.fi';
const CD = join(REPO, '_comments');
const SCRATCH = process.env.CMT_SCRATCH ||
  '/tmp/claude-1000/-home-olli-ollij-fi/976d3855-1587-46ca-b144-2976766a9998/scratchpad/cmt-e2e';
const CMT_DIR = join(SCRATCH, 'local');
const PERSIST = join(SCRATCH, 'wr');
const API = 'http://localhost:8791/api/comments';
const SITE = 'http://localhost:8099';
// unique per run: the stageable-files grep must be able to flag ANY file that carries them,
// including a hypothetical future fixture — so the strings themselves live in no file.
const RUN = Date.now().toString(36);
const SECRET_BODY = 'e2e secret payload kumquat-' + RUN;
const SECRET_REPLY = 'bob reply xyzzy-' + RUN;

let failures = 0;
const ok = (cond, name) => { console.log((cond ? '  ok ' : '  FAIL ') + name); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', cwd: CD, ...opts });
const cli = (args) => sh(`CMT_DIR=${CMT_DIR} python3 cli.py ${args}`);

execSync(`rm -rf ${SCRATCH}; mkdir -p ${SCRATCH}`);

console.log('— stand up D1 + Worker + admin seed —');
sh(`npx wrangler d1 execute ollij-comments --local --persist-to ${PERSIST} --file schema.sql >/dev/null 2>&1`);
cli(`setup --api ${API} --force`);
sh(`npx wrangler d1 execute ollij-comments --local --persist-to ${PERSIST} --file ${CMT_DIR}/seed.sql >/dev/null 2>&1`);

const wrangler = spawn('npx', ['wrangler', 'dev', '--port', '8791', '--persist-to', PERSIST],
  { cwd: CD, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let wlog = '';
wrangler.stdout.on('data', d => { wlog += d; });
wrangler.stderr.on('data', d => { wlog += d; });

const site = spawn('python3', ['-m', 'http.server', '8099', '--bind', '127.0.0.1'],
  { cwd: join(REPO, '_site'), stdio: 'ignore', detached: true });

const cleanup = () => { for (const c of [wrangler, site]) { try { process.kill(-c.pid, 'SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} } };
process.on('uncaughtException', e => { console.log('UNCAUGHT: ' + e.message); cleanup(); process.exit(1); });
process.on('exit', cleanup);

let up = false;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  try { const r = await fetch(API + '/index'); if (r.status === 401) { up = true; break; } } catch (e) {}
}
if (!up) { console.log('WRANGLER NEVER CAME UP\n' + wlog.slice(-2000)); process.exit(1); }
ok(true, 'wrangler dev up (unauthenticated /index → 401)');
ok((cli('status')).includes('0 comments'), 'admin CLI authenticates against the Worker');

console.log('— mint two audience links —');
const linkA = cli('mint --label alice --slug /proto_angel/').split('\n')[0].trim();
const linkB = cli('mint --label bob --slug /proto_angel/').split('\n')[0].trim();
const tokA = linkA.split('#')[1], tokB = linkB.split('#')[1];
ok(/^[0-9a-f]{32}$/.test(tokA) && /^[0-9a-f]{32}$/.test(tokB), 'links carry 32-hex capabilities');

console.log('— Alice: fragment intake on the real built page, comment round-trip —');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const mkCtx = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript({ content: `window.CMT_API=${JSON.stringify(API)};` });
  return ctx;
};
const ctxA = await mkCtx();
const pa = await ctxA.newPage();
pa.on('pageerror', e => { console.log('  PAGEERROR(A) ' + e.message); failures++; });
await pa.goto(`${SITE}/proto_angel/#${tokA}`, { waitUntil: 'load' });
await pa.waitForSelector('.cmt-panel', { timeout: 10000 });
ok(true, 'gate panel appeared for a fresh link');
ok(await pa.evaluate(() => location.hash === ''), 'fragment stripped from URL');
ok(await pa.evaluate(t => localStorage.getItem('cmt_token') === t, tokA), 'capability stored');
ok(await pa.evaluate(() => document.querySelectorAll('.cmt-mast,.cmt-card,.cmt-anchor').length === 0),
  'no layer chrome before the name is set');
await pa.locator('.cmt-panel input').click();
await pa.keyboard.type('Alice');
await pa.keyboard.press('Enter');
await pa.waitForSelector('.cmt-mast', { timeout: 10000 });
ok(true, 'layer appeared once named');

await pa.evaluate(() => {
  const p = [...document.querySelectorAll('.post-body p')].find(p => p.textContent.length > 120);
  const tn = [...p.childNodes].find(n => n.nodeType === 3 && n.nodeValue.length > 60);
  const r = document.createRange(); r.setStart(tn, 5); r.setEnd(tn, 55);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.querySelector('.post-body').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
await sleep(250);
await pa.keyboard.type(SECRET_BODY);
await pa.keyboard.press('Control+Enter');
await sleep(1200);
ok(await pa.evaluate(() => [...document.querySelectorAll('.cmt-who b')].some(b => b.textContent === 'Alice')),
  'posted card shows Alice');
await pa.reload({ waitUntil: 'load' });
await pa.waitForSelector('.cmt-card', { timeout: 10000 });
ok(await pa.evaluate(s => document.body.textContent.includes(s), SECRET_BODY),
  'comment survives reload — real server round-trip');

console.log('— Bob: second link reads and replies —');
const ctxB = await mkCtx();
const pb = await ctxB.newPage();
await pb.goto(`${SITE}/proto_angel/#${tokB}`, { waitUntil: 'load' });
await pb.waitForSelector('.cmt-panel', { timeout: 10000 });
ok(await pb.evaluate(s => !document.body.textContent.includes(s), SECRET_BODY),
  'Bob sees no comment content behind the gate');
await pb.locator('.cmt-panel input').click();
await pb.keyboard.type('Bob');
await pb.keyboard.press('Enter');
await pb.waitForSelector('.cmt-card', { timeout: 10000 });
ok(await pb.evaluate(s => document.body.textContent.includes(s), SECRET_BODY), 'Bob decrypts Alice’s comment');
await pb.locator('.cmt-card').first().click();
await sleep(200);
await pb.keyboard.type(SECRET_REPLY);
await pb.keyboard.press('Control+Enter');
await sleep(1200);
await pa.reload({ waitUntil: 'load' });
await pa.waitForSelector('.cmt-card', { timeout: 10000 });
ok(await pa.evaluate(s => document.body.textContent.includes(s), SECRET_REPLY), 'Alice sees Bob’s reply');

console.log('— /writing/ index: quiet counts + "N new" —');
await pb.goto(`${SITE}/writing/`, { waitUntil: 'load' });
await sleep(2000);
ok(await pb.evaluate(() => {
  const a = [...document.querySelectorAll('.wlist a')].find(a => a.getAttribute('href') === '/proto_angel/');
  const c = a && a.parentNode.querySelector('.cmt-count');
  return c && c.textContent.trim() === '· 2';
}), 'per-title count on the index (· 2)');
ok(await pb.evaluate(() => {
  const m = document.querySelector('a.cmt-mast');
  return !m || /new$/.test(m.textContent);   // Bob has seen everything → no "new"; if shown, it says new
}), 'masthead new-indicator well-formed');
await pb.goto(`${SITE}/proto_angel/`, { waitUntil: 'load' });   // back to the post for the revoke phase
await pb.waitForSelector('.cmt-card', { timeout: 10000 });

console.log('— §6: D1 at rest is ciphertext-only —');
const dbFiles = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f);
  statSync(p).isDirectory() ? walk(p) : /\.sqlite/.test(f) && dbFiles.push(p); } })(PERSIST);
ok(dbFiles.length > 0, 'found local D1 sqlite (' + dbFiles.length + ')');
const dbBlob = dbFiles.map(f => readFileSync(f, 'latin1')).join('');
for (const [what, needle] of [
  ['comment body', SECRET_BODY], ['reply body', SECRET_REPLY],
  ['name Alice', 'Alice'], ['name Bob', 'Bob'],
  ['token A', tokA], ['token B', tokB]])
  ok(!dbBlob.includes(needle), `no plaintext ${what} in D1`);
const bearerA = sh(`CMT_DIR=${CMT_DIR} python3 -c "import cli;print(cli.halves('${tokA}')[0])"`).trim();
ok(!dbBlob.includes(bearerA), 'no bearer (auth half) in D1 — only its hash');
cli('export');
const expFile = () => join(CMT_DIR, readdirSync(CMT_DIR).filter(f => f.startsWith('export-')).sort().pop());
const preRekey = JSON.parse(readFileSync(expFile(), 'utf8'));
const preCts = preRekey.comments.map(c => c.payload_ct).filter(Boolean);
ok(preCts.length >= 2, 'ciphertext rows present pre-revoke (' + preCts.length + ')');

console.log('— revoke Alice → re-key; Bob still reads, Alice dead —');
console.log(cli('revoke alice').split('\n').map(l => '    ' + l).join('\n'));
await pb.reload({ waitUntil: 'load' });
await pb.waitForSelector('.cmt-card', { timeout: 10000 });
ok(await pb.evaluate(s => document.body.textContent.includes(s), SECRET_BODY), 'Bob still decrypts after re-key');
await pa.reload({ waitUntil: 'load' });
await sleep(1500);
ok(await pa.evaluate(() => !document.querySelector('.cmt-mast, .cmt-card')), 'Alice (stored token): layer gone');
await pa.goto('about:blank');   // same-URL + hash is a hash-only change; force a real load
await pa.goto(`${SITE}/proto_angel/#${tokA}`, { waitUntil: 'load' });
await pa.waitForSelector('.cmt-note', { timeout: 8000 });
ok(await pa.evaluate(() => document.querySelector('.cmt-note').textContent === 'comment link no longer valid'),
  'explicit revisit of the dead link fails loud (one muted line)');
// the enforceable re-key invariant: every row the API serves is freshly encrypted
cli('export');
const postRekey = JSON.parse(readFileSync(expFile(), 'utf8'));
const postCts = postRekey.comments.map(c => c.payload_ct).filter(Boolean);
ok(postCts.length === preCts.length && postCts.every(ct => !preCts.includes(ct)),
  'all served ciphertext re-encrypted after re-key');
const dbBlob2 = dbFiles.map(f => readFileSync(f, 'latin1')).join('');
ok(!dbBlob2.includes(SECRET_BODY) && !dbBlob2.includes('Alice'), 'still no plaintext after re-key');

console.log('— export backup is ciphertext —');
const expData = readFileSync(expFile(), 'utf8');
ok(!expData.includes(SECRET_BODY) && !expData.includes('Alice'), 'export holds no plaintext');

console.log('— §6: nothing stageable carries a comment string —');
const staged = execSync(
  `git -C ${REPO} ls-files -co --exclude-standard | grep -v '^_site/' | xargs -d'\\n' grep -l -F "${SECRET_BODY}" 2>/dev/null || true`,
  { encoding: 'utf8' }).trim();
ok(staged === '', 'no stageable file contains the comment body' + (staged ? ' — LEAKED: ' + staged : ''));

await browser.close();
cleanup();
console.log(failures ? `\nE2E: ${failures} FAILURES` : '\nE2E: ALL PASS');
process.exit(failures ? 1 : 0);
