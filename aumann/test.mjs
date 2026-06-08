// Node-runnable: `node test.mjs`
import { fullDeck, makeCard, sampleK, makeRng, cardKey } from './js/cards.js';
import { CONDITIONS } from './js/conditions.js';
import { round1Belief, round2Belief, idealScore, beliefToRow, ROWS, checkQ } from './js/bayesian.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
    if (cond) { console.log(`  ✓ ${msg}`); pass++; }
    else      { console.log(`  ✗ ${msg}`); fail++; }
}
function section(name) { console.log(`\n${name}`); }

// Parse a hand from strings like "2h", "10c", "Ah", "Kd".
function h(...specs) {
    return specs.map(s => {
        let rank, suit;
        if (s.startsWith('10')) { rank = 10; suit = s[2]; }
        else {
            const c = s[0];
            rank = (c === 'A') ? 14 : (c === 'K') ? 13 : (c === 'Q') ? 12 : (c === 'J') ? 11 : parseInt(c);
            suit = s[1];
        }
        return makeCard(rank, suit);
    });
}

// ---------- 1) Deck basics ----------
section('1) Deck basics');
const deck = fullDeck();
assert(deck.length === 52, 'full deck has 52 cards');
assert(new Set(deck.map(cardKey)).size === 52, 'all 52 cards are distinct');
const ranks = deck.map(c => c.rank);
assert(Math.min(...ranks) === 2 && Math.max(...ranks) === 14, 'rank range 2..14');
const suits = new Set(deck.map(c => c.suit));
assert(suits.size === 4, 'four suits present');

const rng = makeRng(42);
const sample = sampleK(deck, 5, rng);
assert(sample.length === 5, 'sampleK(5) returns 5');
assert(new Set(sample.map(cardKey)).size === 5, 'sampleK(5) elements distinct');

// ---------- 2) Each of the 20 conditions ----------
const C = CONDITIONS;

section('C1: at least 2 aces');
assert( C[0].eval(h('Ah','As','2c','3c','4c','5c','6c','7c','8c','9c')), '2 aces → true');
assert(!C[0].eval(h('Ah','2s','3c','4c','5c','6c','7c','8c','9c','10c')), '1 ace → false');
assert( C[0].eval(h('Ah','As','Ad','Ac','5c','6c','7c','8c','9c','10c')), '4 aces → true');

section('C2: at least 5 of one suit');
assert( C[1].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Jc')), '5 hearts → true');
assert(!C[1].eval(h('2h','3h','4h','5h','2s','3s','4s','5s','2c','3c')), 'max 4 of a suit → false');
assert( C[1].eval(h('2c','3c','4c','5c','6c','7c','8s','9s','10s','Jh')), '6 clubs → true');

section('C3: 7 of clubs present');
assert( C[2].eval(h('7c','2h','3h','4h','5h','6h','7h','8h','9h','10h')), '7c present → true');
assert(!C[2].eval(h('7h','7d','7s','2c','3c','4c','5c','6c','8c','9c')), 'no 7c → false');

section('C4: number cards (2..10) sum ≥ 50');
// 9 number cards 2..10: sum = 54.
assert( C[3].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Jc')), '2+3+...+10 = 54 → true');
// 7 small number cards (2..8) sum=35 + 3 non-number cards.
assert(!C[3].eval(h('2h','3h','4h','5h','6h','7s','8c','Jh','Qc','Ah')), '2+3+4+5+6+7+8 = 35 → false');
// Cap: number cards sum max with 10 number cards all 10s would need 5 of each rank (impossible). So 50 is reachable mostly with 8+ cards.

section('C5/C6: number-card counts');
assert( C[4].eval(h('2h','3h','4h','5h','6h','7s','Jh','Qc','Kh','Ah')), 'exactly 6 number cards → true (C5)');
assert(!C[4].eval(h('2h','3h','4h','5h','6h','7s','8c','Jh','Qc','Ah')), '7 number cards → false (C5)');
assert( C[5].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Ah')), '9 number cards → true (C6)');
assert(!C[5].eval(h('2h','3h','4h','5h','6h','7s','8c','Jh','Qc','Ah')), '7 number cards → false (C6)');

section('C7: ≥4 distinct even number values');
assert( C[6].eval(h('2h','4h','6h','8h','10h','3s','5c','7c','9c','Jh')), 'evens {2,4,6,8,10} → true');
assert(!C[6].eval(h('2h','2s','4h','4d','6h','3s','5c','7c','9c','Jh')), 'evens {2,4,6} → false');

section('C8/C9: even vs odd number-card balance');
assert( C[7].eval(h('2h','4h','3s','5s','Jh','Qh','Kh','Ah','As','Ad')), '2 even / 2 odd → equal (C8)');
assert(!C[7].eval(h('2h','4h','6h','3s','5s','Jh','Qh','Kh','Ah','As')), '3 even / 2 odd → not equal (C8)');
assert( C[8].eval(h('2h','4h','6h','8h','3s','Jh','Qh','Kh','Ah','As')), '4 even / 1 odd → 4 ≥ 1+3 (C9)');
assert(!C[8].eval(h('2h','4h','3s','Jh','Qh','Kh','Ah','As','Ad','Ac')), '2 even / 1 odd → 2 < 1+3 (C9)');

section('C10/C11/C12: face-card counts');
assert( C[9].eval(h('2h','3h','4h','5h','6h','7s','8c','Jh','Ah','Ad')), '1 face → true (C10)');
assert(!C[9].eval(h('2h','3h','4h','5h','6h','7s','8c','Jh','Qc','Ah')), '2 faces → false (C10)');
assert( C[10].eval(h('2h','3h','4h','5h','6h','7s','Jh','Qc','Kh','Ah')), '3 faces → true (C11)');
assert( C[11].eval(h('2h','3h','4h','5h','6h','7s','8c','Jh','Qc','Kh')), 'J+Q+K present → true (C12)');
assert(!C[11].eval(h('2h','3h','4h','5h','6h','7s','Jh','Qc','Qd','Qh')), 'no K → false (C12)');
assert(!C[11].eval(h('2h','3h','4h','5h','6h','7s','Jh','Jc','Kc','Kh')), 'no Q → false (C12)');

section('C13: smallest card value is odd');
assert( C[12].eval(h('3h','4h','5h','6h','7s','8c','9c','10c','Jh','Qh')), 'smallest 3 (odd) → true');
assert(!C[12].eval(h('2h','4h','5h','6h','7s','8c','9c','10c','Jh','Qh')), 'smallest 2 (even) → false');

section('C14: exactly 6 red cards');
assert( C[13].eval(h('2h','3h','4h','5d','6d','7d','8c','9c','10c','Jc')), '3h+3d = 6 red → true');
assert(!C[13].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Jc')), '5 red → false');
assert(!C[13].eval(h('2h','3h','4h','5h','6h','7h','2d','3d','8c','9c')), '8 red → false');

section('C15: highest card is K or J');
assert( C[14].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','Jh','Kh')), 'max=K → true');
assert( C[14].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Jh')), 'max=J → true');
assert(!C[14].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Qh')), 'max=Q → false');
assert(!C[14].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Ah')), 'max=A → false');

section('C16: ≥4 cards of value 3/6/9');
assert( C[15].eval(h('3h','3s','6h','6s','9h','9s','2c','4c','5c','7c')), '6 cards in {3,6,9} → true');
assert( C[15].eval(h('3h','3s','6h','9h','2c','4c','5c','7c','8c','10c')), '4 cards in {3,6,9} → true');
assert(!C[15].eval(h('3h','6h','9h','2c','4c','5c','7c','8c','10c','Jc')), '3 cards in {3,6,9} → false');

section('C17: sum of 3 lowest ≤ 8');
assert( C[16].eval(h('2h','2s','3h','4h','5h','6h','7s','8c','9c','10c')), '2+2+3 = 7 → true');
assert( C[16].eval(h('2h','3h','3s','4h','5h','6h','7s','8c','9c','10c')), '2+3+3 = 8 → true');
assert(!C[16].eval(h('2h','3h','4h','5h','6h','7s','8c','9c','10c','Jh')), '2+3+4 = 9 → false');
assert(!C[16].eval(h('3h','3s','3d','4h','5h','6h','7s','8c','9c','10c')), '3+3+3 = 9 → false');

section('C18: two pairs of consecutive values');
assert( C[17].eval(h('5h','5s','6h','6s','2c','3c','4c','7c','8c','9c')), 'pair 5 + pair 6 → true');
assert( C[17].eval(h('Kh','Ks','Ah','As','2c','3c','4c','5c','6c','7c')), 'pair K + pair A → true');
assert(!C[17].eval(h('5h','5s','7h','7s','2c','3c','4c','8c','9c','10c')), 'pair 5 + pair 7 (gap) → false');
assert(!C[17].eval(h('5h','5s','5d','5c','2c','3c','4c','7c','8c','9c')), 'four of a kind only → false');

section('C19: ♥ ≥ ♦ ≥ ♠');
assert( C[18].eval(h('2h','3h','4h','5h','2d','3d','4d','2s','3s','2c')), '4♥ ≥ 3♦ ≥ 2♠ → true');
assert(!C[18].eval(h('2h','3h','2d','3d','4d','2s','3s','4s','5s','2c')), '2♥ < 3♦ < 4♠ → false');
assert( C[18].eval(h('2h','2d','2s','2c','3c','4c','5c','6c','7c','8c')), '1=1=1 → true');

section('C20: highest card is clubs (clubs loses ties)');
assert( C[19].eval(h('Kc','Qh','Js','10d','9h','8s','7c','6d','5h','4s')), 'unique max Kc → true');
assert(!C[19].eval(h('Kc','Kh','Qh','Js','10d','9h','8s','7c','6d','5h')), 'tied Kc/Kh → clubs loses → false');
assert(!C[19].eval(h('Kh','Qc','Jh','10s','9d','8c','7h','6s','5d','4h')), 'max Kh non-club → false');
assert( C[19].eval(h('Ac','Kh','Qs','Jd','10h','9s','8c','7d','6h','5s')), 'Ac > all others → true');

// ---------- 3) Bayesian solver sanity ----------
section('3) Bayesian sanity');
const conditions = [CONDITIONS[0], CONDITIONS[1], CONDITIONS[4]]; // C1, C2, C5

const fullSorted = fullDeck();
const myHand = sampleK(fullSorted, 5, rng);

const b1 = round1Belief(myHand, conditions, fullSorted, 2000, rng);
assert(b1 >= 0 && b1 <= 1, `round1Belief in [0,1]: ${b1.toFixed(3)}`);

// base rate of "any of 3 conditions met" over 10 random cards
let baseHits = 0;
const baseN = 4000;
for (let i = 0; i < baseN; i++) {
    const ten = sampleK(fullSorted, 10, rng);
    if (checkQ(ten, conditions)) baseHits++;
}
const baseP = baseHits / baseN;
console.log(`  • base rate P(any of C1,C2,C5) ≈ ${baseP.toFixed(3)} (over ${baseN} random 10-card draws)`);

// round-2 belief is in [0,1]
const b2 = round2Belief(myHand, conditions, fullSorted, 2, 500, 100, rng);
assert(b2 >= 0 && b2 <= 1, `round2Belief in [0,1]: ${b2.toFixed(3)}`);

// ideal score sits in [0, 40]
const hand1 = sampleK(fullSorted, 5, rng);
const used = new Set(hand1.map(cardKey));
const hand2 = sampleK(fullSorted.filter(c => !used.has(cardKey(c))), 5, rng);
const ideal = idealScore(hand1, hand2, conditions, fullSorted, { numOuter: 500, numInner: 100, rng });
assert(ideal.score >= 0 && ideal.score <= 40, `idealScore in [0,40]: ${ideal.score} (qTrue=${ideal.qTrue})`);
console.log(`  • idealScore sample = ${ideal.score} | p1 rows ${ideal.p1.r1Row}→${ideal.p1.r2Row} | p2 rows ${ideal.p2.r1Row}→${ideal.p2.r2Row}`);

// belief band ↔ row mapping
assert(beliefToRow(0.95) === 0, 'belief 0.95 → row 0');
assert(beliefToRow(1.00) === 0, 'belief 1.00 → row 0');
assert(beliefToRow(0.70) === 1, 'belief 0.70 → row 1');
assert(beliefToRow(0.50) === 2, 'belief 0.50 → row 2');
assert(beliefToRow(0.30) === 3, 'belief 0.30 → row 3');
assert(beliefToRow(0.05) === 4, 'belief 0.05 → row 4');
assert(beliefToRow(0.00) === 4, 'belief 0.00 → row 4');

// ---------- 4) Idealized average score over many random games ----------
// Skipped in the unit-test run (too slow). The expected ideal-game-average
// under proper Bayesians for the chapter's setup is around 30-32; we'll
// verify that informally in a separate calibration script.

section('Summary');
console.log(`  passed: ${pass}`);
console.log(`  failed: ${fail}`);
if (fail) process.exit(1);
