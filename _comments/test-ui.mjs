/* Comment-layer UI behavior suite — drives the REAL assets/js/comments.js through the
   mockup harness (fake in-memory API, real crypto path) in headless Chromium, and a core
   subset in real Firefox (see test-ui-ff.mjs launched by test.sh).

   Usage: node _comments/test-ui.mjs [--base http://localhost:8098]
   The page: dashboard/design/comments-mockup.html (dashboard/ is gitignored; data synthetic). */
import { createRequire } from 'module';
const require = createRequire('/home/olli/node_modules/');
const { chromium } = require('playwright-core');

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:8098';
const URL = BASE + '/dashboard/design/comments-mockup.html';

let failures = 0;
const ok = (cond, name) => { console.log((cond ? '  ok ' : '  FAIL ') + name); if (!cond) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
const page = await ctx.newPage();
page.on('pageerror', e => { console.log('  PAGEERROR ' + e.message); failures++; });

async function freshPage(query = '') {
  await page.goto('about:blank');
  await page.evaluate(() => {});
  await page.goto(URL + query, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}
async function resetIdentity() {
  await page.evaluate(() => {
    ['cmt_name', 'cmt_author', 'cmt_hidden', 'cmt_seen'].forEach(k => localStorage.removeItem(k));
    Object.keys(localStorage).forEach(k => { if (k.startsWith('cmt_drafts:')) localStorage.removeItem(k); });
  });
}
const storeSize = () => page.evaluate(() => MOCK.store.comments.length);
const storeJSON = () => page.evaluate(() => JSON.stringify(MOCK.store));
function selectInParagraph(pIdx, from, to) {
  return page.evaluate(([pIdx, from, to]) => {
    const p = document.querySelectorAll('.post-body p')[pIdx];
    const tn = [...p.childNodes].find(n => n.nodeType === 3 && n.nodeValue.length > to);
    const r = document.createRange(); r.setStart(tn, from); r.setEnd(tn, to);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const out = r.toString();
    document.querySelector('.post-body').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return out;
  }, [pIdx, from, to]);
}

console.log('— first visit: the gate panel (no name → no comments) —');
await freshPage(); await resetIdentity(); await freshPage();
ok(await page.locator('.cmt-panel').count() === 1, 'gate panel shows on first visit');
ok(await page.evaluate(() => document.querySelector('.cmt-panel').textContent
  .includes('comment access on my posts')), 'panel carries the info text');
ok(await page.locator('.cmt-card, .cmt-anchor, .cmt-mast').count() === 0,
  'no comments, washes, or masthead before a name is set');
await page.locator('.cmt-panel input').click();
await page.keyboard.press('Enter');
ok(await page.locator('.cmt-panel').count() === 1, 'empty name does not pass the gate');
await page.keyboard.press('Escape');
ok(await page.locator('.cmt-panel').count() === 1, 'Esc does not dismiss the gate');
await page.keyboard.type('Maria');
await page.keyboard.press('Enter');
await page.waitForSelector('.cmt-card.laid', { timeout: 8000 }).catch(() => {});
ok(await page.locator('.cmt-panel').count() === 0, 'panel closes on save');

console.log('— load & baseline —');
ok(await page.locator('.cmt-card').count() === 5, 'five seeded rail cards render');
ok(await page.locator('.cmt-anchor').count() >= 4, 'anchors wrapped (incl. across <em>)');
ok((await page.locator('.cmt-mast').textContent()) === 'comments · 6', 'masthead count');
ok(await page.locator('.cmt-quote').count() === 1, 'orphan shows its quote');
ok((await page.locator('.cmt-removed').count()) === 1, 'tombstone renders [deleted]');
ok(await page.evaluate(() => document.querySelector('.cmt-removed').textContent === '[deleted]'),
  'tombstone label is [deleted]');
ok(await page.evaluate(() => [...document.querySelectorAll('.cmt-who b')].some(b => b.classList.contains('olli'))),
  "Olli's name in brick");
ok(await page.evaluate(() => !document.querySelector('.cmt-card.laid') ||
  [...document.querySelectorAll('.cmt-rail .cmt-card')].every(c => c.classList.contains('laid'))), 'cards laid (no top-flash)');

console.log('— select → composer auto-opens, focused —');
const quote = await selectInParagraph(2, 10, 48);
await sleep(150);
ok(await page.locator('.cmt-card.cmt-compose').count() === 1, 'composer card appeared');
ok(await page.evaluate(() => document.activeElement.tagName === 'TEXTAREA'), 'caret already in composer');
ok(await page.evaluate(() => !document.querySelector('.cmt-compose input')), 'no inline name field (name lives in the panel)');

console.log('— untouched composer: Ctrl+C still copies the passage —');
await page.keyboard.press('Control+c');
const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
ok(clip === quote, 'clipboard got the selected passage (' + JSON.stringify(clip && clip.slice(0, 20)) + ')');

console.log('— empty composer sweeps on new intent; typed text never destroyed —');
await selectInParagraph(3, 5, 30); await sleep(150);
ok(await page.locator('.cmt-card.cmt-compose').count() === 1, 'old empty composer swept, new one open');
await page.keyboard.type('draft that must survive');
await selectInParagraph(2, 10, 40); await sleep(150);
ok(await page.evaluate(() => [...document.querySelectorAll('.cmt-compose textarea')]
  .some(t => t.value === 'draft that must survive')), 'typed composer survived new selection');
ok(await page.locator('.cmt-card.cmt-compose').count() === 1, 'no second composer stacked while one holds text');

console.log('— drafts survive reload —');
await freshPage();
ok(await page.evaluate(() => [...document.querySelectorAll('.cmt-compose textarea')]
  .some(t => t.value === 'draft that must survive')), 'draft restored after reload');
ok(await page.evaluate(() => document.activeElement.tagName !== 'TEXTAREA'), 'restored draft does not steal focus');

console.log('— posting: name from the panel, timestamp, encrypted at rest —');
await page.evaluate(() => { const t = [...document.querySelectorAll('.cmt-compose textarea')]
  .find(t => t.value); t.focus(); });
const n0 = await storeSize();
await page.keyboard.press('Control+Enter');
await sleep(400);
ok(await storeSize() === n0 + 1, 'comment persisted to store');
ok(await page.evaluate(() => [...document.querySelectorAll('.cmt-who b')].some(b => b.textContent === 'Maria')),
  'posted card carries the panel-set name');
ok(/[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}/.test(await page.evaluate(() =>
  [...document.querySelectorAll('.cmt-who')].map(w => w.textContent).join('|'))), 'time-of-day timestamps');
const dump1 = await storeJSON();
ok(!dump1.includes('draft that must survive') && !dump1.includes('Maria'), 'store holds only ciphertext');

console.log('— reply: whole card, and the highlight, are the target —');
await page.locator('.cmt-card[data-c="c2"]').click();
await sleep(100);
ok(await page.locator('.cmt-card[data-c="c2"] .cmt-reply-compose').count() === 1, 'card click opens reply composer');
ok(await page.evaluate(() => document.activeElement.tagName === 'TEXTAREA'), 'reply composer focused');
ok(await page.evaluate(() => document.querySelector('.cmt-card[data-c="c2"]').classList.contains('active')), 'thread activates');
await page.evaluate(() => document.querySelector('.cmt-anchor[data-c="c1"]').click());
await sleep(100);
ok(await page.locator('.cmt-card[data-c="c1"] .cmt-reply-compose').count() === 1, 'highlight click opens reply on its thread');
ok(await page.locator('.cmt-card[data-c="c2"] .cmt-reply-compose').count() === 0, 'empty reply composer swept when intent moved');
const n1 = await storeSize();
await page.keyboard.type('replying via the highlight');
await page.keyboard.press('Control+Enter');
await sleep(400);
ok(await storeSize() === n1 + 1, 'reply persisted');
ok(await page.evaluate(() => document.querySelector('.cmt-card[data-c="c1"]').textContent.includes('replying via the highlight')),
  'reply rendered in thread');

console.log('— no tiny buttons anywhere —');
ok(await page.evaluate(() => !document.body.textContent.match(/·\s*now/)), 'no "· now" noise');
ok(await page.evaluate(() => ![...document.querySelectorAll('.cmt-card *')]
  .some(e => e.children.length === 0 && e.textContent.trim() === 'Reply')), 'no Reply buttons');

console.log('— edit own comment: hover affordance, prefill, · edited —');
const myCard = await page.evaluate(() => {
  const p = [...document.querySelectorAll('.cmt-rail .cmt-item-root .cmt-body')]
    .find(p => p.textContent === 'draft that must survive');
  return p.closest('.cmt-card').dataset.c;
});
await sleep(350);                       // let the rail's top-transitions settle before aiming the mouse
await page.hover('.cmt-card[data-c="' + myCard + '"]');
await sleep(200);
ok(await page.evaluate(c => {
  const ed = document.querySelector('.cmt-card[data-c="' + c + '"] .cmt-item-root .cmt-edit');
  return ed && getComputedStyle(ed).opacity > 0;
}, myCard), 'edit affordance appears on hover of own card');
await page.locator('.cmt-card[data-c="' + myCard + '"] .cmt-item-root .cmt-edit').click();
ok(await page.evaluate(c => document.querySelector('.cmt-card[data-c="' + c + '"] .cmt-item-root textarea').value
  === 'draft that must survive', myCard), 'edit prefilled with current text');
await page.keyboard.press('Control+a'); await page.keyboard.type('edited body');
await page.keyboard.press('Control+Enter');
await sleep(400);
ok(await page.evaluate(c => document.querySelector('.cmt-card[data-c="' + c + '"] .cmt-item-root').textContent.includes('edited body'), myCard),
  'body updated');
ok(await page.evaluate(c => document.querySelector('.cmt-card[data-c="' + c + '"] .cmt-item-root .cmt-who').textContent.includes('· edited'), myCard),
  '"· edited" marker');
ok(!(await storeJSON()).includes('edited body'), 'edit stored as ciphertext');

console.log('— delete = edit to empty (hint flips), wash goes with it —');
const washes0 = await page.locator('.cmt-anchor').count();
await sleep(350);
await page.hover('.cmt-card[data-c="' + myCard + '"]');
await page.locator('.cmt-card[data-c="' + myCard + '"] .cmt-item-root .cmt-edit').click();
await page.waitForSelector('.cmt-card[data-c="' + myCard + '"] textarea', { timeout: 5000 });
await page.keyboard.press('Control+a'); await page.keyboard.press('Delete');
await page.waitForFunction(c => {
  const h = document.querySelector('.cmt-card[data-c="' + c + '"] .cmt-hint');
  return h && h.textContent.includes('delete');
}, myCard, { timeout: 5000 }).catch(() => {});
ok(await page.evaluate(c => document.querySelector('.cmt-card[data-c="' + c + '"] .cmt-hint').textContent
  .includes('delete'), myCard), 'hint flips to delete on empty');
await page.keyboard.press('Control+Enter');
await page.waitForFunction(c => !document.querySelector('.cmt-card[data-c="' + c + '"]'),
  myCard, { timeout: 5000 }).catch(() => {});
ok(await page.locator('.cmt-card[data-c="' + myCard + '"]').count() === 0, 'card gone');
ok(await page.locator('.cmt-anchor').count() < washes0, 'its wash gone too');

console.log('— rename propagates everywhere —');
await page.evaluate(() => document.querySelector('.cmt-mine-name').click());
await page.keyboard.press('Control+a'); await page.keyboard.type('M. Renamed');
await page.keyboard.press('Enter');
await sleep(400);
ok(await page.evaluate(() => [...document.querySelectorAll('.cmt-mine-name')]
  .every(b => b.textContent === 'M. Renamed')), 'all own cards show new name');
ok(!(await storeJSON()).includes('M. Renamed'), 'name at rest is ciphertext');

console.log('— (i) reopens the panel: info text + rename —');
await page.locator('.cmt-info').click();
await sleep(100);
ok(await page.locator('.cmt-panel').count() === 1, '(i) opens the panel');
ok(await page.evaluate(() => document.querySelector('.cmt-panel input').value === 'M. Renamed'),
  'panel name field prefilled with current name');
await page.keyboard.press('Escape');
ok(await page.locator('.cmt-panel').count() === 0, 'Esc closes the non-gated panel');
await page.locator('.cmt-info').click();
await sleep(100);
await page.locator('.cmt-panel input').click();
await page.keyboard.press('Control+a'); await page.keyboard.type('Panel Name');
await page.keyboard.press('Enter');
await sleep(400);
ok(await page.locator('.cmt-panel').count() === 0, 'panel closes after rename');
ok(await page.evaluate(() => [...document.querySelectorAll('.cmt-mine-name')]
  .every(b => b.textContent === 'Panel Name')), 'panel rename propagates to all own cards');

console.log('— hide/show toggle —');
await page.locator('.cmt-mast').click();
ok(await page.evaluate(() => document.body.getAttribute('data-cmt') === 'off'), 'layer off');
ok((await page.locator('.cmt-mast').textContent()) === 'comments', 'label dims to bare "comments"');
ok(await page.evaluate(() => getComputedStyle(document.querySelector('.cmt-rail')).display === 'none'), 'rail hidden');
await selectInParagraph(4, 3, 25); await sleep(150);
ok(await page.locator('.cmt-card.cmt-compose').count() === 0, 'selection does nothing while off');
await freshPage();
ok(await page.evaluate(() => document.body.getAttribute('data-cmt') === 'off'), 'off state persists across reload');
await page.locator('.cmt-mast').click();
ok(await page.evaluate(() => document.body.getAttribute('data-cmt') === 'on'), 'back on');

console.log('— anchored-only: no post-level composer exists —');
ok(await page.locator('.cmt-general, .cmt-gc').count() === 0, 'no general/post-level composer anywhere');

console.log('— failure: fail loud, retry works —');
await page.evaluate(() => { MOCK.fail = true; });
await selectInParagraph(1, 5, 30); await sleep(150);
await page.keyboard.type('will fail first');
await page.keyboard.press('Control+Enter');
await sleep(500);
ok(await page.locator('.cmt-failline').count() === 1, '"not saved — retry" shown');
await page.evaluate(() => { MOCK.fail = false; });
const n3 = await storeSize();
await page.locator('.cmt-failline').click();
await sleep(500);
ok(await page.locator('.cmt-failline').count() === 0, 'retry clears the failure');
ok(await storeSize() === n3 + 1, 'retried comment persisted');

console.log('— admin sees edit on every card —');
await freshPage('?admin=1');
ok(await page.evaluate(() => [...document.querySelectorAll('.cmt-rail .cmt-card')]
  .filter(c => !c.querySelector('.cmt-removed'))
  .every(c => c.querySelector('.cmt-edit'))), 'edit affordance on all cards for admin');

console.log('— public view: nothing —');
await freshPage('?public=1');
ok(await page.locator('.cmt-card, .cmt-anchor, .cmt-mast, .cmt-panel, .cmt-info').count() === 0,
  'zero layer elements for public');

await browser.close();
console.log(failures ? `\nUI SUITE: ${failures} FAILURES` : '\nUI SUITE: ALL PASS');
process.exit(failures ? 1 : 0);
