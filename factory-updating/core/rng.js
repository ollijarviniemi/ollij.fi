/**
 * Random Number Generator
 *
 * Deterministic RNG for reproducible simulations
 */

class RNG {
  constructor(seed) {
    // Scramble the seed to avoid correlations between similar seeds.
    // LCGs have poor low-order bits, so seeds differing only in low bits
    // (e.g., 0, 2, 4 vs 1, 3, 5) can produce correlated sequences.
    // This uses a simple mixing function to spread entropy across all bits.
    let s = (seed || 12345) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0x85ebca6b);
    s = Math.imul(s ^ (s >>> 13), 0xc2b2ae35);
    s = (s ^ (s >>> 16)) >>> 0;
    this.state = s || 1;  // Ensure non-zero state
  }

  /**
   * Generate next random number [0, 1)
   */
  next() {
    // Simple LCG (Linear Congruential Generator)
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  /**
   * Random integer in range [min, max)
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * Random choice from array
   */
  choice(array) {
    return array[this.nextInt(0, array.length)];
  }

  /**
   * Weighted random choice
   *
   * @param {Array} items - Array of items to choose from
   * @param {Array} weights - Array of weights (same length as items)
   * @returns {*} Randomly selected item
   */
  weightedChoice(items, weights) {
    if (items.length !== weights.length) {
      throw new Error("Items and weights must have same length");
    }

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) {
      throw new Error("Total weight cannot be zero");
    }

    let random = this.next() * totalWeight;

    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return items[i];
      }
    }

    // Fallback (shouldn't happen)
    return items[items.length - 1];
  }

  /**
   * Shuffle array in place
   */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}
