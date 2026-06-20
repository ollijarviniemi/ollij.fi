// Aumann client. Socket.IO state → DOM via render.js.

import {
    showView, renderHand, revealHandInPlace, renderBoard, renderConditions,
    statusFor, realizedScores, renderBayesArrows, clearBayesArrows,
    renderScoreboard, renderHowTo, appendChatMessage, renderHistory,
} from './render.js';
import {
    getName, setName, getRoomCookie, setRoomCookie, clearRoomCookie,
    getToken, setToken, clearToken,
    appendHistory, getHistory, summarize,
} from './storage.js';

const SERVER = window.AUMANN_SERVER || 'http://localhost:8787';

let socket = null;
let state  = null;
let lobby  = null;
let account = null;   // logged-in user { username, display }, or null for guests
let lastGameRecorded = 0;
let inLobby = false;
// Track previous render's game number + state so we can animate transitions.
let lastRenderKey = null;
// Chat: ids already rendered (idempotent across the live event + state history).
let chatSeen = new Set();
let chatLastRound = null;   // last game number marked with a divider in the chat
let inGameView = false;
// Scoreboard: which metric is shown, and a signature to avoid needless rebuilds
// (which would otherwise disturb the reader's scroll position).
let scoreboardMode = 'loss';   // 'loss' (vs Bayesian, default) | 'score' (raw points)
let scoreboardSig = null;

/* ---------------- Socket ---------------- */

function connect() {
    if (socket) return;
    if (typeof SERVER === 'string' && SERVER.includes('CHANGE_ME')) {
        flashError('Server URL not configured. Edit aumann/config.js and set SERVER_URL_PROD.');
        return;
    }
    socket = io(SERVER + '/aumann', { transports: ['websocket'], reconnection: true });
    socket.on('state',     onState);
    socket.on('lobby',     onLobby);
    socket.on('chat',      onChat);
    socket.on('connect',   onConnect);
    socket.on('disconnect', () => {});
    socket.on('connect_error', () => flashError(`Cannot reach server (${SERVER}).`));
}
function onConnect() {
    // Resume a remembered account (independent of any room membership).
    const token = getToken();
    if (token) socket.emit('auth:resume', { token }, (res) => {
        account = res?.ok ? res.user : null;
        if (!res?.ok) clearToken();
        if (!state) renderAuth();
    });
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

/* ---------------- Chat ---------------- */

function onChat(entry) { pushChat(entry); }

// Render one message if unseen. Keeps the log pinned to the bottom when the
// reader is already near the bottom (so it doesn't yank you up while scrolling).
function pushChat(entry) {
    if (chatSeen.has(entry.id)) return;
    chatSeen.add(entry.id);
    const logEl = document.querySelector('#chat-log');
    if (!logEl) return;
    const empty = logEl.querySelector('.chat-empty');
    if (empty) empty.remove();
    const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 60;
    appendChatMessage(logEl, entry, state?.seat ?? -1);
    if (nearBottom) logEl.scrollTop = logEl.scrollHeight;
}

// A faint "round N" divider in the chat flow when a new round (deal) begins.
// The first round we see gets no "began" marker.
function maybeRoundDivider() {
    const n = state?.game?.number;
    if (n == null) return;
    if (chatLastRound == null) { chatLastRound = n; return; }
    if (n === chatLastRound) return;
    chatLastRound = n;
    const logEl = document.querySelector('#chat-log');
    if (!logEl) return;
    const empty = logEl.querySelector('.chat-empty');
    if (empty) empty.remove();
    const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 60;
    const div = document.createElement('div');
    div.className = 'chat-divider';
    const span = document.createElement('span');
    span.textContent = `round ${n}`;
    div.appendChild(span);
    logEl.appendChild(div);
    if (nearBottom) logEl.scrollTop = logEl.scrollHeight;
}

// Catch up on any history carried in the state (reconnect / late join).
function renderChat() {
    const logEl = document.querySelector('#chat-log');
    if (!logEl) return;
    for (const entry of state?.chat || []) pushChat(entry);
    maybeRoundDivider();
    if (!logEl.children.length) {
        const e = document.createElement('div');
        e.className = 'chat-empty muted';
        e.textContent = 'No messages yet — say hi 👋';
        logEl.appendChild(e);
    }
}

// The game never needs the keyboard, so keep the chat input focused. Skip on
// touch devices to avoid forcing the on-screen keyboard up.
function focusChat() {
    if ('ontouchstart' in window) return;
    document.querySelector('#chat-input')?.focus();
}

/* ---------------- Scoreboard ---------------- */

function renderScoreboardIfChanged() {
    const g = state?.game;
    const rows = state?.scoreHistory || [];
    const latest = g && g.state === 'revealed' ? g.number : null;
    const sig = `${scoreboardMode}|${rows.length}|${latest}`;
    if (sig === scoreboardSig) return;
    scoreboardSig = sig;
    renderScoreboard(document.querySelector('#scoreboard'), rows, latest, scoreboardMode);
}

function setScoreboardMode(mode) {
    if (mode === scoreboardMode) return;
    scoreboardMode = mode;
    scoreboardSig = null; // force a rebuild
    document.querySelectorAll('.sb-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    renderScoreboardIfChanged();
}

/* ---------------- Render dispatch ---------------- */

function render() {
    if (!state) { showView('landing'); renderLanding(); inGameView = false; return; }
    if (!state.opponent && !state.game) { showView('waiting'); inGameView = false; return; }
    showView('game');
    if (!inGameView) { inGameView = true; focusChat(); }
    renderGame();
}

// Toggle the auth box between the login form and the signed-in state, and own
// the name field (a logged-in user always plays under their account name).
function renderAuth() {
    const form = document.querySelector('#auth-form');
    const li = document.querySelector('#auth-loggedin');
    const nameRow = document.querySelector('#name-row');
    const nameEl = document.querySelector('#name');
    if (!form || !li) return;
    if (account) {
        form.hidden = true; li.hidden = false;
        document.querySelector('#auth-display').textContent = account.display;
        nameRow.hidden = true;
        nameEl.value = account.display;
    } else {
        form.hidden = false; li.hidden = true;
        nameRow.hidden = false;
        if (!nameEl.value) nameEl.value = getName();   // never clobber typed text
    }
}

function renderLanding() {
    renderAuth();
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
                <div class="stat-row"><span class="label">Today (${summary.todayGames})</span><span>${summary.todayAvg != null ? summary.todayAvg.toFixed(1) : '—'} · loss ${summary.todayLossAvg != null ? summary.todayLossAvg.toFixed(1) : '—'}</span></div>
                <div class="stat-row"><span class="label">All-time (${summary.games})</span><span>${summary.allTimeAvg.toFixed(1)} · loss ${summary.allTimeLossAvg != null ? summary.allTimeLossAvg.toFixed(1) : '—'}</span></div>
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

    // Sidebar scoreboard (re-rendered only when its content actually changes).
    renderScoreboardIfChanged();

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

    renderChat();
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

/* ---------------- Accounts ---------------- */

function doAuth(event, mode) {
    event?.preventDefault();
    const username = (document.querySelector('#auth-username').value || '').trim();
    const password = document.querySelector('#auth-password').value || '';
    const remember = document.querySelector('#auth-remember').checked;
    if (!username || !password) return flashError('Enter a username and password.');
    connect();
    const ev = mode === 'register' ? 'auth:register' : 'auth:login';
    const go = () => socket.emit(ev, { username, password, remember }, (res) => {
        if (!res?.ok) return flashError(res?.error || 'Could not sign in.');
        account = res.user;
        if (res.token) setToken(res.token); else clearToken();
        document.querySelector('#auth-password').value = '';
        renderAuth();
    });
    if (socket.connected) go(); else socket.once('connect', go);
}

function doLogout() {
    if (socket) socket.emit('auth:logout', { token: getToken() }, () => {});
    clearToken();
    account = null;
    renderAuth();
}

function openHistory() {
    if (!socket) return;
    socket.emit('auth:history', null, (res) => {
        if (!res?.ok) return flashError(res?.error || 'Could not load history.');
        renderHistory(document.querySelector('#history-list'), res.games);
        document.querySelector('#history-modal').hidden = false;
    });
}
function closeHistory() { document.querySelector('#history-modal').hidden = true; }

function maybeRecordHistory() {
    if (!state?.game) return;
    if (state.game.state !== 'revealed') return;
    if (state.game.number === lastGameRecorded) return;
    lastGameRecorded = state.game.number;
    const real = realizedScores(state);
    if (!real) return;
    // Your own expected loss for this game (two placements), as computed
    // server-side from the ideal-Bayesian beliefs.
    const hist = (state.scoreHistory || []).find(h => h.gameNum === state.game.number);
    const myLoss = hist?.you ? hist.you.loss : null;
    appendHistory(state.me?.name || 'You', {
        ts: Date.now(),
        date: new Date().toISOString(),
        ownScore: real.my,
        loss: myLoss,
        opponentName: state.opponent?.name || 'Teammate',
        qTrue: state.game.ideal.qTrue,
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
        chatSeen = new Set(); chatLastRound = null; inGameView = false; scoreboardSig = null;
        const logEl = document.querySelector('#chat-log'); if (logEl) logEl.innerHTML = '';
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

    // Accounts (optional).
    document.querySelector('#auth-form').addEventListener('submit', (e) => doAuth(e, 'login'));
    document.querySelector('#btn-register').addEventListener('click', (e) => doAuth(e, 'register'));
    document.querySelector('#btn-logout').addEventListener('click', doLogout);
    document.querySelector('#btn-history').addEventListener('click', openHistory);
    document.querySelector('#btn-history-close').addEventListener('click', closeHistory);
    document.querySelector('#history-backdrop').addEventListener('click', closeHistory);

    // Scoreboard metric toggle.
    document.querySelectorAll('.sb-tab').forEach(btn => {
        btn.addEventListener('click', () => setScoreboardMode(btn.dataset.mode));
    });

    // Tap-to-toggle for ?-icons on mobile.
    document.addEventListener('click', (e) => {
        const target = e.target.closest('.help');
        document.querySelectorAll('.help.active').forEach(h => { if (h !== target) h.classList.remove('active'); });
        if (target) { target.classList.toggle('active'); e.stopPropagation(); }
    });

    // Send a chat message; keep the cursor in the box afterwards.
    document.querySelector('#chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.querySelector('#chat-input');
        const text = input.value.trim();
        if (!text || !socket) return;
        socket.emit('chat', { text }, (res) => { if (res && !res.ok && res.error) flashError(res.error); });
        input.value = '';
        input.focus();
    });

    // The game itself never needs the keyboard: if the player starts typing
    // anywhere in the game view, route it straight into the chat box (capturing
    // the first keystroke) so they never have to click the input first.
    document.addEventListener('keydown', (e) => {
        const gameEl = document.querySelector('#game');
        if (!gameEl || gameEl.hidden) return;
        const input = document.querySelector('#chat-input');
        if (!input) return;
        const active = document.activeElement;
        if (active === input) return;
        if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            input.focus();
            input.value += e.key;
            e.preventDefault();
        }
    });

    renderLanding(); showView('landing');
    renderHowTo();
    connect();
});
