/* Comment layer — REAL Firefox pass (headless, snap binary + raw geckodriver, the
   extension-suite pattern). Chromium (test-ui.mjs) carries the deep behavior matrix; this
   validates the engine-sensitive paths: Selection/Range wrapping, keyboard chords,
   contenteditable rename, focus handling.
   Cleanup rule: leaked geckodrivers are reaped via
   `systemctl --user stop 'snap.firefox.geckodriver-*.scope'` — never pkill. */
import { createRequire } from 'module';
const require = createRequire('/home/olli/node_modules/');
const { Builder, By } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox.js');

const FF = '/snap/firefox/current/usr/lib/firefox/firefox';
const GECKO = '/snap/firefox/current/usr/lib/firefox/geckodriver';
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1] : 'http://localhost:8098';
const URL = BASE + '/dashboard/design/comments-mockup.html';

let failures = 0;
const ok = (cond, name) => { console.log((cond ? '  ok ' : '  FAIL ') + name); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const driver = await new Builder().forBrowser('firefox')
  .setFirefoxOptions(new firefox.Options().setBinary(FF).addArguments('-headless', '--width=1600', '--height=1000'))
  .setFirefoxService(new firefox.ServiceBuilder(GECKO)).build();

try {
  await driver.get(URL);
  await sleep(400);
  await driver.executeScript(`
    ['cmt_name','cmt_author','cmt_hidden'].forEach(k=>localStorage.removeItem(k));
    Object.keys(localStorage).forEach(k=>{if(k.startsWith('cmt_drafts:'))localStorage.removeItem(k);});`);
  await driver.get(URL);
  await sleep(900);

  // first visit: the gate panel holds until a name is saved
  ok(await driver.executeScript(`return document.querySelectorAll('.cmt-panel').length`) === 1,
    'gate panel shows on first visit');
  ok(await driver.executeScript(`return document.querySelectorAll('.cmt-card,.cmt-anchor,.cmt-mast').length`) === 0,
    'no comments before a name is set');
  await driver.findElement(By.css('.cmt-panel input')).sendKeys('FFox');
  await driver.executeScript(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await sleep(700);
  ok(await driver.executeScript(`return document.querySelectorAll('.cmt-panel').length`) === 0,
    'panel closes on save');

  const counts = await driver.executeScript(`return {
    cards: document.querySelectorAll('.cmt-card').length,
    anchors: document.querySelectorAll('.cmt-anchor').length,
    mast: (document.querySelector('.cmt-mast')||{}).textContent||'MISSING' }`);
  ok(counts.cards === 5, 'seeded cards render (' + counts.cards + ')');
  ok(counts.anchors >= 4, 'anchors wrapped');
  ok(counts.mast === 'comments · 6', 'masthead count');

  // select → composer, focused
  await driver.executeScript(`
    const p = document.querySelectorAll('.post-body p')[2];
    const tn = [...p.childNodes].find(n => n.nodeType === 3 && n.nodeValue.length > 48);
    const r = document.createRange(); r.setStart(tn, 10); r.setEnd(tn, 48);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.querySelector('.post-body').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));`);
  await sleep(300);
  ok(await driver.executeScript(`return document.querySelectorAll('.cmt-card.cmt-compose').length`) === 1,
    'composer opens on selection');
  ok(await driver.executeScript(`return document.activeElement.tagName`) === 'TEXTAREA', 'composer focused');

  // type, post — the name came from the gate panel
  await driver.switchTo().activeElement().sendKeys('firefox says hello');
  await driver.executeScript(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}))`);
  await sleep(600);
  const posted = await driver.executeScript(`return {
    n: MOCK.store.comments.length,
    shown: [...document.querySelectorAll('.cmt-who b')].some(b => b.textContent === 'FFox'),
    cipher: !JSON.stringify(MOCK.store).includes('firefox says hello') }`);
  ok(posted.n === 8, 'comment persisted (' + posted.n + ')');
  ok(posted.shown, 'panel-set name shown on card');
  ok(posted.cipher, 'ciphertext at rest');

  // whole card = reply target
  await driver.findElement(By.css('.cmt-card[data-c="c2"]')).click();
  await sleep(250);
  ok(await driver.executeScript(`return document.querySelectorAll('.cmt-card[data-c="c2"] .cmt-reply-compose').length`) === 1,
    'card click opens reply');
  ok(await driver.executeScript(`return document.activeElement.tagName`) === 'TEXTAREA', 'reply focused');

  // highlight = reply target too; empty composer sweeps
  await driver.executeScript(`document.querySelector('.cmt-anchor[data-c="c1"]').click()`);
  await sleep(250);
  ok(await driver.executeScript(`return document.querySelectorAll('.cmt-card[data-c="c1"] .cmt-reply-compose').length`) === 1,
    'highlight click opens its thread reply');
  ok(await driver.executeScript(`return document.querySelectorAll('.cmt-card[data-c="c2"] .cmt-reply-compose').length`) === 0,
    'empty composer swept');

  // rename propagates (contenteditable)
  await driver.executeScript(`document.querySelector('.cmt-mine-name').click()`);
  await sleep(100);
  await driver.switchTo().activeElement().sendKeys('Renamed FF');
  await driver.executeScript(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await sleep(500);
  ok(await driver.executeScript(`return [...document.querySelectorAll('.cmt-mine-name')].every(b => /Renamed FF/.test(b.textContent))`),
    'rename propagates');

  // toggle off hides everything
  await driver.executeScript(`document.querySelector('.cmt-mast').click()`);
  ok(await driver.executeScript(`return document.body.getAttribute('data-cmt')`) === 'off', 'layer toggles off');
} finally {
  await driver.quit();
}
console.log(failures ? `\nFF SUITE: ${failures} FAILURES` : '\nFF SUITE: ALL PASS');
process.exit(failures ? 1 : 0);
