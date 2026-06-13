// Unit tests for the Manifold-style linked binary-CPMM market.
// Run: node server/market.test.mjs
import { createMarket, probabilities, buyYes, buyNo, sellYes, sellNo, sellSharesForMana, payout } from './market.js';

let passed = 0, failed = 0;
const approx = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;
function ok(cond, msg) { if (cond) { passed++; } else { failed++; console.error('  FAIL:', msg); } }
const sum = (a) => a.reduce((x, y) => x + y, 0);

// --- init: equal prices summing to 1 ---
for (const n of [2, 3, 4, 8]) {
    const m = createMarket(n, { liquidity: 100 });
    const p = probabilities(m);
    ok(approx(sum(p), 1), `n=${n}: prices sum to 1 (got ${sum(p)})`);
    ok(p.every(x => approx(x, 1 / n)), `n=${n}: each price = 1/n`);
}

// --- liquidity clamp: a bad knob must not poison the LMSR (NaN/Inf b) ---
for (const bad of [0, -5, NaN, undefined, Infinity, 'x']) {
    const m = createMarket(3, { liquidity: bad });
    const p = probabilities(m);
    ok(p.every(Number.isFinite) && approx(sum(p), 1), `liquidity=${String(bad)}: finite prices summing to 1`);
    const s = buyYes(m, 0, 25);
    ok(Number.isFinite(s) && s > 0 && approx(sum(probabilities(m)), 1), `liquidity=${String(bad)}: buyYes stays finite + sums to 1`);
}

// --- buyYes raises that option, lowers others, sums to 1 ---
for (const n of [2, 3, 4]) {
    const m = createMarket(n, { liquidity: 100 });
    const before = probabilities(m);
    const s = buyYes(m, 0, 25);
    const after = probabilities(m);
    ok(s > 0, `n=${n}: buyYes returns positive shares`);
    ok(after[0] > before[0], `n=${n}: YES raised its price`);
    for (let j = 1; j < n; j++) ok(after[j] < before[j], `n=${n}: other ${j} fell`);
    ok(approx(sum(after), 1), `n=${n}: sums to 1 after buyYes (${sum(after)})`);
}

// --- buyNo lowers that option, raises others, sums to 1 ---
for (const n of [2, 3, 4]) {
    const m = createMarket(n, { liquidity: 100 });
    const before = probabilities(m);
    const s = buyNo(m, 0, 25);
    const after = probabilities(m);
    ok(s > 0, `n=${n}: buyNo returns positive shares`);
    ok(after[0] < before[0], `n=${n}: NO lowered its price`);
    for (let j = 1; j < n; j++) ok(after[j] > before[j], `n=${n}: other ${j} rose`);
    ok(approx(sum(after), 1), `n=${n}: sums to 1 after buyNo (${sum(after)})`);
}

// --- buy then sell the same shares restores the price (no fee) ---
{
    const m = createMarket(3, { liquidity: 100 });
    const p0 = probabilities(m);
    const s = buyYes(m, 0, 10);
    const back = sellYes(m, 0, s);
    ok(back <= 10 + 1e-6 && back > 9.0, `YES round-trip returns ~paid (paid 10, back ${back.toFixed(3)})`);
    ok(probabilities(m).every((x, j) => approx(x, p0[j], 1e-3)), `prices restored after YES round-trip`);
}
{
    const m = createMarket(3, { liquidity: 100 });
    const p0 = probabilities(m);
    const s = buyNo(m, 1, 10);
    const back = sellNo(m, 1, s);
    ok(back <= 10 + 1e-6 && back > 9.0, `NO round-trip returns ~paid (back ${back.toFixed(3)})`);
    ok(probabilities(m).every((x, j) => approx(x, p0[j], 1e-3)), `prices restored after NO round-trip`);
}

// --- payout is ALWAYS >= 0 (bounded loss: can't owe more than staked) ---
{
    const trueProbs = [0.5, 0.3, 0.2];
    for (const pos of [[10, 0, 0], [-10, 0, 0], [-50, 20, -5], [0, 0, -100]]) {
        ok(payout(pos, trueProbs) >= 0, `payout >= 0 for ${JSON.stringify(pos)} (got ${payout(pos, trueProbs).toFixed(2)})`);
    }
    // YES_i pays trueProb_i, NO_i pays 1-trueProb_i
    ok(approx(payout([10, 0, 0], trueProbs), 10 * 0.5), 'YES pays trueProb');
    ok(approx(payout([-10, 0, 0], trueProbs), 10 * 0.5), 'NO pays 1-trueProb');
}

// --- redemption: 1 YES_i + 1 NO_i pays exactly 1 mana regardless of outcome ---
{
    for (const tp of [[0.1, 0.9], [0.5, 0.5], [0.8, 0.2]]) {
        ok(approx(payout([5, 0], tp) + payout([-5, 0], tp), 5), `5 YES + 5 NO = 5 mana (tp ${tp[0]})`);
    }
}

// --- sellSharesForMana: recover up to target, capped at holding ---
{
    const m = createMarket(3, { liquidity: 100 });
    const held = buyNo(m, 2, 20);
    const { shares, mana } = sellSharesForMana(m, 2, 'no', held, 10);
    ok(shares < held && shares > 0, 'partial sell recovers part of the holding');
    ok(approx(mana, 10, 0.05), `partial sell returns ~target mana (${mana.toFixed(3)})`);
    const all = sellSharesForMana(m, 2, 'no', held, 1e9);
    ok(approx(all.shares, held, 1e-6), 'target above holding sells the whole holding');
}

// --- ARBITRAGE-FREE: any cycle that returns to the start nets ~0 (no free mana) ---
{
    const m = createMarket(4, { liquidity: 100 });
    const p0 = probabilities(m);
    const s0 = buyYes(m, 0, 20);
    const s1 = buyNo(m, 1, 15);
    const s2 = buyYes(m, 2, 10);
    const back = sellYes(m, 2, s2) + sellNo(m, 1, s1) + sellYes(m, 0, s0);
    ok(approx(back, 45, 1e-3), `mixed cycle conserves value (paid 45, back ${back.toFixed(4)}) — no arbitrage`);
    ok(probabilities(m).every((x, j) => approx(x, p0[j], 1e-4)), 'prices fully restored after the cycle');
}
// even an unwind in a DIFFERENT order conserves (LMSR cost is path-independent)
{
    const m = createMarket(3, { liquidity: 100 });
    const a = buyYes(m, 0, 12), b = buyNo(m, 2, 8);
    const back = sellYes(m, 0, a) + sellNo(m, 2, b);
    ok(approx(back, 20, 1e-3), `out-of-order unwind conserves value (back ${back.toFixed(4)})`);
}

// --- larger liquidity ⇒ smaller price impact ---
{
    const thin = createMarket(3, { liquidity: 50 });
    const thick = createMarket(3, { liquidity: 500 });
    buyYes(thin, 0, 10); buyYes(thick, 0, 10);
    ok((probabilities(thin)[0] - 1 / 3) > (probabilities(thick)[0] - 1 / 3), 'thinner market moves more on the same bet');
}

console.log(`\nmarket.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
