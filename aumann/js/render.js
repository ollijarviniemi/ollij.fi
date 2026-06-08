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

export function renderCard(card, opts = {}) {
    const div = document.createElement('div');
    div.className = 'card';
    if (opts.back) {
        div.classList.add('back');
        div.innerHTML = '<div class="corner"></div><div class="center"></div><div class="corner"></div>';
        return div;
    }
    const red = RED_SUITS.has(card.suit);
    div.classList.add(red ? 'red' : 'black');
    const rank = RANK_LABEL[card.rank];
    const suit = SUIT_GLYPH[card.suit];
    div.innerHTML = `
        <div class="corner">${rank}${suit}</div>
        <div class="center">${suit}</div>
        <div class="corner" style="align-self:flex-end; transform:rotate(180deg);">${rank}${suit}</div>
    `;
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
    const w = board.offsetWidth;
    const meRow = board.querySelector('.row-me');
    const oppRow = board.querySelector('.row-opp');
    if (!meRow || !oppRow) return;

    drawPlayerLines(board, 'me', myI, w, meRow.offsetTop, meRow.offsetHeight);
    drawPlayerLines(board, 'opp', oppI, w, oppRow.offsetTop, oppRow.offsetHeight);

    drawArc(boardWrap.querySelector('#bayes-arc-me'),  myI, w, '#1976d2');
    drawArc(boardWrap.querySelector('#bayes-arc-opp'), oppI, w, '#ef6c00');
}

function drawPlayerLines(board, kind, info, w, top, h) {
    const r1x = info.r1Belief * w;
    const r2x = info.r2Belief * w;
    const close = Math.abs(r1x - r2x) < 70;

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

function drawArc(svg, info, w, color) {
    if (!svg) return;
    svg.style.display = 'block';
    const h = 60;
    svg.setAttribute('width',  w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const sx = info.r1Belief * w;
    const ex = info.r2Belief * w;
    const cy = 42;
    svg.innerHTML = `
        <defs>
            <marker id="ah-${color.replace('#','')}" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="9" markerHeight="9" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" />
            </marker>
        </defs>
        <path d="M ${sx} 0 C ${sx} ${cy} ${ex} ${cy} ${ex} 8"
              stroke="${color}" stroke-width="3" fill="none"
              marker-end="url(#ah-${color.replace('#','')})" />
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

/* ---------------- Sidebar score tables ---------------- */

export function renderScoreTables(realEl, idealEl, scoreHistory, latestGameNum) {
    const rows = scoreHistory || [];
    if (rows.length === 0) {
        const empty = `<tbody><tr><td colspan="6" class="muted" style="text-align:center; padding:18px; font-style:italic; color:#aaa;">No games yet.</td></tr></tbody>`;
        realEl.innerHTML  = empty;
        idealEl.innerHTML = empty;
        return;
    }

    const buildTable = (extract) => {
        const head = `
            <thead><tr>
                <th>#</th><th>my 1</th><th>my 2</th><th>mate 1</th><th>mate 2</th><th>total</th>
            </tr></thead>`;
        let body = '<tbody>';
        let sumMy1 = 0, sumMy2 = 0, sumMa1 = 0, sumMa2 = 0, sumT = 0;
        for (const r of rows) {
            const e = extract(r);
            const cls = r.gameNum === latestGameNum ? ' class="latest"' : '';
            body += `<tr${cls}>
                <td class="game-num">${r.gameNum}</td>
                <td>${e.my1}</td><td>${e.my2}</td>
                <td>${e.ma1}</td><td>${e.ma2}</td>
                <td class="total">${e.total}</td>
            </tr>`;
            sumMy1 += e.my1; sumMy2 += e.my2; sumMa1 += e.ma1; sumMa2 += e.ma2; sumT += e.total;
        }
        const n = rows.length;
        body += `<tr class="avg-row">
            <td class="game-num">avg</td>
            <td>${(sumMy1/n).toFixed(1)}</td>
            <td>${(sumMy2/n).toFixed(1)}</td>
            <td>${(sumMa1/n).toFixed(1)}</td>
            <td>${(sumMa2/n).toFixed(1)}</td>
            <td class="total">${(sumT/n).toFixed(1)}</td>
        </tr></tbody>`;
        return head + body;
    };
    realEl.innerHTML = buildTable(r => ({
        my1: r.you.r1Score, my2: r.you.r2Score,
        ma1: r.mate.r1Score, ma2: r.mate.r2Score,
        total: r.totalScore,
    }));
    idealEl.innerHTML = buildTable(r => ({
        my1: r.youIdeal.r1Score, my2: r.youIdeal.r2Score,
        ma1: r.mateIdeal.r1Score, ma2: r.mateIdeal.r2Score,
        total: r.totalIdealScore,
    }));
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
