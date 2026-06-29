// Server smoke test. Drives a full game: two clients connect, create+join,
// each round, reveal, next-game.
import { io as ioClient } from 'socket.io-client';
import { renderScoreboard } from '../js/render.js';

const URL = process.env.URL || 'http://localhost:8787';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function connect(name) {
    return new Promise((resolve, reject) => {
        const s = ioClient(URL + '/aumann', { transports: ['websocket'], reconnection: false });
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
    });
}
function emit(s, event, payload) {
    return new Promise((resolve) => s.emit(event, payload, resolve));
}
function nextState(s) {
    return new Promise((resolve) => s.once('state', resolve));
}

let pass = 0, fail = 0;
function check(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); pass++; } else { console.log(`  ✗ ${msg}`); fail++; }
}

const A = await connect('Alice'); A.name = 'A';
const B = await connect('Bob');   B.name = 'B';

// Hook each client's state events
const stateA = { last: null }; A.on('state', s => stateA.last = s);
const stateB = { last: null }; B.on('state', s => stateB.last = s);

// 1) A creates room
const createRes = await emit(A, 'room:create', { name: 'Alice' });
check(createRes.ok === true && /^[A-Z]{4}$/.test(createRes.code), `room:create returned code ${createRes.code}`);
const code = createRes.code;

await wait(50);
check(stateA.last?.code === code, 'A received state with the room code');
check(stateA.last?.seat === 0, 'A is seated at 0');
check(stateA.last?.opponent === null, 'no opponent yet');

// 2) B joins
const joinRes = await emit(B, 'room:join', { code, name: 'Bob' });
check(joinRes.ok === true && joinRes.seat === 1, 'B joined at seat 1');
await wait(80);

check(stateA.last?.opponent?.name === 'Bob', 'A sees opponent Bob');
check(stateB.last?.opponent?.name === 'Alice', 'B sees opponent Alice');
check(stateA.last?.game !== null && stateA.last.game.state === 'round1', 'game dealt, state=round1');
check(Array.isArray(stateA.last.game.myHand) && stateA.last.game.myHand.length === 5, 'A got 5 cards');
check(stateA.last.game.oppHand === null, 'A does NOT see B\'s hand');
check(stateA.last.game.conditions.length === 3, '3 conditions visible to A');

// 3) A places round 1 in row 0
await emit(A, 'place', { round: 1, row: 0 });
await wait(50);
check(stateA.last.game.myR1 === 0, 'A sees their own r1 placement');
check(stateA.last.game.oppR1 === null, 'A still cannot see B\'s r1 (B hasn\'t placed)');
check(stateB.last.game.oppR1 === null, 'B cannot see A\'s r1 either');
check(stateB.last.game.oppR1Pending === true, 'B sees A has placed (pending flag)');

// 4) B places round 1 in row 4
await emit(B, 'place', { round: 1, row: 4 });
await wait(60);
check(stateA.last.game.oppR1 === 4, 'A now sees B\'s r1 = 4');
check(stateB.last.game.oppR1 === 0, 'B now sees A\'s r1 = 0');
check(stateA.last.game.state === 'round2', 'state advanced to round2');
check(stateA.last.game.oppHand === null, 'A still does NOT see B\'s hand');

// 5) Players "think" during round 2 — the ideal-Bayesian compute was kicked off at DEAL time and
//    runs in the worker the whole time, so a realistic think-pause lets it finish before reveal.
await wait(1800);

const revealStart = Date.now();
let revealAt = null, idealAt = null;
A.on('state', s => {
    if (s.game?.state === 'revealed') {
        if (revealAt === null) revealAt = Date.now();
        if (idealAt === null && s.game.ideal !== null) idealAt = Date.now();
    }
});
await emit(A, 'place', { round: 2, row: 2 });
await emit(B, 'place', { round: 2, row: 2 });

// Wait for the score to land (precomputed, so it should be essentially immediate).
const deadline = Date.now() + 15000;
while ((idealAt === null) && Date.now() < deadline) await wait(20);

check(stateA.last.game.state === 'revealed', 'state is revealed immediately');
check(Array.isArray(stateA.last.game.oppHand) && stateA.last.game.oppHand.length === 5, 'A now sees B\'s 5 cards');
check(stateB.last.game.oppHand?.length === 5, 'B now sees A\'s 5 cards');
check(stateA.last.game.ideal !== null && typeof stateA.last.game.ideal.score === 'number', 'ideal scores present after reveal');
check(typeof stateA.last.game.ideal.qTrue === 'boolean', 'qTrue is boolean');
const gap = idealAt - revealAt;
check(gap < 400, `score appears ~immediately at reveal (precomputed during play): +${gap} ms gap`);
console.log(`  · reveal at +${revealAt - revealStart} ms, score at +${idealAt - revealStart} ms after placing`);

// 6) Score history records the game
check(stateA.last.scoreHistory.length === 1, 'scoreHistory has 1 entry');

// 6b) Render-contract: the scoreboard must render without crashing in BOTH modes
//     (this catches missing fields like the r1Loss/totalLoss the client reads).
const sh = stateA.last.scoreHistory, e0 = sh[0];
check(typeof e0.you.r1Loss === 'number' && typeof e0.you.r2Loss === 'number' && typeof e0.mate.r1Loss === 'number', 'scoreHistory carries per-round loss');
check(typeof e0.totalLoss === 'number' && typeof e0.totalScore === 'number', 'scoreHistory carries totalLoss + totalScore');
const stubContainer = () => { let h = ''; return { scrollTop: 0, get scrollHeight() { return 100; }, set innerHTML(v) { h = v; }, get innerHTML() { return h; } }; };
for (const mode of ['score', 'loss']) {
    let ok = true, msg = '';
    try { renderScoreboard(stubContainer(), sh, stateA.last.game.number, mode); } catch (ex) { ok = false; msg = ex.message; }
    check(ok, `renderScoreboard('${mode}') renders without throwing${ok ? '' : ' — ' + msg}`);
}

// 7) Both ready up; new game deals
await emit(A, 'game:ready');
await emit(B, 'game:ready');
await wait(80);
check(stateA.last.game.number === 2, 'now playing game 2');
check(stateA.last.game.state === 'round1', 'new game state=round1');

console.log(`\n  passed: ${pass}`);
console.log(`  failed: ${fail}`);

A.close(); B.close();
process.exit(fail ? 1 : 0);
