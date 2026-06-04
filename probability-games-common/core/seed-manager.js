/**
 * Seed Manager - Centralized seed handling
 *
 * Provides consistent seed management across the application.
 * Seeds can come from URL parameters, explicit setting, or random generation.
 */

const SeedManager = {
  _currentSeed: null,

  /**
   * Initialize seed from URL parameter or generate random
   * Call this once at app startup
   */
  initialize() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlSeed = urlParams.get('seed');

    if (urlSeed !== null) {
      this._currentSeed = parseInt(urlSeed, 10);
      if (isNaN(this._currentSeed)) {
        console.warn(`[SeedManager] Invalid seed in URL: "${urlSeed}", using random`);
        this._currentSeed = this.generateRandomSeed();
      } else {
        console.log(`[SeedManager] Using seed from URL: ${this._currentSeed}`);
      }
    } else {
      this._currentSeed = this.generateRandomSeed();
      console.log(`[SeedManager] Using random seed: ${this._currentSeed}`);
    }

    return this._currentSeed;
  },

  /**
   * Generate a random seed
   */
  generateRandomSeed() {
    return Math.floor(Math.random() * 2147483647); // Max 32-bit signed int
  },

  /**
   * Get current seed (initializes if needed)
   */
  getSeed() {
    if (this._currentSeed === null) {
      this.initialize();
    }
    return this._currentSeed;
  },

  /**
   * Explicitly set the seed
   */
  setSeed(seed) {
    this._currentSeed = seed;
    console.log(`[SeedManager] Seed set to: ${this._currentSeed}`);
  },

  /**
   * Get seed for Monte Carlo run (deterministic sequence)
   * @param {number} runIndex - The run number (0, 1, 2, ...)
   */
  getMonteCarloSeed(runIndex) {
    return runIndex;
  },

  /**
   * Reset to uninitialized state (for testing)
   */
  reset() {
    this._currentSeed = null;
  }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SeedManager;
}
