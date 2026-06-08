// Calibration: simulate N random Aumann games where both players are perfect
// Bayesians. The average per-game score should land near the chapter's
// reference range (28 easy, 30 very good, 31 extremely hard). If our solver
// matches, the answer here should be roughly 30 ± a couple.

import { fullDeck, sampleK, cardKey, makeRng } from './js/cards.js';
import { CONDITIONS } from './js/conditions.js';
import { idealScore } from './js/bayesian.js';

const N_GAMES = Number(process.argv[2] || 30);
const rng = makeRng(7);
const deck = fullDeck();

let total = 0;
let qTrueCount = 0;
const scores = [];

const t0 = performance.now();
for (let g = 0; g < N_GAMES; g++) {
    // 3 random distinct conditions
    const condIdxs = sampleK([...Array(CONDITIONS.length).keys()], 3, rng);
    const conds = condIdxs.map(i => CONDITIONS[i]);

    // Deal 5 + 5
    const hand1 = sampleK(deck, 5, rng);
    const used = new Set(hand1.map(cardKey));
    const hand2 = sampleK(deck.filter(c => !used.has(cardKey(c))), 5, rng);

    const ideal = idealScore(hand1, hand2, conds, deck,
        { numOuter: 1500, numInner: 150, rng });
    total += ideal.score;
    scores.push(ideal.score);
    if (ideal.qTrue) qTrueCount++;
    if ((g + 1) % 5 === 0) process.stdout.write('.');
}
const dt = (performance.now() - t0) / 1000;

scores.sort((a, b) => a - b);
const mean = total / N_GAMES;
const median = scores[Math.floor(N_GAMES / 2)];
const min = scores[0];
const max = scores[N_GAMES - 1];

console.log(`\nGames: ${N_GAMES}`);
console.log(`Mean score per game: ${mean.toFixed(2)} (chapter range: 28 easy → 31 extremely hard)`);
console.log(`Median: ${median}, min: ${min}, max: ${max}`);
console.log(`Q true: ${qTrueCount}/${N_GAMES} (${(100*qTrueCount/N_GAMES).toFixed(1)}%)`);
console.log(`Elapsed: ${dt.toFixed(2)}s (${(1000*dt/N_GAMES).toFixed(0)} ms/game)`);
