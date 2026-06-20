// Monte Carlo solver for the Aumann game's two beliefs:
//   round-1 belief = P(Q | my hand)                 — MC over opp hand
//   round-2 belief = P(Q | my hand, opp's row 1)    — nested MC
// plus the deterministic ideal-Bayesians' score for a dealt scenario.
//
// Q = "at least one of the 3 conditions is met by the combined 10 cards".

import { cardKey, sampleK } from './cards.js';

// Probability bands per row (top to bottom), each with score for Q-true and Q-false.
// Aligned with the chapter's "10/0, 9/4, 7, 4/9, 0/10" board.
// The upper bound of row 0 is 1.01 (not 1.00) so a belief of exactly 1.0 lands in row 0.
export const ROWS = [
    { label: '80–100%', range: [0.80, 1.01], scoreYes: 10, scoreNo:  0 },
    { label: '60–80%',  range: [0.60, 0.80], scoreYes:  9, scoreNo:  4 },
    { label: '40–60%',  range: [0.40, 0.60], scoreYes:  7, scoreNo:  7 },
    { label: '20–40%',  range: [0.20, 0.40], scoreYes:  4, scoreNo:  9 },
    { label: '0–20%',   range: [0.00, 0.20], scoreYes:  0, scoreNo: 10 },
];

// Map a real-valued belief to its row (0..4). Edge cases handled by ranges above.
export function beliefToRow(p) {
    for (let i = 0; i < ROWS.length; i++) {
        const [lo, hi] = ROWS[i].range;
        if (p >= lo && p < hi) return i;
    }
    // p < 0 (shouldn't happen) falls to bottom row.
    return ROWS.length - 1;
}

export function rowScore(row, qTrue) {
    return qTrue ? ROWS[row].scoreYes : ROWS[row].scoreNo;
}

// Expected payoff of a token on `row` when the probability of Q is `p`.
// The board's bands are designed so the expected-score-maximising row is
// exactly beliefToRow(p).
export function expScore(row, p) {
    return p * ROWS[row].scoreYes + (1 - p) * ROWS[row].scoreNo;
}

// Expected loss (regret) of placing on `pickedRow` instead of the Bayesian-
// optimal row, with the expectation over Q taken under the Bayesian belief `p`.
// Always >= 0, and exactly 0 when pickedRow is (one of) the optimal row(s).
//
// This is the variance-reduced alternative to comparing realised scores: it
// replaces the single realised outcome 1[Q] by its conditional expectation p,
// so it carries no Bernoulli noise from how Q happened to resolve.
export function expectedLoss(pickedRow, p) {
    let best = -Infinity;
    for (let r = 0; r < ROWS.length; r++) {
        const s = expScore(r, p);
        if (s > best) best = s;
    }
    return best - expScore(pickedRow, p);
}

// Per-move expected loss for both seats, given the ideal-Bayesian beliefs (the
// `p1`/`p2` blocks from idealScore) and the rows each player actually placed.
//
// Beliefs are the ones an ideal Bayesian would have held — including round 2,
// which conditions on the *ideal* teammate's round-1 row, not the human
// teammate's actual placement. So a player can incur loss because their
// teammate misplayed; in a team game, that's intended.
export function lossBreakdown(ideal, placements) {
    const seat = (info, r1Row, r2Row) => {
        const r1 = expectedLoss(r1Row, info.r1Belief);
        const r2 = expectedLoss(r2Row, info.r2Belief);
        return { r1, r2, total: r1 + r2 };
    };
    const p1 = seat(ideal.p1, placements.p1r1, placements.p1r2);
    const p2 = seat(ideal.p2, placements.p2r1, placements.p2r2);
    return { p1, p2, team: p1.total + p2.total };
}

// Q: at least one of the supplied conditions is satisfied by the 10-card hand.
export function checkQ(combinedHand, conditions) {
    for (const cond of conditions) if (cond.eval(combinedHand)) return true;
    return false;
}

// Return the deck minus the given excluded hand. Pure.
export function complement(excludeHand, deck) {
    const excl = new Set(excludeHand.map(cardKey));
    return deck.filter(c => !excl.has(cardKey(c)));
}

// P(Q | myHand) — opponent's hand is uniform over the 47 cards we don't have.
export function round1Belief(myHand, conditions, deck, numSamples = 2000, rng = Math.random) {
    const otherCards = complement(myHand, deck);
    let hits = 0;
    for (let i = 0; i < numSamples; i++) {
        const oppHand = sampleK(otherCards, 5, rng);
        const combined = myHand.concat(oppHand);
        if (checkQ(combined, conditions)) hits++;
    }
    return hits / numSamples;
}

// P(Q | myHand, opponent placed in row oppRow) — opp assumed to be a perfect
// Bayesian, so their row reflects that their own belief falls in oppRow's range.
//
// Nested MC: outer samples opp's hand from our 47 unknowns; inner estimates
// opp's belief from their 47 unknowns (which include our actual hand as one of
// many possibilities). Keep only outer samples where the inner-estimated belief
// lands in the row opp chose, and take the conditional expectation of Q.
//
// Falls back to round-1 belief if no consistent opp-hands are found within
// numOuter samples (which happens when opp chose a row no Bayesian would given
// our hand — i.e., the player isn't actually Bayesian).
export function round2Belief(myHand, conditions, deck, oppRow,
                              numOuter = 2000, numInner = 200, rng = Math.random) {
    const [lo, hi] = ROWS[oppRow].range;
    const otherCards = complement(myHand, deck);
    let inRange = 0, hitsInRange = 0;

    for (let i = 0; i < numOuter; i++) {
        const oppHand = sampleK(otherCards, 5, rng);
        // Opp's belief from their perspective: their 47 unknowns include my hand.
        const oppUnknowns = complement(oppHand, deck);
        let oppHits = 0;
        for (let j = 0; j < numInner; j++) {
            const sampledMyHand = sampleK(oppUnknowns, 5, rng);
            const combined = oppHand.concat(sampledMyHand);
            if (checkQ(combined, conditions)) oppHits++;
        }
        const oppBelief = oppHits / numInner;
        if (oppBelief >= lo && oppBelief < hi) {
            inRange++;
            const actualCombined = myHand.concat(oppHand);
            if (checkQ(actualCombined, conditions)) hitsInRange++;
        }
    }
    if (inRange === 0) {
        // No Bayesian-consistent opp-hand found; gracefully fall back.
        return round1Belief(myHand, conditions, deck, numOuter, rng);
    }
    return hitsInRange / inRange;
}

// Run two ideal Bayesians through the full 2-round game on a dealt scenario.
// Returns the full breakdown including each player's row choices, the
// realized Q, and the summed score over all 4 token placements.
export function idealScore(hand1, hand2, conditions, deck, opts = {}) {
    const { numOuter = 2000, numInner = 200, rng = Math.random } = opts;

    const p1_r1 = round1Belief(hand1, conditions, deck, numOuter, rng);
    const p2_r1 = round1Belief(hand2, conditions, deck, numOuter, rng);
    const p1_row1 = beliefToRow(p1_r1);
    const p2_row1 = beliefToRow(p2_r1);

    const p1_r2 = round2Belief(hand1, conditions, deck, p2_row1, numOuter, numInner, rng);
    const p2_r2 = round2Belief(hand2, conditions, deck, p1_row1, numOuter, numInner, rng);
    const p1_row2 = beliefToRow(p1_r2);
    const p2_row2 = beliefToRow(p2_r2);

    const qTrue = checkQ(hand1.concat(hand2), conditions);

    const score =
        rowScore(p1_row1, qTrue) +
        rowScore(p1_row2, qTrue) +
        rowScore(p2_row1, qTrue) +
        rowScore(p2_row2, qTrue);

    return {
        p1: { r1Belief: p1_r1, r1Row: p1_row1, r2Belief: p1_r2, r2Row: p1_row2 },
        p2: { r1Belief: p2_r1, r1Row: p2_row1, r2Belief: p2_r2, r2Row: p2_row2 },
        qTrue,
        score,
    };
}
