// Determinism check: the GM grid re-simulates each player's stream from the same
// (seed, level, N) the player's own client uses, so the landed-ball distributions
// MUST match. Here we run two independent FactoryReplay instances per seed (as
// the player + the GM's mirror would) and assert identical observation bins.
// Prereq: http.server :8090 in ollij.fi/. Run from ollij.fi/.
import { chromium } from 'playwright';

const errors = [];
let failed = 0;
const ok = (c, m) => { if (c) console.log('  ok:', m); else { failed++; console.error('  FAIL:', m); } };

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

try {
    // tutorial.html loads the engine + FactoryReplay + window.TUTORIAL_STEPS
    await page.goto('http://localhost:8090/factory-market/tutorial.html', { waitUntil: 'networkidle' });

    const trials = await page.evaluate(async () => {
        const level = window.TUTORIAL_STEPS[1].level; // the "mixer" (3-way splitter → routing RNG)
        const N = 24;
        const mk = (seed) => {
            const cv = document.createElement('canvas');
            cv.style.cssText = 'position:absolute;left:-9999px;top:-9999px';
            document.body.appendChild(cv);
            const r = new FactoryReplay(cv, { speed: 8, drawIntervalSim: 200 }); // fast, still fixed-step deterministic
            r.load(JSON.parse(JSON.stringify(level)), seed, N);
            return r;
        };
        const counts = (r) => r._observationComps().map(c => (c && c.observations ? c.observations.length : 0));
        const done = (r) => r._raf === null && r.spawned >= r.target;
        const out = [];
        for (const seed of [11, 22, 33, 44, 55]) {
            const a = mk(seed), b = mk(seed);
            await new Promise((res) => {
                const iv = setInterval(() => { if (done(a) && done(b)) { clearInterval(iv); res(); } }, 40);
                setTimeout(() => { clearInterval(iv); res(); }, 15000);
            });
            out.push({ seed, a: counts(a), b: counts(b), total: counts(a).reduce((x, y) => x + y, 0) });
            a.destroy(); b.destroy();
        }
        return out;
    });

    for (const t of trials) {
        ok(t.total === 24, `seed ${t.seed}: all 24 balls landed (got ${t.total})`);
        ok(JSON.stringify(t.a) === JSON.stringify(t.b), `seed ${t.seed}: two replays land identically [${t.a}] vs [${t.b}]`);
    }
    // routing actually varies by seed (otherwise the test would be vacuous)
    const distinct = new Set(trials.map(t => t.a.join(','))).size;
    ok(distinct > 1, `different seeds give different distributions (${distinct} distinct)`);
} catch (e) {
    failed++; console.error('  EXCEPTION:', e.stack || e.message);
} finally {
    await browser.close();
}
if (errors.length) { console.error('\nConsole errors:'); errors.forEach(e => console.error('  ', e)); }
console.log(`\ndeterminism: ${failed === 0 && errors.length === 0 ? 'PASS' : 'FAIL'} (${failed} fails, ${errors.length} console errors)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
