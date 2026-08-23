/* Friend-link e2e: the ONE shared 32-hex capability both DECRYPTS a protected post (the new
   protect.py friend block) AND lights up end-to-end-encrypted comments (the existing layer) —
   exercised exactly as the public site would, against a real Worker (wrangler dev + local D1),
   a real minted capability, a real jekyll-rendered post encrypted by protect.py, in a real
   headless browser. The four paths that matter:

     1. friend fragment  #<32hex>  → post decrypts, no passphrase box, comments activate,
                                      comment round-trips + survives reload; fragment stripped.
     2. returning friend (stored cmt_token, no fragment) → post still decrypts, comments load.
     3. AISI passphrase   #<pass>  → post decrypts, and NO comment UI / NO comment token
                                      (the load-bearing separation: passphrase never = comments).
     4. wrong 32-hex               → friend-unlock fails, passphrase box shown, post stays hidden.

   Plus §6: the comment body is ciphertext at rest in D1. Browsers headless (Olli's rule).
     NODE_PATH=/home/olli/node_modules node _protect/test-friend-comments.mjs
*/
import { createRequire } from 'module';
import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, cpSync } from 'fs';
import { join } from 'path';
const require = createRequire('/home/olli/node_modules/');
const { chromium } = require('playwright-core');

const REPO = '/home/olli/ollij.fi';
const CD = join(REPO, '_comments');
const SCRATCH = process.env.FC_SCRATCH ||
  join(process.env.TMPDIR || '/tmp', 'protect-friend-e2e-' + process.pid);
const CMT_DIR = join(SCRATCH, 'local');
const PERSIST = join(SCRATCH, 'wr');
const SITE_FULL = join(SCRATCH, 'site_full');
const PUB = join(SCRATCH, 'pub');
const WPORT = 8793, SPORT = 8099;   // SPORT must be in worker.js CORS_ORIGINS (8090/8091/8098/8099)
const API = `http://localhost:${WPORT}/api/comments`;
const SITE = `http://localhost:${SPORT}`;
const SLUG = 'zzz-friendpost';
const FIXTURE = join(REPO, '_writing', SLUG + '.md');
const PASS = 'aisi-test-passphrase-only';
const RUN = Date.now().toString(36);
const SENT = 'FriendSentinel-' + RUN;           // in the post plaintext, must never leak while locked
const CBODY = 'friend comment body zonk-' + RUN; // a posted comment, must be ciphertext in D1

let failures = 0;
const ok = (cond, name) => { console.log((cond ? '  ok  ' : '  FAIL ') + name); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sh = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', ...opts });
const cli = (args) => sh(`CMT_DIR=${CMT_DIR} python3 cli.py ${args}`, { cwd: CD });

let wrangler = null, site = null, browser = null;
function cleanup() {
  for (const c of [wrangler, site]) { try { process.kill(-c.pid, 'SIGKILL'); } catch (e) {} try { c && c.kill('SIGKILL'); } catch (e) {} }
  try { rmSync(FIXTURE, { force: true }); } catch (e) {}
  try { rmSync(SCRATCH, { recursive: true, force: true }); } catch (e) {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('uncaughtException', e => { console.log('UNCAUGHT: ' + (e.stack || e.message)); cleanup(); process.exit(1); });

// ---- stand up the real comment backend (local D1) --------------------------------------
execSync(`rm -rf ${SCRATCH}; mkdir -p ${SCRATCH}`);
console.log('— stand up wrangler dev + admin seed —');
sh(`npx wrangler d1 execute ollij-comments --local --persist-to ${PERSIST} --file schema.sql >/dev/null 2>&1`, { cwd: CD });
cli(`setup --api ${API} --force`);
sh(`npx wrangler d1 execute ollij-comments --local --persist-to ${PERSIST} --file ${CMT_DIR}/seed.sql >/dev/null 2>&1`, { cwd: CD });
wrangler = spawn('npx', ['wrangler', 'dev', '--port', String(WPORT), '--persist-to', PERSIST],
  { cwd: CD, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let wlog = ''; wrangler.stdout.on('data', d => wlog += d); wrangler.stderr.on('data', d => wlog += d);
let up = false;
for (let i = 0; i < 60; i++) { await sleep(1000); try { const r = await fetch(API + '/index'); if (r.status === 401) { up = true; break; } } catch (e) {} }
if (!up) { console.log('WRANGLER NEVER CAME UP\n' + wlog.slice(-1500)); process.exit(1); }
ok(true, 'wrangler dev up');

// ---- mint the ONE shared friend capability --------------------------------------------
const link = cli(`mint --label friends --slug /${SLUG}/`).split('\n')[0].trim();
const TOKEN = link.split('#')[1];
ok(/^[0-9a-f]{32}$/.test(TOKEN), 'minted a 32-hex friend capability');

// ---- author + render a protected fixture post, encrypt it with BOTH blocks -------------
console.log('— render fixture post, protect with passphrase + friend token —');
writeFileSync(FIXTURE, `---\ntitle: "Friend fixture post"\npublished: false\nprotected: true\n---\n# Friend fixture post\n\n${SENT}. A paragraph long enough to select and anchor a comment onto for the round-trip check — plenty of words here to make a range.\n`);
sh(`bundle exec jekyll build --unpublished -d ${SITE_FULL} >/dev/null 2>&1`, { cwd: REPO });
if (!existsSync(join(SITE_FULL, SLUG, 'index.html'))) { console.log('fixture did not render'); process.exit(1); }
const stubPage = join(SCRATCH, 'stub.page');
sh(`python3 _protect/protect.py ${SLUG} --test --password '${PASS}' --friend-token ${TOKEN} --site-dir ${SITE_FULL} --out-file ${stubPage} --permalink /${SLUG}/`, { cwd: REPO });
// the served stub HTML = the Jekyll page with front-matter + {% raw %} wrappers stripped
// (jekyll passes the {% raw %} body through verbatim, so this is byte-identical to public)
let stubHtml = readFileSync(stubPage, 'utf8')
  .replace(/^---\n[\s\S]*?\n---\n/, '')
  .replace(/^\{% raw %\}\n/, '').replace(/\n\{% endraw %\}\n?$/, '');
ok(!stubHtml.includes(SENT), 'stub leaks no plaintext (sentinel absent)');
mkdirSync(join(PUB, SLUG), { recursive: true });
writeFileSync(join(PUB, SLUG, 'index.html'), stubHtml);
cpSync(join(SITE_FULL, 'assets'), join(PUB, 'assets'), { recursive: true });   // real comments.js, css, theme
site = spawn('python3', ['-m', 'http.server', String(SPORT), '--bind', '127.0.0.1'],
  { cwd: PUB, stdio: 'ignore', detached: true });
await sleep(800);

browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const mkCtx = async (init) => {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await ctx.addInitScript({ content: `window.CMT_API=${JSON.stringify(API)};` + (init || '') });
  return ctx;
};
const has = (p, s) => p.evaluate(t => document.body.innerText.includes(t), s);
// Poll via evaluate() — each call re-acquires the current execution context, so this
// survives the stub's document.write (which destroys the context waitForFunction binds to).
const waitText = async (p, s, ms = 25000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (await has(p, s)) return true; } catch (e) {} await sleep(300); }
  return false;
};

// ---- 1) friend fragment: decrypt + comment ---------------------------------------------
console.log('— path 1: friend link (#token) → post + comments —');
const ctx1 = await mkCtx();
const p1 = await ctx1.newPage();
p1.on('pageerror', e => { console.log('  PAGEERROR ' + e.message); failures++; });
if (process.env.FC_DEBUG) { p1.on('console', m => console.log('  CONSOLE ' + m.type() + ': ' + m.text())); }
await p1.goto(`${SITE}/${SLUG}/#${TOKEN}`, { waitUntil: 'load' });
if (process.env.FC_DEBUG) { await sleep(3000); console.log('  DEBUG ' + JSON.stringify(await p1.evaluate(() => ({ hash: location.hash, cmtLoaded: !!window.__cmtLoaded, api: window.CMT_API, hasCMT: !!window.CMT, panel: !!document.querySelector('.cmt-panel'), mast: !!document.querySelector('.cmt-mast'), hasP: !!document.getElementById('p'), scripts: [...document.scripts].map(s => s.src).filter(Boolean) })))); }
ok(await waitText(p1, SENT), 'friend link decrypts the post (no passphrase typed)');
ok(!(await p1.evaluate(() => !!document.getElementById('p'))), 'no passphrase box on the friend path');
await p1.waitForSelector('.cmt-panel', { timeout: 10000 });
ok(true, 'comment gate panel appeared (comments activated by the same link)');
ok(await p1.evaluate(() => location.hash === ''), 'fragment stripped from the URL');
ok(await p1.evaluate(t => localStorage.getItem('cmt_token') === t, TOKEN), 'comment token stored for return visits');
await p1.locator('.cmt-panel input').click();
await p1.keyboard.type('Alice');
await p1.keyboard.press('Enter');
await p1.waitForSelector('.cmt-mast', { timeout: 10000 });
await p1.evaluate(() => {
  const para = [...document.querySelectorAll('.post-body p')].find(p => p.textContent.length > 120);
  const tn = [...para.childNodes].find(n => n.nodeType === 3 && n.nodeValue.length > 60);
  const r = document.createRange(); r.setStart(tn, 5); r.setEnd(tn, 55);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.querySelector('.post-body').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
});
await sleep(250);
await p1.keyboard.type(CBODY);
await p1.keyboard.press('Control+Enter');
await sleep(1200);
ok(await has(p1, CBODY), 'comment posted and visible');
await p1.reload({ waitUntil: 'load' });
await p1.waitForSelector('.cmt-card', { timeout: 10000 });
ok(await has(p1, CBODY), 'comment survives reload — real server round-trip');
ok(await has(p1, SENT), 'post still decrypts on return (from stored token, no fragment)');

// ---- 2) returning friend: stored token only, no fragment -------------------------------
console.log('— path 2: returning friend (stored cmt_token, no fragment) —');
const ctx2 = await mkCtx(`try{localStorage.setItem('cmt_token', ${JSON.stringify(TOKEN)});}catch(e){}`);
const p2 = await ctx2.newPage();
await p2.goto(`${SITE}/${SLUG}/`, { waitUntil: 'load' });
ok(await waitText(p2, SENT), 'stored token alone decrypts the post (no fragment, no passphrase)');
// a new browser (token but no name yet) hits the name-gate — the layer stays dark until named
await p2.waitForSelector('.cmt-panel', { timeout: 10000 });
ok(true, 'name-gate shown to the fresh browser');
await p2.locator('.cmt-panel input').click();
await p2.keyboard.type('Bob');
await p2.keyboard.press('Enter');
await p2.waitForSelector('.cmt-card', { timeout: 10000 });
ok(await has(p2, CBODY), 'returning friend reads the existing comment once named');

// ---- 3) AISI passphrase: post yes, comments NO ----------------------------------------
console.log('— path 3: AISI passphrase → post only, never comments —');
const ctx3 = await mkCtx();
const p3 = await ctx3.newPage();
if (process.env.FC_DEBUG) { p3.on('console', m => console.log('  P3 CONSOLE ' + m.type() + ': ' + m.text())); p3.on('pageerror', e => console.log('  P3 PAGEERROR ' + e.message)); }
await p3.goto(`${SITE}/${SLUG}/#${encodeURIComponent(PASS)}`, { waitUntil: 'load' });
if (process.env.FC_DEBUG) { await sleep(4000); console.log('  P3 DEBUG ' + JSON.stringify(await p3.evaluate(() => ({ hash: location.hash, hasP: !!document.getElementById('p'), err: document.getElementById('f') && document.getElementById('f').classList.contains('err'), disabled: document.getElementById('p') && document.getElementById('p').disabled, sentinel: document.body.innerText.includes('FriendSentinel'), title: document.title, readyState: document.readyState })))); }
// PBKDF2 is 600k iterations — deliberately slow, and slower still under the concurrent
// wrangler/browser load here, so give the one-click passphrase unlock generous headroom
ok(await waitText(p3, SENT), 'passphrase link decrypts the post');
await sleep(1500);   // give any (wrongly) loading comment layer time to appear
ok(await p3.evaluate(() => !document.querySelector('.cmt-mast, .cmt-panel, .cmt-card, .cmt-rail')),
   'NO comment UI on the passphrase path');
ok(!(await has(p3, CBODY)), 'passphrase reader cannot see the comment');
ok(await p3.evaluate(() => { try { return !localStorage.getItem('cmt_token'); } catch (e) { return true; } }),
   'passphrase path stores no comment token');

// ---- 4) wrong 32-hex: friend-unlock fails → passphrase box ----------------------------
console.log('— path 4: a wrong 32-hex → passphrase prompt, post stays hidden —');
const bad = 'deadbeef'.repeat(4);   // 32 hex, not the minted token
const ctx4 = await mkCtx();
const p4 = await ctx4.newPage();
await p4.goto(`${SITE}/${SLUG}/#${bad}`, { waitUntil: 'load' });
await sleep(1200);
ok(await p4.evaluate(() => !!document.getElementById('p')), 'wrong token falls through to the passphrase box');
ok(!(await has(p4, SENT)), 'post stays encrypted for a wrong token');

// ---- §6: the comment body is ciphertext at rest in D1 ---------------------------------
console.log('— §6: D1 holds no plaintext comment —');
const dbFiles = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.sqlite/.test(f) && dbFiles.push(p); } })(PERSIST);
const blob = dbFiles.map(f => readFileSync(f, 'latin1')).join('');
ok(dbFiles.length > 0 && !blob.includes(CBODY), 'comment body is ciphertext in D1 (no plaintext)');
ok(!blob.includes(TOKEN), 'friend token itself never stored server-side (only its hash)');

await browser.close();
cleanup();
console.log(failures ? `\nFRIEND-COMMENTS E2E: ${failures} FAILURE(S)` : '\nFRIEND-COMMENTS E2E: ALL PASS');
process.exit(failures ? 1 : 0);
