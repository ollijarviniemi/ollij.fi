// DOM rendering for Aumann v3: compact icon conditions, fanned hands (you + opp),
// 3×5 B&W grid (0-20% left → 80-100% right), sidebar score tables, Bayesian
// dashed-line + arc visualization after reveal.

import { RANK_LABEL, SUIT_GLYPH, RED_SUITS } from './cards.js';
import { CONDITIONS } from './conditions.js';
import { ICON, TIP } from './condition-icons.js';

// Display order: visual column index → internal row index. With 0-20% at
// visual column 0 (leftmost), the internal row indices reverse to 4..0.
const VIS_TO_INT = [4, 3, 2, 1, 0];
const INT_TO_VIS = [4, 3, 2, 1, 0];

// Per-cell band/score data ordered LEFT TO RIGHT (visual order).
const BAND_PAYOFF = ['0/10', '4/9', '7/7', '9/4', '10/0'];
const BAND_PCT    = ['0–20%',  '20–40%', '40–60%', '60–80%', '80–100%'];

const BAND_TIP_LEFT_RIGHT = [
    'P 0–20%. Scoring: 0 if any condition is met, 10 otherwise.',
    'P 20–40%. Scoring: 4 if met, 9 otherwise.',
    'P 40–60%. Scoring: 7 either way — the safe middle.',
    'P 60–80%. Scoring: 9 if met, 4 otherwise.',
    'P 80–100%. Scoring: 10 if met, 0 otherwise. The 10/9/7/4/0 numbers are calibrated so each band maximizes expected score for beliefs in its range.',
];

const IDEAL_TIP =
    'What two perfectly rational Bayesians would have scored on these exact hands. The deviation shows how close to ideal your play was.';

/* ---------------- View switching ---------------- */

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

export function renderHand(container, hand) {
    container.innerHTML = '';
    if (!hand) {
        for (let i = 0; i < 5; i++) container.appendChild(renderCard(null, { back: true }));
        return;
    }
    const sorted = sortHand(hand);
    for (const c of sorted) container.appendChild(renderCard(c));
}

/* ---------------- Conditions (compact icon style) ---------------- */

export function renderConditions(container, conditions, opts = {}) {
    container.innerHTML = '';
    for (const c of conditions) {
        const cond = CONDITIONS.find(x => x.id === c.id) || c;
        const div = document.createElement('div');
        div.className = 'cond-card';
        const iconHtml = ICON[cond.id] ? ICON[cond.id]() : `<div class="ic-formula">${cond.name}</div>`;
        const tip = (TIP[cond.id] || '') + (TIP[cond.id] ? ' ' : '') + cond.name;
        const tipEsc = tip.replace(/"/g, '&quot;');
        div.innerHTML = `${iconHtml}<span class="cond-help help" data-tooltip="${tipEsc}">?</span>`;
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

    // Row 1: opponent's cells (top). One per visual column.
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
    // Row 2: band (middle). Payoff prominent, pct secondary.
    for (let v = 0; v < 5; v++) {
        const b = document.createElement('div');
        b.className = 'row-band';
        b.innerHTML = `
            <div class="payoff">${BAND_PAYOFF[v]}</div>
            <div class="pct">${BAND_PCT[v]}</div>
        `;
        b.title = BAND_TIP_LEFT_RIGHT[v];
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

/* ---------------- Bayesian dashed-line + arc (after reveal) ---------------- */

// belief ∈ [0,1] → x position as fraction (0..1) across the grid, given the
// 0-20% column is on the LEFT. So x = belief.
export function renderBayesArrows(boardWrap, view) {
    // Wipe any previous lines.
    boardWrap.querySelectorAll('.bayes-line').forEach(n => n.remove());
    const arc = boardWrap.querySelector('#bayes-arc');
    arc.innerHTML = '';
    arc.removeAttribute('hidden');
    arc.style.display = 'none';

    const g = view.game;
    if (!g.ideal) return;
    const me = view.seat;
    const myI = me === 0 ? g.ideal.p1 : g.ideal.p2;
    const x1 = myI.r1Belief * 100;
    const x2 = myI.r2Belief * 100;

    const board = boardWrap.querySelector('#board');
    const w = board.offsetWidth;
    const r1x = myI.r1Belief * w;
    const r2x = myI.r2Belief * w;
    // If labels would overlap horizontally, stack them vertically.
    const close = Math.abs(r1x - r2x) < 70;

    const r1Line = document.createElement('div');
    r1Line.className = 'bayes-line r1';
    r1Line.style.left = `${r1x}px`;
    r1Line.innerHTML = `<div class="label">r1 ${Math.round(myI.r1Belief * 100)}%</div>`;
    board.appendChild(r1Line);

    const r2Line = document.createElement('div');
    r2Line.className = 'bayes-line r2' + (close ? ' stack' : '');
    r2Line.style.left = `${r2x}px`;
    r2Line.innerHTML = `<div class="label">r2 ${Math.round(myI.r2Belief * 100)}%</div>`;
    board.appendChild(r2Line);

    // Arc: cubic bezier dipping below the grid from r1's column down and back
    // up to r2's column.
    arc.style.display = 'block';
    const arcW = w;
    const arcH = 70;
    arc.setAttribute('width',  arcW);
    arc.setAttribute('height', arcH);
    arc.setAttribute('viewBox', `0 0 ${arcW} ${arcH}`);
    const sx = myI.r1Belief * arcW;
    const ex = myI.r2Belief * arcW;
    const minDx = 12; // ensure arc is visible even when beliefs are close
    const dx = Math.max(Math.abs(ex - sx), minDx);
    const cy = 50; // arc apex depth
    arc.innerHTML = `
        <defs>
            <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5"
                    markerWidth="9" markerHeight="9" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#1976d2" />
            </marker>
        </defs>
        <path d="M ${sx} 0 C ${sx} ${cy} ${ex} ${cy} ${ex} 8"
              stroke="#1976d2" stroke-width="3" fill="none"
              marker-end="url(#arrowhead)" />
    `;
}

/* ---------------- Reveal panel ---------------- */

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

export function renderReveal(els, view) {
    const g = view.game;
    const q = g.ideal.qTrue;
    const real = realizedScores(view);
    const idealTotal = g.ideal.score;

    els.q.textContent = q ? 'YES' : 'NO';
    els.q.classList.toggle('yes', q);
    els.q.classList.toggle('no',  !q);

    const delta = real.total - idealTotal;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const deltaCls = delta >= 0 ? 'pos' : 'neg';

    els.team.innerHTML = `
        <span class="team-score">${real.total}</span>
        <span class="bayes-score">ideal ${idealTotal}<span class="help" data-tooltip="${IDEAL_TIP}">?</span></span>
        <span class="delta ${deltaCls}">${deltaStr}</span>
    `;
}

/* ---------------- Status text ---------------- */

export function statusFor(view) {
    const g = view.game;
    if (!g) return '';
    const oppDown = view.opponent && view.opponent.connected === false;
    if (g.state === 'round1') {
        if (g.myR1 == null) return 'Tap a cell in your row.';
        if (oppDown) return 'Opponent disconnected.';
        return 'Waiting for opponent…';
    }
    if (g.state === 'round2') {
        if (g.myR2 == null) return 'Tap your second cell.';
        if (oppDown) return 'Opponent disconnected.';
        return 'Waiting for opponent…';
    }
    return '';
}

/* ---------------- Sidebar score tables ---------------- */

export function renderScoreTables(realEl, idealEl, scoreHistory) {
    const rows = scoreHistory || [];
    if (rows.length === 0) {
        realEl.innerHTML = `<tbody><tr><td colspan="6" class="muted" style="text-align:center; padding:14px; font-style:italic; color:#aaa;">No games yet.</td></tr></tbody>`;
        idealEl.innerHTML = '';
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
            body += `<tr>
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
        </tr>`;
        body += '</tbody>';
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
