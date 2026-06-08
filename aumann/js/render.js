// DOM rendering helpers for the Aumann UI. Pure functions of state →
// mutations on existing DOM nodes (no virtual DOM, no framework).

import { RANK_LABEL, SUIT_GLYPH, RED_SUITS } from './cards.js';
import { CONDITIONS } from './conditions.js';

const SCORE_LABELS = ['10 / 0', '9 / 4', '7 / 7', '4 / 9', '0 / 10'];
const BAND_LABELS  = ['80 – 100%', '60 – 80%', '40 – 60%', '20 – 40%', '0 – 20%'];

// Show one of the top-level <section class="view"> blocks, hiding the rest.
export function showView(id) {
    document.querySelectorAll('.view').forEach(el => {
        el.hidden = (el.id !== id);
    });
}

// Render a single card to a DOM element.
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

export function renderHand(container, hand, opts = {}) {
    container.innerHTML = '';
    if (!hand) {
        // Show 5 backs
        for (let i = 0; i < 5; i++) container.appendChild(renderCard(null, { back: true }));
        return;
    }
    for (const c of hand) container.appendChild(renderCard(c, opts));
}

// Render the 5-row board with two player columns. on Row click → onPlace(row).
export function renderBoard(container, view, onPlace) {
    container.innerHTML = '';
    const g = view.game;
    const state = g.state;
    for (let i = 0; i < 5; i++) {
        const row = document.createElement('div');
        row.className = 'board-row';

        // You cell
        const you = document.createElement('div');
        you.className = 'cell player';
        // Both placed-for-round states
        const myR1 = g.myR1, myR2 = g.myR2;
        const oppR1 = g.oppR1, oppR2 = g.oppR2;

        const showR1Me = (myR1 != null && i === myR1);
        const showR2Me = (myR2 != null && i === myR2);
        const showR1Opp = (oppR1 != null && i === oppR1);
        const showR2Opp = (oppR2 != null && i === oppR2);

        // Decide if this row is currently tappable (for me)
        // - Round 1: I can place if I haven't yet AND game is in round1
        // - Round 2: I can place if I haven't yet AND game is in round2
        const canTapR1 = state === 'round1' && myR1 == null;
        const canTapR2 = state === 'round2' && myR2 == null;
        if (!(canTapR1 || canTapR2)) you.classList.add('disabled');

        // Tokens
        const tokenPair = document.createElement('div');
        tokenPair.className = 'token-pair';
        if (showR1Me) {
            const t = document.createElement('div');
            t.className = 'token r1';
            t.title = 'Your round 1';
            t.textContent = '1';
            tokenPair.appendChild(t);
        }
        if (showR2Me) {
            const t = document.createElement('div');
            t.className = 'token r2';
            t.title = 'Your round 2';
            t.textContent = '2';
            tokenPair.appendChild(t);
        }
        you.appendChild(tokenPair);

        if (canTapR1 || canTapR2) {
            you.addEventListener('click', () => {
                const round = canTapR1 ? 1 : 2;
                onPlace(round, i);
            });
        }

        // Middle cell
        const mid = document.createElement('div');
        mid.className = 'cell middle';
        mid.innerHTML = `<div class="band">${BAND_LABELS[i]}</div><div class="scores">${SCORE_LABELS[i]}</div>`;

        // Opp cell
        const opp = document.createElement('div');
        opp.className = 'cell';
        opp.classList.add('disabled'); // opponent's column is read-only for me
        const oppTokens = document.createElement('div');
        oppTokens.className = 'token-pair';
        if (showR1Opp) {
            const t = document.createElement('div');
            t.className = 'token opp r1';
            t.title = "Opponent's round 1";
            t.textContent = '1';
            oppTokens.appendChild(t);
        }
        if (showR2Opp) {
            const t = document.createElement('div');
            t.className = 'token opp r2';
            t.title = "Opponent's round 2";
            t.textContent = '2';
            oppTokens.appendChild(t);
        }
        opp.appendChild(oppTokens);

        row.appendChild(you);
        row.appendChild(mid);
        row.appendChild(opp);
        container.appendChild(row);
    }
}

// Render the conditions list. If revealed, mark which conditions are met (computed against combined hand).
export function renderConditions(container, view, opts = {}) {
    container.innerHTML = '';
    const g = view.game;
    const ol = document.createElement('ol');
    ol.style.listStyle = 'none';
    ol.style.padding = '0';
    ol.style.margin = '0';
    for (const c of g.conditions) {
        const li = document.createElement('li');
        const cond = CONDITIONS.find(x => x.id === c.id);
        li.textContent = cond ? cond.name : c.name;
        if (opts.revealed && opts.combined) {
            const met = cond && cond.eval(opts.combined);
            li.classList.add(met ? 'met' : 'unmet');
        }
        ol.appendChild(li);
    }
    container.appendChild(ol);
}

// Status text given the current game state and whose turn.
export function statusFor(view) {
    const g = view.game;
    const s = g.state;
    if (s === 'round1') {
        if (g.myR1 == null && g.oppR1Pending) return 'Opponent has placed. Place your round 1 token.';
        if (g.myR1 == null) return 'Place your round 1 token.';
        return 'Waiting for opponent…';
    }
    if (s === 'round2') {
        if (g.myR2 == null && g.oppR2Pending) return 'Opponent has placed. Place your round 2 token.';
        if (g.myR2 == null) return 'Place your round 2 token.';
        return 'Waiting for opponent…';
    }
    return ''; // revealed — reveal panel shown instead
}

// Compute realized scores for both players given the placements + qTrue.
// Returns { myScore, oppScore }.
export function realizedScores(view) {
    const g = view.game;
    if (!g.ideal) return null;
    const S = [[10, 0], [9, 4], [7, 7], [4, 9], [0, 10]];
    const q = g.ideal.qTrue;
    const myR1Score = g.myR1 != null ? (q ? S[g.myR1][0] : S[g.myR1][1]) : 0;
    const myR2Score = g.myR2 != null ? (q ? S[g.myR2][0] : S[g.myR2][1]) : 0;
    const oppR1Score = g.oppR1 != null ? (q ? S[g.oppR1][0] : S[g.oppR1][1]) : 0;
    const oppR2Score = g.oppR2 != null ? (q ? S[g.oppR2][0] : S[g.oppR2][1]) : 0;
    return {
        my: myR1Score + myR2Score,
        opp: oppR1Score + oppR2Score,
        myR1Score, myR2Score, oppR1Score, oppR2Score,
    };
}

// Render reveal panel: Q result, condition check, score summary, ideal info.
export function renderReveal(elements, view) {
    const g = view.game;
    const me = view.seat; // 0 or 1
    const oppIdx = 1 - me;

    const qEl = elements.q;
    const condEl = elements.conditions;
    const scoresEl = elements.scores;
    const idealEl = elements.ideal;

    const q = g.ideal.qTrue;
    qEl.textContent = q ? 'YES — at least one condition is met.' : 'NO — no condition is met.';
    qEl.classList.toggle('yes', q);
    qEl.classList.toggle('no', !q);

    // Conditions with met/unmet against the combined hand
    const combined = [...(g.myHand || []), ...(g.oppHand || [])];
    renderConditions(condEl, view, { revealed: true, combined });

    // Realized scores (yours, opponent's, sum); compare to ideal
    const realized = realizedScores(view);
    const idealHalfMine = Math.round((me === 0
        ? scoreFromRows(g.ideal.p1.r1Row, g.ideal.p1.r2Row, q)
        : scoreFromRows(g.ideal.p2.r1Row, g.ideal.p2.r2Row, q)));
    const idealHalfOpp = Math.round((me === 0
        ? scoreFromRows(g.ideal.p2.r1Row, g.ideal.p2.r2Row, q)
        : scoreFromRows(g.ideal.p1.r1Row, g.ideal.p1.r2Row, q)));
    const totalRealized = (realized?.my || 0) + (realized?.opp || 0);
    const idealTotal = g.ideal.score;

    scoresEl.innerHTML = `
        <div class="score-cell">
            <div class="label">You</div>
            <div class="value">${realized.my}</div>
            <div class="delta ${(realized.my - idealHalfMine) >= 0 ? 'pos' : 'neg'}">vs ideal ${idealHalfMine} (${diffStr(realized.my - idealHalfMine)})</div>
        </div>
        <div class="score-cell">
            <div class="label">Opponent</div>
            <div class="value">${realized.opp}</div>
            <div class="delta ${(realized.opp - idealHalfOpp) >= 0 ? 'pos' : 'neg'}">vs ideal ${idealHalfOpp} (${diffStr(realized.opp - idealHalfOpp)})</div>
        </div>
        <div class="score-cell">
            <div class="label">Total this round</div>
            <div class="value">${totalRealized}</div>
            <div class="delta ${(totalRealized - idealTotal) >= 0 ? 'pos' : 'neg'}">vs ideal ${idealTotal} (${diffStr(totalRealized - idealTotal)})</div>
        </div>
    `;

    // Ideal probabilities
    const myI = me === 0 ? g.ideal.p1 : g.ideal.p2;
    const oppI = me === 0 ? g.ideal.p2 : g.ideal.p1;
    idealEl.innerHTML = `
        <div class="row"><span>Your ideal round 1 P:</span> <span>${(100 * myI.r1Belief).toFixed(0)}% → row ${myI.r1Row + 1}</span></div>
        <div class="row"><span>Your ideal round 2 P (given opp's row 1):</span> <span>${(100 * myI.r2Belief).toFixed(0)}% → row ${myI.r2Row + 1}</span></div>
        <div class="row"><span>Opp's ideal round 1 P:</span> <span>${(100 * oppI.r1Belief).toFixed(0)}% → row ${oppI.r1Row + 1}</span></div>
        <div class="row"><span>Opp's ideal round 2 P (given your row 1):</span> <span>${(100 * oppI.r2Belief).toFixed(0)}% → row ${oppI.r2Row + 1}</span></div>
    `;
}

function scoreFromRows(r1, r2, q) {
    const S = [[10, 0], [9, 4], [7, 7], [4, 9], [0, 10]];
    return (q ? S[r1][0] : S[r1][1]) + (q ? S[r2][0] : S[r2][1]);
}
function diffStr(d) { return d >= 0 ? '+' + d : '' + d; }
