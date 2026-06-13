// Verifies the ported level editor + manager load cleanly on the dev server and
// that a save round-trips to disk. Prereq: `python3 serve.py` (port 8090) in ollij.fi/.
// Run from ollij.fi/.  (Caller backs up/restores factory-market/levels/export.json.)
import { chromium } from 'playwright';

const BASE = 'http://localhost:8090/factory-market';
const errors = [];
let failed = 0;
const ok = (c, m) => { if (c) console.log('  ok:', m); else { failed++; console.error('  FAIL:', m); } };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

try {
    // ---- manager ----
    await page.goto(`${BASE}/manage.html`, { waitUntil: 'networkidle' });
    const mgr = await page.evaluate(() => ({
        levels: window.LevelRegistry?.getAllLevels()?.length ?? -1,
        blocked: document.body.innerHTML.includes('Wrong dev server'),
        hasEditorBtn: !![...document.querySelectorAll('button')].find(b => /editor/i.test(b.textContent)),
    }));
    ok(!mgr.blocked, 'manager not blocked (talking to serve.py)');
    ok(mgr.levels > 0, `manager loaded the inherited levels (${mgr.levels})`);
    ok(mgr.hasEditorBtn, 'manager has an Editor button');

    // ---- editor ----
    await page.goto(`${BASE}/editor.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const ed = await page.evaluate(() => ({
        blocked: document.body.innerHTML.includes('Wrong dev server'),
        palette: document.querySelector('#component-palette')?.children.length ?? 0,
        hasCanvas: !!document.querySelector('#editor-canvas'),
        status: document.querySelector('#status')?.textContent || '',
        levels: window.LevelRegistry?.getAllLevels()?.length ?? -1,
    }));
    ok(!ed.blocked, 'editor not blocked');
    ok(ed.palette > 0, `editor component palette populated (${ed.palette} components)`);
    ok(ed.hasCanvas, 'editor canvas present');
    ok(ed.levels > 0, `editor sees the level set (${ed.levels})`);

    // ---- save round-trip: append a cloned level via the registry, persist to disk ----
    const rt = await page.evaluate(() => {
        const all = window.LevelRegistry.getAllLevels();
        const clone = JSON.parse(JSON.stringify(all[0]));
        clone.meta = { ...clone.meta, id: 'test-editor-roundtrip', title: 'RT Test' };
        const before = all.length;
        window.LevelRegistry.saveLevels([...all, clone]); // synchronous POST to serve.py
        return { before, after: window.LevelRegistry.getAllLevels().length };
    });
    ok(rt.after === rt.before + 1, `save added a level in memory (${rt.before} → ${rt.after})`);

    // re-fetch export.json straight from disk and confirm it persisted
    const disk = await page.evaluate(async () => {
        const r = await fetch('/factory-market/levels/export.json?_=' + Date.now());
        const d = await r.json();
        return d.levels.some(l => l.meta.id === 'test-editor-roundtrip');
    });
    ok(disk, 'saved level persisted to factory-market/levels/export.json on disk');
} catch (e) {
    failed++; console.error('  EXCEPTION:', e.stack || e.message);
} finally {
    await browser.close();
}
if (errors.length) { console.error('\nConsole/page errors:'); errors.forEach(e => console.error('  ', e)); }
console.log(`\neditor-smoke: ${failed === 0 && errors.length === 0 ? 'PASS' : 'FAIL'} (${failed} fails, ${errors.length} console errors)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
