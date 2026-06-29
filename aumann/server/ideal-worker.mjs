// Off-main-thread ideal-Bayesian computation. Kicked off AT DEAL TIME (the ideal depends only on
// the hands + conditions, not the placements), so the ~1.3 s MC runs while the players are still
// thinking. The main server posts {id, h1, h2, ids}; we reply {id, ideal}. The cheap loss
// breakdown (which needs the placements) is folded in on the main thread at reveal.
import { parentPort } from 'node:worker_threads';
import { encodeHand, idealScoreFast } from '../js/bayesian_fast.mjs';

parentPort.on('message', ({ id, h1, h2, ids }) => {
  try {
    // Hidden behind play time, so the budget can favour accuracy.
    const ideal = idealScoreFast(encodeHand(h1), encodeHand(h2), ids, { outer: 4000, inner: 800 });
    parentPort.postMessage({ id, ideal });
  } catch (e) {
    parentPort.postMessage({ id, error: e && e.message ? e.message : String(e) });
  }
});
