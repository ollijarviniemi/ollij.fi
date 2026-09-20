// Tier 2 — the AUTHORITATIVE check: a REAL headless Firefox drives the stub the way
// an AISI reviewer would — arrive, type a wrong passphrase, type the right one, read
// the post — asserting the decrypted page really renders (content, inlined images,
// KaTeX), not just that decryption returns bytes. Same real-browser stack as
// extension/test-e2e-firefox.mjs (Playwright/chromium false-greens are banned history).
//   NODE_PATH=/home/olli/node_modules node test-e2e.mjs <siteDir> <urlpath:sentinel:kind>... \
//       --pass <passphrase> [--shots <dir>] [--base <url>]
// --base https://ollij.fi drives the LIVE site instead of serving <siteDir> (pass - for siteDir).
import { createServer } from 'http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { Builder, Key } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const FF = '/snap/firefox/current/usr/lib/firefox/firefox';
const GECKO = '/snap/firefox/current/usr/lib/firefox/geckodriver';

const argv = process.argv.slice(2);
const siteDir = argv.shift();
const posts = [];   // {path, sentinel, kind: 'images'|'math'}
let passphrase = '', shots = '', baseArg = '';
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--pass') passphrase = argv[++i];
  else if (argv[i] === '--shots') shots = argv[++i];
  else if (argv[i] === '--base') baseArg = argv[++i];
  else { const [path, sentinel, kind] = argv[i].split(':'); posts.push({ path, sentinel, kind }); }
}
if (shots) mkdirSync(shots, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.json': 'application/json',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.xml': 'application/xml' };
let server = null, BASE;
let cssDelayMs = 0;   // >0: /assets/css/* is served this late — makes an external-stylesheet flash catchable
if (baseArg) {
  BASE = baseArg.replace(/\/+$/, '');
} else {
  server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = join(siteDir, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('no'); return; }
    const send = () => {
      res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' });
      res.end(readFileSync(f));
    };
    if (cssDelayMs && p.startsWith('/assets/css/')) setTimeout(send, cssDelayMs); else send();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  BASE = `http://localhost:${server.address().port}`;
}

const opts = new firefox.Options().setBinary(FF).addArguments('-headless');
const service = new firefox.ServiceBuilder(GECKO);
let driver, fails = 0;
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`); if (!cond) fails++; };
const poll = async (fn, ms) => { const t0 = Date.now(); let v;
  while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await driver.sleep(250); } return v; };
const bodyHas = (s) => driver.executeScript('return document.body.innerText.includes(arguments[0])', s);
const shot = async (name) => { if (shots) writeFileSync(join(shots, name), Buffer.from(await driver.takeScreenshot(), 'base64')); };

try {
  driver = await new Builder().forBrowser('firefox').setFirefoxOptions(opts).setFirefoxService(service).build();
  await driver.manage().window().setRect({ width: 1280, height: 900 });

  for (const { path, sentinel, kind } of posts) {
    const url = `${BASE}/${path}/`;
    console.log(`\n/${path}/ (${kind}, sentinel "${sentinel}")`);

    // locked state: a passphrase box and nothing else
    await driver.get(url);
    const input = await poll(() => driver.executeScript('return !!document.getElementById("p")'), 5000);
    ok('stub shows the passphrase input', !!input);
    ok('post content is NOT in the DOM before unlock', !(await bodyHas(sentinel)));
    const pwmgr = await driver.executeScript(`
      var p = document.getElementById('p'), u = document.getElementById('u');
      return !!(p && p.getAttribute('autocomplete') === 'current-password'
             && u && u.getAttribute('autocomplete') === 'username');`);
    ok('password-manager semantics (current-password + username fields)', !!pwmgr);
    await shot(`${path}-locked.png`);

    // wrong passphrase → shake, still locked
    await driver.findElement({ id: 'p' }).sendKeys('wrong-horse-battery', Key.ENTER);
    const err = await poll(() => driver.executeScript('return document.getElementById("f").classList.contains("err")'), 15000);
    ok('wrong passphrase → error state, no content', !!err && !(await bodyHas(sentinel)));
    await shot(`${path}-wrong.png`);

    // right passphrase → the real page
    await driver.executeScript('const p=document.getElementById("p"); p.value=""; p.focus()');
    await driver.findElement({ id: 'p' }).sendKeys(passphrase, Key.ENTER);
    const open = await poll(() => bodyHas(sentinel), 30000);
    ok('right passphrase → post content renders', !!open);
    const title = await driver.getTitle();
    ok('document <title> is the post\'s (head swapped in)', title !== 'ollij.fi' && title.length > 0, `"${title}"`);

    if (open && kind === 'images') {
      const imgs = await driver.executeScript(`return [...document.images].map(i => (
        { data: i.src.startsWith('data:'), loaded: i.complete && i.naturalWidth > 0 }))`);
      ok(`all ${imgs.length} image(s) are inlined data: URIs and actually load`,
         imgs.length > 0 && imgs.every(i => i.data && i.loaded));
    }
    if (open && kind === 'math') {
      const katex = await poll(() => driver.executeScript('return document.querySelectorAll(".katex").length'), 20000);
      ok('KaTeX rendered after decryption (deferred site scripts ran)', katex > 0, `${katex} node(s)`);
    }
    await shot(`${path}-open.png`);

    // fragment flow: the one-click link — #passphrase auto-unlocks, no typing
    await driver.get('about:blank');
    await driver.get(`${url}#${encodeURIComponent(passphrase)}`);
    ok('#fragment link auto-unlocks', !!(await poll(() => bodyHas(sentinel), 30000)));

    // No flash between the stub and the post (Olli, 2026-09-20: "for a split second when one
    // has opened the link, it shows a white background and non-rendered markdown, before
    // showing the rendered site"). A document.write'd page paints BEFORE its external
    // stylesheet arrives, so the decrypted page must carry site.css INLINE. Serve the CSS
    // 600 ms late and sample the body colour every few ms across the whole unlock: paper
    // (light or dark) on every sample, or the flash is real.
    cssDelayMs = 600;
    await driver.get('about:blank');
    await driver.get(`${url}#${encodeURIComponent(passphrase)}`);
    const samples = []; const t0 = Date.now(); let seenPost = 0;
    while (Date.now() - t0 < 30000) {
      samples.push(await driver.executeScript(`
        var b = document.body;
        return { stub: !!document.documentElement.getAttribute('data-protect-stub'),
                 bg: b ? getComputedStyle(b).backgroundColor : 'nobody',
                 post: !!(b && b.innerText.includes(arguments[0])),
                 links: document.querySelectorAll('link[rel="stylesheet"]').length };`, sentinel));
      const last = samples[samples.length - 1];
      if (last.post) { seenPost = seenPost || Date.now(); if (Date.now() - seenPost > 1000) break; }
    }
    cssDelayMs = 0;
    const PAPER = new Set(['rgb(251, 250, 246)', 'rgb(22, 21, 15)']);   // site.css --bg light / dark
    const post = samples.filter(x => x.post), off = samples.filter(x => !PAPER.has(x.bg));
    ok('no flash: body is paper on every sample across the unlock (site.css served 600 ms late)',
       post.length > 0 && off.length === 0,
       `${samples.length} samples, ${off.length} off-paper${off.length ? ', e.g. ' + JSON.stringify(off[0]) : ''}`);
    ok('decrypted page carries its stylesheet inline (no external <link rel=stylesheet>)',
       post.length > 0 && post[post.length - 1].links === 0);

    // The stub honours the site's own theme choice (localStorage 'theme', set by the masthead
    // toggle), not just the OS scheme — else a dark-mode reader gets a light box that jumps dark.
    await driver.get(url);
    await driver.executeScript("localStorage.setItem('theme', 'dark')");
    await driver.get('about:blank');
    await driver.get(url);
    await poll(() => driver.executeScript('return !!document.getElementById("p")'), 5000);
    const darkBg = await driver.executeScript('return getComputedStyle(document.body).backgroundColor');
    ok('stub follows the site theme stored by its toggle (theme=dark → dark paper)', darkBg === 'rgb(22, 21, 15)', darkBg);
    await driver.executeScript("localStorage.removeItem('theme')");
  }
} catch (e) {
  console.log('\n✗ FAIL  harness error:', e.message);
  fails++;
} finally {
  if (driver) await driver.quit().catch(() => {});
  if (server) server.close();
}

console.log(`\n${fails ? '✗ ' + fails + ' FAILURE(S)' : '✓ real-Firefox e2e PASSED'}`);
process.exit(fails ? 1 : 0);
