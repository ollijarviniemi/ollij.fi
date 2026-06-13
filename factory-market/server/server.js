// Multiplayer Bayesian Factory + prediction-market server.
//
// One in-memory Map of rooms keyed by a 4-letter code. A room has one game
// master (the creator) and up to MAX_PLAYERS traders. Each trader has a stable
// playerId token and a bankroll that PERSISTS across rounds and survives
// disconnect/reconnect (and lets newcomers join mid-round at the base bankroll).
//
// A "round" = the GM starts a level. The server locks one hidden DGP as the
// truth, assigns every trader a private draw seed (so each sees different balls),
// opens a linked sum-to-100% CPMM over the observation points, and reveals N
// balls (GM increments N to feed more evidence). The GM resolves to the TRUE
// probabilities; each outcome token pays its true probability.
//
// Privacy: the true probabilities are sent to the GM always (so they know when
// the market has converged) but to traders only at resolution. Each trader sees
// their own positions; everyone sees public market prices and the bankroll
// leaderboard.

import express from 'express';
import { createServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { randomBytes, randomInt } from 'node:crypto';

import { createMarket, probabilities, buyYes, buyNo, sellYes, sellNo, sellSharesForMana, payout } from './market.js';
import { listLevels, lockLevel, listHypotheses, reload } from './levels.js';

const PORT = Number(process.env.PORT || 8788);
const ROOM_TTL_MS = 60 * 60 * 1000;        // 60 min idle → drop room
const RECONNECT_WINDOW_MS = 30 * 60 * 1000; // 30 min disconnect → keep seat + bankroll
const MAX_PLAYERS = 12;
const MAX_N = 200;
const START_BANKROLL = 500;
const DEFAULT_LIQUIDITY = 200;
const BROADCAST_HZ = 20;

// ---------- Room store ----------

/** @type {Map<string, Room>} */
const rooms = new Map();

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
function newRoomCode() {
    for (let attempt = 0; attempt < 64; attempt++) {
        let code = '';
        for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
        if (!rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a unique room code.');
}
function newPlayerId() { return randomBytes(16).toString('hex'); }
function newSeed() { return randomInt(1, 2 ** 31); }

// A player's draw seed is DETERMINISTIC in (playerId, round nonce). So a refresh
// / reconnect always reproduces the same balls — a player cannot reroll for more
// data points by reloading. A new round (new nonce) gives everyone fresh draws.
function seedFor(playerId, nonce) {
    let h = (2166136261 ^ nonce) >>> 0;
    const s = `${playerId}:${nonce}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 1) || 1; // 31-bit positive, nonzero
}

class Room {
    constructor(code, gmName) {
        this.code = code;
        /** playerId -> player */
        this.players = new Map();
        this.gmId = null;          // playerId of the game master
        this.round = null;         // current round (see startLevel)
        this.roundSeq = 0;         // monotonic round id (rejects stale trades)
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
        this.dirty = false;        // coalesced-broadcast flag
        this.rev = 0;              // monotonic state version (client drops stale payloads)
    }
    touch() { this.lastActivity = Date.now(); }

    addPlayer(name, socketId, asGM = false) {
        const traders = [...this.players.values()].filter(p => !p.isGM);
        if (!asGM && traders.length >= MAX_PLAYERS) return null;
        const p = {
            id: newPlayerId(), name, socketId, isGM: asGM,
            bankroll: START_BANKROLL, lastSeen: Date.now(),
        };
        this.players.set(p.id, p);
        if (asGM) this.gmId = p.id;
        // Seat a newcomer into an in-progress round at the base bankroll. Their
        // seed is derived from (id, nonce) on demand — nothing to assign here.
        if (this.round && !this.round.positions.has(p.id) && !asGM) {
            this.round.positions.set(p.id, new Array(this.round.options.length).fill(0));
            this.round.spent.set(p.id, 0);
        }
        return p;
    }
    reconnect(playerId, socketId) {
        const p = this.players.get(playerId);
        if (!p) return false;
        p.socketId = socketId;
        p.lastSeen = Date.now();
        return true;
    }
    get gm() { return this.gmId ? this.players.get(this.gmId) : null; }
}

// ---------- Round lifecycle ----------

function startLevel(room, levelId, { liquidity = DEFAULT_LIQUIDITY, altIndex } = {}) {
    const { level, options, trueProbs } = lockLevel(levelId, altIndex);
    const market = createMarket(options.length, { liquidity });
    const positions = new Map();
    const spent = new Map();
    for (const p of room.players.values()) {
        if (p.isGM) continue;
        positions.set(p.id, new Array(options.length).fill(0));
        spent.set(p.id, 0);
    }
    room.round = {
        levelId, level, options, trueProbs, market,
        liquidity, N: 1, phase: 'live',
        seq: ++room.roundSeq,    // round id — trades carrying a stale seq are rejected
        nonce: newSeed(),        // per-round salt for deterministic per-player seeds
        positions, spent,
        results: null,           // populated at resolution
        startedAt: Date.now(),
    };
    room.touch();
}

function incrementN(room) {
    const r = room.round;
    if (!r || r.phase !== 'live') return;
    r.N = Math.min(MAX_N, r.N + 1);
    room.touch();
}

function resolveRound(room) {
    const r = room.round;
    if (!r || r.phase !== 'live') return;
    const results = [];
    for (const p of room.players.values()) {
        if (p.isGM) continue;
        const pos = r.positions.get(p.id) || [];
        const pay = payout(pos, r.trueProbs);
        const spentMana = r.spent.get(p.id) || 0;
        p.bankroll = Math.max(0, p.bankroll + pay); // margin makes this a no-op, but never go negative
        results.push({ id: p.id, name: p.name, payout: pay, spent: spentMana, bankroll: p.bankroll });
    }
    r.phase = 'resolved';
    r.results = results;
    room.touch();
}

// A trade from a trader. Manifold-style YES/NO per option, tracked as one signed
// position[i] (positive = YES_i shares, negative = NO_i shares; never both —
// the opposite side is sold/redeemed first):
//   'up'   = buy YES_i (or, if holding NO_i, redeem it for mana).
//   'down' = buy NO_i  (or, if holding YES_i, sell it for mana).
// Both BUYS cost mana and pay out >= 0 at resolution, so a player can never lose
// more than they stake — no margin needed, and bankroll never goes negative.
// up and down on the same option cancel (1 YES + 1 NO = 1 mana redemption).
function applyTrade(room, playerId, { action, option, amount, seq } = {}) {
    const r = room.round;
    if (!r || r.phase !== 'live') throw new Error('No live round.');
    // A trade aimed at a previous round (in flight when the GM started a new one).
    if (seq != null && seq !== r.seq) throw new Error('Round has moved on.');
    const p = room.players.get(playerId);
    if (!p || p.isGM) throw new Error('Not a trader.');
    const i = Number(option);
    if (!(i >= 0 && i < r.options.length)) throw new Error('Bad option.');
    const m = Number(amount);
    if (!(m > 0)) throw new Error('Bad amount.');
    const pos = r.positions.get(playerId);
    if (!pos) throw new Error('No position for this round.');
    const addSpent = (d) => r.spent.set(playerId, (r.spent.get(playerId) || 0) + d);

    if (action === 'up') {
        if (pos[i] < -1e-9) {
            // Holding NO_i → redeem some of it (sell NO worth up to m), recover mana.
            const { shares } = sellSharesForMana(r.market, i, 'no', -pos[i], m);
            const mana = sellNo(r.market, i, shares); pos[i] += shares;
            p.bankroll += mana; addSpent(-mana);
        } else {
            if (p.bankroll < m - 1e-9) throw new Error('Insufficient mana.');
            pos[i] += buyYes(r.market, i, m); p.bankroll -= m; addSpent(m);
        }
    } else if (action === 'down') {
        if (pos[i] > 1e-9) {
            // Holding YES_i → sell some of it (worth up to m), recover mana.
            const { shares } = sellSharesForMana(r.market, i, 'yes', pos[i], m);
            const mana = sellYes(r.market, i, shares); pos[i] -= shares;
            p.bankroll += mana; addSpent(-mana);
        } else {
            if (p.bankroll < m - 1e-9) throw new Error('Insufficient mana.');
            pos[i] -= buyNo(r.market, i, m); p.bankroll -= m; addSpent(m);
        }
    } else {
        throw new Error(`Unknown action: ${action}`);
    }

    // Manifold auto-redemption: a guaranteed payout shouldn't lock your mana.
    // YES in EVERY option pays exactly 1 mana (one option resolves); NO in every
    // option pays n-1. Redeem the common amount for mana now and free the capital.
    const n = r.options.length;
    if (pos.every(x => x > 1e-9)) {
        const q = Math.min(...pos);
        for (let j = 0; j < n; j++) pos[j] -= q;
        p.bankroll += q; addSpent(-q);
    } else if (pos.every(x => x < -1e-9)) {
        const q = Math.min(...pos.map(x => -x));
        for (let j = 0; j < n; j++) pos[j] += q;
        p.bankroll += q * (n - 1); addSpent(-(q * (n - 1)));
    }

    room.dirty = true;
    return {};
}

// ---------- State views ----------

function leaderboard(room) {
    return [...room.players.values()]
        .filter(p => !p.isGM)
        .map(p => ({ name: p.name, bankroll: round2(p.bankroll), connected: !!p.socketId }))
        .sort((a, b) => b.bankroll - a.bankroll);
}

function round2(x) { return Math.round(x * 100) / 100; }

function viewFor(room, playerId) {
    const me = room.players.get(playerId);
    const r = room.round;
    const isGM = me?.isGM;
    const view = {
        code: room.code,
        you: me ? { id: me.id, name: me.name, isGM: !!me.isGM, bankroll: round2(me.bankroll) } : null,
        gmName: room.gm?.name || null,
        playerCount: [...room.players.values()].filter(p => !p.isGM).length,
        leaderboard: leaderboard(room),
        round: null,
    };
    if (r) {
        const prices = probabilities(r.market);
        const resolved = r.phase === 'resolved';
        view.round = {
            levelId: r.levelId,
            seq: r.seq,
            phase: r.phase,
            N: r.N,
            options: r.options.map((o, k) => ({ index: o.index, label: o.label, price: round4(prices[k]) })),
            // True probs: to the GM always; to traders only after resolution.
            trueProbs: (isGM || resolved) ? r.trueProbs.map(round4) : null,
            // This trader's private state.
            myShares: (me && !isGM) ? (r.positions.get(playerId) || []).map(round4) : null,
            mySpent: (me && !isGM) ? round2(r.spent.get(playerId) || 0) : null,
            results: resolved ? r.results.map(x => ({ name: x.name, payout: round2(x.payout), spent: round2(x.spent) })) : null,
            // For the GM only: each trader's name + draw seed, so the GM can mirror
            // exactly what every player has seen so far.
            players: isGM ? [...room.players.values()].filter(p => !p.isGM)
                .map(p => ({ name: p.name, seed: seedFor(p.id, r.nonce) })) : undefined,
        };
    }
    return view;
}
function round4(x) { return Math.round(x * 10000) / 10000; }

// The heavy, one-time-per-round payload: the locked level + this trader's seed.
function levelPayloadFor(room, playerId) {
    const r = room.round;
    if (!r) return null;
    const me = room.players.get(playerId);
    const isGM = me?.isGM;
    // Everyone (incl. the GM's per-player grid) gets the VEILED level — the GM's
    // grid mirrors exactly what players see. The GM's per-player seeds arrive in
    // the state payload; the GM's own seed here is unused.
    return {
        levelId: r.levelId,
        level: r.level,
        options: r.options.map(o => ({ index: o.index, label: o.label })),
        seed: isGM ? null : seedFor(playerId, r.nonce),
        liquidity: r.liquidity,
    };
}

// ---------- Broadcasting (coalesced) ----------

function emitState(io, room) {
    const rev = ++room.rev; // one version per broadcast; client ignores out-of-order payloads
    for (const p of room.players.values()) {
        if (p.socketId) { const v = viewFor(room, p.id); v.rev = rev; io.to(p.socketId).emit('state', v); }
    }
}

// ---- Lobby: open rooms anyone can join (no codes typed). ----
function lobbyState() {
    const open = [];
    for (const [code, room] of rooms) {
        const gm = room.gm;
        if (!gm || !gm.socketId) continue; // only rooms with a present game master
        const traders = [...room.players.values()].filter(p => !p.isGM);
        if (traders.length >= MAX_PLAYERS) continue;
        open.push({
            code, host: gm.name,
            players: traders.length,
            phase: room.round ? room.round.phase : 'lobby',
            since: room.createdAt,
        });
    }
    open.sort((a, b) => a.since - b.since);
    return { rooms: open };
}
function broadcastLobby(io) { io.to('lobby').emit('lobby', lobbyState()); }
function emitLevel(io, room, playerId) {
    const p = room.players.get(playerId);
    if (p?.socketId) io.to(p.socketId).emit('level', levelPayloadFor(room, p.id));
}
function emitLevelAll(io, room) {
    for (const p of room.players.values()) emitLevel(io, room, p.id);
}

// ---------- HTTP + Socket.IO ----------

const app = express();
const httpServer = createServer(app);
const io = new IOServer(httpServer, { cors: { origin: '*' } });

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

function requireGM(room, playerId) {
    if (!room) throw new Error('Not in a room.');
    if (room.gmId !== playerId) throw new Error('Only the game master can do that.');
}

io.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;

    const myRoom = () => rooms.get(socket.data.roomCode);

    // Lobby: list of open rooms. Client subscribes on the landing screen.
    socket.on('lobby:join', () => { socket.join('lobby'); socket.emit('lobby', lobbyState()); });
    socket.on('lobby:leave', () => { socket.leave('lobby'); });

    socket.on('room:create', ({ name } = {}, cb) => {
        try {
            const code = newRoomCode();
            const room = new Room(code);
            const p = room.addPlayer(String(name || 'Host').slice(0, 24), socket.id, true);
            rooms.set(code, room);
            socket.data.roomCode = code;
            socket.data.playerId = p.id;
            socket.join(code);
            socket.leave('lobby');
            cb?.({ ok: true, code, playerId: p.id, isGM: true });
            emitState(io, room);
            broadcastLobby(io);
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });

    socket.on('room:join', ({ code, name } = {}, cb) => {
        try {
            const c = String(code || '').toUpperCase();
            const room = rooms.get(c);
            if (!room) return cb?.({ ok: false, error: 'No such room.' });
            const p = room.addPlayer(String(name || 'Player').slice(0, 24), socket.id, false);
            if (!p) return cb?.({ ok: false, error: 'Room is full.' });
            socket.data.roomCode = c;
            socket.data.playerId = p.id;
            socket.join(c);
            socket.leave('lobby');
            cb?.({ ok: true, code: c, playerId: p.id, isGM: false });
            if (room.round) emitLevel(io, room, p.id); // newcomer mid-round gets the level
            emitState(io, room);
            broadcastLobby(io);
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });

    socket.on('room:rejoin', ({ code, playerId } = {}, cb) => {
        try {
            const c = String(code || '').toUpperCase();
            const room = rooms.get(c);
            if (!room) return cb?.({ ok: false, error: 'Room no longer exists.' });
            if (!room.reconnect(playerId, socket.id)) return cb?.({ ok: false, error: 'Your seat expired — join fresh.' });
            socket.data.roomCode = c;
            socket.data.playerId = playerId;
            socket.join(c);
            const p = room.players.get(playerId);
            cb?.({ ok: true, code: c, playerId, isGM: !!p.isGM });
            if (room.round) emitLevel(io, room, playerId);
            emitState(io, room);
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });

    // ---- GM controls ----
    socket.on('gm:levels', (_, cb) => {
        try { reload(); cb?.({ ok: true, levels: listLevels() }); }
        catch (e) { cb?.({ ok: false, error: e.message }); }
    });
    // Preview a level/hypothesis before committing. Returns the unveiled locked
    // level (so the GM can watch it) plus the full hypothesis space.
    socket.on('gm:preview', ({ levelId, altIndex = 0 } = {}, cb) => {
        try {
            requireGM(myRoom(), socket.data.playerId);
            const { level, options, trueProbs } = lockLevel(levelId, altIndex);
            level.veiledTiles = [];
            cb?.({
                ok: true, altIndex, trueProbs,
                level, seed: newSeed(),
                options: options.map(o => ({ index: o.index, label: o.label })),
                hypotheses: listHypotheses(levelId),
            });
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });
    socket.on('gm:start', ({ levelId, liquidity, altIndex } = {}, cb) => {
        try {
            const room = myRoom();
            requireGM(room, socket.data.playerId);
            // Reject a malformed liquidity outright so the GM sees feedback; a
            // missing value falls through to DEFAULT_LIQUIDITY in startLevel.
            if (liquidity != null && !(Number.isFinite(liquidity) && liquidity > 0))
                throw new Error('Liquidity must be a positive number.');
            startLevel(room, levelId, { liquidity, altIndex });
            cb?.({ ok: true });
            emitLevelAll(io, room);
            emitState(io, room);
            broadcastLobby(io);
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });
    socket.on('gm:incrementN', (_, cb) => {
        try {
            const room = myRoom();
            requireGM(room, socket.data.playerId);
            incrementN(room);
            cb?.({ ok: true, N: room.round?.N });
            emitState(io, room);
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });
    socket.on('gm:resolve', (_, cb) => {
        try {
            const room = myRoom();
            requireGM(room, socket.data.playerId);
            resolveRound(room);
            cb?.({ ok: true });
            emitState(io, room);
            broadcastLobby(io);
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });
    socket.on('gm:nextLevel', (_, cb) => {
        try {
            const room = myRoom();
            requireGM(room, socket.data.playerId);
            room.round = null; // bankrolls persist
            cb?.({ ok: true });
            emitState(io, room);
            broadcastLobby(io);
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });

    // ---- Trader actions ----
    socket.on('trade', ({ action, option, amount, seq } = {}, cb) => {
        try {
            const room = myRoom();
            if (!room) throw new Error('Not in a room.');
            // seq is the round id the client thinks it is trading in. Passing it
            // through lets applyTrade reject a trade that was in flight when the GM
            // started a new round (omitted seq ⇒ no check, for old clients).
            const res = applyTrade(room, socket.data.playerId, { action, option, amount, seq });
            // Instant ack to the actor (snappy UI); coalesced broadcast does the rest.
            const you = viewFor(room, socket.data.playerId); you.rev = ++room.rev;
            cb?.({ ok: true, ...res, you });
        } catch (e) { cb?.({ ok: false, error: e.message }); }
    });

    // Explicit leave: free the seat now (vs. disconnect, which holds it for a
    // reconnect window). Coming back later is a fresh join.
    socket.on('room:leave', (_, cb) => {
        const room = myRoom();
        if (room) {
            const pid = socket.data.playerId;
            room.players.delete(pid);
            if (room.gmId === pid) room.gmId = null;
            if (room.round) { room.round.positions.delete(pid); room.round.spent.delete(pid); }
            socket.leave(room.code);
            if (room.players.size === 0) rooms.delete(room.code);
            else { room.dirty = true; emitState(io, room); }
            broadcastLobby(io);
        }
        socket.data.roomCode = null; socket.data.playerId = null;
        cb?.({ ok: true });
    });

    socket.on('disconnect', () => {
        const room = myRoom();
        if (!room) return;
        const p = room.players.get(socket.data.playerId);
        // Only clear if THIS socket is still the bound one — on a fast refresh the
        // new socket may have already rejoined and rebound; don't undo that.
        if (p && p.socketId === socket.id) { p.socketId = null; p.lastSeen = Date.now(); }
        room.dirty = true;
        broadcastLobby(io); // GM leaving removes the room from the lobby
    });
});

// ---------- Coalesced broadcast loop ----------
setInterval(() => {
    for (const room of rooms.values()) {
        if (room.dirty) { room.dirty = false; emitState(io, room); }
    }
}, Math.round(1000 / BROADCAST_HZ));

// ---------- Idle cleanup ----------
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.lastActivity > ROOM_TTL_MS) { rooms.delete(code); continue; }
        for (const [pid, p] of room.players) {
            if (!p.socketId && now - p.lastSeen > RECONNECT_WINDOW_MS) {
                room.players.delete(pid);
                if (room.gmId === pid) room.gmId = null;
            }
        }
        if (room.players.size === 0) rooms.delete(code);
    }
    broadcastLobby(io);
}, 60 * 1000);

httpServer.listen(PORT, () => console.log(`factory-market server listening on :${PORT}`));
