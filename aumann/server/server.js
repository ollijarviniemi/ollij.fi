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
import { randomBytes } from 'node:crypto';

import { fullDeck, sampleK, cardKey } from '../js/cards.js';
import { CONDITIONS } from '../js/conditions.js';
import { idealScore } from '../js/bayesian.js';

const PORT = Number(process.env.PORT || 8787);
const ROOM_TTL_MS = 30 * 60 * 1000;      // 30 min idle → drop room
const RECONNECT_WINDOW_MS = 5 * 60 * 1000; // 5 min disconnect → keep seat

const DECK = fullDeck();

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
        this.ideal = null;               // populated at reveal
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
    room.touch();
}

function finalizeGame(room) {
    const g = room.currentGame;
    if (!g || g.state() !== 'revealed') return;
    if (g.ideal) return; // already done
    g.ideal = idealScore(g.hands[0], g.hands[1], g.conditions, DECK,
        { numOuter: 1200, numInner: 150 });
    const rowScore = (row, q) => {
        const S = [[10,0],[9,4],[7,7],[4,9],[0,10]];
        return q ? S[row][0] : S[row][1];
    };
    const q = g.ideal.qTrue;
    const p1Score = rowScore(g.placements.p1r1, q) + rowScore(g.placements.p1r2, q);
    const p2Score = rowScore(g.placements.p2r1, q) + rowScore(g.placements.p2r2, q);
    room.scoreHistory.push({
        gameNum: g.number,
        p1Score, p2Score,
        idealScore: g.ideal.score,
        qTrue: q,
        conditionIds: g.conditions.map(c => c.id),
    });
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
        scoreHistory: room.scoreHistory.map(h => ({
            gameNum: h.gameNum,
            youScore: seat === 0 ? h.p1Score : h.p2Score,
            oppScore: seat === 0 ? h.p2Score : h.p1Score,
            idealScore: h.idealScore,
            qTrue: h.qTrue,
        })),
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

function broadcastRoom(io, room) {
    for (let seat = 0; seat < 2; seat++) {
        const p = room.players[seat];
        if (!p || !p.socketId) continue;
        io.to(p.socketId).emit('state', viewFor(room, seat));
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
function broadcastLobby(io) {
    io.to('lobby').emit('lobby', lobbyState());
}

// ---------- HTTP + Socket.IO setup ----------

const app = express();
const httpServer = createServer(app);
const io = new IOServer(httpServer, {
    cors: { origin: '*' }, // good-faith assumed; tighten in production if you ever expose this
});

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

// ---------- Connection handler ----------

io.on('connection', (socket) => {
    socket.data.roomCode = null;
    socket.data.playerId = null;

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
            broadcastRoom(io, room);
            broadcastLobby(io);
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
            broadcastRoom(io, room);
            broadcastLobby(io);
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
            broadcastRoom(io, room);
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
            // If we just transitioned to revealed, finalize the game now.
            if (g.state() === 'revealed') finalizeGame(room);
            room.touch();
            cb?.({ ok: true });
            broadcastRoom(io, room);
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
            broadcastRoom(io, room);
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
            broadcastLobby(io);
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
    if (changed) broadcastLobby(io);
}, 60 * 1000);

// ---------- Boot ----------

httpServer.listen(PORT, () => {
    console.log(`aumann server listening on :${PORT}`);
});
