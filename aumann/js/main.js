// Aumann client entry. Wires the Socket.IO connection to the DOM via state.
//
// Config: set window.AUMANN_SERVER (e.g., in a config snippet on the host page)
// to point at the deployed server URL. Defaults to localhost for development.

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
let state = null;          // last received view from server
let lastGameRecorded = 0;  // gameNum of the most recently saved history entry

// ---------- Connection ----------

function connect() {
    if (socket) return;
    socket = io(SERVER, { transports: ['websocket'] });
    socket.on('state', onState);
    socket.on('connect', tryRejoin);
    socket.on('disconnect', () => {});
}

function tryRejoin() {
    const c = getRoomCookie();
    if (!c?.code || !c?.playerId) return;
    socket.emit('room:rejoin', c, (res) => {
        if (!res?.ok) clearRoomCookie();
    });
}

function onState(s) {
    state = s;
    if (state.code) setRoomCookie(state.code, state.me?.id);
    render();
    maybeRecordHistory();
}

// ---------- State → view router ----------

function render() {
    if (!state) {
        showView('landing');
        renderLanding();
        return;
    }
    if (!state.opponent && (!state.game || state.game.state === 'round1' && state.game.myR1 == null && state.game.oppR1Pending === false)) {
        showView('waiting');
        renderWaiting();
        return;
    }
    if (state.game) {
        showView('game');
        renderGame();
        return;
    }
    // Fallback (shouldn't happen)
    showView('landing');
    renderLanding();
}

function renderLanding() {
    document.querySelector('#name').value = getName();
    const name = getName();
    const statsEl = document.querySelector('#my-stats');
    if (name) {
        const summary = summarize(getHistory(name));
        if (summary) {
            statsEl.innerHTML = `
                <div class="stat-row"><span class="label">Today's avg (${summary.todayGames} games)</span><span>${summary.todayAvg != null ? summary.todayAvg.toFixed(1) : '—'}</span></div>
                <div class="stat-row"><span class="label">Today's ideal avg</span><span>${summary.todayIdealAvg != null ? summary.todayIdealAvg.toFixed(1) : '—'}</span></div>
                <div class="stat-row"><span class="label">All-time avg (${summary.games} games)</span><span>${summary.allTimeAvg.toFixed(1)}</span></div>
                <div class="stat-row"><span class="label">All-time ideal avg</span><span>${summary.allTimeIdealAvg.toFixed(1)}</span></div>
            `;
            statsEl.hidden = false;
        } else { statsEl.hidden = true; }
    } else { statsEl.hidden = true; }
}

function renderWaiting() {
    document.querySelectorAll('.room-code').forEach(el => el.textContent = state.code);
}

function renderGame() {
    const g = state.game;

    // Header
    document.querySelectorAll('.room-code').forEach(el => el.textContent = state.code);
    document.querySelectorAll('.me-name').forEach(el => el.textContent = state.me?.name || 'You');
    document.querySelectorAll('.opp-name').forEach(el => el.textContent = state.opponent?.name || 'Opponent');
    document.querySelectorAll('.game-num').forEach(el => el.textContent = g.number);

    // Conditions (without met/unmet during play)
    renderConditions(document.querySelector('#condition-list'), state);

    // Hands
    renderHand(document.querySelector('#my-hand'), g.myHand);
    renderHand(document.querySelector('#opp-hand'), g.oppHand); // null until reveal → shows backs

    // Board
    renderBoard(document.querySelector('#board'), state, onPlace);

    // Status
    document.querySelector('#status').textContent = statusFor(state);

    // Reveal panel
    const revealEl = document.querySelector('#reveal');
    if (g.state === 'revealed') {
        revealEl.hidden = false;
        renderReveal(
            {
                q: document.querySelector('#reveal-q'),
                conditions: document.querySelector('#reveal-conditions'),
                scores: document.querySelector('#reveal-scores'),
                ideal: document.querySelector('#reveal-ideal'),
            },
            state,
        );
    } else {
        revealEl.hidden = true;
    }

    // Session stats
    const sess = document.querySelector('#session-stats');
    if (state.scoreHistory.length) {
        const total = state.scoreHistory.reduce((s, h) => s + h.youScore, 0);
        const idealTotal = state.scoreHistory.reduce((s, h) => s + (h.idealScore / 2), 0);
        const games = state.scoreHistory.length;
        sess.innerHTML = `
            <div class="stat-row"><span class="label">This session (${games} games)</span><span>${(total / games).toFixed(1)} per round (you)</span></div>
            <div class="stat-row"><span class="label">Ideal Bayesians avg</span><span>${(idealTotal / games).toFixed(1)}</span></div>
        `;
    } else {
        sess.innerHTML = '';
    }
}

// ---------- Actions ----------

function onPlace(round, row) {
    socket.emit('place', { round, row }, (res) => {
        if (!res?.ok) flashError(res?.error || 'Could not place token.');
    });
}

function maybeRecordHistory() {
    if (!state?.game) return;
    if (state.game.state !== 'revealed') return;
    if (state.game.number === lastGameRecorded) return;
    lastGameRecorded = state.game.number;
    const realized = realizedScores(state);
    if (!realized) return;
    const idealHalf = state.seat === 0
        ? scoreFromRows(state.game.ideal.p1.r1Row, state.game.ideal.p1.r2Row, state.game.ideal.qTrue)
        : scoreFromRows(state.game.ideal.p2.r1Row, state.game.ideal.p2.r2Row, state.game.ideal.qTrue);
    appendHistory(state.me?.name || 'You', {
        ts: Date.now(),
        date: new Date().toISOString(),
        ownScore: realized.my,
        idealScore: state.game.ideal.score,
        idealHalf,
        delta: realized.my - idealHalf,
        opponentName: state.opponent?.name || 'Opponent',
        qTrue: state.game.ideal.qTrue,
    });
}

function scoreFromRows(r1, r2, q) {
    const S = [[10, 0], [9, 4], [7, 7], [4, 9], [0, 10]];
    return (q ? S[r1][0] : S[r1][1]) + (q ? S[r2][0] : S[r2][1]);
}

function flashError(msg) {
    const el = document.querySelector('#error-msg');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.hidden = false;
    setTimeout(() => el.hidden = true, 4000);
}

// ---------- DOM wiring ----------

window.addEventListener('DOMContentLoaded', () => {
    // Landing buttons
    document.querySelector('#btn-create').addEventListener('click', () => {
        const name = document.querySelector('#name').value.trim();
        if (!name) return flashError('Enter your name first.');
        setName(name);
        connect();
        socket.emit('room:create', { name }, (res) => {
            if (!res?.ok) flashError(res?.error || 'Could not create room.');
        });
    });
    document.querySelector('#btn-join').addEventListener('click', () => {
        const name = document.querySelector('#name').value.trim();
        const code = document.querySelector('#join-code').value.trim().toUpperCase();
        if (!name) return flashError('Enter your name first.');
        if (!code) return flashError('Enter a room code.');
        setName(name);
        connect();
        socket.emit('room:join', { name, code }, (res) => {
            if (!res?.ok) flashError(res?.error || 'Could not join.');
        });
    });
    document.querySelector('#btn-leave-waiting').addEventListener('click', () => {
        clearRoomCookie();
        if (socket) { socket.close(); socket = null; }
        state = null;
        showView('landing');
        renderLanding();
    });
    document.querySelector('#btn-next-game').addEventListener('click', () => {
        socket.emit('game:ready', null, () => {});
    });

    // URL ?room=CODE auto-fills join field
    const params = new URLSearchParams(location.search);
    const roomParam = (params.get('room') || '').toUpperCase().slice(0, 4);
    if (roomParam) document.querySelector('#join-code').value = roomParam;

    // Show landing initially
    renderLanding();

    // Try silent rejoin if we already have a room cookie
    if (getRoomCookie()) {
        connect();
    }
});
