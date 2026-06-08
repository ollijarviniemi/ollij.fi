// DOM rendering helpers. Pure-ish: take DOM nodes, mutate their children.

import { RANK_LABEL, SUIT_GLYPH, RED_SUITS } from './cards.js';
import { CONDITIONS } from './conditions.js';

const BAND_PCT    = ['80–100%', '60–80%', '40–60%', '20–40%', '0–20%'];
const BAND_POINTS = ['10 / 0',  '9 / 4',  '7',      '4 / 9',  '0 / 10'];

const BAND_TIPS = [
    'Place here when you think P(at least one condition is met) is between 80% and 100%. Scoring: 10 if any condition is met, 0 otherwise.',
    'P between 60% and 80%. Scoring: 9 if any condition is met, 4 otherwise.',
    'P between 40% and 60%. Scoring: 7 either way — the safe middle.',
    'P between 20% and 40%. Scoring: 4 if any condition is met, 9 otherwise.',
    'P between 0% and 20%. Scoring: 0 if any condition is met, 10 otherwise. The scores are calibrated so each band maximizes expected points for beliefs in its range.',
];

// Per-condition tooltip clarifications for things that aren't obvious from
// the short label alone.
const COND_TIP = {
    4:  'Number cards = ranks 2–10. Aces (value 14) and face cards (J/Q/K) are NOT counted as number cards.',
    5:  'Number cards = ranks 2–10. Aces and J/Q/K are NOT number cards.',
    6:  'Number cards = ranks 2–10. Aces and J/Q/K are NOT number cards.',
    7:  'Even number-card values are {2, 4, 6, 8, 10}; we need at least 4 distinct values from this set present in the 10 cards.',
    8:  'Among the number cards (2–10): same count of even-valued and odd-valued.',
    9:  'Among number cards (2–10), even count minus odd count ≥ 3.',
    10: 'Face cards = J, Q, K. Aces are not face cards.',
    11: 'Face cards = J, Q, K.',
    12: 'At least one Jack, at least one Queen, at least one King.',
    13: 'The lowest-valued card in the 10. Odd means rank is one of 3, 5, 7, 9, J, K.',
    14: 'Red = hearts and diamonds.',
    15: 'Highest-rank card is exactly a King or a Jack. (Queen or Ace would fail.)',
    17: 'Take the 3 lowest-ranked cards from the 10 and sum their values.',
    18: 'A pair = two cards of the same rank. We need two pairs whose ranks differ by exactly 1 (e.g. pair of 5s + pair of 6s, or pair of Ks + pair of As).',
    20: 'The clubs suit loses ties. So this is true iff there is a clubs card whose rank is strictly higher than every non-clubs card\'s rank.',
};

const IDEAL_TIP =
    'What two perfectly rational Bayesians would have scored on these exact hands: each computes their own posterior probability that Q is true, places in the matching band, then on round 2 updates given the opponent\'s round-1 row. The deviation shows how close to ideal your play was.';

/* ---------------- View switching ---------------- */

export function showView(id) {
    document.querySelectorAll('.view').forEach(el => { el.hidden = (el.id !== id); });
}

/* ---------------- Cards ---------------- */

// Sort a hand for display: alternate suit colours (black ♠, red ♥, black ♣,
// red ♦), ascending rank within each suit. Makes the hand easier to parse.
const SUIT_DISPLAY_ORDER = { s: 0, h: 1, c: 2, d: 3 };
function sortHand(hand) {
    return hand.slice().sort((a, b) => {
        const so = SUIT_DISPLAY_ORDER[a.suit] - SUIT_DISPLAY_ORDER[b.suit];
        return so !== 0 ? so : a.rank - b.rank;
    });
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

export function renderHand(container, hand, opts = {}) {
    container.innerHTML = '';
    if (!hand) {
        for (let i = 0; i < 5; i++) container.appendChild(renderCard(null, { back: true }));
        return;
    }
    const sorted = sortHand(hand);
    for (const c of sorted) container.appendChild(renderCard(c, opts));
}

/* ---------------- Conditions ---------------- */

function helpSpan(tip) {
    if (!tip) return '';
    const safe = String(tip).replace(/"/g, '&quot;');
    return ` <span class="help" data-tooltip="${safe}">?</span>`;
}

export function renderConditions(container, conditions, opts = {}) {
    container.innerHTML = '';
    for (const c of conditions) {
        const cond = CONDITIONS.find(x => x.id === c.id) || c;
        const div = document.createElement('div');
        div.className = 'cond-card';
        const tip = COND_TIP[cond.id];
        div.innerHTML = `<span>${cond.name}${helpSpan(tip)}</span>`;
        if (opts.revealed && opts.combined) {
            const met = cond.eval ? cond.eval(opts.combined) : false;
            div.classList.add(met ? 'met' : 'unmet');
        }
        container.appendChild(div);
    }
}

/* ---------------- Board ---------------- */

export function renderBoard(container, view, onPlace) {
    container.innerHTML = '';
    const g = view.game;
    const st = g.state;

    // Row 0: band headers.
    for (let i = 0; i < 5; i++) {
        const b = document.createElement('div');
        b.className = 'band';
        b.innerHTML = `
            <div class="pct">${BAND_PCT[i]}${i === 0 ? helpSpan(BAND_TIPS[i]) : ''}</div>
            <div class="points">${BAND_POINTS[i]}</div>
        `;
        // Add per-band tooltip on the percentage. We only show a single ? icon
        // (on the leftmost band) to avoid clutter — its tooltip covers the
        // whole scoring rule. The other bands get a hidden title for desktop
        // discoverability.
        if (i > 0) b.title = BAND_TIPS[i];
        container.appendChild(b);
    }

    const canTapR1 = st === 'round1' && g.myR1 == null;
    const canTapR2 = st === 'round2' && g.myR2 == null;

    // Row 1: me cells.
    for (let i = 0; i < 5; i++) {
        const c = document.createElement('div');
        c.className = 'cell me';
        const tokens = document.createElement('div'); tokens.className = 'tokens';
        if (g.myR1 === i) tokens.appendChild(token('1', 'r1'));
        if (g.myR2 === i) tokens.appendChild(token('2', 'r2'));
        c.appendChild(tokens);
        if (canTapR1 || canTapR2) {
            c.classList.add('tappable');
            c.addEventListener('click', () => onPlace(canTapR1 ? 1 : 2, i));
        }
        container.appendChild(c);
    }
    // Row 2: opp cells.
    for (let i = 0; i < 5; i++) {
        const c = document.createElement('div');
        c.className = 'cell opp';
        const tokens = document.createElement('div'); tokens.className = 'tokens';
        if (g.oppR1 === i) tokens.appendChild(token('1', 'opp r1'));
        if (g.oppR2 === i) tokens.appendChild(token('2', 'opp r2'));
        c.appendChild(tokens);
        container.appendChild(c);
    }
}

function token(label, cls) {
    const t = document.createElement('div');
    t.className = 'token ' + cls;
    t.textContent = label;
    return t;
}

/* ---------------- Status ---------------- */

export function statusFor(view) {
    const g = view.game;
    if (!g) return '';
    if (g.state === 'round1') {
        if (g.myR1 == null) return 'Tap a row to place your first token.';
        return 'Waiting for opponent…';
    }
    if (g.state === 'round2') {
        if (g.myR2 == null) return 'Tap a row to place your second token.';
        return 'Waiting for opponent…';
    }
    return '';
}

/* ---------------- Reveal ---------------- */

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
    const me = view.seat;
    const myI = me === 0 ? g.ideal.p1 : g.ideal.p2;
    const oppI = me === 0 ? g.ideal.p2 : g.ideal.p1;
    const idealTotal = g.ideal.score;
    const real = realizedScores(view);

    els.q.textContent = q ? 'YES' : 'NO';
    els.q.classList.toggle('yes', q);
    els.q.classList.toggle('no',  !q);

    const delta = real.total - idealTotal;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    const deltaCls = delta >= 0 ? 'pos' : 'neg';

    els.scores.innerHTML = `
        <span class="number">${real.total}</span>
        <span class="ideal">ideal ${idealTotal}${helpSpan(IDEAL_TIP)}</span>
        <span class="delta ${deltaCls}">${deltaStr}</span>
    `;

    els.details.innerHTML = `
        you ${real.my} · opp ${real.opp} ·
        ideal placement: you ${pct(myI.r1Belief)}→${pct(myI.r2Belief)},
        opp ${pct(oppI.r1Belief)}→${pct(oppI.r2Belief)}
    `;
}

function pct(p) { return Math.round(100 * p) + '%'; }
