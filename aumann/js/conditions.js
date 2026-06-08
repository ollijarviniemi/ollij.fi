// The 20 condition cards from chapter 11.4. Each takes a 10-card hand (the
// combined pool of both players) and returns true iff the condition is met.
//
// Semantic care:
//   - "numerokortti" (number card) = rank 2..10. Aces NOT counted as number
//     cards; their value is 14 per the chapter.
//   - "kuvakortti" (face card) = J, Q, K (11, 12, 13).
//   - "smallest"/"largest" = by rank value (so an ace beats a king).
//   - Condition 20 ("highest is clubs") uses clubs-loses-ties tiebreaker per
//     the chapter's footnote: clubs is true only if the clubs max strictly
//     exceeds the non-clubs max.

import { isRed, isFace, isNumber, isAce } from './cards.js';

function count(hand, pred) { return hand.filter(pred).length; }
function sortedValues(hand) { return hand.map(c => c.rank).slice().sort((a, b) => a - b); }

export const CONDITIONS = [
    {
        id: 1,
        name: 'At least 2 aces',
        // "Vähintään 2 ässää"
        eval: hand => count(hand, isAce) >= 2,
    },
    {
        id: 2,
        name: 'At least 5 cards of one suit',
        // "Vähintään 5 samaa maata"
        eval: hand => ['s', 'h', 'd', 'c'].some(s => count(hand, c => c.suit === s) >= 5),
    },
    {
        id: 3,
        name: 'The 7 of clubs',
        // "Risti-7"
        eval: hand => hand.some(c => c.suit === 'c' && c.rank === 7),
    },
    {
        id: 4,
        name: 'Number cards sum to at least 50',
        // "Numerokorttien lukujen summa on vähintään 50"
        eval: hand => hand.filter(isNumber).reduce((s, c) => s + c.rank, 0) >= 50,
    },
    {
        id: 5,
        name: 'Exactly 6 number cards',
        // "Tasan 6 numerokorttia"
        eval: hand => count(hand, isNumber) === 6,
    },
    {
        id: 6,
        name: 'At least 8 number cards',
        // "Vähintään 8 numerokorttia"
        eval: hand => count(hand, isNumber) >= 8,
    },
    {
        id: 7,
        name: 'At least 4 distinct even number-card values',
        // "Vähintään 4 eri parillista numeroa"
        eval: hand => {
            const evens = new Set();
            for (const c of hand) {
                if (isNumber(c) && c.rank % 2 === 0) evens.add(c.rank);
            }
            return evens.size >= 4;
        },
    },
    {
        id: 8,
        name: 'Equal count of even and odd number cards',
        // "Parillisia numerokortteja sama määrä kuin parittomia"
        eval: hand => {
            const nums = hand.filter(isNumber);
            const evens = nums.filter(c => c.rank % 2 === 0).length;
            return evens === nums.length - evens;
        },
    },
    {
        id: 9,
        name: 'Even number cards exceed odd by at least 3',
        // "Parillisia numerokortteja on vähintään parittomien määrä plus kolme"
        eval: hand => {
            const nums = hand.filter(isNumber);
            const evens = nums.filter(c => c.rank % 2 === 0).length;
            const odds = nums.length - evens;
            return evens >= odds + 3;
        },
    },
    {
        id: 10,
        name: 'Exactly 1 face card',
        // "Tasan 1 kuvakortti"
        eval: hand => count(hand, isFace) === 1,
    },
    {
        id: 11,
        name: 'Exactly 3 face cards',
        // "Tasan 3 kuvakorttia"
        eval: hand => count(hand, isFace) === 3,
    },
    {
        id: 12,
        name: 'At least one each of J, Q, K',
        // "Vähintään yksi kutakin kuvakorttia"
        eval: hand => {
            const ranks = new Set(hand.map(c => c.rank));
            return ranks.has(11) && ranks.has(12) && ranks.has(13);
        },
    },
    {
        id: 13,
        name: "Smallest card's value is odd",
        // "Pienimmän kortin arvo on pariton"
        eval: hand => {
            let min = Infinity;
            for (const c of hand) if (c.rank < min) min = c.rank;
            return min % 2 === 1;
        },
    },
    {
        id: 14,
        name: 'Exactly 6 red cards',
        // "Tasan 6 punaista korttia"
        eval: hand => count(hand, isRed) === 6,
    },
    {
        id: 15,
        name: 'Highest card is a King or Jack',
        // "Arvokkain kortti on kuningas tai jätkä"
        // Interpretation: max rank ∈ {11, 13}. (Q=12 or A=14 fails.)
        eval: hand => {
            let max = 0;
            for (const c of hand) if (c.rank > max) max = c.rank;
            return max === 11 || max === 13;
        },
    },
    {
        id: 16,
        name: 'At least 4 cards of value 3, 6, or 9',
        // "Vähintään 4 korttia, joiden arvo on 3, 6 tai 9"
        eval: hand => count(hand, c => c.rank === 3 || c.rank === 6 || c.rank === 9) >= 4,
    },
    {
        id: 17,
        name: 'Sum of the 3 lowest cards is at most 8',
        // "Kolmen pienimmän kortin summa on enintään 8"
        eval: hand => {
            const sv = sortedValues(hand);
            return sv[0] + sv[1] + sv[2] <= 8;
        },
    },
    {
        id: 18,
        name: 'Two pairs of consecutive values',
        // "Kaksi paria, joista toisen arvo on yhden suurempi kuin toisen"
        eval: hand => {
            const counts = new Map();
            for (const c of hand) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
            for (let v = 2; v <= 13; v++) {
                if ((counts.get(v) || 0) >= 2 && (counts.get(v + 1) || 0) >= 2) return true;
            }
            return false;
        },
    },
    {
        id: 19,
        name: 'Hearts ≥ Diamonds ≥ Spades (by count)',
        // "Herttojen määrä ≥ ruutujen määrä ≥ patojen määrä"
        eval: hand => {
            let h = 0, d = 0, s = 0;
            for (const c of hand) {
                if (c.suit === 'h') h++;
                else if (c.suit === 'd') d++;
                else if (c.suit === 's') s++;
            }
            return h >= d && d >= s;
        },
    },
    {
        id: 20,
        name: 'Highest card is clubs (clubs loses ties)',
        // "Arvokkain kortti on risti" — tasatilanteessa risti on vähemmän arvokas
        // → true iff max-rank-among-clubs is strictly greater than max-rank-among-others.
        eval: hand => {
            let maxClub = -1, maxOther = -1;
            for (const c of hand) {
                if (c.suit === 'c') { if (c.rank > maxClub) maxClub = c.rank; }
                else                { if (c.rank > maxOther) maxOther = c.rank; }
            }
            return maxClub > maxOther;
        },
    },
];
