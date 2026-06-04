/**
 * Distribution Scorer
 *
 * Scores player predictions against true distributions using proper scoring rules.
 * Proper scoring rules incentivize honest reporting of beliefs.
 */

class DistributionScorer {
  /**
   * Logarithmic scoring rule (proper scoring rule)
   *
   * Higher is better. Returns log(p) where p is predicted probability of actual outcome.
   * Returns -Infinity for impossible predictions, so we clamp to minimum.
   *
   * @param {Distribution|Object} predictedDist - Predicted distribution
   * @param {*} actualOutcome - The actual outcome
   * @returns {number} Log score
   */
  static logScore(predictedDist, actualOutcome) {
    const epsilon = 1e-10;
    let prob;

    if (predictedDist instanceof Distribution) {
      prob = predictedDist.prob(actualOutcome);
    } else {
      prob = predictedDist[actualOutcome] || 0;
    }

    prob = Math.max(epsilon, prob);
    return Math.log(prob);
  }

  /**
   * Brier score (quadratic proper scoring rule)
   *
   * Lower is better. Sum of squared differences between predicted probabilities
   * and indicator (1 for actual outcome, 0 for others).
   *
   * @param {Distribution|Object} predictedDist - Predicted distribution
   * @param {*} actualOutcome - The actual outcome
   * @returns {number} Brier score (lower is better)
   */
  static brierScore(predictedDist, actualOutcome) {
    let score = 0;
    const pmf = predictedDist instanceof Distribution
      ? predictedDist.toObject()
      : predictedDist;

    for (const [value, prob] of Object.entries(pmf)) {
      const indicator = value == actualOutcome ? 1 : 0;  // Use == for type coercion
      score += (prob - indicator) ** 2;
    }

    // Also account for actual outcome if not in distribution
    if (!(actualOutcome in pmf)) {
      score += 1;  // (0 - 1)^2 = 1
    }

    return score;
  }

  /**
   * KL Divergence from true distribution to predicted
   *
   * Lower is better. Measures how much information is lost when using
   * the predicted distribution instead of the true distribution.
   *
   * @param {Distribution|Object} trueDist - True distribution
   * @param {Distribution|Object} predictedDist - Predicted distribution
   * @returns {number} KL divergence (lower is better)
   */
  static klDivergence(trueDist, predictedDist) {
    const epsilon = 1e-10;
    let kl = 0;

    const trueProbs = trueDist instanceof Distribution
      ? trueDist.toObject()
      : trueDist;
    const predProbs = predictedDist instanceof Distribution
      ? predictedDist.toObject()
      : predictedDist;

    for (const [value, p] of Object.entries(trueProbs)) {
      if (p > epsilon) {
        const q = Math.max(epsilon, predProbs[value] || 0);
        kl += p * Math.log(p / q);
      }
    }

    return kl;
  }

  /**
   * Score against a baseline (uniform distribution)
   *
   * Returns difference in log scores: positive means beat baseline.
   *
   * @param {Distribution|Object} predictedDist - Predicted distribution
   * @param {*} actualOutcome - The actual outcome
   * @returns {number} Score relative to baseline
   */
  static scoreVsBaseline(predictedDist, actualOutcome) {
    const pmf = predictedDist instanceof Distribution
      ? predictedDist.toObject()
      : predictedDist;

    const numOutcomes = Object.keys(pmf).length;
    const uniformProb = 1 / numOutcomes;

    const playerScore = this.logScore(predictedDist, actualOutcome);
    const baselineScore = Math.log(uniformProb);

    return playerScore - baselineScore;
  }

  /**
   * Convert KL divergence to star rating (1-5 stars)
   *
   * @param {number} klDiv - KL divergence
   * @returns {{count: number, thresholds: Object}} Star count and thresholds
   */
  static klToStars(klDiv) {
    const thresholds = [
      { kl: 0.01, count: 5 },
      { kl: 0.05, count: 4 },
      { kl: 0.15, count: 3 },
      { kl: 0.30, count: 2 },
      { kl: Infinity, count: 1 }
    ];

    for (const t of thresholds) {
      if (klDiv <= t.kl) {
        return { count: t.count, thresholds };
      }
    }
    return { count: 1, thresholds };
  }

  /**
   * Calculate all relevant scores for a prediction
   *
   * @param {Distribution|Object} trueDist - True distribution
   * @param {Distribution|Object} predictedDist - Predicted distribution
   * @param {*} actualOutcome - The actual outcome (optional, for log/Brier scores)
   * @returns {Object} Object with all scores
   */
  static calculateAllScores(trueDist, predictedDist, actualOutcome = null) {
    const scores = {
      klDivergence: this.klDivergence(trueDist, predictedDist)
    };

    scores.stars = this.klToStars(scores.klDivergence);

    if (actualOutcome !== null) {
      scores.logScore = this.logScore(predictedDist, actualOutcome);
      scores.brierScore = this.brierScore(predictedDist, actualOutcome);
      scores.vsBaseline = this.scoreVsBaseline(predictedDist, actualOutcome);
    }

    return scores;
  }

  /**
   * Compare two distributions by computing various metrics
   *
   * @param {Distribution|Object} dist1 - First distribution
   * @param {Distribution|Object} dist2 - Second distribution
   * @returns {Object} Comparison metrics
   */
  static compareDistributions(dist1, dist2) {
    const pmf1 = dist1 instanceof Distribution ? dist1.toObject() : dist1;
    const pmf2 = dist2 instanceof Distribution ? dist2.toObject() : dist2;

    // Get all values present in either distribution
    const allValues = new Set([...Object.keys(pmf1), ...Object.keys(pmf2)]);

    // Total variation distance (max difference)
    let tvd = 0;
    for (const v of allValues) {
      const p1 = pmf1[v] || 0;
      const p2 = pmf2[v] || 0;
      tvd += Math.abs(p1 - p2);
    }
    tvd /= 2;  // TVD is half the L1 distance

    // L2 distance
    let l2 = 0;
    for (const v of allValues) {
      const p1 = pmf1[v] || 0;
      const p2 = pmf2[v] || 0;
      l2 += (p1 - p2) ** 2;
    }
    l2 = Math.sqrt(l2);

    return {
      klDivergence: this.klDivergence(dist1, dist2),
      totalVariationDistance: tvd,
      l2Distance: l2,
      numValuesInCommon: Array.from(allValues).filter(v => (pmf1[v] || 0) > 0 && (pmf2[v] || 0) > 0).length
    };
  }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DistributionScorer };
}
