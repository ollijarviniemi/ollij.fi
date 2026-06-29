// Allocation-free Monte-Carlo solver for the Aumann game.
// Same semantics as bayesian.js, but ~100x faster: cards are ints, conditions are
// counting predicates, sampling is in-place partial Fisher-Yates, zero per-iteration allocation.
//
// Card int encoding:  card = rank*4 + suit,  suit: s=0 h=1 d=2 c=3  (red = h|d, club = 3).
//   rank = card >> 2 ;  suit = card & 3.
import { ROWS, beliefToRow, rowScore } from './bayesian.js';

const SUIT_IDX = { s: 0, h: 1, d: 2, c: 3 };
export function encodeCard(c) { return c.rank * 4 + SUIT_IDX[c.suit]; }
export function encodeHand(h) { return Int32Array.from(h, encodeCard); }

// full 52-card int deck
export const DECK52 = (() => {
  const d = new Int32Array(52); let i = 0;
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d[i++] = r * 4 + s;
  return d;
})();

// ---- scratch buffers (single-threaded; reused across all calls) ----
const RC = new Int8Array(15);   // rank counts, index 2..14
const SC = new Int8Array(4);    // suit counts
const COMBA = new Int32Array(10);
const COMBB = new Int32Array(10);
const POOL = new Int32Array(52);
const OPPUN = new Int32Array(47);

// Q = at least one of the (≤3) condition ids holds for the 10-card int hand `comb`.
function evalQ(comb, ids) {
  RC.fill(0); SC.fill(0);
  let maxClub = -1, maxOther = -1, has7c = false;
  for (let i = 0; i < 10; i++) {
    const card = comb[i], r = card >> 2, s = card & 3;
    RC[r]++; SC[s]++;
    if (s === 3) { if (r > maxClub) maxClub = r; if (r === 7) has7c = true; }
    else if (r > maxOther) maxOther = r;
  }
  // derived aggregates (one pass over ranks)
  let numCount = 0, numberSum = 0, evenNum = 0, face = 0, minR = 0, maxR = 0,
      threeSum = 0, threeCnt = 0, evenDistinct = 0;
  for (let r = 2; r <= 14; r++) {
    const c = RC[r]; if (!c) continue;
    if (minR === 0) minR = r; maxR = r;
    if (threeCnt < 3) { const t = Math.min(c, 3 - threeCnt); threeSum += r * t; threeCnt += t; }
    if (r <= 10) { numCount += c; numberSum += r * c; if ((r & 1) === 0) { evenNum += c; evenDistinct++; } }
    else if (r <= 13) face += c;
  }
  const oddNum = numCount - evenNum, red = SC[1] + SC[2];
  for (let k = 0; k < ids.length; k++) {
    let ok = false;
    switch (ids[k]) {
      case 1:  ok = RC[14] >= 2; break;
      case 2:  ok = SC[0] >= 5 || SC[1] >= 5 || SC[2] >= 5 || SC[3] >= 5; break;
      case 3:  ok = has7c; break;
      case 4:  ok = numberSum >= 50; break;
      case 5:  ok = numCount === 6; break;
      case 6:  ok = numCount >= 8; break;
      case 7:  ok = evenDistinct >= 4; break;
      case 8:  ok = evenNum === oddNum; break;
      case 9:  ok = evenNum - oddNum >= 3; break;
      case 10: ok = face === 1; break;
      case 11: ok = face === 3; break;
      case 12: ok = RC[11] > 0 && RC[12] > 0 && RC[13] > 0; break;
      case 13: ok = (minR & 1) === 1; break;
      case 14: ok = red === 6; break;
      case 15: ok = maxR === 11 || maxR === 13; break;
      case 16: ok = RC[3] + RC[6] + RC[9] >= 4; break;
      case 17: ok = threeSum <= 8; break;
      case 18: for (let v = 2; v <= 13; v++) if (RC[v] >= 2 && RC[v + 1] >= 2) { ok = true; break; } break;
      case 19: ok = SC[1] >= SC[2] && SC[2] >= SC[0]; break;
      case 20: ok = maxClub > maxOther; break;
    }
    if (ok) return true;
  }
  return false;
}
export { evalQ };

// POOL[0..46] = the 47 deck cards not in the 5-card int hand `myInts`. Returns 47.
function buildComplement(myInts, out) {
  let n = 0;
  for (let i = 0; i < 52; i++) {
    const card = DECK52[i];
    if (card !== myInts[0] && card !== myInts[1] && card !== myInts[2] && card !== myInts[3] && card !== myInts[4]) out[n++] = card;
  }
  return n; // 47
}
// in-place partial Fisher-Yates: first 5 entries of arr[0..n-1] become a uniform 5-sample
function pick5(arr, n, rng) {
  for (let s = 0; s < 5; s++) {
    const j = s + (rng() * (n - s) | 0);
    const t = arr[s]; arr[s] = arr[j]; arr[j] = t;
  }
}

// P(Q | myHand) over a uniform opponent 5-hand from the 47 unknowns.
export function round1Fast(myInts, ids, samples, rng) {
  const n = buildComplement(myInts, POOL);     // 47
  COMBA[0] = myInts[0]; COMBA[1] = myInts[1]; COMBA[2] = myInts[2]; COMBA[3] = myInts[3]; COMBA[4] = myInts[4];
  let hits = 0;
  for (let i = 0; i < samples; i++) {
    pick5(POOL, n, rng);
    COMBA[5] = POOL[0]; COMBA[6] = POOL[1]; COMBA[7] = POOL[2]; COMBA[8] = POOL[3]; COMBA[9] = POOL[4];
    if (evalQ(COMBA, ids)) hits++;
  }
  return hits / samples;
}

// EXACT round-1: enumerate all C(47,5)=1,533,939 opponent hands (~0.26s, zero variance).
export function round1Exact(myInts, ids) {
  const n = buildComplement(myInts, POOL);   // 47
  COMBA[0] = myInts[0]; COMBA[1] = myInts[1]; COMBA[2] = myInts[2]; COMBA[3] = myInts[3]; COMBA[4] = myInts[4];
  let hits = 0, total = 0;
  for (let a = 0; a < n - 4; a++) { COMBA[5] = POOL[a];
    for (let b = a + 1; b < n - 3; b++) { COMBA[6] = POOL[b];
      for (let c = b + 1; c < n - 2; c++) { COMBA[7] = POOL[c];
        for (let d = c + 1; d < n - 1; d++) { COMBA[8] = POOL[d];
          for (let e = d + 1; e < n; e++) { COMBA[9] = POOL[e]; total++; if (evalQ(COMBA, ids)) hits++; } } } } }
  return hits / total;
}

// normal CDF (Abramowitz–Stegun erf) for soft membership weights
function erf(x) { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y; }
function Phi(z) { return 0.5 * (1 + erf(z * 0.7071067811865476)); }

// SOFT-binned round-2: weight each opp hand by P(true b ∈ band | b̂) instead of a hard
// in/out test, removing the boundary-misclassification variance. Lower variance, same cost.
export function round2Soft(myInts, ids, oppRow, outer, inner, rng) {
  const lo = ROWS[oppRow].range[0], hi = ROWS[oppRow].range[1];
  const n = buildComplement(myInts, POOL);
  let wSum = 0, wHit = 0;
  for (let i = 0; i < outer; i++) {
    pick5(POOL, n, rng);
    const o0 = POOL[0], o1 = POOL[1], o2 = POOL[2], o3 = POOL[3], o4 = POOL[4];
    OPPUN[0] = myInts[0]; OPPUN[1] = myInts[1]; OPPUN[2] = myInts[2]; OPPUN[3] = myInts[3]; OPPUN[4] = myInts[4];
    for (let k = 5; k < 47; k++) OPPUN[k] = POOL[k];
    COMBA[0] = o0; COMBA[1] = o1; COMBA[2] = o2; COMBA[3] = o3; COMBA[4] = o4;
    let oh = 0;
    for (let j = 0; j < inner; j++) {
      pick5(OPPUN, 47, rng);
      COMBA[5] = OPPUN[0]; COMBA[6] = OPPUN[1]; COMBA[7] = OPPUN[2]; COMBA[8] = OPPUN[3]; COMBA[9] = OPPUN[4];
      if (evalQ(COMBA, ids)) oh++;
    }
    const b = oh / inner;
    const se = Math.sqrt(b * (1 - b) / inner);
    let w;
    if (se < 1e-9) w = (b >= lo && b < hi) ? 1 : 0;
    else w = Math.max(0, Phi((hi - b) / se) - Phi((lo - b) / se));
    if (w > 1e-9) {
      wSum += w;
      COMBB[0] = myInts[0]; COMBB[1] = myInts[1]; COMBB[2] = myInts[2]; COMBB[3] = myInts[3]; COMBB[4] = myInts[4];
      COMBB[5] = o0; COMBB[6] = o1; COMBB[7] = o2; COMBB[8] = o3; COMBB[9] = o4;
      if (evalQ(COMBB, ids)) wHit += w;
    }
  }
  if (wSum < 1e-6) return { belief: round1Fast(myInts, ids, outer, rng), inRange: 0, fallback: true };
  return { belief: wHit / wSum, inRange: wSum, fallback: false };
}

// P(Q | myHand, opp's round-1 belief ∈ ROWS[oppRow]). Nested MC. Falls back to round-1
// if no Bayesian-consistent opp hand is found (matches bayesian.js).
export function round2Fast(myInts, ids, oppRow, outer, inner, rng) {
  const lo = ROWS[oppRow].range[0], hi = ROWS[oppRow].range[1];
  const n = buildComplement(myInts, POOL);     // my 47 unknowns
  let inRange = 0, hits = 0;
  for (let i = 0; i < outer; i++) {
    pick5(POOL, n, rng);                        // oppHand = POOL[0..4]
    const o0 = POOL[0], o1 = POOL[1], o2 = POOL[2], o3 = POOL[3], o4 = POOL[4];
    // opp's 47 unknowns = myHand(5) ∪ the other 42 of POOL
    OPPUN[0] = myInts[0]; OPPUN[1] = myInts[1]; OPPUN[2] = myInts[2]; OPPUN[3] = myInts[3]; OPPUN[4] = myInts[4];
    for (let k = 5; k < 47; k++) OPPUN[k] = POOL[k];
    COMBA[0] = o0; COMBA[1] = o1; COMBA[2] = o2; COMBA[3] = o3; COMBA[4] = o4;
    let oh = 0;
    for (let j = 0; j < inner; j++) {
      pick5(OPPUN, 47, rng);
      COMBA[5] = OPPUN[0]; COMBA[6] = OPPUN[1]; COMBA[7] = OPPUN[2]; COMBA[8] = OPPUN[3]; COMBA[9] = OPPUN[4];
      if (evalQ(COMBA, ids)) oh++;
    }
    const b = oh / inner;
    if (b >= lo && b < hi) {
      inRange++;
      COMBB[0] = myInts[0]; COMBB[1] = myInts[1]; COMBB[2] = myInts[2]; COMBB[3] = myInts[3]; COMBB[4] = myInts[4];
      COMBB[5] = o0; COMBB[6] = o1; COMBB[7] = o2; COMBB[8] = o3; COMBB[9] = o4;
      if (evalQ(COMBB, ids)) hits++;
    }
  }
  if (inRange === 0) return { belief: round1Fast(myInts, ids, outer, rng), inRange: 0, fallback: true };
  return { belief: hits / inRange, inRange, fallback: false };
}

// Full 2-Bayesian game on a dealt scenario (ints). Mirrors idealScore.
export function idealScoreFast(h1Ints, h2Ints, ids, opts = {}) {
  // round-1 is computed EXACTLY (enumeration, zero variance). round-2 is MC, weighted
  // toward many OUTER samples since its variance ∝ 1/inRange. ~4.5 s/game total.
  const { outer = 3000, inner = 600, rng = Math.random } = opts;
  // round-1 via MC too (not exact enumeration): the 0.4s enumeration floor isn't worth it
  // when reveal latency matters; MC σ≈0.009 here, negligible for the continuous-belief score.
  const p1r1 = round1Fast(h1Ints, ids, outer, rng);
  const p2r1 = round1Fast(h2Ints, ids, outer, rng);
  const row1 = beliefToRow(p1r1), row2 = beliefToRow(p2r1);
  const p1r2 = round2Fast(h1Ints, ids, row2, outer, inner, rng).belief;
  const p2r2 = round2Fast(h2Ints, ids, row1, outer, inner, rng).belief;
  const p1row2 = beliefToRow(p1r2), p2row2 = beliefToRow(p2r2);
  // realised Q over the actual 10 cards, and the 4-token ideal score
  for (let k = 0; k < 5; k++) { COMBB[k] = h1Ints[k]; COMBB[k + 5] = h2Ints[k]; }
  const qTrue = evalQ(COMBB, ids);
  const score = rowScore(row1, qTrue) + rowScore(p1row2, qTrue) + rowScore(row2, qTrue) + rowScore(p2row2, qTrue);
  return {
    p1: { r1Belief: p1r1, r1Row: row1, r2Belief: p1r2, r2Row: p1row2 },
    p2: { r1Belief: p2r1, r1Row: row2, r2Belief: p2r2, r2Row: p2row2 },
    qTrue, score,
  };
}
