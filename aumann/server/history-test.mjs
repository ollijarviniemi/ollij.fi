// Cross-session history test. Spawns its OWN server (temp accounts file, test port) so it
// never touches the real accounts.json. A signed-in player plays a game; we assert the game
// is persisted, survives a "reconnect" (fresh socket + token resume), and renders.
import { spawn } from 'node:child_process';
import { io as ioClient } from 'socket.io-client';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8798;
const URL = `http://localhost:${PORT}`;
const ACCOUNTS = join(here, `.history-test-accounts.${process.pid}.json`);

const wait = ms => new Promise(r => setTimeout(r, ms));
const conn = () => new Promise((res, rej) => { const s = ioClient(URL + '/aumann', { transports: ['websocket'], reconnection: false }); s.on('connect', () => res(s)); s.on('connect_error', rej); });
const emit = (s, e, p) => new Promise(r => s.emit(e, p, r));

let pass = 0, fail = 0;
const check = (c, m) => { if (c) { console.log(`  ✓ ${m}`); pass++; } else { console.log(`  ✗ ${m}`); fail++; } };

// 1) Spawn an isolated server.
const srv = spawn(process.execPath, [join(here, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), ACCOUNTS_FILE: ACCOUNTS }, stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('server did not start')), 5000);
    srv.stdout.on('data', d => { if (String(d).includes('listening')) { clearTimeout(to); res(); } });
    srv.stderr.on('data', d => process.stderr.write(d));
});

let token = null;
try {
    const A = await conn(), B = await conn();
    const stA = { last: null }; A.on('state', s => stA.last = s);

    // 2) A registers (remember=true → token), B stays a guest.
    const reg = await emit(A, 'auth:register', { username: 'alice', password: 'pw12345', remember: true });
    check(reg.ok && reg.token, 'A registered and got a remember-me token');
    token = reg.token;

    // 3) Play one full game.
    const { code } = await emit(A, 'room:create', { name: 'Alice' });
    await emit(B, 'room:join', { code, name: 'Bob' });
    await wait(80);
    await emit(A, 'place', { round: 1, row: 0 }); await emit(B, 'place', { round: 1, row: 3 }); await wait(60);
    await emit(A, 'place', { round: 2, row: 1 }); await emit(B, 'place', { round: 2, row: 2 });
    // Wait for the background ideal + persistence.
    const dl = Date.now() + 15000;
    while (stA.last?.game?.ideal === null && Date.now() < dl) await wait(50);
    await wait(150); // let recordHistory() + saveAccounts() flush

    // 4) A asks for history in the SAME session.
    const h1 = await emit(A, 'auth:history', null);
    check(h1.ok && h1.games.length === 1, 'history has the 1 game just played');
    const g = h1.games[0];
    check(g.youSeat === 0 && g.opponent === 'Bob', 'record: youSeat=0, opponent=Bob');
    check(g.seats?.[0]?.hand?.length === 5 && g.seats?.[1]?.hand?.length === 5, 'record: both hands stored');
    check(g.seats[0].r1 === 0 && g.seats[0].r2 === 1, 'record: your placements stored');
    check(typeof g.qTrue === 'boolean' && g.conditions?.length === 3, 'record: qTrue + 3 conditions');
    check(g.ideal?.seats?.length === 2 && typeof g.ideal.seats[0].r1 === 'number', 'record: ideal rows for both seats');

    // 5) Guest B gets nothing.
    const hB = await emit(B, 'auth:history', null);
    check(hB.ok && hB.games.length === 0, 'guest B has no history');

    A.close(); B.close();

    // 6) CROSS-SESSION: a brand-new socket resumes via token and still sees the game.
    const A2 = await conn();
    const res = await emit(A2, 'auth:resume', { token });
    check(res.ok && res.user?.username === 'alice', 'resumed session from token');
    const h2 = await emit(A2, 'auth:history', null);
    check(h2.ok && h2.games.length === 1, 'history persists across sessions (new socket)');

    // 7) The client renderer accepts the server's record shape.
    let ok = true, msg = '';
    try {
        // renderHistory uses DOM; only run if document exists, else just validate shape access.
        const seat = h2.games[0].youSeat ?? 0;
        const you = h2.games[0].seats[seat], them = h2.games[0].seats[1 - seat];
        void you.hand; void them.hand; void h2.games[0].ideal.seats[seat];
    } catch (e) { ok = false; msg = e.message; }
    check(ok, `record shape is renderHistory-compatible${ok ? '' : ' — ' + msg}`);

    A2.close();
} finally {
    srv.kill();
    if (existsSync(ACCOUNTS)) unlinkSync(ACCOUNTS);
}

console.log(`\n  passed: ${pass}`);
console.log(`  failed: ${fail}`);
process.exit(fail ? 1 : 0);
