// Aumann client. Socket.IO state → DOM via render.js.

import {
    showView, renderHand, revealHandInPlace, renderBoard, renderConditions,
    statusFor, realizedScores, renderBayesArrows, clearBayesArrows,
    renderScoreTables, renderHowTo,
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
// Track previous render's game number + state so we can animate transitions.
let lastRenderKey = null;

/* ---------------- Socket ---------------- */

function connect() {
    if (socket) return;
    if (typeof SERVER === 'string' && SERVER.includes('CHANGE_ME')) {
        flashError('Server URL not configured. Edit aumann/config.js and set SERVER_URL_PROD.');
        return;
    }
    socket = io(SERVER, { transports: ['websocket'], reconnection: true });
    socket.on('state',     onState);
    socket.on('lobby',     onLobby);
    socket.on('connect',   onConnect);
    socket.on('disconnect', () => {});
    socket.on('connect_error', () => flashError(`Cannot reach server (${SERVER}).`));
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
    const key = `${g.number}/${g.state}`;
    const isFreshReveal = g.state === 'revealed'
        && lastRenderKey?.startsWith(`${g.number}/`)
        && !lastRenderKey.endsWith('/revealed');
    const isNewGame = lastRenderKey && !lastRenderKey.startsWith(`${g.number}/`);

    // Conditions: full re-render (cheap, supplies met/unmet at reveal).
    const combined = (g.myHand && g.oppHand) ? [...g.myHand, ...g.oppHand] : null;
    renderConditions(
        document.querySelector('#conditions-row'),
        g.conditions,
        { revealed: g.state === 'revealed', combined },
    );

    // Hands: special-case the reveal animation. On a fresh reveal, animate
    // the existing fanned cards into a flat row (and swap opp's backs for
    // face cards in place). Otherwise re-render normally.
    const myHandEl = document.querySelector('#my-hand');
    const oppHandEl = document.querySelector('#opp-hand');
    if (isFreshReveal) {
        revealHandInPlace(myHandEl, g.myHand);
        revealHandInPlace(oppHandEl, g.oppHand);
    } else if (isNewGame) {
        myHandEl.classList.remove('revealed');
        oppHandEl.classList.remove('revealed');
        renderHand(myHandEl, g.myHand);
        renderHand(oppHandEl, g.oppHand);
    } else if (g.state !== 'revealed') {
        // Round 1 / round 2 — re-render so token state stays current. But the
        // hand DOM itself doesn't change between rounds, so this is cheap.
        renderHand(myHandEl, g.myHand);
        renderHand(oppHandEl, g.oppHand);
    } else {
        // Re-render of an already-revealed state (e.g., player just joined a
        // finished game). Render normally + add .revealed class.
        renderHand(myHandEl, g.myHand);
        renderHand(oppHandEl, g.oppHand);
        myHandEl.classList.add('revealed');
        oppHandEl.classList.add('revealed');
    }

    renderBoard(document.querySelector('#board'), state, onPlace);
    document.querySelector('#status').textContent = statusFor(state);

    // Bayesian visualization only after reveal. Also grow board-wrap margin
    // so the arcs have room above + below the grid.
    const boardWrap = document.querySelector('#board-wrap');
    boardWrap.classList.toggle('with-arcs', g.state === 'revealed');
    if (g.state === 'revealed') {
        // Wait for margin transition (400ms) to settle before computing arc
        // geometry, otherwise offsetTop/Height are still mid-transition.
        requestAnimationFrame(() => requestAnimationFrame(() => renderBayesArrows(boardWrap, state)));
    } else {
        clearBayesArrows(boardWrap);
    }

    // Sidebar.
    renderScoreTables(
        document.querySelector('#score-table-real'),
        document.querySelector('#score-table-ideal'),
        state.scoreHistory,
        g.state === 'revealed' ? g.number : null,
    );

    // Next-game button: visible when revealed. Both players must click it
    // (server tracks ready[seat]). After your own click, the button disables
    // and re-labels so you know it's waiting for the teammate.
    const nextBtn = document.querySelector('#btn-next-game');
    if (g.state === 'revealed') {
        nextBtn.hidden = false;
        const iClicked = Array.isArray(g.ready) && g.ready[state.seat];
        nextBtn.disabled = !!iClicked;
        nextBtn.textContent = iClicked ? 'Waiting for teammate…' : 'Next game';
    } else {
        nextBtn.hidden = true;
        nextBtn.disabled = false;
        nextBtn.textContent = 'Next game';
    }

    lastRenderKey = key;
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
        opponentName: state.opponent?.name || 'Teammate',
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
        state = null; lobby = null; inLobby = false; lastRenderKey = null;
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

    // Tap-to-toggle for ?-icons on mobile.
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.help');
        document.querySelectorAll('.help.active').forEach(h => { if (h !== target) h.classList.remove('active'); });
        if (target) { target.classList.toggle('active'); e.stopPropagation(); }
    });

    renderLanding(); showView('landing');
    renderHowTo();
    connect();
});
