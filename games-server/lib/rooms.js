// Generic multiplayer-room infrastructure, shared by every game.
//
// Handles the parts that are identical across games: room codes, the lobby of
// open rooms, seating two players, stable playerId reconnect tokens, the chat
// channel, privacy-filtered broadcasts, and idle cleanup. Each game plugs in
// its own state by implementing a small interface (see mountGame).

import { randomBytes } from 'node:crypto';
import store from './store.js';

const ROOM_TTL_MS = 30 * 60 * 1000;        // 30 min idle → drop room
const RECONNECT_WINDOW_MS = 5 * 60 * 1000; // 5 min disconnect → keep seat
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O

export class Room {
    constructor(code) {
        this.code = code;
        /** @type {(object|null)[]} */ this.players = [null, null];
        this.chat = [];          // { id, seat, name, text, ts }
        this.chatSeq = 0;
        this.data = {};          // game-specific state lives here
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
    seatNew(name, socketId) {
        const idx = this.players[0] ? (this.players[1] ? -1 : 1) : 0;
        if (idx < 0) return null;
        const p = { id: randomBytes(16).toString('hex'), name, socketId, lastSeen: Date.now() };
        this.players[idx] = p;
        return { seat: idx, player: p };
    }
    reconnect(playerId, socketId) {
        const seat = this.seatOf(playerId);
        if (seat < 0) return false;
        this.players[seat].socketId = socketId;
        this.players[seat].lastSeen = Date.now();
        return true;
    }
}

function allocCode(rooms) {
    for (let attempt = 0; attempt < 32; attempt++) {
        let code = '';
        for (let i = 0; i < 4; i++) code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
        if (!rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a unique room code.');
}

// Mount a game onto a Socket.IO namespace. `game` implements:
//   onBothSeated(room)        — initialise the first game once two players are in
//   view(room, seat)          — game-specific slice of the per-seat state view
//   handlers                  — { eventName: (room, seat, payload) => ({ error? }) }
//                               run with room+seat resolved; on success the room
//                               is touched and re-broadcast automatically.
export function mountGame(nsp, game) {
    const rooms = new Map();

    function viewFor(room, seat) {
        const me = room.players[seat];
        const opp = room.players[1 - seat];
        return {
            code: room.code,
            seat,
            chat: room.chat,
            me: me ? { id: me.id, name: me.name } : null,
            opponent: opp ? { name: opp.name, connected: !!opp.socketId } : null,
            ...game.view(room, seat),
        };
    }
    function broadcastRoom(room) {
        for (let seat = 0; seat < 2; seat++) {
            const p = room.players[seat];
            if (p?.socketId) nsp.to(p.socketId).emit('state', viewFor(room, seat));
        }
    }
    function lobbyState() {
        const open = [];
        for (const [code, room] of rooms) {
            const p0 = room.players[0], p1 = room.players[1];
            if (p0 && !p1 && p0.socketId) open.push({ code, creator: p0.name, since: room.createdAt });
        }
        open.sort((a, b) => a.since - b.since);
        return { rooms: open };
    }
    function broadcastLobby() { nsp.to('lobby').emit('lobby', lobbyState()); }

    // When a game has just finished, persist one history row per seated player
    // who is logged in. The game exposes the finished-game record via
    // game.historyRecord(room) (null until a game is freshly revealed); the
    // per-room guard makes this idempotent across repeated broadcasts.
    function maybeSaveHistory(room) {
        const rec = game.historyRecord?.(room);
        if (!rec) return;
        if (room.data._historySavedFor === rec.gameNum) return;
        room.data._historySavedFor = rec.gameNum;
        const now = Date.now();
        for (let seat = 0; seat < 2; seat++) {
            const p = room.players[seat];
            if (!p?.userId) continue;
            const opp = room.players[1 - seat];
            store.addGame(p.userId, opp ? (opp.account || opp.name) : null, { ...rec, youSeat: seat }, now);
        }
    }

    nsp.on('connection', (socket) => {
        socket.data.roomCode = null;
        socket.data.playerId = null;
        socket.data.userId   = null;   // set once this socket authenticates
        socket.data.account  = null;   // display name of the logged-in user

        socket.on('lobby:join', () => { socket.join('lobby'); socket.emit('lobby', lobbyState()); });
        socket.on('lobby:leave', () => { socket.leave('lobby'); });

        // --- accounts (optional: guests can still play) ----------------------
        function signIn(user, remember) {
            socket.data.userId = user.id;
            socket.data.account = user.display;
            const out = { ok: true, user: { username: user.username, display: user.display } };
            if (remember) out.token = store.issueToken(user.id, Date.now());
            return out;
        }
        socket.on('auth:register', ({ username, password, remember } = {}, cb) => {
            try {
                const { user, error } = store.registerUser(username, password, Date.now());
                cb?.(error ? { ok: false, error } : signIn(user, remember));
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });
        socket.on('auth:login', ({ username, password, remember } = {}, cb) => {
            try {
                const { user, error } = store.loginUser(username, password);
                cb?.(error ? { ok: false, error } : signIn(user, remember));
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });
        socket.on('auth:resume', ({ token } = {}, cb) => {
            try {
                const user = store.userForToken(token, Date.now());
                if (!user) return cb?.({ ok: false, error: 'Session expired.' });
                socket.data.userId = user.id;
                socket.data.account = user.display;
                cb?.({ ok: true, user: { username: user.username, display: user.display } });
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });
        socket.on('auth:logout', ({ token } = {}, cb) => {
            try { store.revokeToken(token); } catch {}
            socket.data.userId = null; socket.data.account = null;
            cb?.({ ok: true });
        });
        socket.on('auth:history', (_payload, cb) => {
            try {
                if (!socket.data.userId) return cb?.({ ok: true, games: [] });
                cb?.({ ok: true, games: store.gamesForUser(socket.data.userId) });
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });

        socket.on('room:create', ({ name } = {}, cb) => {
            try {
                if (!socket.data.userId) return cb?.({ ok: false, error: 'Please sign in first.' });
                const code = allocCode(rooms);
                const room = new Room(code);
                const seated = room.seatNew(socket.data.account.slice(0, 24), socket.id);
                rooms.set(code, room);
                if (socket.data.userId) { seated.player.userId = socket.data.userId; seated.player.account = socket.data.account; }
                socket.data.roomCode = code;
                socket.data.playerId = seated.player.id;
                socket.leave('lobby');
                cb?.({ ok: true, code, playerId: seated.player.id, seat: seated.seat });
                broadcastRoom(room);
                broadcastLobby();
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });

        socket.on('room:join', ({ code, name } = {}, cb) => {
            try {
                if (!socket.data.userId) return cb?.({ ok: false, error: 'Please sign in first.' });
                const c = String(code || '').toUpperCase();
                const room = rooms.get(c);
                if (!room) return cb?.({ ok: false, error: 'No such room.' });
                const seated = room.seatNew(socket.data.account.slice(0, 24), socket.id);
                if (!seated) return cb?.({ ok: false, error: 'Room is full.' });
                if (socket.data.userId) { seated.player.userId = socket.data.userId; seated.player.account = socket.data.account; }
                socket.data.roomCode = c;
                socket.data.playerId = seated.player.id;
                socket.leave('lobby');
                if (room.bothSeated()) game.onBothSeated(room);
                cb?.({ ok: true, code: c, playerId: seated.player.id, seat: seated.seat });
                broadcastRoom(room);
                broadcastLobby();
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });

        socket.on('room:rejoin', ({ code, playerId } = {}, cb) => {
            try {
                const c = String(code || '').toUpperCase();
                const room = rooms.get(c);
                if (!room) return cb?.({ ok: false, error: 'Room no longer exists.' });
                if (!room.reconnect(playerId, socket.id)) return cb?.({ ok: false, error: 'Your seat is gone — try joining fresh.' });
                socket.data.roomCode = c;
                socket.data.playerId = playerId;
                cb?.({ ok: true, code: c, seat: room.seatOf(playerId) });
                broadcastRoom(room);
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });

        socket.on('chat', ({ text } = {}, cb) => {
            try {
                const room = rooms.get(socket.data.roomCode);
                if (!room) return cb?.({ ok: false, error: 'Not in a room.' });
                const seat = room.seatOf(socket.data.playerId);
                if (seat < 0) return cb?.({ ok: false, error: 'Not seated.' });
                const msg = String(text || '').slice(0, 500).trim();
                if (!msg) return cb?.({ ok: false, error: 'Empty message.' });
                const entry = { id: room.chatSeq++, seat, name: room.players[seat].name, text: msg, ts: Date.now() };
                room.chat.push(entry);
                if (room.chat.length > 200) room.chat.splice(0, room.chat.length - 200);
                room.touch();
                cb?.({ ok: true });
                for (let s = 0; s < 2; s++) { const p = room.players[s]; if (p?.socketId) nsp.to(p.socketId).emit('chat', entry); }
            } catch (e) { cb?.({ ok: false, error: e.message }); }
        });

        // Game-specific events: resolve room+seat, run, then broadcast on success.
        for (const [event, fn] of Object.entries(game.handlers || {})) {
            socket.on(event, (payload, cb) => {
                try {
                    const room = rooms.get(socket.data.roomCode);
                    if (!room) return cb?.({ ok: false, error: 'Not in a room.' });
                    const seat = room.seatOf(socket.data.playerId);
                    if (seat < 0) return cb?.({ ok: false, error: 'Not seated.' });
                    const res = fn(room, seat, payload) || {};
                    if (res.error) return cb?.({ ok: false, error: res.error });
                    room.touch();
                    maybeSaveHistory(room);
                    cb?.({ ok: true });
                    broadcastRoom(room);
                } catch (e) { cb?.({ ok: false, error: e.message }); }
            });
        }

        socket.on('disconnect', () => {
            const room = rooms.get(socket.data.roomCode);
            if (!room) return;
            const seat = room.seatOf(socket.data.playerId);
            if (seat >= 0) {
                room.players[seat].lastSeen = Date.now();
                room.players[seat].socketId = null;
                broadcastLobby();
            }
        });
    });

    setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [code, room] of rooms) {
            if (now - room.lastActivity > ROOM_TTL_MS) { rooms.delete(code); changed = true; continue; }
            for (let i = 0; i < 2; i++) {
                const p = room.players[i];
                if (p && !p.socketId && now - p.lastSeen > RECONNECT_WINDOW_MS) { room.players[i] = null; changed = true; }
            }
            if (!room.players[0] && !room.players[1]) { rooms.delete(code); changed = true; }
        }
        store.purgeExpiredTokens(now);
        if (changed) broadcastLobby();
    }, 60 * 1000);

    return { rooms };
}
