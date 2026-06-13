// Client glue: socket, view routing, lobby, room create/join/rejoin (reconnect
// keeps bankroll), factory replay, and the GM's level-preview / hypothesis pick.
(function () {
    const SESSION_KEY = 'factory-market.session';
    const TUTORIAL_DONE_KEY = 'factory-market.tutorialDone';
    const socket = io(window.FM_SERVER, { transports: ['websocket'] });

    let replay = null, lastLevelKey = null, levelCache = null, lastState = null, onLanding = false;
    let lastRev = -1;              // highest server state version applied (drops out-of-order payloads)
    // A trade ack and a coalesced broadcast can arrive out of order; apply only if newer.
    const isStale = (s) => s && s.rev != null && s.rev <= lastRev;
    const markRev = (s) => { if (s && s.rev != null) lastRev = s.rev; };
    let preview = null;            // {levelId, altIndex, hypotheses}
    let gmGrid = null, gmLevel = null; // GM's per-player grid + its (veiled) level

    const $ = (id) => document.getElementById(id);
    const views = { landing: $('landing'), game: $('game') };
    function showView(name) {
        for (const k in views) views[k].hidden = (k !== name);
        if (name === 'landing') { applyGate(); enterLobby(); } else leaveLobby();
    }
    function flash(m) { const e = $('flash'); e.textContent = m; e.hidden = false; clearTimeout(flash._t); flash._t = setTimeout(() => e.hidden = true, 3000); }
    function applyGate() {
        const done = localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
        $('tutorial-gate').hidden = done; $('play-controls').hidden = !done;
    }
    const escape = (s) => String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

    // session
    const saveSession = (code, playerId) => localStorage.setItem(SESSION_KEY, JSON.stringify({ code, playerId }));
    const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
    const clearSession = () => localStorage.removeItem(SESSION_KEY);

    // lobby
    function enterLobby() { if (!onLanding) { onLanding = true; socket.emit('lobby:join'); } }
    function leaveLobby() { if (onLanding) { onLanding = false; socket.emit('lobby:leave'); } }
    socket.on('lobby', (data) => {
        const rooms = data.rooms || [];
        $('lobby-empty').hidden = rooms.length > 0;
        $('lobby-rooms').innerHTML = rooms.map(r => `<div class="lobby-room">
            <span class="host">${escape(r.host)}<span class="meta"> · ${r.players} ${r.players === 1 ? 'player' : 'players'} · ${r.phase === 'live' ? 'in play' : r.phase === 'resolved' ? 'between rounds' : 'open'}</span></span>
            <button data-code="${r.code}">Join</button></div>`).join('');
        $('lobby-rooms').querySelectorAll('button[data-code]').forEach(b => b.onclick = () => joinRoom(b.dataset.code));
    });

    // market
    MarketUI.mount({
        marketCanvas: $('market-canvas'), mktBuys: $('mkt-buys'), mktSells: $('mkt-sells'),
        probGraph: $('prob-graph'), results: $('results'),
        gmPanel: $('gm-panel'), bankroll: $('bankroll'), status: $('round-status'),
    }, doTrade, renderGM);

    function doTrade(action, option, amount) {
        socket.emit('trade', { action, option, amount, seq: lastState?.round?.seq }, (res) => {
            if (!res?.ok) return flash(res?.error || 'Trade failed');
            if (res.you && !isStale(res.you)) { markRev(res.you); lastState = res.you; MarketUI.render(res.you); }
        });
    }

    // ---- GM panel ----
    function renderGM(panel, state) {
        const r = state.round, live = r?.phase === 'live', resolved = r?.phase === 'resolved';
        panel.hidden = false;
        if (!r) {
            // picking phase: level select + hypotheses + start
            panel.innerHTML = `<div class="sb-title">Game master</div>
              <select id="gm-level"></select>
              <div class="hyps" id="gm-hyps"></div>
              <label class="gm-liq">liquidity <input id="gm-liq" type="number" min="10" max="1000" step="10" value="200"></label>
              <button id="gm-start" class="primary">Start round</button>`;
            const sel = panel.querySelector('#gm-level');
            const fill = (lvls) => {
                sel.innerHTML = lvls.map(l => `<option value="${l.id}">${escape(l.code || l.title)} · ${l.numOptions} bins</option>`).join('');
                if (preview?.levelId) sel.value = preview.levelId;
                if (!preview || preview.levelId !== sel.value) doPreview(sel.value, 0);
                else renderHyps(panel);
            };
            if (levelCache) fill(levelCache);
            else socket.emit('gm:levels', {}, (res) => { if (res?.ok) { levelCache = res.levels; fill(res.levels); } });
            sel.onchange = () => doPreview(sel.value, 0);
            panel.querySelector('#gm-start').onclick = () => {
                if (!preview) return;
                socket.emit('gm:start', { levelId: preview.levelId, altIndex: preview.altIndex, liquidity: Number(panel.querySelector('#gm-liq').value) || 200 },
                    (res) => { if (!res?.ok) flash(res?.error || 'Start failed'); });
            };
        } else {
            // running a round
            panel.innerHTML = `<div class="sb-title">Game master</div>
              <div class="row">
                ${live ? `<button id="gm-incn">+1 ball</button><button id="gm-resolve" class="primary">Resolve</button>` : ''}
                ${resolved ? `<button id="gm-next" class="primary">Next round</button>` : ''}
              </div>`;
            const on = (id, ev) => { const el = panel.querySelector(id); if (el) el.onclick = ev; };
            on('#gm-incn', () => socket.emit('gm:incrementN', {}, (r2) => { if (!r2?.ok) flash(r2?.error); }));
            on('#gm-resolve', () => socket.emit('gm:resolve', {}, (r2) => { if (!r2?.ok) flash(r2?.error); }));
            on('#gm-next', () => socket.emit('gm:nextLevel', {}, (r2) => { if (!r2?.ok) flash(r2?.error); }));
        }
    }
    function renderHyps(panel) {
        const box = panel.querySelector('#gm-hyps'); if (!box || !preview) return;
        box.innerHTML = preview.hypotheses.map(h =>
            `<div class="hyp ${h.index === preview.altIndex ? 'on' : ''}" data-i="${h.index}">
               <span>${escape(h.label)}</span>
               <span class="dist">${h.options.map((lbl, k) => `${lbl} ${Math.round(h.trueProbs[k] * 100)}%`).join(' · ')}</span></div>`).join('');
        box.querySelectorAll('.hyp').forEach(el => el.onclick = () => doPreview(preview.levelId, Number(el.dataset.i)));
    }
    function doPreview(levelId, altIndex) {
        socket.emit('gm:preview', { levelId, altIndex }, (res) => {
            if (!res?.ok) return flash(res?.error || 'Preview failed');
            preview = { levelId, altIndex, hypotheses: res.hypotheses };
            // show the (unveiled) factory for this hypothesis
            if (replay) replay.destroy();
            replay = new FactoryReplay($('factory-canvas'));
            replay.load(res.level, res.seed, 25);
            lastLevelKey = null;
            if (lastState) renderGM($('gm-panel'), lastState); // refresh hypotheses highlight
        });
    }

    // ---- factory replay (live rounds) ----
    let pendingLevel = null;
    socket.on('level', (payload) => { if (payload?.level) { pendingLevel = payload; maybeLoadLevel(); } });
    function gmGridMode() { return !!(lastState?.you?.isGM && lastState?.round); }
    function setCanvasMode(mode) {
        $('factory-canvas').hidden = mode !== 'single';
        $('gm-grid').hidden = mode !== 'grid';
        $('gm-zoom').hidden = mode !== 'grid';
    }
    function maybeLoadLevel() {
        if (!pendingLevel || $('game').hidden || gmGridMode()) return; // grid mode handles the GM
        const key = `${pendingLevel.levelId}:${pendingLevel.seed}`;
        if (key === lastLevelKey) { if (replay) replay.refit(); return; }
        lastLevelKey = key;
        if (replay) replay.destroy();
        replay = new FactoryReplay($('factory-canvas'));
        const N = lastState?.round?.N || 1;
        replay.load(pendingLevel.level, pendingLevel.seed ?? 1, pendingLevel.seed == null ? 0 : N);
    }

    function applyState(state) {
        if (isStale(state)) return; // an older broadcast that lost the race to a trade ack
        markRev(state);
        lastState = state;
        if (!state.you) { showView('landing'); return; }
        showView('game');
        MarketUI.render(state);
        const isGM = state.you.isGM, r = state.round;
        if (isGM && r) {
            // GM watches a grid of every player's stream (veiled, as they see it).
            setCanvasMode('grid');
            if (pendingLevel && pendingLevel.levelId === r.levelId) gmLevel = pendingLevel.level;
            if (!gmGrid) gmGrid = new GMGrid($('gm-grid'));
            if (gmLevel && r.players) gmGrid.update(gmLevel, r.players, r.N, r.phase === 'resolved');
        } else {
            setCanvasMode('single');
            if (gmGrid) gmGrid.clear();
            maybeLoadLevel();
            if (replay && r) { replay.refit(); replay.setTarget(r.N); if (r.phase === 'resolved') replay.reveal(); }
        }
        if (!r) { lastLevelKey = null; gmLevel = null; }
    }
    socket.on('state', applyState);

    socket.on('connect', () => {
        const s = loadSession();
        if (s?.code && s?.playerId) socket.emit('room:rejoin', s, (res) => {
            if (!res?.ok) { clearSession(); showView('landing'); } else saveSession(res.code, s.playerId);
        });
        else showView('landing');
    });

    // landing actions
    function joinRoom(code) {
        const name = $('name').value.trim() || 'Player';
        socket.emit('room:join', { code, name }, (res) => { if (!res?.ok) return flash(res?.error || 'Could not join'); saveSession(res.code, res.playerId); });
    }
    $('btn-create').onclick = () => {
        const name = $('name').value.trim() || 'Host';
        socket.emit('room:create', { name }, (res) => { if (!res?.ok) return flash(res?.error || 'Could not create room'); saveSession(res.code, res.playerId); });
    };
    $('btn-skip-tutorial').onclick = () => { localStorage.setItem(TUTORIAL_DONE_KEY, '1'); applyGate(); };
    $('btn-restart').onclick = () => {
        if (gmGridMode() && gmGrid) gmGrid.replayAll();
        else if (replay) replay.restart();
    };
    $('gm-zoom').addEventListener('click', (e) => {
        const z = e.target.dataset.z; if (!z || !gmGrid) return;
        if (z === 'in') gmGrid.zoomBy(1.18); else if (z === 'out') gmGrid.zoomBy(0.85); else gmGrid.fit();
    });
    $('btn-leave').onclick = () => {
        socket.emit('room:leave', {}, () => {});
        clearSession(); lastLevelKey = null; preview = null;
        if (replay) { replay.destroy(); replay = null; }
        setTimeout(() => location.reload(), 60);
    };

    let _rz; window.addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(() => { if (gmGridMode() && gmGrid) gmGrid.refit(); else if (replay) replay.refit(); if (lastState?.you) MarketUI.render(lastState); }, 150); });
})();
