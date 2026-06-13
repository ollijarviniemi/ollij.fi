// Visual check of the tutorial: load each step, let balls animate, screenshot.
// Prereq: python3 -m http.server 8090 in ollij.fi/.  Run from ollij.fi/.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8090/factory-market/tutorial.html';
const errors = [];
let failed = 0;
const ok = (c, m) => { if (c) console.log('  ok:', m); else { failed++; console.error('  FAIL:', m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    for (let step = 1; step <= 5; step++) {
        const title = await page.textContent('#tut-title');
        ok(!!title, `step ${step} has a title: "${title}"`);
        await sleep(2600); // let several balls animate (2× speed)
        const nonBlank = await page.evaluate(() => {
            const c = document.querySelector('#factory-canvas'); const ctx = c.getContext('2d');
            const d = ctx.getImageData(0, 0, c.width, c.height).data; const f = [d[0], d[1], d[2]];
            for (let i = 4; i < d.length; i += 4000 * 4) if (d[i] !== f[0] || d[i + 1] !== f[1] || d[i + 2] !== f[2]) return true;
            return false;
        });
        ok(nonBlank, `step ${step} canvas non-blank`);
        await page.screenshot({ path: `factory-market/tests/tut-${step}.png` });
        if (step < 5) { await page.click('#tut-next'); await sleep(400); }
    }
    // final "Start playing" → should set flag and land on index with play controls
    await page.click('#tut-next');
    await page.waitForURL('**/index.html', { timeout: 4000 });
    await sleep(400);
    const playVisible = await page.locator('#play-controls').isVisible();
    const gateHidden = await page.locator('#tutorial-gate').isHidden();
    ok(playVisible && gateHidden, 'finishing tutorial unlocks room controls');
} catch (e) {
    failed++; console.error('  EXCEPTION:', e.stack || e.message);
} finally {
    await browser.close();
}
if (errors.length) { console.error('\nConsole errors:'); errors.forEach(e => console.error('  ', e)); }
console.log(`\ntutorial-smoke: ${failed === 0 && errors.length === 0 ? 'PASS' : 'FAIL'} (${failed} fails, ${errors.length} console errors)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
