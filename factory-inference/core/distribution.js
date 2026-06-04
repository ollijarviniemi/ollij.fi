/**
 * Distribution class for probabilistic DSL
 *
 * Represents a probability mass function (PMF) over discrete values.
 * Supports arithmetic operations, convolution, and statistical functions.
 */

class Distribution {
  /**
   * @param {Object|Map} pmf - Probability mass function as {value: probability}
   */
  constructor(pmf = {}) {
    // Store as Map for efficiency
    if (pmf instanceof Map) {
      this.pmf = new Map(pmf);
    } else {
      this.pmf = new Map(Object.entries(pmf).map(([k, v]) => [this._parseKey(k), v]));
    }
    this._normalize();
  }

  _parseKey(k) {
    // Try to parse as number, keep as string if not
    const num = Number(k);
    return isNaN(num) ? k : num;
  }

  _normalize() {
    // Remove zero/negative probabilities and normalize if sum > 0
    const toRemove = [];
    let sum = 0;
    for (const [k, v] of this.pmf) {
      if (v <= 0) {
        toRemove.push(k);
      } else {
        sum += v;
      }
    }
    for (const k of toRemove) {
      this.pmf.delete(k);
    }
    // Only normalize if sum is reasonably different from 1
    if (sum > 0 && Math.abs(sum - 1) > 1e-10) {
      for (const [k, v] of this.pmf) {
        this.pmf.set(k, v / sum);
      }
    }
  }

  // ========== Static Constructors ==========

  /**
   * Create a distribution with a single certain value
   */
  static constant(value) {
    // Use Map directly to preserve non-primitive values like arrays
    const pmf = new Map();
    pmf.set(value, 1.0);
    return new Distribution(pmf);
  }

  /**
   * Create a Bernoulli distribution
   * @param {number} p - Probability of 1
   */
  static bernoulli(p) {
    if (p <= 0) return new Distribution({ 0: 1.0 });
    if (p >= 1) return new Distribution({ 1: 1.0 });
    return new Distribution({ 0: 1 - p, 1: p });
  }

  /**
   * Create a uniform distribution over given values
   */
  static uniform(values) {
    const p = 1.0 / values.length;
    const pmf = {};
    for (const v of values) {
      pmf[v] = (pmf[v] || 0) + p;
    }
    return new Distribution(pmf);
  }

  /**
   * Create a binomial distribution
   * @param {number} n - Number of trials
   * @param {number} p - Success probability
   */
  static binomial(n, p) {
    const pmf = {};
    for (let k = 0; k <= n; k++) {
      pmf[k] = Distribution._binomialCoeff(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
    }
    return new Distribution(pmf);
  }

  static _binomialCoeff(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1);
    }
    return result;
  }

  // ========== Arithmetic Operations ==========

  /**
   * Add two independent distributions (convolution)
   */
  add(other) {
    if (!(other instanceof Distribution)) {
      other = Distribution.constant(other);
    }

    const result = new Map();
    for (const [v1, p1] of this.pmf) {
      for (const [v2, p2] of other.pmf) {
        const sum = v1 + v2;
        result.set(sum, (result.get(sum) || 0) + p1 * p2);
      }
    }
    return new Distribution(result);
  }

  /**
   * Subtract another distribution (convolution with negation)
   */
  subtract(other) {
    if (!(other instanceof Distribution)) {
      other = Distribution.constant(other);
    }

    const result = new Map();
    for (const [v1, p1] of this.pmf) {
      for (const [v2, p2] of other.pmf) {
        const diff = v1 - v2;
        result.set(diff, (result.get(diff) || 0) + p1 * p2);
      }
    }
    return new Distribution(result);
  }

  /**
   * Multiply by a scalar (scales all values)
   */
  multiply(scalar) {
    if (typeof scalar !== 'number') {
      throw new Error('Distribution.multiply only supports scalar multiplication');
    }

    const result = new Map();
    for (const [v, p] of this.pmf) {
      const newVal = v * scalar;
      result.set(newVal, (result.get(newVal) || 0) + p);
    }
    return new Distribution(result);
  }

  /**
   * Maximum of two independent distributions
   */
  max(other) {
    if (!(other instanceof Distribution)) {
      other = Distribution.constant(other);
    }

    const result = new Map();
    for (const [v1, p1] of this.pmf) {
      for (const [v2, p2] of other.pmf) {
        const maxVal = Math.max(v1, v2);
        result.set(maxVal, (result.get(maxVal) || 0) + p1 * p2);
      }
    }
    return new Distribution(result);
  }

  /**
   * Minimum of two independent distributions
   */
  min(other) {
    if (!(other instanceof Distribution)) {
      other = Distribution.constant(other);
    }

    const result = new Map();
    for (const [v1, p1] of this.pmf) {
      for (const [v2, p2] of other.pmf) {
        const minVal = Math.min(v1, v2);
        result.set(minVal, (result.get(minVal) || 0) + p1 * p2);
      }
    }
    return new Distribution(result);
  }

  // ========== Comparison Operations ==========

  /**
   * P(this == value)
   */
  probabilityEquals(value) {
    return this.pmf.get(value) || 0;
  }

  /**
   * P(this > value)
   */
  probabilityGreaterThan(value) {
    let prob = 0;
    for (const [v, p] of this.pmf) {
      if (v > value) prob += p;
    }
    return prob;
  }

  /**
   * P(this < value)
   */
  probabilityLessThan(value) {
    let prob = 0;
    for (const [v, p] of this.pmf) {
      if (v < value) prob += p;
    }
    return prob;
  }

  // ========== Statistical Functions ==========

  /**
   * Expected value
   */
  expectation() {
    let sum = 0;
    for (const [v, p] of this.pmf) {
      if (typeof v === 'number') {
        sum += v * p;
      }
    }
    return sum;
  }

  /**
   * Variance
   */
  variance() {
    const mean = this.expectation();
    let sum = 0;
    for (const [v, p] of this.pmf) {
      if (typeof v === 'number') {
        sum += (v - mean) ** 2 * p;
      }
    }
    return sum;
  }

  /**
   * Standard deviation
   */
  std() {
    return Math.sqrt(this.variance());
  }

  /**
   * Get probability of a specific value
   */
  prob(value) {
    return this.pmf.get(value) || 0;
  }

  // ========== Utility Methods ==========

  /**
   * Convert to plain object {value: probability}
   */
  toObject() {
    const obj = {};
    for (const [k, v] of this.pmf) {
      obj[k] = v;
    }
    return obj;
  }

  /**
   * Get sorted entries [[value, probability], ...]
   */
  entries() {
    return Array.from(this.pmf.entries()).sort((a, b) => {
      if (typeof a[0] === 'number' && typeof b[0] === 'number') {
        return a[0] - b[0];
      }
      return String(a[0]).localeCompare(String(b[0]));
    });
  }

  /**
   * Get all values in sorted order
   */
  values() {
    return this.entries().map(([v, _]) => v);
  }

  /**
   * Get number of distinct outcomes
   */
  size() {
    return this.pmf.size;
  }

  /**
   * Check if this is a constant (single value)
   */
  isConstant() {
    return this.pmf.size === 1;
  }

  /**
   * Get the constant value if this is constant
   */
  getConstantValue() {
    if (!this.isConstant()) return null;
    return this.pmf.keys().next().value;
  }

  /**
   * Prune small probabilities (below threshold)
   */
  prune(threshold = 1e-10) {
    const toRemove = [];
    for (const [k, v] of this.pmf) {
      if (v < threshold) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      this.pmf.delete(k);
    }
    this._normalize();
    return this;
  }

  /**
   * Clone this distribution
   */
  clone() {
    return new Distribution(new Map(this.pmf));
  }

  /**
   * Sample a random value from this distribution
   */
  sample(rng = Math.random) {
    const r = rng();
    let cumulative = 0;
    for (const [v, p] of this.pmf) {
      cumulative += p;
      if (r <= cumulative) {
        return v;
      }
    }
    // Return last value (shouldn't happen with proper normalization)
    return this.pmf.keys().next().value;
  }

  /**
   * String representation for debugging
   */
  toString() {
    const entries = this.entries();
    if (entries.length === 0) return 'Distribution{}';
    if (entries.length === 1) return `Distribution{${entries[0][0]}: 100%}`;

    const parts = entries.map(([v, p]) => `${v}: ${(p * 100).toFixed(1)}%`);
    return `Distribution{${parts.join(', ')}}`;
  }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Distribution };
}
