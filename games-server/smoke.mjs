// Smoke test for the namespaced games server: drives a full Aumann game plus
// chat on the /aumann namespace. Boot the server first:  node server.js
import { io as ioClient } from 'socket.io-client';

const URL = (process.env.URL || 'http://localhost:8787') + '/aumann';
const connect = () => new Promise((res, rej) => { const s = ioClient(URL, { transports: ['websocket'], reconnection: false }); s.on('connect', () => res(s)); s.on('connect_error', rej); });
const emit = (s, ev, p) => new Promise(r => s.emit(ev, p, r));
const nextChat = (s) => new Promise(r => s.once('chat', r));
// Resolve on the first 'state' matching pred (skips unrelated broadcasts).
const stateWhere = (s, pred) => new Promise(r => { const h = st => { if (pred(st)) { s.off('state', h); r(st); } }; s.on('state', h); });

let pass = 0, fail = 0;
const check = (c, m) => { if (c) { console.log(`  ✓ ${m}`); pass++; } else { console.log(`  ✗ ${m}`); fail++; } };

const A = await connect(), B = await connect();
const cr = await emit(A, 'room:create', { name: 'Alice' });
check(cr.ok && cr.code, 'room created on /aumann');

const dealt = stateWhere(A, st => st.game && st.game.state === 'round1');
await emit(B, 'room:join', { code: cr.code, name: 'Bob' });
const s0 = await dealt;
check(s0.game.state === 'round1', 'game dealt on join');
check(Array.isArray(s0.game.myHand) && s0.game.myHand.length === 5, 'A sees own 5-card hand');
check(s0.game.oppHand === null, 'A does NOT see B’s hand pre-reveal');

await emit(A, 'place', { round: 1, row: 2 });
await emit(B, 'place', { round: 1, row: 2 });
const revealed = stateWhere(A, st => st.game && st.game.state === 'revealed');
await emit(A, 'place', { round: 2, row: 2 });
await emit(B, 'place', { round: 2, row: 2 });
const sr = await revealed;
check(sr.game.ideal && typeof sr.game.ideal.qTrue === 'boolean', 'ideal/Q computed at reveal');
check(sr.scoreHistory.length === 1 && typeof sr.scoreHistory[0].totalLoss === 'number', 'scoreHistory has the game with totalLoss');

const bChat = nextChat(B);
await emit(A, 'chat', { text: 'gg' });
const got = await bChat;
check(got.text === 'gg' && got.seat === 0, 'chat delivered across the namespace');

const next = stateWhere(A, st => st.game && st.game.number === 2);
await emit(A, 'game:ready', null);
await emit(B, 'game:ready', null);
const sn = await next;
check(sn.game.number === 2 && sn.game.state === 'round1', 'next game deals on both-ready');

console.log(`\n  passed: ${pass}\n  failed: ${fail}`);
A.close(); B.close();
process.exit(fail ? 1 : 0);
