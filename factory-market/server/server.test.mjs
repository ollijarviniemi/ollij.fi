// End-to-end server test: boot the server, drive a full round over real sockets.
// Run: node server/server.test.mjs
//
// State/level are pushed by the server; we cache the latest of each on every
// client and poll for conditions (race-free), rather than chasing one-shot events.
import { io as Client } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8799;
const URL = `http://localhost:${PORT}`;

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.error('  FAIL:', m); } };
const approx = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function connect() {
    const s = Client(URL, { transports: ['websocket'], forceNew: true });
    s._state = null; s._level = null;
    s.on('state', x => { s._state = x; });
    s.on('level', x => { s._level = x; });
    return s;
}
const emit = (s, ev, payload) => new Promise((res) => s.emit(ev, payload, res));
async function until(fn, label, ms = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(10); }
    throw new Error(`timeout waiting for: ${label}`);
}

const proc = spawn('node', [join(__dir, 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await once(proc.stdout, 'data');
await sleep(150);

try {
    const gm = connect(); await once(gm, 'connect');
    const created = await emit(gm, 'room:create', { name: 'Teacher' });
    ok(created.ok && created.isGM, 'GM creates room');
    const code = created.code;

    const a = connect(); await once(a, 'connect');
    const b = connect(); await once(b, 'connect');
    const ja = await emit(a, 'room:join', { code, name: 'Ann' });
    const jb = await emit(b, 'room:join', { code, name: 'Bob' });
    ok(ja.ok && !ja.isGM, 'trader Ann joins');
    ok(jb.ok && !jb.isGM, 'trader Bob joins');

    // Lobby: a fresh watcher sees the open room (no code typed)
    const watcher = connect(); await once(watcher, 'connect');
    const lob = await new Promise(res => { watcher.once('lobby', res); watcher.emit('lobby:join'); });
    ok(lob.rooms.some(r => r.code === code && r.host === 'Teacher' && r.players === 2), 'open room appears in lobby with host + player count');
    watcher.disconnect();

    const lvls = await emit(gm, 'gm:levels', {});
    ok(lvls.ok && lvls.levels.length > 0, 'gm lists levels');
    const lvl = lvls.levels.find(l => l.numOptions >= 2);

    const started = await emit(gm, 'gm:start', { levelId: lvl.id, liquidity: 100, altIndex: 0 });
    ok(started.ok, 'gm starts level');

    const aLevel = await until(() => a._level, 'Ann level');
    ok(aLevel.level && aLevel.options.length >= 2, 'trader receives locked level');
    ok(typeof aLevel.seed === 'number', 'trader receives a private seed');
    ok(aLevel.level.dgpAlternatives === undefined, 'locked level has alternatives stripped');
    const bLevel = await until(() => b._level, 'Bob level');
    ok(bLevel.seed !== aLevel.seed, 'Ann and Bob get different seeds');

    let st = await until(() => (a._state?.round ? a._state : null), 'Ann round state');
    const n = st.round.options.length;
    ok(approx(st.round.options.reduce((s, o) => s + o.price, 0), 1), 'prices sum to 1');
    ok(st.round.options.every(o => approx(o.price, 1 / n)), 'prices start equal');
    ok(st.round.trueProbs === null, 'trader does NOT see true probs before resolve');
    ok(st.you.bankroll === 500, 'trader starts at 500 mana');
    ok(Array.isArray((await until(() => (gm._state?.round ? gm._state : null), 'gm state')).round.trueProbs), 'GM sees true probs');

    // Ann buys outcome 0 up
    const t1 = await emit(a, 'trade', { action: 'up', option: 0, amount: 25 });
    ok(t1.ok, 'trade up accepted');
    ok(t1.you.you.bankroll < 500, 'mana deducted from buyer');
    ok(t1.you.round.myShares[0] > 0, 'buyer holds shares in outcome 0');
    const afterUp = await until(() => (b._state?.round?.options[0].price > 1 / n ? b._state : null), 'price rise seen by Bob');
    ok(approx(afterUp.round.options.reduce((s, o) => s + o.price, 0), 1), 'still sums to 1 after trade');

    // Bob bets outcome 0 DOWN while flat → opens a short on outcome 0 ONLY
    const t2 = await emit(b, 'trade', { action: 'down', option: 0, amount: 25 });
    ok(t2.ok, 'trade down accepted');
    ok(t2.you.round.myShares[0] < 0 && t2.you.round.myShares.slice(1).every(x => Math.abs(x) < 1e-6), 'down-while-flat shorts that option only (no spread)');

    const tBad = await emit(a, 'trade', { action: 'up', option: 1, amount: 1000 });
    ok(!tBad.ok, 'overspend rejected');

    // "down" sells Ann's long (no separate sell button), crediting mana back
    const longBefore = t1.you.round.myShares[0];
    const tDown = await emit(a, 'trade', { action: 'down', option: 0, amount: 25 });
    ok(tDown.ok, 'down (sell long) accepted');
    ok(tDown.you.round.myShares[0] < longBefore, "down reduced Ann's long");
    ok(tDown.you.you.bankroll > t1.you.you.bankroll, 'down credited mana back');

    // Isolated up-m-then-down-m returns to neutral (no intervening trades)
    {
        const g2 = connect(); await once(g2, 'connect');
        const c2 = (await emit(g2, 'room:create', { name: 'H2' })).code;
        const z = connect(); await once(z, 'connect');
        await emit(z, 'room:join', { code: c2, name: 'Z' });
        await emit(g2, 'gm:start', { levelId: lvl.id, liquidity: 100, altIndex: 0 });
        await until(() => z._state?.round, 'Z round');
        await emit(z, 'trade', { action: 'up', option: 0, amount: 5 });
        const dn = await emit(z, 'trade', { action: 'down', option: 0, amount: 5 });
        ok(approx(dn.you.you.bankroll, 500, 0.05), `isolated up5/down5 ~neutral bankroll (${dn.you.you.bankroll})`);
        ok(approx(dn.you.round.myShares[0], 0, 1e-3), 'isolated up5/down5 closes the position');
        g2.disconnect(); z.disconnect();
    }

    // Manifold cross-option auto-redemption: long on EVERY option frees the common amount as mana
    {
        const g3 = connect(); await once(g3, 'connect');
        const c3 = (await emit(g3, 'room:create', { name: 'H3' })).code;
        const z = connect(); await once(z, 'connect');
        await emit(z, 'room:join', { code: c3, name: 'Z3' });
        const L3 = (await emit(g3, 'gm:levels', {})).levels.find(l => l.numOptions >= 2);
        await emit(g3, 'gm:start', { levelId: L3.id, liquidity: 100, altIndex: 0 });
        const nopt = (await until(() => (z._state?.round ? z._state : null), 'z3 round')).round.options.length;
        for (let o = 0; o < nopt; o++) await emit(z, 'trade', { action: 'up', option: o, amount: 10 });
        const st = await until(() => z._state, 'z3 final');
        ok(Math.min(...st.round.myShares) < 1e-3, 'long on every option auto-redeems the common amount (a min position → ~0)');
        ok(st.you.bankroll > (500 - nopt * 10) + 1, `redemption credited mana back (bankroll ${st.you.bankroll.toFixed(1)} > pure spend)`);
        g3.disconnect(); z.disconnect();
    }

    const sneaky = await emit(a, 'gm:start', { levelId: lvl.id });
    ok(!sneaky.ok, 'non-GM blocked from gm:start');

    const inc = await emit(gm, 'gm:incrementN', {});
    ok(inc.ok && inc.N === 2, 'GM increments N to 2');

    // Mid-round join
    const c = connect(); await once(c, 'connect');
    const jc = await emit(c, 'room:join', { code, name: 'Cara' });
    ok(jc.ok, 'Cara joins mid-round');
    const cLevel = await until(() => c._level, 'Cara level');
    ok(typeof cLevel.seed === 'number' && cLevel.seed !== aLevel.seed, 'mid-round joiner gets her own seed');
    const cSt = await until(() => (c._state?.round ? c._state : null), 'Cara state');
    ok(cSt.you.bankroll === 500 && cSt.round.N === 2, 'joiner starts at 500 and sees current N');

    // Reconnect with bankroll intact
    const annBankroll = tDown.you.you.bankroll;
    a.disconnect();
    await sleep(60);
    const a2 = connect(); await once(a2, 'connect');
    const rj = await emit(a2, 'room:rejoin', { code, playerId: ja.playerId });
    ok(rj.ok, 'reconnect succeeds');
    const a2St = await until(() => a2._state, 'reconnect state');
    ok(approx(a2St.you.bankroll, annBankroll, 0.01), 'bankroll preserved across reconnect');

    // Resolve
    const res = await emit(gm, 'gm:resolve', {});
    ok(res.ok, 'GM resolves');
    const finalSt = await until(() => (b._state?.round?.phase === 'resolved' ? b._state : null), 'resolved state');
    ok(Array.isArray(finalSt.round.trueProbs), 'traders see true probs after resolve');
    ok(Array.isArray(finalSt.round.results), 'results delivered');

    gm.disconnect(); a2.disconnect(); b.disconnect(); c.disconnect();
} catch (e) {
    failed++; console.error('  EXCEPTION:', e.stack || e.message);
} finally {
    proc.kill('SIGKILL');
}

console.log(`\nserver.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
