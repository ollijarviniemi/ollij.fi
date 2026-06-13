// Browser smoke test for the Inference-style UI: GM creates a room, previews +
// picks a hypothesis, starts a round; a trader joins via the LOBBY, sees the
// 10-row market grid, trades by clicking the grid (▲ top / ▼ bottom), and the
// round resolves. Fails on any console/page error.
// Prereq: node server :8788 + http.server :8090 in ollij.fi/.
import { chromium } from 'playwright';

const BASE = 'http://localhost:8090/factory-market/index.html';
const errors = [];
let failed = 0;
const ok = (c, m) => { if (c) console.log('  ok:', m); else { failed++; console.error('  FAIL:', m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
async function newPage(ctx, who) {
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errors.push(`[${who}] ${m.text()}`); });
    p.on('pageerror', e => errors.push(`[${who}] pageerror: ${e.message}`));
    await p.addInitScript(() => localStorage.setItem('factory-market.tutorialDone', '1'));
    return p;
}

try {
    const gm = await newPage(await browser.newContext(), 'GM');
    await gm.goto(BASE, { waitUntil: 'networkidle' });
    await gm.waitForSelector('#play-controls:not([hidden])', { timeout: 5000 });
    await gm.fill('#name', 'Teacher');
    await gm.click('#btn-create');
    await gm.waitForSelector('#gm-panel:not([hidden])', { timeout: 5000 });
    const code = await gm.evaluate(() => { try { return JSON.parse(localStorage.getItem('factory-market.session')).code; } catch { return ''; } });
    ok(/^[A-Z]{4}$/.test(code), `GM created room (${code})`);

    // GM picker: choose level, see hypotheses, pick one, start
    await gm.waitForFunction(() => document.querySelector('#gm-level')?.options.length > 0, { timeout: 5000 });
    await gm.selectOption('#gm-level', 'level-1').catch(() => {});
    await gm.waitForSelector('#gm-hyps .hyp', { timeout: 5000 });
    const hypCount = await gm.locator('#gm-hyps .hyp').count();
    ok(hypCount >= 1, `GM sees ${hypCount} hypotheses to choose from`);
    await gm.locator('#gm-hyps .hyp').first().click(); // pick a specific truth
    await sleep(200);
    await gm.click('#gm-start');
    await sleep(500);

    // trader joins via lobby
    const t = await newPage(await browser.newContext(), 'Trader');
    await t.goto(BASE, { waitUntil: 'networkidle' });
    await t.fill('#name', 'Ann');
    await t.waitForSelector(`.lobby-room button[data-code="${code}"]`, { timeout: 5000 });
    ok(true, 'room visible in lobby (no code typed)');
    await t.click(`.lobby-room button[data-code="${code}"]`);

    // market grid + per-column buttons present; no leaderboard / room code
    await t.waitForSelector('#market-canvas', { timeout: 5000 });
    ok(await t.locator('#market-canvas').isVisible(), 'market grid canvas visible');
    ok(await t.locator('#mkt-buys button[data-opt="0"][data-amt="25"]').count() === 1, 'per-column +25 buy button present');
    ok(await t.locator('#mkt-sells button[data-opt="0"][data-amt="25"]').count() === 1, 'per-column -25 sell button present');
    ok(await t.locator('#leaderboard, #room-code').count() === 0, 'leaderboard and room code removed');
    ok(await t.locator('.leave-bottom').count() === 1, 'leave button is at the bottom');

    // ball animates (check canvas non-blank)
    await sleep(3500);
    const nonBlank = await t.evaluate(() => {
        const c = document.querySelector('#factory-canvas'); const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data; const f = [d[0], d[1], d[2]];
        for (let i = 4; i < d.length; i += 4000 * 4) if (d[i] !== f[0] || d[i + 1] !== f[1] || d[i + 2] !== f[2]) return true;
        return false;
    });
    ok(nonBlank, 'factory canvas rendered');

    // trade with the per-column buttons: +5 then -5 ≈ neutral
    const bank0 = parseFloat(await t.textContent('#bankroll'));
    await t.click('#mkt-buys button[data-opt="0"][data-amt="5"]');
    await sleep(250);
    const bank1 = parseFloat(await t.textContent('#bankroll'));
    ok(bank1 < bank0, `+5 bought (mana ${bank0} → ${bank1})`);
    await t.click('#mkt-sells button[data-opt="0"][data-amt="5"]');
    await sleep(250);
    const bank2 = parseFloat(await t.textContent('#bankroll'));
    ok(Math.abs(bank2 - bank0) < 0.2, `+5 then -5 ~neutral (${bank0} → ${bank2})`);

    // the factory canvas must NOT blank out after trading (regression guard)
    const stillRendered = await t.evaluate(() => {
        const c = document.querySelector('#factory-canvas'); const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data; const f = [d[0], d[1], d[2]];
        for (let i = 4; i < d.length; i += 4000 * 4) if (d[i] !== f[0] || d[i + 1] !== f[1] || d[i + 2] !== f[2]) return true;
        return false;
    });
    ok(stillRendered, 'factory canvas still rendered after trading');

    // GM sees a grid of what each participant sees (one mini-factory per player)
    await gm.waitForSelector('.gm-cell canvas', { timeout: 5000 });
    ok(await gm.locator('.gm-cell').count() === 1, 'GM grid shows one cell per player');
    ok((await gm.locator('#gm-grid').isVisible()) && (await gm.locator('#factory-canvas').isHidden()), 'GM shows the player grid, not a single canvas');
    await sleep(2500);
    const gmCellRendered = await gm.evaluate(() => {
        const c = document.querySelector('.gm-cell canvas'); const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data; const f = [d[0], d[1], d[2]];
        for (let i = 4; i < d.length; i += 2000 * 4) if (d[i] !== f[0] || d[i + 1] !== f[1] || d[i + 2] !== f[2]) return true;
        return false;
    });
    ok(gmCellRendered, "GM grid cell renders the player's factory");

    // resolve
    await gm.click('#gm-incn'); await sleep(200);
    await gm.click('#gm-resolve'); await sleep(500);
    ok(/Resolved/.test(await t.textContent('#round-status')), 'resolved status shown');
    ok(await t.locator('.results').count() === 1, 'P/L table shown after resolve');

    await t.screenshot({ path: 'factory-market/tests/trader.png' });
    await gm.screenshot({ path: 'factory-market/tests/gm.png' });
} catch (e) {
    failed++; console.error('  EXCEPTION:', e.stack || e.message);
} finally {
    await browser.close();
}
if (errors.length) { console.error('\nConsole/page errors:'); errors.forEach(e => console.error('  ', e)); }
console.log(`\nsmoke: ${failed === 0 && errors.length === 0 ? 'PASS' : 'FAIL'} (${failed} fails, ${errors.length} console errors)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
