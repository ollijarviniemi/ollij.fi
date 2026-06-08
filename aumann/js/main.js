// Aumann client. Socket.IO state → DOM via render.js.
// Server URL: window.AUMANN_SERVER (set by config.js).

import {
    showView, renderHand, renderBoard, renderConditions, statusFor,
    realizedScores, renderReveal,
} from './render.js';
import {
    getName, setName, getRoomCookie, setRoomCookie, clearRoomCookie,
    appendHistory, getHistory, summarize,
} from './storage.js';

const SERVER = window.AUMANN_SERVER || 'http://localhost:8787';

let socket = null;
let state  = null;
let lobby  = null;
let lastGameRecorded = 0;
let inLobby = false;

/* ---------------- Socket ---------------- */

function connect() {
    if (socket) return;
    // Detect the unedited placeholder so deployed instances don't fail mysteriously.
    if (typeof SERVER === 'string' && SERVER.includes('CHANGE_ME')) {
        flashError('Server URL not configured. Edit aumann/config.js and set SERVER_URL_PROD.');
        return;
    }
    socket = io(SERVER, { transports: ['websocket'], reconnection: true });
    socket.on('state',     onState);
    socket.on('lobby',     onLobby);
    socket.on('connect',   onConnect);
    socket.on('disconnect', () => {});
    socket.on('connect_error', (err) => {
        flashError(`Cannot reach server (${SERVER}). Check that it's running.`);
    });
}
function onConnect() {
    const c = getRoomCookie();
    if (c?.code && c?.playerId) {
        socket.emit('room:rejoin', c, (res) => {
            if (!res?.ok) { clearRoomCookie(); state = null; joinLobby(); render(); }
        });
    } else { joinLobby(); }
}
function joinLobby() { if (socket && !inLobby) { inLobby = true; socket.emit('lobby:join'); } }
function leaveLobby() { if (socket && inLobby) { inLobby = false; socket.emit('lobby:leave'); } }

function onState(s) {
    state = s;
    if (state?.code && state?.me?.id) { setRoomCookie(state.code, state.me.id); leaveLobby(); }
    render();
    maybeRecordHistory();
}
function onLobby(l) { lobby = l; if (!state || !state.game) renderLanding(); }

/* ---------------- Render dispatch ---------------- */

function render() {
    if (!state) { showView('landing'); renderLanding(); return; }
    if (!state.opponent && !state.game) { showView('waiting'); return; }
    showView('game');
    renderGame();
}

function renderLanding() {
    document.querySelector('#name').value = getName();

    const roomsEl = document.querySelector('#lobby-rooms');
    const emptyEl = document.querySelector('#lobby-empty');
    roomsEl.innerHTML = '';
    const open = lobby?.rooms || [];
    if (open.length === 0) {
        emptyEl.hidden = false;
    } else {
        emptyEl.hidden = true;
        for (const r of open) {
            const row = document.createElement('div');
            row.className = 'lobby-room';
            row.innerHTML = `<div class="creator">${escapeHtml(r.creator)}</div>`;
            const btn = document.createElement('button');
            btn.textContent = 'Join';
            btn.addEventListener('click', () => joinRoom(r.code));
            row.appendChild(btn);
            roomsEl.appendChild(row);
        }
    }

    const name = getName();
    const statsEl = document.querySelector('#my-stats');
    if (name) {
        const summary = summarize(getHistory(name));
        if (summary) {
            statsEl.innerHTML = `
                <div class="stat-row"><span class="label">Today (${summary.todayGames})</span><span>${summary.todayAvg != null ? summary.todayAvg.toFixed(1) : '—'} · ideal ${summary.todayIdealAvg != null ? summary.todayIdealAvg.toFixed(1) : '—'}</span></div>
                <div class="stat-row"><span class="label">All-time (${summary.games})</span><span>${summary.allTimeAvg.toFixed(1)} · ideal ${summary.allTimeIdealAvg.toFixed(1)}</span></div>
            `;
            statsEl.hidden = false;
        } else { statsEl.hidden = true; }
    } else { statsEl.hidden = true; }
}

function renderGame() {
    const g = state.game;

    const combined = (g.myHand && g.oppHand) ? [...g.myHand, ...g.oppHand] : null;
    renderConditions(
        document.querySelector('#conditions-row'),
        g.conditions,
        { revealed: g.state === 'revealed', combined },
    );

    renderHand(document.querySelector('#opp-hand'), g.oppHand);
    renderHand(document.querySelector('#my-hand'),  g.myHand);

    renderBoard(document.querySelector('#board'), state, onPlace);

    document.querySelector('#status').textContent = statusFor(state);

    const revealEl = document.querySelector('#reveal');
    if (g.state === 'revealed') {
        revealEl.hidden = false;
        renderReveal(
            {
                q:       document.querySelector('#reveal-q'),
                scores:  document.querySelector('#reveal-scores'),
                details: document.querySelector('#reveal-details'),
            },
            state,
        );
    } else { revealEl.hidden = true; }

    const sess = document.querySelector('#session-stats');
    if (state.scoreHistory.length) {
        const games = state.scoreHistory.length;
        const youAvg = state.scoreHistory.reduce((s, h) => s + h.youScore, 0) / games;
        const idealAvg = state.scoreHistory.reduce((s, h) => s + h.idealScore / 2, 0) / games;
        sess.innerHTML = `<div class="stat-row"><span class="label">This room (${games})</span><span>${youAvg.toFixed(1)} · ideal ${idealAvg.toFixed(1)}</span></div>`;
    } else { sess.innerHTML = ''; }
}

/* ---------------- Actions ---------------- */

function joinRoom(code) {
    const name = (document.querySelector('#name').value || '').trim();
    if (!name) return flashError('Enter your name first.');
    setName(name);
    connect();
    const go = () => socket.emit('room:join', { code, name }, (res) => {
        if (!res?.ok) flashError(res?.error || 'Could not join.');
    });
    if (socket.connected) go(); else socket.once('connect', go);
}

function onPlace(round, row) {
    socket.emit('place', { round, row }, (res) => {
        if (!res?.ok) flashError(res?.error || 'Could not place.');
    });
}

function maybeRecordHistory() {
    if (!state?.game) return;
    if (state.game.state !== 'revealed') return;
    if (state.game.number === lastGameRecorded) return;
    lastGameRecorded = state.game.number;
    const real = realizedScores(state);
    if (!real) return;
    const q = state.game.ideal.qTrue;
    const S = [[10, 0], [9, 4], [7, 7], [4, 9], [0, 10]];
    const myI = state.seat === 0 ? state.game.ideal.p1 : state.game.ideal.p2;
    const idealHalf = (q ? S[myI.r1Row][0] : S[myI.r1Row][1]) + (q ? S[myI.r2Row][0] : S[myI.r2Row][1]);
    appendHistory(state.me?.name || 'You', {
        ts: Date.now(),
        date: new Date().toISOString(),
        ownScore: real.my,
        idealScore: state.game.ideal.score,
        idealHalf,
        delta: real.my - idealHalf,
        opponentName: state.opponent?.name || 'Opponent',
        qTrue: q,
    });
}

function flashError(msg) {
    const el = document.querySelector('#error-msg');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => el.hidden = true, 4000);
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ---------------- DOM wiring ---------------- */

window.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#btn-create').addEventListener('click', () => {
        const name = (document.querySelector('#name').value || '').trim();
        if (!name) return flashError('Enter your name first.');
        setName(name);
        connect();
        const go = () => socket.emit('room:create', { name }, (res) => {
            if (!res?.ok) flashError(res?.error || 'Could not create room.');
        });
        if (socket.connected) go(); else socket.once('connect', go);
    });

    function leaveRoom() {
        clearRoomCookie();
        if (socket) { socket.close(); socket = null; }
        state = null; lobby = null; inLobby = false;
        connect();
        renderLanding(); showView('landing');
    }
    document.querySelector('#btn-leave-waiting').addEventListener('click', leaveRoom);
    document.querySelector('#btn-leave-game').addEventListener('click', () => {
        if (confirm('Leave this room?')) leaveRoom();
    });

    document.querySelector('#btn-next-game').addEventListener('click', () => {
        socket.emit('game:ready', null, () => {});
    });

    // Mobile-friendly tooltips: tap a ?-icon to toggle its tooltip. Tap
    // elsewhere to close. Hover still works on desktop.
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.help');
        // Close any open tooltip
        document.querySelectorAll('.help.active').forEach(h => {
            if (h !== target) h.classList.remove('active');
        });
        if (target) { target.classList.toggle('active'); e.stopPropagation(); }
    });

    renderLanding(); showView('landing');
    connect();
});
