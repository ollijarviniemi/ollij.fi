// Stress / edge-case test: 1 GM + 10 traders over real sockets, exercising the
// nasty concurrency cases. Throughout, three invariants are asserted:
//   (I1) the server stays healthy,
//   (I2) every client's market prices sum to ~100%,
//   (I3) no bankroll ever goes negative.
// Run: node server/stress.test.mjs
import { io as Client } from 'socket.io-client';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';

const __dir = dirname(fileURLToPath(import.meta.url));
const PORT = 8801;
const URL = `http://localhost:${PORT}`;
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) console.log('  ok:', m); else { failed++; console.error('  FAIL:', m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sum = (a) => a.reduce((x, y) => x + y, 0);

function connect() {
    const s = Client(URL, { transports: ['websocket'], forceNew: true });
    s._state = null; s._level = null; s._errs = 0;
    s.on('state', x => { s._state = x; });
    s.on('level', x => { s._level = x; });
    s.on('connect_error', () => { s._errs++; });
    return s;
}
const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
async function until(fn, label, ms = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(15); }
    throw new Error(`timeout: ${label}`);
}
function health() {
    return new Promise((res) => http.get(`${URL}/health`, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', () => res(null)));
}

// continuous invariant sampler over a set of clients
function checkInvariants(clients, tag) {
    let pricesOk = true, bankOk = true;
    for (const c of clients) {
        const st = c._state; if (!st) continue;
        if (st.you && st.you.bankroll < -1e-6) bankOk = false;
        for (const lp of (st.leaderboard || [])) if (lp.bankroll < -1e-6) bankOk = false;
        if (st.round) {
            const s = sum(st.round.options.map(o => o.price));
            if (Math.abs(s - 1) > 0.02) pricesOk = false;
        }
    }
    ok(pricesOk, `[${tag}] all prices sum to ~100%`);
    ok(bankOk, `[${tag}] no negative bankroll`);
}

const proc = spawn('node', [join(__dir, 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await once(proc.stdout, 'data');
await sleep(150);

const RNG = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
const pick = (a) => a[Math.floor(RNG() * a.length)];

try {
    // ---- setup: GM + a level with several options + healthy liquidity ----
    const gm = connect(); await once(gm, 'connect');
    const created = await emit(gm, 'room:create', { name: 'Host' });
    const code = created.code;
    const lvls = await emit(gm, 'gm:levels', {});
    const lvl = lvls.levels.find(l => l.numOptions >= 3) || lvls.levels.find(l => l.numOptions >= 2);
    await emit(gm, 'gm:start', { levelId: lvl.id, liquidity: 300, altIndex: 0 });
    const nOpt = (await until(() => (gm._state?.round ? gm._state : null), 'gm round')).round.options.length;

    // ---- 10 traders join, incl. duplicate + empty names ----
    const names = ['Ann', 'Bob', 'Bob', 'Cara', '', '', 'Dan', 'Eve', 'Finn', 'Gus'];
    const traders = [];
    for (const name of names) {
        const c = connect(); await once(c, 'connect');
        const r = await emit(c, 'room:join', { code, name });
        ok(r.ok, `join "${name || '(empty)'}" → ${r.ok ? 'ok' : r.error}`);
        c._pid = r.playerId; c._name = name;
        traders.push(c);
    }
    await until(() => traders.every(t => t._state?.round), 'all traders see round');
    ok(traders.length === 10, '10 traders joined (duplicate + empty names allowed)');

    // GM grid sees 10 players with DISTINCT seeds (same names still distinct)
    const gmPlayers = (await until(() => (gm._state?.round?.players ? gm._state : null), 'gm players')).round.players;
    const seeds = new Set(gmPlayers.map(p => p.seed));
    ok(gmPlayers.length === 10, 'GM grid lists all 10 players');
    ok(seeds.size === 10, 'every player has a distinct seed (even with duplicate/empty names)');

    // ---- Phase A: 10 players trade concurrently (incl. simultaneous) ----
    const burst = [];
    for (const t of traders) for (let k = 0; k < 6; k++)
        burst.push(emit(t, 'trade', { action: pick(['up', 'down']), option: Math.floor(RNG() * nOpt), amount: pick([1, 5, 25]) }));
    const results = await Promise.all(burst);
    ok(results.every(r => r && (r.ok || /margin|mana|thin/i.test(r.error || ''))), 'concurrent trades all either applied or cleanly rejected (margin/funds)');
    await sleep(300);
    checkInvariants([gm, ...traders], 'after 60 concurrent trades');
    ok((await health())?.ok === true, 'server healthy after burst');

    // ---- Phase B: GM double-clicks +1 ball rapidly ----
    const N0 = gm._state.round.N;
    await Promise.all([emit(gm, 'gm:incrementN', {}), emit(gm, 'gm:incrementN', {}), emit(gm, 'gm:incrementN', {})]);
    await sleep(150);
    const N1 = (await until(() => (gm._state?.round ? gm._state : null), 'gm N')).round.N;
    ok(N1 === N0 + 3, `rapid +1×3 → N ${N0}→${N1} (each click counts, no double-apply weirdness)`);
    await until(() => traders.every(t => t._state.round.N === N1), 'traders see new N');
    ok(true, 'all traders received the new N');

    // ---- Phase C: drop 3 players, they come back with bankroll+position intact ----
    const droppers = traders.slice(0, 3);
    const before = droppers.map(t => ({ pid: t._pid, bank: t._state.you.bankroll, shares: t._state.round.myShares.slice() }));
    for (const t of droppers) t.disconnect();
    await sleep(300);
    const back = [];
    for (let i = 0; i < droppers.length; i++) {
        const c = connect(); await once(c, 'connect');
        const r = await emit(c, 'room:rejoin', { code, playerId: before[i].pid });
        ok(r.ok, `dropper ${i} reconnects`);
        const st = await until(() => c._state, 'reconnect state');
        ok(Math.abs(st.you.bankroll - before[i].bank) < 0.01, `dropper ${i} bankroll preserved (${before[i].bank.toFixed(2)})`);
        ok(st.round.myShares.every((x, k) => Math.abs(x - before[i].shares[k]) < 1e-4), `dropper ${i} position preserved`);
        back.push(c);
    }
    traders.splice(0, 3, ...back);

    // ---- Phase D: a player Leaves, then comes back fresh (new seat, full mana) ----
    const leaver = traders[traders.length - 1];
    const leaverName = leaver._name;
    await emit(leaver, 'room:leave', {});
    await sleep(200);
    ok((await until(() => gm._state, 'gm after leave')).round.players.length === 9, 'leaver freed the seat (GM grid now 9)');
    const rejoinFresh = connect(); await once(rejoinFresh, 'connect');
    const rf = await emit(rejoinFresh, 'room:join', { code, name: leaverName || 'X' });
    ok(rf.ok, 'leaver can come back as a fresh join');
    ok((await until(() => rejoinFresh._state, 'fresh state')).you.bankroll === 500, 'returning leaver starts fresh at 500 mana');
    traders[traders.length - 1] = rejoinFresh;

    // ---- Phase E: GM connection breaks and comes back ----
    const gmPid = created.playerId;
    gm.disconnect(); await sleep(300);
    const gm2 = connect(); await once(gm2, 'connect');
    const gr = await emit(gm2, 'room:rejoin', { code, playerId: gmPid });
    ok(gr.ok && gr.isGM, 'GM reconnects and is still the game master');
    await until(() => gm2._state?.round, 'gm2 round');
    const inc = await emit(gm2, 'gm:incrementN', {});
    ok(inc.ok, 'reconnected GM can resume control (+1 ball works)');

    // ---- Phase F: disconnect a player WHILE +1 balls is spammed ----
    const victim = traders[4];
    await Promise.all([
        emit(gm2, 'gm:incrementN', {}), emit(gm2, 'gm:incrementN', {}),
        (async () => { victim.disconnect(); })(),
        emit(traders[5], 'trade', { action: 'up', option: 0, amount: 5 }),
    ]);
    await sleep(200);
    ok((await health())?.ok === true, 'server healthy after disconnect-during-incrementN');
    checkInvariants([gm2, ...traders.filter(t => t.connected)], 'after disconnect+incrementN');

    // ---- Phase G: heavy trading right up to a NEW round ----
    const oldSeq = traders.find(t => t.connected)._state.round.seq;
    const lateTrades = [];
    for (const t of traders.filter(t => t.connected)) for (let k = 0; k < 4; k++)
        lateTrades.push(emit(t, 'trade', { action: pick(['up', 'down']), option: Math.floor(RNG() * nOpt), amount: pick([1, 5, 25]), seq: t._state.round.seq }).catch(() => null));
    const newRound = emit(gm2, 'gm:start', { levelId: lvl.id, liquidity: 300, altIndex: 0 });
    await Promise.all([...lateTrades, newRound]);
    ok(true, 'new round started while trades were in flight');
    // wait for the NEW round's state, then verify last-second trades didn't bleed in
    const anyT = traders.find(t => t.connected);
    const newState = await until(() => (anyT._state?.round?.seq > oldSeq ? anyT._state : null), 'new round seq');
    ok(newState.round.myShares.every(x => Math.abs(x) < 1e-6), 'positions reset to zero in the new round (no stale trades bled in)');
    checkInvariants([gm2, ...traders.filter(t => t.connected)], 'after trades-into-new-round');

    // ---- Phase G2: the stale-seq guard is actually live (deterministic) ----
    // A trade carrying the previous round's seq must be rejected; the same trade
    // with the current seq must succeed. (Guards against the seq being silently
    // dropped before it reaches applyTrade.)
    const curSeq = newState.round.seq;
    const stale = await emit(anyT, 'trade', { action: 'up', option: 0, amount: 5, seq: oldSeq });
    ok(!stale.ok && /moved on/i.test(stale.error || ''), 'trade with a stale seq is rejected');
    const fresh = await emit(anyT, 'trade', { action: 'up', option: 0, amount: 5, seq: curSeq });
    ok(fresh.ok, 'trade with the current seq succeeds');
    checkInvariants([gm2, ...traders.filter(t => t.connected)], 'after stale-seq probe');

    // ---- Phase H: hammer one option down (buy NO); loss is bounded by stake, so
    // it's only rejected once out of mana, and bankroll never goes negative ----
    const shorter = traders.find(t => t.connected);
    let rejected = false, neverNeg = true;
    for (let k = 0; k < 40; k++) {
        const r = await emit(shorter, 'trade', { action: 'down', option: 0, amount: 25 });
        if (!r.ok) { rejected = true; }
        if (shorter._state && shorter._state.you.bankroll < -1e-6) neverNeg = false;
    }
    await sleep(150);
    ok(rejected, 'repeated down (buy NO) is rejected once out of mana');
    ok(neverNeg, 'bankroll never went negative while hammering NO bets (bounded loss)');

    // ---- Phase I: resolve while trades are in flight ----
    const tradesAtResolve = traders.filter(t => t.connected).map(t => emit(t, 'trade', { action: 'up', option: 1 % nOpt, amount: 5 }).catch(() => null));
    const res = await emit(gm2, 'gm:resolve', {});
    await Promise.all(tradesAtResolve);
    ok(res.ok, 'GM resolves amid in-flight trades');
    const resolved = await until(() => { const s = traders.find(t => t.connected)?._state; return s?.round?.phase === 'resolved' ? s : null; }, 'resolved');
    ok(Array.isArray(resolved.round.results), 'results delivered after resolve');
    const post = await emit(shorter, 'trade', { action: 'up', option: 0, amount: 5 });
    ok(!post.ok, 'trades rejected after resolution');
    checkInvariants([gm2, ...traders.filter(t => t.connected)], 'after resolve');

    // ---- final health ----
    ok((await health())?.ok === true, 'server healthy at end');
    const totalErrs = [gm2, ...traders].reduce((s, c) => s + (c._errs || 0), 0);
    ok(totalErrs === 0, 'no socket connect errors across the run');

    gm2.disconnect(); for (const t of traders) t.disconnect();
} catch (e) {
    failed++; console.error('  EXCEPTION:', e.stack || e.message);
} finally {
    proc.kill('SIGKILL');
}

console.log(`\nstress.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
