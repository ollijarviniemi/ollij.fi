// Aumann realtime server.
//
// One in-memory Map of rooms keyed by a 4-letter code. Each room holds up to
// two players (by stable serverside playerId tokens, so a refresh/disconnect
// can reconnect within the room TTL without losing the seat) and the current
// game's state machine.
//
// Privacy: each player's hand is only sent to that player. The opponent's row
// 1 / row 2 token is only sent once both have placed.

import express from 'express';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { Worker } from 'node:worker_threads';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { fullDeck, sampleK, cardKey } from '../js/cards.js';
import { CONDITIONS } from '../js/conditions.js';
import { lossBreakdown } from '../js/bayesian.js';   // ideal MC runs in ideal-worker.mjs (off-thread); this is cheap

const PORT = Number(process.env.PORT || 8787);
const ROOM_TTL_MS = 30 * 60 * 1000;      // 30 min idle → drop room
const RECONNECT_WINDOW_MS = 5 * 60 * 1000; // 5 min disconnect → keep seat

const DECK = fullDeck();

// ---------- Accounts (username/password, scrypt-hashed; token for "remember me") ----------
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE || join(dirname(fileURLToPath(import.meta.url)), 'accounts.json');
/** username -> { salt, hash, display }  ;  token -> username  ;  username -> [game record] */
const users = new Map();
const tokens = new Map();
const histories = new Map();
const MAX_HISTORY = 100;   // keep the last N games per account (bounds the file)
function loadAccounts() {
  try {
    if (!existsSync(ACCOUNTS_FILE)) return;
    const d = JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8'));
    for (const [u, v] of Object.entries(d.users || {})) users.set(u, v);
    for (const [t, u] of Object.entries(d.tokens || {})) tokens.set(t, u);
    for (const [u, g] of Object.entries(d.history || {})) histories.set(u, g);
  } catch (e) { console.error('accounts load failed:', e.message); }
}
function saveAccounts() {
  try {
    writeFileSync(ACCOUNTS_FILE, JSON.stringify({
      users: Object.fromEntries(users),
      tokens: Object.fromEntries(tokens),
      history: Object.fromEntries(histories),
    }));
  } catch (e) { console.error('accounts save failed:', e.message); }
}
// Append a finished game to a signed-in player's persistent history (newest kept; capped).
function recordHistory(username, record) {
  if (!username) return;
  const arr = histories.get(username) || [];
  arr.push(record);
  if (arr.length > MAX_HISTORY) arr.splice(0, arr.length - MAX_HISTORY);
  histories.set(username, arr);
  saveAccounts();
}
const hashPw = (password, salt) => scryptSync(password, salt, 32).toString('hex');
function verifyPw(password, rec) {
  const a = Buffer.from(hashPw(password, rec.salt), 'hex');
  const b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
function issueToken(username) { const t = randomBytes(24).toString('hex'); tokens.set(t, username); return t; }
const userView = (username) => ({ username, display: users.get(username).display });
loadAccounts();

// ---------- Room store ----------

/** @type {Map<string, Room>} */
const rooms = new Map();

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
function newRoomCode() {
    for (let attempt = 0; attempt < 32; attempt++) {
        let code = '';
        for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
        if (!rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a unique room code.');
}
function newPlayerId() { return randomBytes(16).toString('hex'); }

class Room {
    constructor(code) {
        this.code = code;
        /** @type {(Player|null)[]} */ this.players = [null, null];
        this.scoreHistory = [];   // { gameNum, p1Score, p2Score, idealScore, qTrue, conditions, hands }
        this.currentGame = null;  // see startGame()
        this.gameCounter = 0;
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
    }
    touch() { this.lastActivity = Date.now(); }
    bothSeated() { return this.players[0] && this.players[1]; }
    seatOf(playerId) {
        if (this.players[0]?.id === playerId) return 0;
        if (this.players[1]?.id === playerId) return 1;
        return -1;
    }
    /** Try to seat a new player (returns seat 0/1 or -1 if full). */
    seatNew(name, socketId) {
        const idx = this.players[0] ? (this.players[1] ? -1 : 1) : 0;
        if (idx < 0) return null;
        const p = { id: newPlayerId(), name, socketId, lastSeen: Date.now() };
        this.players[idx] = p;
        return { seat: idx, player: p };
    }
    /** Rebind a returning player's socketId. */
    reconnect(playerId, socketId) {
        const seat = this.seatOf(playerId);
        if (seat < 0) return false;
        this.players[seat].socketId = socketId;
        this.players[seat].lastSeen = Date.now();
        return true;
    }
}

class Game {
    constructor(number, conditions, hand1, hand2) {
        this.number = number;
        this.conditions = conditions;    // [3 condition objects from CONDITIONS]
        this.hands = [hand1, hand2];     // [Card[5], Card[5]]
        this.placements = { p1r1: null, p1r2: null, p2r1: null, p2r2: null };
        this.ready = [false, false];     // for "next game" — both players click ready
        this.ideal = null;               // ideal Bayesians — precomputed in the background from deal time
        this.idealPromise = null;        // resolves to `ideal` (the worker job kicked off at deal)
        this.finalized = false;          // scoreHistory entry pushed?
    }
    state() {
        const { p1r1, p2r1, p1r2, p2r2 } = this.placements;
        if (p1r1 == null || p2r1 == null) return 'round1';
        if (p1r2 == null || p2r2 == null) return 'round2';
        return 'revealed';
    }
}

// ---------- Game logic ----------

function pickConditions() {
    // 3 distinct conditions out of 20.
    const idxs = sampleK([...Array(CONDITIONS.length).keys()], 3);
    return idxs.map(i => CONDITIONS[i]);
}

function dealNewGame(room) {
    room.gameCounter += 1;
    const conds = pickConditions();
    const hand1 = sampleK(DECK, 5);
    const used = new Set(hand1.map(cardKey));
    const hand2 = sampleK(DECK.filter(c => !used.has(cardKey(c))), 5);
    room.currentGame = new Game(room.gameCounter, conds, hand1, hand2);
    precomputeIdeal(room);   // start the ~1.4s ideal-Bayesian compute NOW, while players think
    room.touch();
}

// ---- Off-thread ideal-Bayesian worker (so the reveal never blocks the event loop) ----
let idealWorker = null, idealSeq = 0;
const idealPending = new Map();
function startIdealWorker() {
    idealWorker = new Worker(new URL('./ideal-worker.mjs', import.meta.url));
    idealWorker.on('message', (m) => {
        const p = idealPending.get(m.id); if (!p) return;
        idealPending.delete(m.id);
        m.error ? p.reject(new Error(m.error)) : p.resolve(m);
    });
    idealWorker.on('error', (e) => { console.error('ideal worker error:', e.message);
        for (const p of idealPending.values()) p.reject(e); idealPending.clear(); idealWorker = null; });
    idealWorker.on('exit', () => { idealWorker = null; });
}
function requestIdeal(payload) {
    if (!idealWorker) startIdealWorker();
    const id = ++idealSeq;
    return new Promise((resolve, reject) => { idealPending.set(id, { resolve, reject }); idealWorker.postMessage({ id, ...payload }); });
}
startIdealWorker();

// Kick off the ideal-Bayesian compute AT DEAL TIME, in the worker thread. The ideal depends only
// on the two hands + the three conditions (NOT on the placements), so it can run the whole time
// the players are thinking through rounds 1 and 2 — by reveal it's almost always already done.
function precomputeIdeal(room) {
    const g = room.currentGame;
    g.idealPromise = requestIdeal({ h1: g.hands[0], h2: g.hands[1], ids: g.conditions.map(c => c.id) })
        .then(({ ideal }) => { if (room.currentGame === g) g.ideal = ideal; return ideal; })
        .catch((err) => { console.error('ideal precompute failed:', err.message); return null; });
    return g.idealPromise;
}

// Resolve the ideal for this game, retrying once on a fresh worker if the precompute failed
// (e.g. the worker crashed). Without this a crashed precompute would leave the game scoreless.
function ensureIdeal(room, g) {
    return Promise.resolve(g.idealPromise).then((ideal) => {
        if (ideal) return ideal;
        if (room.currentGame !== g) return null;
        console.warn(`ideal missing at reveal (game ${g.number}) — recomputing`);
        return precomputeIdeal(room);   // worker auto-restarts on the next request
    });
}

// At reveal: take the (already-running or finished) precomputed ideal, fold in the placements
// to get the loss breakdown + score, record the game, and broadcast. Cheap arithmetic only —
// the heavy MC already happened in the background.
function finalizeReveal(room, nsp) {
    const g = room.currentGame;
    if (!g || g.state() !== 'revealed' || g.finalized) return;
    g.finalized = true;
    if (!g.idealPromise) precomputeIdeal(room);   // fallback if somehow never kicked at deal
    ensureIdeal(room, g).then((ideal) => {
        if (room.currentGame !== g || !ideal) { if (room.currentGame === g) g.finalized = false; return; }
        const loss = lossBreakdown(ideal, g.placements);
        const rowScore = (row, q) => { const S = [[10,0],[9,4],[7,7],[4,9],[0,10]]; return q ? S[row][0] : S[row][1]; };
        const q = ideal.qTrue;
        const p1Score = rowScore(g.placements.p1r1, q) + rowScore(g.placements.p1r2, q);
        const p2Score = rowScore(g.placements.p2r1, q) + rowScore(g.placements.p2r2, q);
        room.scoreHistory.push({
                gameNum: g.number,
                qTrue: q,
                totalLoss: loss.team,
                conditionIds: g.conditions.map(c => c.id),
                p1: { r1: g.placements.p1r1, r2: g.placements.p1r2, r1Score: rowScore(g.placements.p1r1, q), r2Score: rowScore(g.placements.p1r2, q), total: p1Score, r1Loss: loss.p1.r1, r2Loss: loss.p1.r2, loss: loss.p1.total },
                p2: { r1: g.placements.p2r1, r2: g.placements.p2r2, r1Score: rowScore(g.placements.p2r1, q), r2Score: rowScore(g.placements.p2r2, q), total: p2Score, r1Loss: loss.p2.r1, r2Loss: loss.p2.r2, loss: loss.p2.total },
                ideal: {
                    p1: { r1: ideal.p1.r1Row, r2: ideal.p1.r2Row, r1Belief: ideal.p1.r1Belief, r2Belief: ideal.p1.r2Belief,
                          r1Score: rowScore(ideal.p1.r1Row, q), r2Score: rowScore(ideal.p1.r2Row, q),
                          total: rowScore(ideal.p1.r1Row, q) + rowScore(ideal.p1.r2Row, q) },
                    p2: { r1: ideal.p2.r1Row, r2: ideal.p2.r2Row, r1Belief: ideal.p2.r1Belief, r2Belief: ideal.p2.r2Belief,
                          r1Score: rowScore(ideal.p2.r1Row, q), r2Score: rowScore(ideal.p2.r2Row, q),
                          total: rowScore(ideal.p2.r1Row, q) + rowScore(ideal.p2.r2Row, q) },
                    totalScore: ideal.score,
                },
        });
        broadcastRoom(nsp, room);

        // Persist this game to each SIGNED-IN player's cross-session history (shape matches
        // the client's renderHistory). Account is resolved live from the seat's current socket,
        // so signing in mid-game still records it. Guests record nothing.
        const seatRecord = (seat) => ({
            hand: g.hands[seat],
            r1: g.placements[seat === 0 ? 'p1r1' : 'p2r1'],
            r2: g.placements[seat === 0 ? 'p1r2' : 'p2r2'],
        });
        const idealRecord = (seat) => (seat === 0
            ? { r1: ideal.p1.r1Row, r2: ideal.p1.r2Row }
            : { r1: ideal.p2.r1Row, r2: ideal.p2.r2Row });
        for (let seat = 0; seat < 2; seat++) {
            const p = room.players[seat];
            const account = p?.socketId ? nsp.sockets.get(p.socketId)?.data?.account : null;
            if (!account) continue;
            recordHistory(account, {
                playedAt: Date.now(),
                youSeat: seat,
                opponent: room.players[1 - seat]?.name || 'guest',
                qTrue: q,
                conditions: g.conditions.map(c => ({ name: c.name })),
                seats: [seatRecord(0), seatRecord(1)],
                ideal: { seats: [idealRecord(0), idealRecord(1)] },
            });
        }
    }).catch((err) => { g.finalized = false; console.error('finalizeReveal failed:', err.message); });
}

// ---------- State views (privacy-filtered per player) ----------

function viewFor(room, seat) {
    const me = room.players[seat];
    const opp = room.players[1 - seat];
    const g = room.currentGame;
    const view = {
        code: room.code,
        seat,
        me: me ? { id: me.id, name: me.name } : null,
        opponent: opp ? { name: opp.name, connected: !!opp.socketId } : null,
        scoreHistory: room.scoreHistory.map(h => {
            const me = seat === 0 ? h.p1 : h.p2;
            const opp = seat === 0 ? h.p2 : h.p1;
            const meI = seat === 0 ? h.ideal.p1 : h.ideal.p2;
            const oppI = seat === 0 ? h.ideal.p2 : h.ideal.p1;
            return {
                gameNum: h.gameNum,
                qTrue: h.qTrue,
                you: me,
                mate: opp,
                youIdeal: meI,
                mateIdeal: oppI,
                totalScore: me.total + opp.total,
                totalIdealScore: h.ideal.totalScore,
                totalLoss: h.totalLoss,
            };
        }),
        game: null,
    };
    if (g) {
        const myR1 = seat === 0 ? g.placements.p1r1 : g.placements.p2r1;
        const myR2 = seat === 0 ? g.placements.p1r2 : g.placements.p2r2;
        const oppR1 = seat === 0 ? g.placements.p2r1 : g.placements.p1r1;
        const oppR2 = seat === 0 ? g.placements.p2r2 : g.placements.p1r2;
        const bothR1Done = g.placements.p1r1 != null && g.placements.p2r1 != null;
        const bothR2Done = g.placements.p1r2 != null && g.placements.p2r2 != null;
        const state = g.state();
        view.game = {
            number: g.number,
            state,
            myHand: g.hands[seat],
            oppHand: state === 'revealed' ? g.hands[1 - seat] : null,
            conditions: g.conditions.map(c => ({ id: c.id, name: c.name })),
            myR1, myR2,
            oppR1: bothR1Done ? oppR1 : null,
            oppR2: bothR2Done ? oppR2 : null,
            // Opponent has placed their round-1 token (but you can't see which row yet).
            oppR1Pending: g.placements[seat === 0 ? 'p2r1' : 'p1r1'] != null && !bothR1Done,
            oppR2Pending: g.placements[seat === 0 ? 'p2r2' : 'p1r2'] != null && !bothR2Done,
            ready: g.ready,
            ideal: state === 'revealed' ? g.ideal : null,
        };
    }
    return view;
}

function broadcastRoom(nsp, room) {
    for (let seat = 0; seat < 2; seat++) {
        const p = room.players[seat];
        if (!p || !p.socketId) continue;
        nsp.to(p.socketId).emit('state', viewFor(room, seat));
    }
}

// Lobby view: list of rooms with exactly one connected player (i.e., waiting
// for a second). No 4-letter codes shown to the player — the join target is
// the code, but it stays in the data layer.
function lobbyState() {
    const open = [];
    for (const [code, room] of rooms) {
        const p0 = room.players[0];
        const p1 = room.players[1];
        if (p0 && !p1 && p0.socketId) {
            open.push({ code, creator: p0.name, since: room.createdAt });
        }
    }
    open.sort((a, b) => a.since - b.since);
    return { rooms: open };
}
function broadcastLobby(nsp) {
    nsp.to('lobby').emit('lobby', lobbyState());
}

// ---------- HTTP + Socket.IO setup ----------

const app = express();
const httpServer = createServer(app);
const io = new IOServer(httpServer, {
    cors: { origin: '*' }, // good-faith assumed; tighten in production if you ever expose this
});

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

// ---------- Connection handler ----------
// The client connects to the '/aumann' namespace (io(SERVER + '/aumann')); serve it here.
// Rooms live within the namespace, so broadcasts go through `nsp`, not the root `io`.
const nsp = io.of('/aumann');

nsp.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;
    socket.data.account = null;   // username once signed in

    // ---- Accounts. Every handler ALWAYS calls back (never a silent hang). ----
    const ack = (cb, res) => { if (typeof cb === 'function') cb(res); };
    socket.on('auth:register', ({ username, password, remember } = {}, cb) => {
        username = (username || '').trim();
        if (!username || !password) return ack(cb, { ok: false, error: 'Enter a username and password.' });
        if (username.length > 24) return ack(cb, { ok: false, error: 'Username too long (max 24).' });
        if (users.has(username.toLowerCase())) return ack(cb, { ok: false, error: 'That username is taken.' });
        const salt = randomBytes(16).toString('hex');
        users.set(username.toLowerCase(), { salt, hash: hashPw(password, salt), display: username });
        socket.data.account = username.toLowerCase();
        const token = remember ? issueToken(username.toLowerCase()) : null;
        saveAccounts();
        ack(cb, { ok: true, user: userView(username.toLowerCase()), token });
    });
    socket.on('auth:login', ({ username, password, remember } = {}, cb) => {
        const key = (username || '').trim().toLowerCase();
        const rec = users.get(key);
        if (!rec || !verifyPw(password || '', rec)) return ack(cb, { ok: false, error: 'Wrong username or password.' });
        socket.data.account = key;
        const token = remember ? issueToken(key) : null;
        if (token) saveAccounts();
        ack(cb, { ok: true, user: userView(key), token });
    });
    socket.on('auth:resume', ({ token } = {}, cb) => {
        const key = token ? tokens.get(token) : null;
        if (!key || !users.has(key)) return ack(cb, { ok: false });
        socket.data.account = key;
        ack(cb, { ok: true, user: userView(key) });
    });
    socket.on('auth:logout', ({ token } = {}, cb) => {
        if (token && tokens.delete(token)) saveAccounts();
        socket.data.account = null;
        ack(cb, { ok: true });
    });
    socket.on('auth:history', (_, cb) => {
        const key = socket.data.account;
        const games = key ? (histories.get(key) || []).slice().reverse() : []; // newest first
        ack(cb, { ok: true, games });
    });

    // Lobby: list of open rooms. Client subscribes when on landing; unsubscribes
    // when entering or leaving a room.
    socket.on('lobby:join', () => {
        socket.join('lobby');
        socket.emit('lobby', lobbyState());
    });
    socket.on('lobby:leave', () => { socket.leave('lobby'); });

    // Create a new room and seat the creator as player 0.
    socket.on('room:create', ({ name } = {}, cb) => {
        try {
            const code = newRoomCode();
            const room = new Room(code);
            const seated = room.seatNew(String(name || 'Player').slice(0, 24), socket.id);
            rooms.set(code, room);
            socket.data.roomCode = code;
            socket.data.playerId = seated.player.id;
            socket.leave('lobby');
            cb?.({ ok: true, code, playerId: seated.player.id, seat: seated.seat });
            broadcastRoom(nsp, room);
            broadcastLobby(nsp);
        } catch (e) {
            cb?.({ ok: false, error: e.message });
        }
    });

    // Join an existing room by code. Returns ok with playerId on success.
    socket.on('room:join', ({ code, name } = {}, cb) => {
        try {
            const c = String(code || '').toUpperCase();
            const room = rooms.get(c);
            if (!room) return cb?.({ ok: false, error: 'No such room.' });
            const seated = room.seatNew(String(name || 'Player').slice(0, 24), socket.id);
            if (!seated) return cb?.({ ok: false, error: 'Room is full.' });
            socket.data.roomCode = c;
            socket.data.playerId = seated.player.id;
            socket.leave('lobby');
            if (room.bothSeated() && !room.currentGame) dealNewGame(room);
            cb?.({ ok: true, code: c, playerId: seated.player.id, seat: seated.seat });
            broadcastRoom(nsp, room);
            broadcastLobby(nsp);
        } catch (e) {
            cb?.({ ok: false, error: e.message });
        }
    });

    // Returning client (refresh / disconnect / reconnect) supplies its playerId.
    socket.on('room:rejoin', ({ code, playerId } = {}, cb) => {
        try {
            const c = String(code || '').toUpperCase();
            const room = rooms.get(c);
            if (!room) return cb?.({ ok: false, error: 'Room no longer exists.' });
            const ok = room.reconnect(playerId, socket.id);
            if (!ok) return cb?.({ ok: false, error: 'Your seat is gone — try joining fresh.' });
            socket.data.roomCode = c;
            socket.data.playerId = playerId;
            cb?.({ ok: true, code: c, seat: room.seatOf(playerId) });
            broadcastRoom(nsp, room);
        } catch (e) {
            cb?.({ ok: false, error: e.message });
        }
    });

    socket.on('place', ({ round, row } = {}, cb) => {
        try {
            const room = rooms.get(socket.data.roomCode);
            if (!room) return cb?.({ ok: false, error: 'Not in a room.' });
            const seat = room.seatOf(socket.data.playerId);
            if (seat < 0) return cb?.({ ok: false, error: 'Not seated.' });
            const g = room.currentGame;
            if (!g) return cb?.({ ok: false, error: 'No active game.' });
            const r = Number(row);
            if (!(r >= 0 && r <= 4)) return cb?.({ ok: false, error: 'Bad row.' });
            const st = g.state();
            const key =
                (round === 1 && st === 'round1') ? (seat === 0 ? 'p1r1' : 'p2r1') :
                (round === 2 && st === 'round2') ? (seat === 0 ? 'p1r2' : 'p2r2') : null;
            if (!key) return cb?.({ ok: false, error: `Not in round ${round} (state=${st}).` });
            if (g.placements[key] != null) return cb?.({ ok: false, error: 'Already placed for this round.' });
            g.placements[key] = r;
            const justRevealed = g.state() === 'revealed';
            room.touch();
            cb?.({ ok: true });
            broadcastRoom(nsp, room);                      // instant: cards + met-conditions reveal
            if (justRevealed) finalizeReveal(room, nsp);   // ideal was precomputed during play → score appears at once
        } catch (e) {
            cb?.({ ok: false, error: e.message });
        }
    });

    socket.on('game:ready', (_, cb) => {
        try {
            const room = rooms.get(socket.data.roomCode);
            if (!room) return cb?.({ ok: false, error: 'Not in a room.' });
            const seat = room.seatOf(socket.data.playerId);
            if (seat < 0) return cb?.({ ok: false, error: 'Not seated.' });
            const g = room.currentGame;
            if (!g || g.state() !== 'revealed') return cb?.({ ok: false, error: 'No revealed game.' });
            g.ready[seat] = true;
            if (g.ready[0] && g.ready[1]) dealNewGame(room);
            cb?.({ ok: true });
            broadcastRoom(nsp, room);
        } catch (e) {
            cb?.({ ok: false, error: e.message });
        }
    });

    socket.on('disconnect', () => {
        const room = rooms.get(socket.data.roomCode);
        if (!room) return;
        const seat = room.seatOf(socket.data.playerId);
        if (seat >= 0) {
            // Mark disconnect — the seat stays for RECONNECT_WINDOW_MS.
            room.players[seat].lastSeen = Date.now();
            room.players[seat].socketId = null;
            broadcastLobby(nsp);
        }
    });
});

// ---------- Idle cleanup ----------

setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [code, room] of rooms) {
        // Drop rooms inactive past TTL.
        if (now - room.lastActivity > ROOM_TTL_MS) {
            rooms.delete(code);
            changed = true;
            continue;
        }
        // Free seats from disconnected players past the reconnect window.
        for (let i = 0; i < 2; i++) {
            const p = room.players[i];
            if (p && !p.socketId && now - p.lastSeen > RECONNECT_WINDOW_MS) {
                room.players[i] = null;
                changed = true;
            }
        }
        // If both seats are empty, drop the room.
        if (!room.players[0] && !room.players[1]) { rooms.delete(code); changed = true; }
    }
    if (changed) broadcastLobby(nsp);
}, 60 * 1000);

// ---------- Boot ----------

httpServer.listen(PORT, () => {
    console.log(`aumann server listening on :${PORT}`);
});
