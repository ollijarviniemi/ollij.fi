// Multiple-choice prediction market as a single LMSR (Hanson's logarithmic
// market scoring rule). One shared share-vector q over the n outcomes:
//
//   price_i = exp(q_i/b) / Σ_j exp(q_j/b)        (always sums to 1)
//   C(q)    = b · ln Σ_j exp(q_j/b)              (cost / potential function)
//   cost of a trade Δ = C(q+Δ) − C(q)
//
// Because cost is the change in a single state function C, ANY cycle of trades
// that returns q to its starting point has zero net cost — the market is
// provably arbitrage-free (unlike a heuristic per-pool rescale).
//
// YES_i and NO_i, both bounded-loss:
//   buy YES_i = +shares on outcome i        (pays trueProb_i at resolution)
//   buy NO_i  = +shares on every OTHER i    (pays 1−trueProb_i; = "not i")
// 1 YES_i + 1 NO_i adds the same amount to every q_j, which shifts q by a
// constant — prices unchanged — and is worth exactly 1 mana (redemption).

const EPS = 1e-9;

export function createMarket(n, { liquidity = 100 } = {}) {
    if (!(n >= 2)) throw new Error(`market needs >= 2 outcomes, got ${n}`);
    // LMSR depth b. Scaled so the `liquidity` knob feels like the old per-pool
    // CPMM (a 25-mana bet moves the price ~5% at liquidity 100). Clamp defensively:
    // a zero/negative/non-finite b makes exp(q/b) and C(q) blow up to NaN/Inf.
    const L = (Number.isFinite(liquidity) && liquidity > 0) ? liquidity : 100;
    return { n, q: new Array(n).fill(0), b: L * 3 };
}

// log-sum-exp form of C(q), numerically stable.
function C(q, b) {
    const mx = Math.max(...q);
    let s = 0;
    for (const v of q) s += Math.exp((v - mx) / b);
    return mx + b * Math.log(s);
}
export function probabilities(market) {
    const { q, b } = market;
    const mx = Math.max(...q);
    const ex = q.map(v => Math.exp((v - mx) / b));
    const s = ex.reduce((a, c) => a + c, 0);
    return ex.map(e => e / s);
}

const vecYes = (n, i, s) => { const d = new Array(n).fill(0); d[i] = s; return d; };
const vecNo = (n, i, s) => { const d = new Array(n).fill(s); d[i] = 0; return d; };

// Cost of applying delta to q (read-only). >0 = trader pays, <0 = trader receives.
function deltaCost(market, delta) {
    const { q, b } = market;
    const q2 = q.map((v, i) => v + delta[i]);
    return C(q2, b) - C(q, b);
}
function apply(market, delta) {
    let q = market.q.map((v, i) => v + delta[i]);
    const mn = Math.min(...q);          // re-center (shift-invariant) to keep numbers small
    market.q = q.map(v => v - mn);
}

// Solve shares s>0 such that buying them costs `mana` (cost is increasing in s).
function sharesForManaBuy(market, vecFn, i, mana) {
    let lo = 0, hi = 1;
    while (deltaCost(market, vecFn(market.n, i, hi)) < mana && hi < 1e9) hi *= 2;
    for (let it = 0; it < 200; it++) {
        const mid = (lo + hi) / 2;
        if (deltaCost(market, vecFn(market.n, i, mid)) < mana) lo = mid; else hi = mid;
        if (hi - lo < EPS) break;
    }
    return (lo + hi) / 2;
}

// ---- public ops (mutate the market) ----
export function buyYes(market, i, mana) { const s = sharesForManaBuy(market, vecYes, i, mana); apply(market, vecYes(market.n, i, s)); return s; }
export function buyNo(market, i, mana) { const s = sharesForManaBuy(market, vecNo, i, mana); apply(market, vecNo(market.n, i, s)); return s; }
export function sellYes(market, i, s) { const d = vecYes(market.n, i, -s); const proceeds = -deltaCost(market, d); apply(market, d); return proceeds; }
export function sellNo(market, i, s) { const d = vecNo(market.n, i, -s); const proceeds = -deltaCost(market, d); apply(market, d); return proceeds; }

/**
 * Read-only: how many YES_i / NO_i shares to sell to recover ~manaTarget, capped
 * at `holding`. Returns { shares, mana }. (The caller then sells `shares`.)
 */
export function sellSharesForMana(market, i, side, holding, manaTarget) {
    const vec = side === 'yes' ? vecYes : vecNo;
    const proceedsOf = (s) => -deltaCost(market, vec(market.n, i, -s));
    const full = proceedsOf(holding);
    if (manaTarget >= full - EPS) return { shares: holding, mana: full };
    let lo = 0, hi = holding;
    for (let it = 0; it < 200; it++) {
        const mid = (lo + hi) / 2;
        if (proceedsOf(mid) < manaTarget) lo = mid; else hi = mid;
        if (hi - lo < EPS) break;
    }
    const shares = (lo + hi) / 2;
    return { shares, mana: proceedsOf(shares) };
}

/**
 * Resolution payout (PROB resolution). `pos[i]` signed: + = YES_i shares (pay
 * trueProb_i), − = NO_i shares (pay 1−trueProb_i). Always >= 0.
 */
export function payout(pos, trueProbs) {
    let total = 0;
    for (let i = 0; i < pos.length; i++) {
        const qv = pos[i] || 0;
        total += qv >= 0 ? qv * trueProbs[i] : (-qv) * (1 - trueProbs[i]);
    }
    return total;
}
