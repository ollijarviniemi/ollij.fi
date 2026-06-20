// DOM rendering for Aumann v4: icon+text condition cards, both-player
// Bayesian visualization (1×5 slice each), hand fan→row reveal animation,
// landing-page how-to examples.

import { RANK_LABEL, SUIT_GLYPH, RED_SUITS, makeCard } from './cards.js';
import { CONDITIONS } from './conditions.js';
import { ICON, TIP } from './condition-icons.js';

const VIS_TO_INT = [4, 3, 2, 1, 0];

const BAND_PAYOFF = ['0/10', '4/9', '7/7', '9/4', '10/0'];
const BAND_PCT    = ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'];
const BAND_TIPS = [
    'This column maximises your expected score if your belief is in 0–20%. Pays 0 if any condition is met, 10 otherwise.',
    'This column maximises expected score if your belief is in 20–40%. Pays 4 if met, 9 otherwise.',
    'This column maximises expected score if your belief is in 40–60%. Pays 7 either way (the safe middle).',
    'This column maximises expected score if your belief is in 60–80%. Pays 9 if met, 4 otherwise.',
    'This column maximises expected score if your belief is in 80–100%. Pays 10 if met, 0 otherwise.',
];

export function showView(id) {
    document.querySelectorAll('.view').forEach(el => { el.hidden = (el.id !== id); });
}

/* ---------------- Card primitives ---------------- */

const SUIT_DISPLAY_ORDER = { s: 0, h: 1, c: 2, d: 3 };
function sortHand(hand) {
    return hand.slice().sort((a, b) =>
        (SUIT_DISPLAY_ORDER[a.suit] - SUIT_DISPLAY_ORDER[b.suit]) || (a.rank - b.rank)
    );
}

// Card images live locally at /aumann/cards/{rank}{suit}.png (downloaded once
// from deckofcardsapi.com — see the readme). Served from the same origin so
// they load instantly with no external dependency.
function cardImageUrl(c) {
    const r = c.rank;
    const rankCode =
        r === 10 ? '0' : r === 11 ? 'J' : r === 12 ? 'Q' :
        r === 13 ? 'K' : r === 14 ? 'A' : String(r);
    return `cards/${rankCode}${c.suit.toUpperCase()}.png`;
}

export function renderCard(card, opts = {}) {
    const div = document.createElement('div');
    div.className = 'card';
    if (opts.back) {
        div.classList.add('back');
        return div;
    }
    div.classList.add(RED_SUITS.has(card.suit) ? 'red' : 'black');
    const img = document.createElement('img');
    img.src = cardImageUrl(card);
    img.alt = `${RANK_LABEL[card.rank]}${SUIT_GLYPH[card.suit]}`;
    img.draggable = false;
    // Fallback to text if the image fails (e.g. offline): render a minimalist
    // rank+suit in the centre, so the game stays playable even without CDN.
    img.onerror = () => {
        div.innerHTML = '';
        const rank = RANK_LABEL[card.rank];
        const suit = SUIT_GLYPH[card.suit];
        div.innerHTML = `
            <div class="corner">${rank}${suit}</div>
            <div class="center">${suit}</div>
            <div class="corner" style="align-self:flex-end; transform:rotate(180deg);">${rank}${suit}</div>
        `;
    };
    div.appendChild(img);
    return div;
}

// Plain replace-all hand render (used when we don't need the reveal animation).
export function renderHand(container, hand, opts = {}) {
    container.innerHTML = '';
    container.classList.remove('revealed');
    if (!hand) {
        for (let i = 0; i < 5; i++) container.appendChild(renderCard(null, { back: true }));
        return;
    }
    const sorted = sortHand(hand);
    for (const c of sorted) container.appendChild(renderCard(c));
}

// On the round-2 reveal: keep DOM stable, just swap content of each .card
// (so opp's backs become face cards) and add the .revealed class. The CSS
// transition on .card transforms then animates fan → flat row.
export function revealHandInPlace(container, hand) {
    if (!hand) return;
    const existing = container.querySelectorAll('.card');
    const sorted = sortHand(hand);
    if (existing.length !== sorted.length) {
        // Container didn't have the expected backs (rare); fall back to plain.
        renderHand(container, hand);
    } else {
        for (let i = 0; i < existing.length; i++) {
            const fresh = renderCard(sorted[i]);
            existing[i].className = fresh.className;
            existing[i].innerHTML = fresh.innerHTML;
        }
    }
    // Force a layout flush, then add .revealed so the CSS transition fires.
    void container.offsetWidth;
    container.classList.add('revealed');
}

/* ---------------- Condition cards (icon + text both) ---------------- */

export function renderConditions(container, conditions, opts = {}) {
    container.innerHTML = '';
    for (const c of conditions) {
        const cond = CONDITIONS.find(x => x.id === c.id) || c;
        const div = document.createElement('div');
        div.className = 'cond-card';
        const iconHtml = ICON[cond.id] ? ICON[cond.id]() : '';
        div.innerHTML = `
            <div class="cond-icon">${iconHtml}</div>
            <div class="cond-text">${cond.name}</div>
        `;
        if (opts.revealed && opts.combined) {
            const met = cond.eval ? cond.eval(opts.combined) : false;
            div.classList.add(met ? 'met' : 'unmet');
        }
        container.appendChild(div);
    }
}

/* ---------------- 3×5 board grid ---------------- */

export function renderBoard(container, view, onPlace) {
    container.innerHTML = '';
    const g = view.game;
    const st = g.state;

    // Row 1: teammate's cells (top).
    for (let v = 0; v < 5; v++) {
        const internal = VIS_TO_INT[v];
        const c = document.createElement('div');
        c.className = 'row-opp';
        const tokens = document.createElement('div'); tokens.className = 'tokens';
        if (g.oppR1 === internal) tokens.appendChild(token('1', 'opp r1'));
        if (g.oppR2 === internal) tokens.appendChild(token('2', 'opp r2'));
        c.appendChild(tokens);
        container.appendChild(c);
    }
    // Row 2: band (payoffs + percentages).
    for (let v = 0; v < 5; v++) {
        const b = document.createElement('div');
        b.className = 'row-band';
        b.innerHTML = `
            <div class="payoff">${BAND_PAYOFF[v]}</div>
            <div class="pct">${BAND_PCT[v]}</div>
        `;
        b.title = BAND_TIPS[v];
        container.appendChild(b);
    }
    // Row 3: your cells (bottom).
    const canTapR1 = st === 'round1' && g.myR1 == null;
    const canTapR2 = st === 'round2' && g.myR2 == null;
    for (let v = 0; v < 5; v++) {
        const internal = VIS_TO_INT[v];
        const c = document.createElement('div');
        c.className = 'row-me';
        const tokens = document.createElement('div'); tokens.className = 'tokens';
        if (g.myR1 === internal) tokens.appendChild(token('1', 'me r1'));
        if (g.myR2 === internal) tokens.appendChild(token('2', 'me r2'));
        c.appendChild(tokens);
        if (canTapR1 || canTapR2) {
            c.classList.add('tappable');
            c.addEventListener('click', () => onPlace(canTapR1 ? 1 : 2, internal));
        }
        container.appendChild(c);
    }
}

function token(label, cls) {
    const t = document.createElement('div');
    t.className = 'token ' + cls;
    t.textContent = label;
    return t;
}

/* ---------------- Bayesian dashed lines + arcs ---------------- */

export function clearBayesArrows(boardWrap) {
    boardWrap.querySelectorAll('.bayes-line').forEach(n => n.remove());
    for (const id of ['bayes-arc-me', 'bayes-arc-opp']) {
        const a = boardWrap.querySelector('#' + id);
        if (a) { a.innerHTML = ''; a.style.display = 'none'; }
    }
}

export function renderBayesArrows(boardWrap, view) {
    clearBayesArrows(boardWrap);

    const g = view.game;
    if (!g.ideal) return;
    const me = view.seat;
    const myI  = me === 0 ? g.ideal.p1 : g.ideal.p2;
    const oppI = me === 0 ? g.ideal.p2 : g.ideal.p1;

    const board = boardWrap.querySelector('#board');
    // Use the inner cell area so belief × innerW maps correctly into the
    // grid's cells, NOT into the board's 2 px border. The line is 2.5 px
    // wide, so we also subtract half its thickness to center the visible
    // line on the belief position.
    const innerW = board.clientWidth;
    const borderW = parseFloat(getComputedStyle(board).borderLeftWidth) || 0;
    const meRow = board.querySelector('.row-me');
    const oppRow = board.querySelector('.row-opp');
    if (!meRow || !oppRow) return;

    drawPlayerLines(board, 'me', myI, innerW, borderW, meRow.offsetTop, meRow.offsetHeight);
    drawPlayerLines(board, 'opp', oppI, innerW, borderW, oppRow.offsetTop, oppRow.offsetHeight);

    drawArc(boardWrap.querySelector('#bayes-arc-me'),  myI, innerW, '#1976d2', 'down');
    drawArc(boardWrap.querySelector('#bayes-arc-opp'), oppI, innerW, '#ef6c00', 'up');
}

function drawPlayerLines(board, kind, info, innerW, borderW, top, h) {
    const lineHalf = 1.25; // half of the 2.5 px dashed border-left thickness
    const center = (b) => borderW + b * innerW;
    const placeLeft = (b) => center(b) - lineHalf;

    const r1x = placeLeft(info.r1Belief);
    const r2x = placeLeft(info.r2Belief);
    const close = Math.abs(center(info.r1Belief) - center(info.r2Belief)) < 70;

    const l1 = document.createElement('div');
    l1.className = `bayes-line ${kind} r1`;
    l1.style.left = `${r1x}px`;
    l1.style.top  = `${top}px`;
    l1.style.height = `${h}px`;
    l1.innerHTML = `<div class="label">r1 ${Math.round(info.r1Belief * 100)}%</div>`;
    board.appendChild(l1);

    const l2 = document.createElement('div');
    l2.className = `bayes-line ${kind} r2` + (close ? ' stack' : '');
    l2.style.left = `${r2x}px`;
    l2.style.top  = `${top}px`;
    l2.style.height = `${h}px`;
    l2.innerHTML = `<div class="label">r2 ${Math.round(info.r2Belief * 100)}%</div>`;
    board.appendChild(l2);
}

// Single smooth quadratic-bezier arc from r1 column to r2 column. Both
// endpoints sit at the grid edge; the apex dips into the area away from the
// grid. The arrowhead at the r2 end automatically orients into the grid.
// direction = 'down' → me arc, sits below the grid; 'up' → teammate arc,
// sits above the grid.
// Single Q-bezier from the r1 column to the r2 column. Both endpoints sit
// at the grid-facing edge of the SVG; the apex dips toward the far edge.
//
// Key details that prevent the previous clipping issues:
// - markerUnits="userSpaceOnUse" so the arrowhead size is a fixed number of
//   SVG units (14×14), not stroke-width-dependent (which made the head
//   enormous, ~30 px, with stroke-width 3 and the default markerUnits).
// - edgeY = 12 so the arrowhead's tip and its tail still fit inside the
//   viewBox even when the path tangent at the end is vertical (close r1/r2).
// - When |r2 − r1| is tiny (< 5 %) we skip the arc altogether — the two
//   dashed lines side by side already say "Bayesian barely updated", and
//   degenerate single-pixel arcs just looked broken.
function drawArc(svg, info, w, color, direction) {
    if (!svg) return;

    const delta = Math.abs(info.r2Belief - info.r1Belief);
    if (delta < 0.05) {
        svg.style.display = 'none';
        svg.innerHTML = '';
        return;
    }

    svg.style.display = 'block';
    const h = 36;
    svg.setAttribute('width',  w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const sx = info.r1Belief * w;
    const ex = info.r2Belief * w;
    const mid = (sx + ex) / 2;

    let edgeY, apexY;
    if (direction === 'down') {
        edgeY = 11;
        apexY = h - 3;
    } else {
        edgeY = h - 11;
        apexY = 3;
    }

    const idSafe = color.replace('#','');
    svg.innerHTML = `
        <defs>
            <marker id="ah-${idSafe}" viewBox="0 0 12 12" refX="10" refY="6"
                    markerWidth="14" markerHeight="14" orient="auto"
                    markerUnits="userSpaceOnUse">
                <path d="M 0 0 L 12 6 L 0 12 z" fill="${color}" />
            </marker>
        </defs>
        <path d="M ${sx} ${edgeY} Q ${mid} ${apexY} ${ex} ${edgeY}"
              stroke="${color}" stroke-width="3" fill="none"
              marker-end="url(#ah-${idSafe})" />
    `;
}

/* ---------------- Status text ---------------- */

export function statusFor(view) {
    const g = view.game;
    if (!g) return '';
    const oppDown = view.opponent && view.opponent.connected === false;
    if (g.state === 'round1') {
        if (g.myR1 == null) {
            if (g.oppR1Pending) return 'Teammate has placed. Click a column to place yours.';
            return 'Click a column to place your first token.';
        }
        if (oppDown) return 'Teammate disconnected.';
        return 'Waiting for teammate…';
    }
    if (g.state === 'round2') {
        if (g.myR2 == null) {
            if (g.oppR2Pending) return 'Teammate has placed their second. Click a column to place yours.';
            return 'Click a column to place your second token.';
        }
        if (oppDown) return 'Teammate disconnected.';
        return 'Waiting for teammate…';
    }
    return '';
}

/* ---------------- Sidebar scoreboard ---------------- */

// One scrollable scoreboard with a header + avg pinned at the top and the games
// listed newest-first below. `mode` is 'loss' (expected points lost vs. the
// Bayesian, lower is better) or 'score' (raw realized points).
//
// Scroll behaviour: new rounds are prepended at the top. If the reader is at the
// top they keep seeing the newest; if they've scrolled down to older rounds we
// hold their position (shift scrollTop by the height the new content added)
// instead of yanking them back up.
export function renderScoreboard(container, scoreHistory, latestGameNum, mode) {
    const rows = scoreHistory || [];
    const prevTop = container.scrollTop;
    const prevH = container.scrollHeight;
    const atTop = prevTop < 8;

    if (rows.length === 0) {
        container.innerHTML = `<div class="scoreboard-empty muted">No games yet.</div>`;
        return;
    }

    const isLoss = mode === 'loss';
    const fmt = isLoss ? (v => v.toFixed(1)) : (v => String(v));
    const pick = isLoss
        ? (r => ({ my1: r.you.r1Loss, my2: r.you.r2Loss, ma1: r.mate.r1Loss, ma2: r.mate.r2Loss, total: r.totalLoss }))
        : (r => ({ my1: r.you.r1Score, my2: r.you.r2Score, ma1: r.mate.r1Score, ma2: r.mate.r2Score, total: r.totalScore }));

    const sum = { my1: 0, my2: 0, ma1: 0, ma2: 0, total: 0 };
    for (const r of rows) { const e = pick(r); for (const k in sum) sum[k] += e[k]; }
    const n = rows.length;

    const head = `<thead>
        <tr><th>#</th><th>my&nbsp;1</th><th>my&nbsp;2</th><th>mate&nbsp;1</th><th>mate&nbsp;2</th><th>total</th></tr>
        <tr class="avg-row">
            <td class="game-num">avg</td>
            <td>${(sum.my1/n).toFixed(1)}</td><td>${(sum.my2/n).toFixed(1)}</td>
            <td>${(sum.ma1/n).toFixed(1)}</td><td>${(sum.ma2/n).toFixed(1)}</td>
            <td class="total">${(sum.total/n).toFixed(1)}</td>
        </tr>
    </thead>`;
    let body = '<tbody>';
    for (let i = rows.length - 1; i >= 0; i--) {   // newest first
        const r = rows[i];
        const e = pick(r);
        const cls = r.gameNum === latestGameNum ? ' class="latest"' : '';
        body += `<tr${cls}>
            <td class="game-num">${r.gameNum}</td>
            <td>${fmt(e.my1)}</td><td>${fmt(e.my2)}</td>
            <td>${fmt(e.ma1)}</td><td>${fmt(e.ma2)}</td>
            <td class="total">${fmt(e.total)}</td>
        </tr>`;
    }
    body += '</tbody>';
    container.innerHTML = `<table class="score-table${isLoss ? ' loss-mode' : ''}">${head}${body}</table>`;

    const newH = container.scrollHeight;
    container.scrollTop = atTop ? 0 : prevTop + (newH - prevH);
}

/* ---------------- Realized scores (used by main.js for history) ---------------- */

const SCORES = [[10, 0], [9, 4], [7, 7], [4, 9], [0, 10]];
function rowScore(row, q) { return q ? SCORES[row][0] : SCORES[row][1]; }

export function realizedScores(view) {
    const g = view.game;
    if (!g.ideal) return null;
    const q = g.ideal.qTrue;
    const my  = (g.myR1  != null ? rowScore(g.myR1,  q) : 0) + (g.myR2  != null ? rowScore(g.myR2,  q) : 0);
    const opp = (g.oppR1 != null ? rowScore(g.oppR1, q) : 0) + (g.oppR2 != null ? rowScore(g.oppR2, q) : 0);
    return { my, opp, total: my + opp };
}

/* ---------------- Chat ---------------- */

// Append one message bubble. Just the text — sender is conveyed by side/colour
// (yours right/black, teammate left/grey), so no names or timestamps. Uses
// textContent, so message text can never inject markup.
export function appendChatMessage(logEl, entry, mySeat) {
    const wrap = document.createElement('div');
    wrap.className = 'chat-msg ' + (entry.seat === mySeat ? 'me' : 'them');
    const body = document.createElement('div');
    body.className = 'chat-text';
    body.textContent = entry.text;
    wrap.appendChild(body);
    logEl.appendChild(wrap);
}

/* ---------------- Landing how-to examples ---------------- */

export function renderHowTo() {
    // Example 1: teammate's 5 backs (flipped, across the table) on top,
    // then your 5 face-up cards below.
    const hands = document.querySelector('#howto-hands');
    if (hands) {
        hands.innerHTML = '';
        const opp = document.createElement('div');
        opp.className = 'hand opp-hand fan';
        for (let i = 0; i < 5; i++) opp.appendChild(renderCard(null, { back: true }));
        const me = document.createElement('div');
        me.className = 'hand my-hand fan';
        const sample = [
            { rank: 14, suit: 's' }, { rank: 9, suit: 'h' }, { rank: 7, suit: 'h' },
            { rank: 6, suit: 'c' }, { rank: 13, suit: 'd' },
        ];
        for (const c of sortHand(sample)) me.appendChild(renderCard(c));
        hands.append(opp, me);
    }
    // Example 2: 3 condition cards.
    const conds = document.querySelector('#howto-conditions');
    if (conds) {
        conds.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'conditions-row';
        renderConditions(row, [{ id: 1 }, { id: 14 }, { id: 19 }]);
        conds.append(row);
    }
    // Example 3: board with one token (round 1).
    const bR1 = document.querySelector('#howto-board-r1');
    if (bR1) {
        bR1.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'board-wrap';
        const board = document.createElement('div');
        board.className = 'board';
        renderBoard(board, {
            game: { state: 'round1', myR1: 3, myR2: null, oppR1: 1, oppR2: null,
                    conditions: [], ideal: null },
        }, () => {});
        wrap.appendChild(board);
        bR1.appendChild(wrap);
    }
    // Example 4: board after round 2 (both placed both tokens).
    const bR2 = document.querySelector('#howto-board-r2');
    if (bR2) {
        bR2.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'board-wrap';
        const board = document.createElement('div');
        board.className = 'board';
        renderBoard(board, {
            game: { state: 'revealed', myR1: 3, myR2: 2, oppR1: 1, oppR2: 2,
                    conditions: [], ideal: null },
        }, () => {});
        wrap.appendChild(board);
        bR2.appendChild(wrap);
    }
}

/* ---------------- Account game history ---------------- */

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
// Stored rows are 0=top (80–100%) … 4=bottom (0–20%); BAND_PCT is indexed the
// other way, so map row → band as BAND_PCT[4 - row].
const bandLabel = (row) => (row == null ? '—' : BAND_PCT[4 - row]);

function histHandRow(label, hand) {
    const row = document.createElement('div');
    row.className = 'hist-hand-row';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = label;
    const cards = document.createElement('div');
    cards.className = 'hist-cards';
    for (const c of sortHand(hand || [])) cards.appendChild(renderCard(c));
    row.append(lbl, cards);
    return row;
}

function histMoveRow(label, r1, r2, isIdeal) {
    const row = document.createElement('div');
    row.className = 'hist-move-row' + (isIdeal ? ' ideal' : '');
    row.innerHTML =
        `<span class="lbl">${escapeHtml(label)}</span>` +
        `<span class="mv">${bandLabel(r1)} <span class="arrow">→</span> ${bandLabel(r2)}</span>`;
    return row;
}

// Render the signed-in player's past games (newest first) into the modal.
export function renderHistory(container, games) {
    container.innerHTML = '';
    if (!games || !games.length) {
        const e = document.createElement('div');
        e.className = 'muted hist-empty';
        e.textContent = 'No games yet. Play a game while signed in and it’ll appear here.';
        container.appendChild(e);
        return;
    }
    for (const g of games) {
        const seat = g.youSeat ?? 0;
        const you = g.seats?.[seat] || {};
        const them = g.seats?.[1 - seat] || {};
        const youIdeal = g.ideal?.seats?.[seat];
        const oppName = g.opponent || 'guest';

        const el = document.createElement('div');
        el.className = 'hist-game';

        const date = new Date(g.playedAt);
        const dateStr = isNaN(date) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        const head = document.createElement('div');
        head.className = 'hist-head';
        head.innerHTML =
            `<span class="hist-date">${escapeHtml(dateStr)}</span>` +
            `<span class="hist-opp">vs ${escapeHtml(oppName)}</span>` +
            `<span class="hist-q ${g.qTrue ? 'met' : 'unmet'}">Q ${g.qTrue ? 'met' : 'not met'}</span>`;
        el.appendChild(head);

        const hands = document.createElement('div');
        hands.className = 'hist-hands';
        hands.append(histHandRow('You', you.hand), histHandRow(oppName, them.hand));
        el.appendChild(hands);

        if (g.conditions?.length) {
            const conds = document.createElement('div');
            conds.className = 'hist-conds';
            conds.textContent = g.conditions.map(c => c.name).join('  ·  ');
            el.appendChild(conds);
        }

        const moves = document.createElement('div');
        moves.className = 'hist-moves';
        moves.append(histMoveRow('You', you.r1, you.r2), histMoveRow(oppName, them.r1, them.r2));
        if (youIdeal) moves.appendChild(histMoveRow('Bayesian', youIdeal.r1, youIdeal.r2, true));
        el.appendChild(moves);

        container.appendChild(el);
    }
}
