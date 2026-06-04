/**
 * Probabilistic DSL Evaluator
 *
 * Evaluates DSL programs probabilistically by tracking random sources
 * and their dependencies. Variables are probability distributions, and
 * correlations between variables are preserved through shared sources.
 *
 * Key concepts:
 * - RandomSource: A source of randomness (e.g., a split() call)
 * - ProbabilisticValue: A value that depends on random sources
 * - The interpreter uses BFS over source assignments, exploring
 *   high-probability branches first and discovering dependencies lazily
 */

// Import Distribution for Node.js; in browser, it's already loaded via script tag
if (typeof module !== 'undefined' && typeof require !== 'undefined') {
  try {
    if (typeof Distribution === 'undefined') {
      Distribution = require('./distribution.js').Distribution;
    }
  } catch (e) {
    // Will be set by browser script loading
  }
}

/**
 * Global BFS budget tracker.
 * Shared across all toDistributionBFS calls within a single execution.
 * Reset at the start of each DSLInterpreter.execute() call.
 */
const globalBFSBudget = {
  remaining: 1000,   // Total BFS iterations allowed
  mcSamples: 1000,   // MC samples for fallback
  lastProcessedMass: 0, // Track raw mass coverage from last computation
  reset() {
    this.remaining = 1000;
    this.lastProcessedMass = 0;
  }
};

/**
 * Combine two independent distributions using a binary operation.
 * This is O(|A| * |B|) where |A| and |B| are support sizes.
 * @param {Distribution} distA - First distribution
 * @param {Distribution} distB - Second distribution
 * @param {Function} op - Binary operation (a, b) => result
 * @returns {Distribution} - Combined distribution
 */
function combineIndependentDistributions(distA, distB, op) {
  const result = new Map();

  for (const [valA, probA] of distA.pmf) {
    for (const [valB, probB] of distB.pmf) {
      const combinedVal = op(valA, valB);
      const combinedProb = probA * probB;

      // Use string key for arrays/objects to properly aggregate
      const key = (typeof combinedVal === 'object' && combinedVal !== null)
        ? JSON.stringify(combinedVal)
        : combinedVal;

      result.set(key, (result.get(key) || 0) + combinedProb);
    }
  }

  // Convert back from string keys if needed
  const finalPmf = new Map();
  for (const [key, prob] of result) {
    let actualKey = key;
    if (typeof key === 'string' && (key.startsWith('[') || key.startsWith('{'))) {
      try {
        actualKey = JSON.parse(key);
      } catch (e) {
        // Keep as string
      }
    }
    finalPmf.set(actualKey, prob);
  }

  return new Distribution(finalPmf);
}

/**
 * Special error thrown when evaluation needs a source that isn't assigned yet.
 * Used by tryEvaluate to discover which source to branch on next.
 */
class NeedSourceError extends Error {
  constructor(sourceId) {
    super(`Need source: ${sourceId}`);
    this.sourceId = sourceId;
    this.name = 'NeedSourceError';
  }
}

/**
 * Binary max-heap for priority queue (by probability).
 * O(log n) insertion and extraction of maximum.
 */
class MaxHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    this.items.push(item);
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return undefined;
    if (this.items.length === 1) return this.items.pop();

    const max = this.items[0];
    this.items[0] = this.items.pop();
    this._bubbleDown(0);
    return max;
  }

  peek() {
    return this.items[0];
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.items[parentIndex].probability >= this.items[index].probability) break;
      [this.items[parentIndex], this.items[index]] = [this.items[index], this.items[parentIndex]];
      index = parentIndex;
    }
  }

  _bubbleDown(index) {
    const length = this.items.length;
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let largest = index;

      if (leftChild < length && this.items[leftChild].probability > this.items[largest].probability) {
        largest = leftChild;
      }
      if (rightChild < length && this.items[rightChild].probability > this.items[largest].probability) {
        largest = rightChild;
      }

      if (largest === index) break;
      [this.items[largest], this.items[index]] = [this.items[index], this.items[largest]];
      index = largest;
    }
  }
}

/**
 * Represents a source of randomness in the program
 */
class RandomSource {
  static nextId = 0;

  /**
   * @param {Array<{value: any, probability: number}>} outcomes
   * @param {string} description - Human-readable description (for debugging)
   */
  constructor(outcomes, description = '') {
    this.id = `src_${RandomSource.nextId++}`;
    this.outcomes = outcomes;
    this.description = description;
  }

  /**
   * Create a binary source (Bernoulli)
   */
  static binary(p, description = '') {
    if (p <= 0) return new RandomSource([{ value: false, probability: 1.0 }], description);
    if (p >= 1) return new RandomSource([{ value: true, probability: 1.0 }], description);
    return new RandomSource([
      { value: true, probability: p },
      { value: false, probability: 1 - p }
    ], description);
  }

  /**
   * Create a multi-outcome source (for multi-way splits)
   */
  static categorical(probs, description = '') {
    const outcomes = probs.map((p, i) => ({ value: i, probability: p }));
    return new RandomSource(outcomes, description);
  }

  /**
   * Reset the ID counter (for testing)
   */
  static resetIdCounter() {
    RandomSource.nextId = 0;
  }
}

/**
 * Represents a value that depends on random sources
 *
 * Instead of storing a single value, stores a function that computes
 * the value given an assignment of outcomes to all random sources.
 */
class ProbabilisticValue {
  /**
   * @param {Function} evaluator - (sourceAssignment) => value
   * @param {Set<RandomSource>} sources - Set of sources this depends on
   */
  constructor(evaluator, sources = new Set()) {
    this.evaluator = evaluator;
    this.sources = sources;
  }

  /**
   * Create a constant (deterministic) value
   */
  static constant(value) {
    return new ProbabilisticValue(() => value, new Set());
  }

  /**
   * Evaluate this value for a given source assignment.
   * Supports memoization: if assignment._memo is a Map, results are cached
   * to avoid redundant evaluation of nested conditionals (O(2^N) -> O(N)).
   */
  eval(assignment) {
    // Check memo for cached result
    if (assignment._memo) {
      if (assignment._memo.has(this)) {
        return assignment._memo.get(this);
      }
    }

    const result = this.evaluator(assignment);

    // Cache result if memo exists
    if (assignment._memo) {
      assignment._memo.set(this, result);
    }

    return result;
  }

  /**
   * Get the marginal distribution (cached for efficiency)
   * This is used for hover tooltips and other display purposes
   */
  getMarginal() {
    if (this._cachedMarginal) {
      return this._cachedMarginal;
    }
    // Compute and cache
    this._cachedMarginal = this.toDistribution();
    return this._cachedMarginal;
  }

  /**
   * Set a pre-computed marginal (used when we can compute it analytically)
   */
  setMarginal(dist) {
    this._cachedMarginal = dist;
  }

  /**
   * Check if this is independent of another value
   */
  isIndependentOf(other) {
    for (const src of this.sources) {
      if (other.sources.has(src)) return false;
    }
    return true;
  }

  /**
   * Check if this is a constant (no random sources)
   */
  isConstant() {
    return this.sources.size === 0;
  }

  /**
   * Get constant value if this is deterministic
   */
  getConstantValue() {
    if (!this.isConstant()) return null;
    return this.evaluator({});
  }

  /**
   * Convert to Distribution by enumerating all source combinations
   * Falls back to Monte Carlo sampling if too many sources
   */
  toDistribution() {
    // If we have a cached marginal, use it
    if (this._cachedMarginal) {
      return this._cachedMarginal;
    }

    const sourcesArray = Array.from(this.sources);

    if (sourcesArray.length === 0) {
      // Constant value
      const val = this.evaluator({});
      return Distribution.constant(val);
    }

    // Use BFS-based evaluation which discovers dependencies lazily.
    // This is efficient because it only explores source combinations that
    // are actually needed, avoiding the full Cartesian product.
    // For simple cases with few sources, it's essentially the same as enumeration.
    // For complex cases with many sources in conditional branches, it's much faster.
    return this.toDistributionBFS();
  }

  /**
   * Monte Carlo sampling fallback for when exact enumeration is too expensive
   */
  toDistributionMonteCarlo(sourcesArray, numSamples) {
    const results = new Map();

    for (let i = 0; i < numSamples; i++) {
      // Sample each source (with memoization for O(N) instead of O(2^N) eval)
      const assignment = { _memo: new Map() };
      for (const source of sourcesArray) {
        const r = Math.random();
        let cumulative = 0;
        for (const outcome of source.outcomes) {
          cumulative += outcome.probability;
          if (r <= cumulative) {
            assignment[source.id] = outcome.value;
            break;
          }
        }
        // Fallback to last outcome if rounding issues
        if (assignment[source.id] === undefined) {
          assignment[source.id] = source.outcomes[source.outcomes.length - 1].value;
        }
      }

      // Evaluate (memoized)
      const value = this.evaluator(assignment);
      results.set(value, (results.get(value) || 0) + 1);
    }

    // Convert counts to probabilities
    const pmf = new Map();
    for (const [value, count] of results) {
      pmf.set(value, count / numSamples);
    }

    return new Distribution(pmf);
  }

  /**
   * Try to evaluate with a partial assignment.
   * Returns { value, complete: true } if evaluation succeeds,
   * or { neededSourceId, complete: false } if a source is needed.
   *
   * @param {Object} partialAssignment - Partial mapping of source IDs to values
   * @returns {{ value?: any, neededSourceId?: string, complete: boolean }}
   */
  tryEvaluate(partialAssignment) {
    let neededSourceId = null;

    // Add memoization map to avoid O(2^N) evaluation of nested conditionals
    const memo = new Map();

    // Create a proxy that throws NeedSourceError when accessing unassigned sources
    const handler = {
      get(target, prop) {
        // Handle special properties
        if (prop === Symbol.toStringTag || prop === 'constructor') {
          return undefined;
        }
        if (typeof prop === 'symbol') {
          return target[prop];
        }
        // Provide memo for memoized evaluation
        if (prop === '_memo') {
          return memo;
        }

        // Check if this source is assigned
        if (!(prop in target)) {
          neededSourceId = prop;
          throw new NeedSourceError(prop);
        }
        return target[prop];
      },
      has(target, prop) {
        return prop in target || prop === '_memo';
      }
    };

    const trackedAssignment = new Proxy(partialAssignment, handler);

    try {
      const value = this.evaluator(trackedAssignment);
      return { value, complete: true };
    } catch (e) {
      if (e instanceof NeedSourceError) {
        return { neededSourceId: e.sourceId, complete: false };
      }
      // Re-throw other errors
      throw e;
    }
  }

  /**
   * Compute distribution using hybrid BFS + stratified Monte Carlo.
   *
   * Phase 1 (BFS): Explore high-probability branches first, computing exact
   * probabilities. Uses global budget shared across all calls within an execution.
   *
   * Phase 2 (Stratified MC): For remaining branches, allocate MC samples
   * proportionally to branch probability. Each sample completes the partial
   * assignment by sampling unassigned sources.
   *
   * @param {number} epsilon - Stop BFS when remaining probability mass < epsilon
   * @returns {Distribution}
   */
  toDistributionBFS(epsilon = 1e-10) {
    const sourcesArray = Array.from(this.sources);

    if (sourcesArray.length === 0) {
      const val = this.evaluator({});
      return Distribution.constant(val);
    }

    // Build source registry for lookup by ID
    const sourceRegistry = new Map();
    for (const source of sourcesArray) {
      sourceRegistry.set(source.id, source);
    }

    // Priority queue using binary max-heap for O(log n) operations
    const heap = new MaxHeap();

    // Results accumulator
    const results = new Map();
    let processedMass = 0;

    // Start with empty assignment
    heap.push({ assignment: {}, probability: 1.0 });

    // Track total probability remaining in queue for early termination
    let queueMass = 1.0;

    // Phase 1: BFS for high-probability branches (uses global budget)
    while (heap.size > 0 && globalBFSBudget.remaining > 0 && queueMass > epsilon) {
      globalBFSBudget.remaining--;

      // Pop highest probability item
      const { assignment, probability } = heap.pop();
      queueMass -= probability;

      // Skip if this branch has negligible probability
      if (probability < epsilon * 0.01) continue;

      // Try to evaluate with this partial assignment
      const result = this.tryEvaluate(assignment);

      if (result.complete) {
        // Evaluation succeeded - accumulate result
        const value = result.value;
        results.set(value, (results.get(value) || 0) + probability);
        processedMass += probability;
      } else {
        // Need more source info - branch on the needed source
        const source = sourceRegistry.get(result.neededSourceId);
        if (!source) {
          throw new Error(`Unknown source: ${result.neededSourceId}`);
        }

        // Add children for each outcome of this source
        for (const outcome of source.outcomes) {
          const newAssignment = { ...assignment, [source.id]: outcome.value };
          const newProbability = probability * outcome.probability;
          if (newProbability > epsilon * 0.001) {  // Skip negligible branches
            heap.push({ assignment: newAssignment, probability: newProbability });
            queueMass += newProbability;
          }
        }
      }
    }

    // Phase 2: Stratified MC for remaining branches
    if (heap.size > 0) {
      // Collect remaining items from heap
      const remainingItems = [];
      let totalRemaining = 0;
      while (heap.size > 0) {
        const item = heap.pop();
        if (item.probability > epsilon * 0.0001) {  // Skip truly negligible
          remainingItems.push(item);
          totalRemaining += item.probability;
        }
      }

      if (totalRemaining > epsilon && remainingItems.length > 0) {
        // Stratified sampling: allocate samples proportionally to probability
        // Use randomized floor/ceil: sample floor with prob (1-frac), ceil with prob frac
        for (const item of remainingItems) {
          const expectedSamples = globalBFSBudget.mcSamples * item.probability / totalRemaining;
          const floorSamples = Math.floor(expectedSamples);
          const frac = expectedSamples - floorSamples;
          const numSamples = floorSamples + (Math.random() < frac ? 1 : 0);

          if (numSamples === 0) {
            // No samples for this item - just add its probability mass to results
            // using a single deterministic completion would be biased, so we skip
            // and accept slightly less than 100% coverage
            continue;
          }

          for (let s = 0; s < numSamples; s++) {
            // Complete partial assignment by sampling all unassigned sources
            const fullAssignment = { ...item.assignment, _memo: new Map() };
            for (const source of sourcesArray) {
              if (!(source.id in fullAssignment)) {
                // Sample this source
                const r = Math.random();
                let cumulative = 0;
                for (const outcome of source.outcomes) {
                  cumulative += outcome.probability;
                  if (r <= cumulative) {
                    fullAssignment[source.id] = outcome.value;
                    break;
                  }
                }
                // Fallback for floating point edge cases
                if (!(source.id in fullAssignment)) {
                  fullAssignment[source.id] = source.outcomes[source.outcomes.length - 1].value;
                }
              }
            }

            // Evaluate with complete assignment (memoized)
            const value = this.evaluator(fullAssignment);

            // Weight: probability of this stratum / number of samples in stratum
            const weight = item.probability / numSamples;
            results.set(value, (results.get(value) || 0) + weight);
          }
        }

        processedMass += totalRemaining;
      }
    }

    // Normalize if we didn't process all mass
    if (processedMass < 1 - epsilon && processedMass > 0) {
      const normFactor = 1.0 / processedMass;
      for (const [value, prob] of results) {
        results.set(value, prob * normFactor);
      }
    }

    return new Distribution(results);
  }
}

/**
 * Create a map key that works with arrays and other values.
 * Arrays are stringified to allow proper comparison in Maps.
 */
function makeMapKey(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/**
 * Parse a map key back to its original value.
 */
function parseMapKey(key) {
  if (typeof key === 'string' && key.startsWith('[')) {
    try {
      return JSON.parse(key);
    } catch (e) {
      return key;
    }
  }
  return key;
}

/**
 * Compute distributions for ALL variables in a single BFS pass.
 * Much more efficient than computing each variable separately.
 *
 * @param {Object} variables - Map of variable name -> ProbabilisticValue
 * @param {number} epsilon - Stop when remaining mass < epsilon
 * @returns {Object} Map of variable name -> Distribution
 */
function computeAllDistributions(variables, epsilon = 1e-10) {
  // Separate variables: those with precomputed distributions vs. those needing BFS
  const precomputed = {};  // Variables with _cachedMarginal
  const probVars = {};     // Variables needing BFS enumeration
  const allSources = new Set();

  for (const [name, pv] of Object.entries(variables)) {
    if (pv && pv.sources && pv.sources.size > 0) {
      // Check if this variable already has a precomputed distribution
      if (pv._cachedMarginal && pv._cachedMarginal.pmf && pv._cachedMarginal.pmf.size > 0) {
        precomputed[name] = pv._cachedMarginal;
      } else {
        probVars[name] = pv;
        for (const src of pv.sources) {
          allSources.add(src);
        }
      }
    }
  }

  // If no variables need BFS, return precomputed + constants
  if (Object.keys(probVars).length === 0) {
    const result = { ...precomputed };
    for (const [name, pv] of Object.entries(variables)) {
      if (!result[name] && pv && typeof pv.getConstantValue === 'function') {
        try {
          const val = pv.getConstantValue();
          result[name] = Distribution.constant(val);
        } catch (e) {
          // Skip non-constant values
        }
      }
    }
    return result;
  }

  const sourcesArray = Array.from(allSources);

  // Build source registry for lookup by ID
  const sourceRegistry = new Map();
  for (const source of sourcesArray) {
    sourceRegistry.set(source.id, source);
  }

  // Priority queue using binary max-heap
  const heap = new MaxHeap();

  // Results accumulators - one per variable
  const results = {};
  for (const name of Object.keys(probVars)) {
    results[name] = new Map();
  }
  let processedMass = 0;

  // Start with empty assignment
  heap.push({ assignment: {}, probability: 1.0 });
  let queueMass = 1.0;

  // Phase 1: BFS for high-probability branches
  while (heap.size > 0 && globalBFSBudget.remaining > 0 && queueMass > epsilon) {
    globalBFSBudget.remaining--;

    const { assignment, probability } = heap.pop();
    queueMass -= probability;

    if (probability < epsilon * 0.01) continue;

    // Try to find a source we need - check all variables
    let neededSource = null;
    let allComplete = true;

    // Try evaluating each variable to see if we need more sources
    const varValues = {};
    for (const [name, pv] of Object.entries(probVars)) {
      const result = pv.tryEvaluate(assignment);
      if (result.complete) {
        varValues[name] = result.value;
      } else {
        allComplete = false;
        if (!neededSource) {
          neededSource = result.neededSourceId;
        }
      }
    }

    if (allComplete) {
      // All variables evaluated - accumulate results
      for (const [name, value] of Object.entries(varValues)) {
        const varResults = results[name];
        const key = makeMapKey(value);
        varResults.set(key, (varResults.get(key) || 0) + probability);
      }
      processedMass += probability;

      // Early termination: if we've covered ~all mass, stop BFS
      if (processedMass > 1 - epsilon) {
        // Drain remaining queue mass (it's negligible)
        while (heap.size > 0) heap.pop();
        break;
      }
    } else {
      // Need more source info - branch on the needed source
      const source = sourceRegistry.get(neededSource);
      if (!source) {
        throw new Error(`Unknown source: ${neededSource}`);
      }

      for (const outcome of source.outcomes) {
        const newAssignment = { ...assignment, [source.id]: outcome.value };
        const newProbability = probability * outcome.probability;
        if (newProbability > epsilon * 0.001) {
          heap.push({ assignment: newAssignment, probability: newProbability });
          queueMass += newProbability;
        }
      }
    }
  }

  // Phase 2: Stratified MC for remaining branches (only if needed)
  if (heap.size > 0 && processedMass < 1 - epsilon) {
    const remainingItems = [];
    let totalRemaining = 0;
    while (heap.size > 0) {
      const item = heap.pop();
      if (item.probability > epsilon * 0.0001) {
        remainingItems.push(item);
        totalRemaining += item.probability;
      }
    }

    if (totalRemaining > epsilon && remainingItems.length > 0 && globalBFSBudget.mcSamples > 0) {
      let sampledMass = 0;
      for (const item of remainingItems) {
        const expectedSamples = globalBFSBudget.mcSamples * item.probability / totalRemaining;
        const floorSamples = Math.floor(expectedSamples);
        const frac = expectedSamples - floorSamples;
        const numSamples = floorSamples + (Math.random() < frac ? 1 : 0);

        if (numSamples === 0) continue;

        sampledMass += item.probability;

        for (let s = 0; s < numSamples; s++) {
          // Complete partial assignment by sampling unassigned sources
          const fullAssignment = { ...item.assignment, _memo: new Map() };
          for (const source of sourcesArray) {
            if (!(source.id in fullAssignment)) {
              const r = Math.random();
              let cumulative = 0;
              for (const outcome of source.outcomes) {
                cumulative += outcome.probability;
                if (r <= cumulative) {
                  fullAssignment[source.id] = outcome.value;
                  break;
                }
              }
              if (!(source.id in fullAssignment)) {
                fullAssignment[source.id] = source.outcomes[source.outcomes.length - 1].value;
              }
            }
          }

          // Evaluate ALL variables with this complete assignment
          const weight = item.probability / numSamples;
          for (const [name, pv] of Object.entries(probVars)) {
            const value = pv.evaluator(fullAssignment);
            const varResults = results[name];
            const key = makeMapKey(value);
            varResults.set(key, (varResults.get(key) || 0) + weight);
          }
        }
      }
      processedMass += sampledMass;
    }
  }

  // Track raw mass coverage before normalization
  globalBFSBudget.lastProcessedMass = processedMass;

  // Convert results to Distributions and normalize if needed
  // Start with precomputed distributions (from eager convolution optimization)
  const distributions = { ...precomputed };
  const normFactor = (processedMass < 1 - epsilon && processedMass > 0) ? 1.0 / processedMass : 1.0;

  for (const [name, varResults] of Object.entries(results)) {
    // Parse stringified keys back to original values and normalize
    const parsedResults = new Map();
    for (const [key, prob] of varResults) {
      const value = parseMapKey(key);
      const normalizedProb = normFactor !== 1.0 ? prob * normFactor : prob;
      parsedResults.set(value, normalizedProb);
    }
    distributions[name] = new Distribution(parsedResults);
    // Also cache in the ProbabilisticValue for getMarginal()
    probVars[name]._cachedMarginal = distributions[name];
  }

  // Add constant variables to results
  for (const [name, pv] of Object.entries(variables)) {
    if (!distributions[name] && pv && pv.isConstant && pv.isConstant()) {
      try {
        distributions[name] = Distribution.constant(pv.getConstantValue());
      } catch (e) {
        // Skip
      }
    }
  }

  return distributions;
}

/**
 * DSL Interpreter
 *
 * Evaluates parsed AST nodes probabilistically.
 */
class DSLInterpreter {
  constructor() {
    this.variables = {};  // name -> ProbabilisticValue
    this.sources = [];    // All RandomSources created
    this.returnValue = null;  // The returned distribution
    this.errors = [];

    // Pre-define math constants
    this.variables['pi'] = ProbabilisticValue.constant(Math.PI);
    this.variables['PI'] = ProbabilisticValue.constant(Math.PI);
    this.variables['e'] = ProbabilisticValue.constant(Math.E);
    this.variables['E'] = ProbabilisticValue.constant(Math.E);
  }

  /**
   * Reset interpreter state
   */
  reset() {
    this.variables = {};
    this.sources = [];
    this.returnValue = null;
    this.returnPv = null;  // ProbabilisticValue for return statement
    this.distributions = {};  // Pre-computed distributions for all variables
    this.lineSnapshots = [];  // [{ line, variables }] — variables map after each statement
    this.errors = [];
    RandomSource.resetIdCounter();
    // Re-add math constants
    this.variables['pi'] = ProbabilisticValue.constant(Math.PI);
    this.variables['PI'] = ProbabilisticValue.constant(Math.PI);
    this.variables['e'] = ProbabilisticValue.constant(Math.E);
    this.variables['E'] = ProbabilisticValue.constant(Math.E);
  }

  /**
   * Execute a parsed program (array of statements)
   */
  execute(statements) {
    this.reset();
    globalBFSBudget.reset();  // Reset global BFS budget for this execution

    try {
      for (const stmt of statements) {
        this.evalStatement(stmt);
        // Snapshot variables after each top-level statement (for per-line hover)
        if (stmt.line != null) {
          this.lineSnapshots.push({
            line: stmt.line,
            variables: { ...this.variables }
          });
        }
      }
    } catch (error) {
      this.errors.push({
        message: error.message,
        line: error.line || null
      });
    }

    // Compute distributions for ALL variables at once (more efficient)
    // This also caches them in each ProbabilisticValue for getMarginal()
    this.distributions = computeAllDistributions(this.variables);

    // Get return value from computed distributions (if there was a return statement)
    if (this.distributions['__return__']) {
      this.returnValue = this.distributions['__return__'];
      // Clean up the synthetic variable
      delete this.distributions['__return__'];
      delete this.variables['__return__'];
    }

    return {
      returnValue: this.returnValue,
      variables: this.variables,
      distributions: this.distributions,  // Pre-computed distributions for all variables
      lineSnapshots: this.lineSnapshots,
      sources: this.sources,
      errors: this.errors
    };
  }

  /**
   * Get the ProbabilisticValue for a variable as of a given line (after that line executed).
   * If the line doesn't correspond to a statement, uses the nearest preceding snapshot.
   */
  getVariableAtLine(name, line) {
    if (!this.lineSnapshots || this.lineSnapshots.length === 0) return null;
    // Find the last snapshot with snapshot.line <= line
    let chosen = null;
    for (const snap of this.lineSnapshots) {
      if (snap.line <= line) {
        chosen = snap;
      } else {
        break;
      }
    }
    if (!chosen) return null;
    return chosen.variables[name] || null;
  }

  /**
   * Get the distribution for a variable as of a given line.
   */
  getVariableDistributionAtLine(name, line) {
    const pv = this.getVariableAtLine(name, line);
    if (!pv) return null;
    return pv.getMarginal();
  }

  /**
   * Evaluate a statement
   */
  evalStatement(stmt) {
    switch (stmt.type) {
      case 'assignment':
        return this.evalAssignment(stmt);
      case 'tupleAssignment':
        return this.evalTupleAssignment(stmt);
      case 'augmentedAssignment':
        return this.evalAugmentedAssignment(stmt);
      case 'subscriptAssignment':
        return this.evalSubscriptAssignment(stmt);
      case 'subscriptAugmentedAssignment':
        return this.evalSubscriptAugmentedAssignment(stmt);
      case 'forLoop':
        return this.evalForLoop(stmt);
      case 'whileLoop':
        return this.evalWhileLoop(stmt);
      case 'ifStatement':
        return this.evalIfStatement(stmt);
      case 'break':
        throw { type: 'break' };
      case 'continue':
        throw { type: 'continue' };
      case 'pass':
        return;  // Do nothing
      case 'bodyWithContinueCheck':
        // Special synthetic statement for while loop body with continue handling
        return this.executeBodyWithContinueCheck(stmt.statements);
      case 'functionDef':
        return this.evalFunctionDef(stmt);
      case 'return':
        return this.evalReturn(stmt);
      case 'expression':
        // Expression statement (e.g., function call with side effects)
        // Handle mutating method calls specially
        if (stmt.expression.type === 'method_call') {
          return this.evalMutatingMethodCall(stmt.expression);
        }
        return this.evalExpr(stmt.expression);
      default:
        throw new Error(`Unknown statement type: ${stmt.type}`);
    }
  }

  /**
   * Evaluate simple assignment: X = expr
   */
  evalAssignment(stmt) {
    const value = this.evalExpr(stmt.value);
    this.variables[stmt.target] = value;
  }

  /**
   * Evaluate tuple assignment: B, C = split(A, p) or a, b = b, a or a, b, c = [1, 2, 3]
   */
  evalTupleAssignment(stmt) {
    const numTargets = stmt.targets.length;

    // Check if this is the new format with values array
    const valuesArray = stmt.values || [stmt.value];

    // Special case: split() function (single value that is a split call)
    if (valuesArray.length === 1 && valuesArray[0].type === 'call' && valuesArray[0].name === 'split') {
      // Keep backward compatibility with old format
      const backCompatStmt = { ...stmt, value: valuesArray[0] };
      return this.evalSplitAssignment(backCompatStmt);
    }

    // If multiple values on RHS, evaluate each and assign directly (e.g., a, b = b, a)
    if (valuesArray.length > 1) {
      if (valuesArray.length !== numTargets) {
        throw new Error(`Cannot unpack: expected ${numTargets} values, got ${valuesArray.length}`);
      }

      // First, evaluate ALL right-hand side values BEFORE assigning any
      // This is important for swaps like a, b = b, a
      const evaluatedValues = valuesArray.map(expr => this.evalExpr(expr));

      // Now assign to targets
      for (let i = 0; i < numTargets; i++) {
        this.variables[stmt.targets[i]] = evaluatedValues[i];
      }
      return;
    }

    // Single value that should be an array: a, b, c = [1, 2, 3]
    const valuePv = this.evalExpr(valuesArray[0]);
    if (!valuePv.isConstant()) {
      throw new Error('Tuple unpacking requires constant values');
    }

    const values = valuePv.getConstantValue();
    if (!Array.isArray(values)) {
      throw new Error('Cannot unpack non-sequence');
    }

    if (values.length !== numTargets) {
      throw new Error(`Cannot unpack: expected ${numTargets} values, got ${values.length}`);
    }

    // Assign each value to its target
    for (let i = 0; i < numTargets; i++) {
      this.variables[stmt.targets[i]] = ProbabilisticValue.constant(values[i]);
    }
  }

  /**
   * Evaluate split assignment: B, C = split(A, p)
   */
  evalSplitAssignment(stmt) {
    const call = stmt.value;

    // Get input value
    const inputExpr = call.args[0];
    const input = this.evalExpr(inputExpr);

    // Get probabilities
    const numTargets = stmt.targets.length;
    let probs;

    if (call.args.length >= 2) {
      const probArg = this.evalExpr(call.args[1]);
      if (probArg.isConstant()) {
        const probVal = probArg.getConstantValue();
        if (Array.isArray(probVal)) {
          // Explicit probability array
          probs = probVal;
        } else if (typeof probVal === 'number') {
          // Single probability for binary split
          if (numTargets !== 2) {
            throw new Error(`split() with single probability requires exactly 2 targets, got ${numTargets}`);
          }
          probs = [probVal, 1 - probVal];
        } else {
          throw new Error('split() probability must be a number or array');
        }
      } else {
        throw new Error('split() probability must be a constant');
      }
    } else {
      // Default: uniform distribution
      probs = Array(numTargets).fill(1.0 / numTargets);
    }

    // Validate probabilities
    if (probs.length !== numTargets) {
      throw new Error(`split() got ${probs.length} probabilities but ${numTargets} targets`);
    }

    const probSum = probs.reduce((a, b) => a + b, 0);
    if (Math.abs(probSum - 1.0) > 1e-6) {
      // Normalize
      probs = probs.map(p => p / probSum);
    }

    // OPTIMIZATION: If input is constant 0, no need to create a source - all outputs are 0
    if (input.isConstant() && input.getConstantValue() === 0) {
      for (const targetName of stmt.targets) {
        this.variables[targetName] = ProbabilisticValue.constant(0);
      }
      // Reset the input variable to 0
      if (inputExpr.type === 'variable') {
        this.variables[inputExpr.name] = ProbabilisticValue.constant(0);
      }
      return;
    }

    // Create random source
    const source = RandomSource.categorical(probs, `split at line ${stmt.line || '?'}`);
    this.sources.push(source);

    // Create output variables
    const combinedSources = new Set([...input.sources, source]);

    for (let i = 0; i < numTargets; i++) {
      const targetName = stmt.targets[i];
      const idx = i;  // Capture for closure

      this.variables[targetName] = new ProbabilisticValue(
        (assignment) => {
          // OPTIMIZATION: Check input first - if it's 0, output is 0 regardless of split choice
          // This allows pruning branches where the ball isn't at this position
          const inputVal = input.eval(assignment);
          if (inputVal === 0) {
            return 0;
          }
          // Input is non-zero, now we need the split choice
          const selectedIdx = assignment[source.id];
          if (selectedIdx === idx) {
            return inputVal;
          } else {
            return 0;
          }
        },
        combinedSources
      );
    }

    // Reset the input variable to 0 (its contents have been split out)
    if (inputExpr.type === 'variable') {
      this.variables[inputExpr.name] = ProbabilisticValue.constant(0);
    }
  }

  /**
   * Evaluate augmented assignment: X += expr, X -= expr, X *= expr
   * Uses eager distribution combination when operands are independent.
   */
  evalAugmentedAssignment(stmt) {
    const currentVal = this.variables[stmt.target];
    if (!currentVal) {
      throw new Error(`Variable '${stmt.target}' not defined`);
    }

    const addend = this.evalExpr(stmt.value);

    // Create new value that combines current and addend
    const combinedSources = new Set([...currentVal.sources, ...addend.sources]);

    // Check if operands are independent
    const areIndependent = currentVal.isIndependentOf(addend);

    // Get the operation function for the augmented operator
    const baseOp = stmt.operator.slice(0, -1); // Remove the '=' suffix
    const opFunc = this.getBinOpFunction(baseOp);

    // Use eager combination for independent operands with supported operations
    if (areIndependent && opFunc) {
      const leftDist = currentVal.toDistribution();
      const rightDist = addend.toDistribution();
      const combinedDist = combineIndependentDistributions(leftDist, rightDist, opFunc);

      const newValue = new ProbabilisticValue(
        (assignment) => opFunc(currentVal.eval(assignment), addend.eval(assignment)),
        combinedSources
      );
      newValue._cachedMarginal = combinedDist;
      this.variables[stmt.target] = newValue;
      return;
    }

    // Fallback: lazy evaluation for dependent operands or unsupported operations
    let newValue;
    switch (stmt.operator) {
      case '+=':
        newValue = new ProbabilisticValue(
          (assignment) => currentVal.eval(assignment) + addend.eval(assignment),
          combinedSources
        );
        break;
      case '-=':
        newValue = new ProbabilisticValue(
          (assignment) => currentVal.eval(assignment) - addend.eval(assignment),
          combinedSources
        );
        break;
      case '*=':
        newValue = new ProbabilisticValue(
          (assignment) => currentVal.eval(assignment) * addend.eval(assignment),
          combinedSources
        );
        break;
      case '/=':
        newValue = new ProbabilisticValue(
          (assignment) => {
            const r = addend.eval(assignment);
            return r !== 0 ? currentVal.eval(assignment) / r : 0;
          },
          combinedSources
        );
        break;
      case '//=':
        newValue = new ProbabilisticValue(
          (assignment) => {
            const r = addend.eval(assignment);
            return r !== 0 ? Math.floor(currentVal.eval(assignment) / r) : 0;
          },
          combinedSources
        );
        break;
      case '%=':
        newValue = new ProbabilisticValue(
          (assignment) => {
            const r = addend.eval(assignment);
            return r !== 0 ? currentVal.eval(assignment) % r : 0;
          },
          combinedSources
        );
        break;
      case '**=':
        newValue = new ProbabilisticValue(
          (assignment) => Math.pow(currentVal.eval(assignment), addend.eval(assignment)),
          combinedSources
        );
        break;
      default:
        throw new Error(`Unknown augmented assignment operator: ${stmt.operator}`);
    }

    this.variables[stmt.target] = newValue;
  }

  /**
   * Evaluate subscript assignment: arr[i] = value
   */
  evalSubscriptAssignment(stmt) {
    const arrayPv = this.variables[stmt.array];
    if (!arrayPv) {
      const lineInfo = stmt.line ? ` (line ${stmt.line})` : '';
      throw new Error(`Undefined variable: ${stmt.array}${lineInfo}`);
    }
    if (!arrayPv.isConstant()) {
      throw new Error(`Cannot assign to subscript of probabilistic array`);
    }

    const arr = arrayPv.getConstantValue();
    if (!Array.isArray(arr)) {
      throw new Error(`Subscript assignment on non-array`);
    }

    const indexPv = this.evalExpr(stmt.index);
    if (!indexPv.isConstant()) {
      throw new Error(`Array index must be constant`);
    }
    const idx = indexPv.getConstantValue();

    if (idx < 0 || idx >= arr.length) {
      throw new Error(`Index ${idx} out of bounds for array of length ${arr.length}`);
    }

    const value = this.evalExpr(stmt.value);
    arr[idx] = value;  // Store the ProbabilisticValue directly in the array
  }

  /**
   * Evaluate subscript augmented assignment: arr[i] += value
   */
  evalSubscriptAugmentedAssignment(stmt) {
    const arrayPv = this.variables[stmt.array];
    if (!arrayPv) {
      const lineInfo = stmt.line ? ` (line ${stmt.line})` : '';
      throw new Error(`Undefined variable: ${stmt.array}${lineInfo}`);
    }
    if (!arrayPv.isConstant()) {
      throw new Error(`Cannot assign to subscript of probabilistic array`);
    }

    const arr = arrayPv.getConstantValue();
    if (!Array.isArray(arr)) {
      throw new Error(`Subscript assignment on non-array`);
    }

    const indexPv = this.evalExpr(stmt.index);
    if (!indexPv.isConstant()) {
      throw new Error(`Array index must be constant`);
    }
    const idx = indexPv.getConstantValue();

    if (idx < 0 || idx >= arr.length) {
      throw new Error(`Index ${idx} out of bounds for array of length ${arr.length}`);
    }

    const currentVal = arr[idx];
    const addend = this.evalExpr(stmt.value);

    // Handle the case where current value might be a plain number (from append(0))
    let currentPv;
    if (currentVal instanceof ProbabilisticValue) {
      currentPv = currentVal;
    } else {
      currentPv = ProbabilisticValue.constant(currentVal);
    }

    const combinedSources = new Set([...currentPv.sources, ...addend.sources]);

    let newValue;
    switch (stmt.operator) {
      case '+=':
        newValue = new ProbabilisticValue(
          (assignment) => currentPv.eval(assignment) + addend.eval(assignment),
          combinedSources
        );
        break;
      case '-=':
        newValue = new ProbabilisticValue(
          (assignment) => currentPv.eval(assignment) - addend.eval(assignment),
          combinedSources
        );
        break;
      case '*=':
        newValue = new ProbabilisticValue(
          (assignment) => currentPv.eval(assignment) * addend.eval(assignment),
          combinedSources
        );
        break;
      case '/=':
        newValue = new ProbabilisticValue(
          (assignment) => {
            const r = addend.eval(assignment);
            return r !== 0 ? currentPv.eval(assignment) / r : 0;
          },
          combinedSources
        );
        break;
      case '//=':
        newValue = new ProbabilisticValue(
          (assignment) => {
            const r = addend.eval(assignment);
            return r !== 0 ? Math.floor(currentPv.eval(assignment) / r) : 0;
          },
          combinedSources
        );
        break;
      case '%=':
        newValue = new ProbabilisticValue(
          (assignment) => {
            const r = addend.eval(assignment);
            return r !== 0 ? currentPv.eval(assignment) % r : 0;
          },
          combinedSources
        );
        break;
      case '**=':
        newValue = new ProbabilisticValue(
          (assignment) => Math.pow(currentPv.eval(assignment), addend.eval(assignment)),
          combinedSources
        );
        break;
      default:
        throw new Error(`Unknown operator: ${stmt.operator}`);
    }

    arr[idx] = newValue;
  }

  /**
   * Evaluate for loop
   */
  evalForLoop(stmt) {
    // Fast path: iteration-independent for-loops (see _tryIndependentForLoop).
    // Falls back to unroll if not applicable.
    if (this._tryIndependentForLoop(stmt)) return;

    // Evaluate range expression
    const rangeExpr = stmt.range;
    let iterable;

    if (rangeExpr.type === 'call' && rangeExpr.name === 'range') {
      // range() call
      const args = rangeExpr.args.map(a => {
        const pv = this.evalExpr(a);
        if (!pv.isConstant()) throw new Error('range() arguments must be constants');
        return pv.getConstantValue();
      });

      let start = 0, end, step = 1;
      if (args.length === 1) {
        end = args[0];
      } else if (args.length === 2) {
        start = args[0];
        end = args[1];
      } else if (args.length === 3) {
        start = args[0];
        end = args[1];
        step = args[2];
      } else {
        throw new Error('range() requires 1-3 arguments');
      }

      iterable = [];
      if (step > 0) {
        for (let i = start; i < end; i += step) iterable.push(i);
      } else if (step < 0) {
        for (let i = start; i > end; i += step) iterable.push(i);
      } else {
        throw new Error('range() step cannot be 0');
      }
    } else if (rangeExpr.type === 'call' && rangeExpr.name === 'enumerate') {
      // enumerate() call
      const argPv = this.evalExpr(rangeExpr.args[0]);
      if (!argPv.isConstant()) throw new Error('enumerate() argument must be constant');
      const arr = argPv.getConstantValue();
      if (!Array.isArray(arr)) throw new Error('enumerate() argument must be an array');
      iterable = arr.map((v, i) => [i, v]);
    } else if (rangeExpr.type === 'call' && rangeExpr.name === 'zip') {
      // zip() call
      const arrays = rangeExpr.args.map(a => {
        const pv = this.evalExpr(a);
        if (!pv.isConstant()) throw new Error('zip() arguments must be constants');
        const val = pv.getConstantValue();
        if (!Array.isArray(val)) throw new Error('zip() arguments must be arrays');
        return val;
      });
      const minLen = Math.min(...arrays.map(a => a.length));
      iterable = [];
      for (let i = 0; i < minLen; i++) {
        iterable.push(arrays.map(a => a[i]));
      }
    } else {
      // Assume it's an iterable expression (e.g., array variable)
      const iterPv = this.evalExpr(rangeExpr);
      if (!iterPv.isConstant()) throw new Error('for loop iterable must be constant');
      iterable = iterPv.getConstantValue();
      if (!Array.isArray(iterable)) throw new Error('for loop requires an iterable');
    }

    // Execute loop
    for (const item of iterable) {
      // Set loop variable
      this.variables[stmt.variable] = ProbabilisticValue.constant(item);

      // Execute body
      try {
        for (const bodyStmt of stmt.body) {
          this.evalStatement(bodyStmt);
        }
      } catch (e) {
        if (e && e.type === 'break') break;
        if (e && e.type === 'continue') continue;
        throw e;
      }
    }
  }

  /**
   * Fast path for iteration-independent for-loops.
   *
   * Applicable when:
   *   - It's `for LOOP_VAR in range(N)` with a constant N >= 2.
   *   - LOOP_VAR is not read in the body.
   *   - Every variable written in the body is either:
   *       * a "fresh local" (not also read → a new name introduced each iter), or
   *       * an "accumulator" (only written via augmented assignment
   *         whose RHS doesn't self-reference it).
   *
   * When applicable: run body ONCE with accumulators zeroed, extract each
   * accumulator's marginal Δv distribution, self-convolve N times (via
   * doubling), then set accumulator = pre + Δ_sum. Per-iter cost drops from
   * O(body) × N to O(|Δ-support|²) × log N.
   *
   * Returns true on success, false to fall back to unrolling.
   */
  _tryIndependentForLoop(stmt) {
    const rangeExpr = stmt.range;
    if (!rangeExpr || rangeExpr.type !== 'call' || rangeExpr.name !== 'range') return false;

    // Resolve N (require a single constant integer argument)
    const args = rangeExpr.args.map(a => {
      const pv = this.evalExpr(a);
      return pv.isConstant() ? pv.getConstantValue() : null;
    });
    if (args.some(a => a === null || typeof a !== 'number')) return false;
    let start = 0, end, step = 1;
    if (args.length === 1) end = args[0];
    else if (args.length === 2) { start = args[0]; end = args[1]; }
    else if (args.length === 3) { start = args[0]; end = args[1]; step = args[2]; }
    else return false;
    if (step === 0) return false;
    const N = step > 0 ? Math.max(0, Math.ceil((end - start) / step)) : Math.max(0, Math.ceil((start - end) / (-step)));
    if (N < 2) return false;  // N=0 or 1 — unrolling is fine

    const loopVar = stmt.variable;

    // Analyze body
    const reads = new Set();
    const assigns = new Set();
    const writesByName = new Map();
    const addWrite = (name, node) => {
      assigns.add(name);
      if (!writesByName.has(name)) writesByName.set(name, []);
      writesByName.get(name).push(node);
    };
    const visitExpr = (expr) => {
      if (!expr) return;
      switch (expr.type) {
        case 'variable': reads.add(expr.name); break;
        case 'binOp':
        case 'binaryOp':
          visitExpr(expr.left); visitExpr(expr.right); break;
        case 'unaryOp': visitExpr(expr.operand); break;
        case 'call':
          for (const a of expr.args || []) visitExpr(a); break;
        case 'array':
        case 'list':
          for (const e of expr.elements || []) visitExpr(e); break;
        case 'ternary':
        case 'ifExpr':
          visitExpr(expr.condition);
          visitExpr(expr.thenBranch || expr.then);
          visitExpr(expr.elseBranch || expr.else);
          break;
        case 'comparisonChain':
          for (const o of expr.operands || []) visitExpr(o);
          break;
        case 'subscript':
          visitExpr(expr.object); visitExpr(expr.index); break;
      }
    };
    const visitStmt = (s) => {
      if (!s) return false;
      switch (s.type) {
        case 'assignment':
          visitExpr(s.value); addWrite(s.target, s); return true;
        case 'augmentedAssignment':
          visitExpr(s.value); reads.add(s.target); addWrite(s.target, s); return true;
        case 'tupleAssignment':
          for (const v of s.values || []) visitExpr(v);
          for (const t of s.targets || []) addWrite(t, s);
          return true;
        case 'expression':
          // Mutating method calls like `arr.append(x)` modify state across
          // iterations and cannot be summarized as an iteration-independent
          // delta kernel. Bail out.
          if (s.expression && s.expression.type === 'method_call') return false;
          visitExpr(s.expression); return true;
        case 'ifStatement':
          // Bail out — conditionals complicate iteration-independence analysis
          return false;
        case 'whileLoop':
        case 'forLoop':
          // Nested loop — bail out for simplicity
          return false;
        case 'break':
        case 'continue':
        case 'return':
          return false;  // complicates reasoning
        default:
          return false;  // unknown statement → bail
      }
    };
    for (const s of stmt.body || []) {
      if (!visitStmt(s)) return false;
    }
    if (reads.has(loopVar)) return false;

    // Classify assigned variables
    const accumulators = [];
    const freshLocals = [];
    for (const name of assigns) {
      const writes = writesByName.get(name);
      if (reads.has(name)) {
        // Must be accumulator: all writes are augmentedAssignment with non-self RHS
        const allAug = writes.every(w => w.type === 'augmentedAssignment');
        if (!allAug) return false;
        const selfRef = writes.some(w => this._exprReadsName(w.value, name));
        if (selfRef) return false;
        accumulators.push(name);
      } else {
        freshLocals.push(name);
      }
    }

    if (accumulators.length === 0) {
      // No accumulators; nothing carries across iterations. Still run body once
      // for any side effects (none in this DSL) — but we can just skip.
      return true;
    }

    // Snapshot state for rollback
    const preAccum = {};
    for (const v of accumulators) preAccum[v] = this.variables[v];
    const savedSourcesLen = this.sources.length;
    const savedVarKeys = new Set(Object.keys(this.variables));

    // Zero accumulators and run body once
    for (const v of accumulators) this.variables[v] = ProbabilisticValue.constant(0);
    this.variables[loopVar] = ProbabilisticValue.constant(start);

    let bodyOk = true;
    try {
      for (const bodyStmt of stmt.body) {
        this.evalStatement(bodyStmt);
      }
    } catch (e) {
      bodyOk = false;
    }

    const deltaPVs = {};
    if (bodyOk) {
      for (const v of accumulators) deltaPVs[v] = this.variables[v];
    }

    // Rollback: restore pre-loop accumulator values and remove new vars/sources
    for (const v of accumulators) this.variables[v] = preAccum[v];
    for (const k of Object.keys(this.variables)) {
      if (!savedVarKeys.has(k)) delete this.variables[k];
    }
    this.sources.length = savedSourcesLen;

    if (!bodyOk) return false;

    // For each accumulator, self-convolve its Δ distribution N times and
    // combine with pre-loop value. (Independent per-accumulator treatment —
    // cross-accumulator correlations are lost. Acceptable: the common case
    // returns one accumulator or uses them independently.)
    for (const v of accumulators) {
      const deltaPv = deltaPVs[v];
      const deltaDist = deltaPv.toDistribution();
      if (!deltaDist || deltaDist.pmf.size === 0) continue;

      // Self-convolve N times via doubling
      const sumDist = this._selfConvolveN(deltaDist, N);

      // Combine with pre-loop value: new = pre + sumDist.
      const pre = preAccum[v];
      if (pre && pre.isConstant && pre.isConstant()) {
        const preVal = pre.getConstantValue();
        const shifted = new Map();
        for (const [val, p] of sumDist.pmf) shifted.set(val + preVal, p);
        const newDist = new Distribution(shifted);
        const newPv = ProbabilisticValue.constant(0);  // placeholder sources
        newPv.setMarginal(newDist);
        // Hack: give it a unique source so it's treated probabilistic.
        // Actually we want the PV's marginal to be newDist AND for
        // downstream BFS to treat it as a source. Simpler: create a
        // fresh RandomSource whose outcomes are the distribution values.
        const outcomes = [...newDist.pmf.entries()].map(([val, p]) => ({ value: val, probability: p }));
        const src = new RandomSource(outcomes, `forloop-${v}`);
        this.sources.push(src);
        const pv = new ProbabilisticValue(
          (assignment) => assignment[src.id],
          new Set([src])
        );
        pv._cachedMarginal = newDist;
        this.variables[v] = pv;
      } else {
        // pre is probabilistic — convolve pre's marginal with sumDist
        const preDist = pre.toDistribution ? pre.toDistribution() : null;
        if (!preDist) {
          // Unknown pre; fall back
          return false;
        }
        const convolved = this._convolveDistributions(preDist, sumDist);
        const outcomes = [...convolved.pmf.entries()].map(([val, p]) => ({ value: val, probability: p }));
        const src = new RandomSource(outcomes, `forloop-${v}`);
        this.sources.push(src);
        const pv = new ProbabilisticValue(
          (assignment) => assignment[src.id],
          new Set([src])
        );
        pv._cachedMarginal = convolved;
        this.variables[v] = pv;
      }
    }

    // Loop var after the loop: Python semantics — last value. Set to end-step.
    if (N > 0) {
      const lastIdx = N - 1;
      this.variables[loopVar] = ProbabilisticValue.constant(start + lastIdx * step);
    }

    return true;
  }

  /** Check if an expression reads a variable by name. */
  _exprReadsName(expr, name) {
    if (!expr) return false;
    switch (expr.type) {
      case 'variable': return expr.name === name;
      case 'binOp':
      case 'binaryOp':
        return this._exprReadsName(expr.left, name) || this._exprReadsName(expr.right, name);
      case 'unaryOp': return this._exprReadsName(expr.operand, name);
      case 'call':
        return (expr.args || []).some(a => this._exprReadsName(a, name));
      case 'array':
      case 'list':
        return (expr.elements || []).some(e => this._exprReadsName(e, name));
      case 'ternary':
      case 'ifExpr':
        return this._exprReadsName(expr.condition, name) ||
               this._exprReadsName(expr.thenBranch || expr.then, name) ||
               this._exprReadsName(expr.elseBranch || expr.else, name);
      case 'subscript':
        return this._exprReadsName(expr.object, name) || this._exprReadsName(expr.index, name);
      default: return false;
    }
  }

  /** Discrete convolution of two Distributions (assumes numeric values). */
  _convolveDistributions(A, B) {
    const out = new Map();
    for (const [a, pa] of A.pmf) {
      for (const [b, pb] of B.pmf) {
        const v = a + b;
        out.set(v, (out.get(v) || 0) + pa * pb);
      }
    }
    return new Distribution(out);
  }

  /** N-fold self-convolution of a Distribution via binary exponentiation. */
  _selfConvolveN(D, N) {
    // Identity (delta at 0)
    let result = new Distribution(new Map([[0, 1]]));
    let base = D;
    let remaining = N;
    while (remaining > 0) {
      if (remaining & 1) result = this._convolveDistributions(result, base);
      remaining >>= 1;
      if (remaining > 0) base = this._convolveDistributions(base, base);
    }
    return result;
  }

  /**
   * Evaluate while loop
   * Supports both deterministic and probabilistic conditions
   */
  evalWhileLoop(stmt) {
    // Phase 3 fast path: translation-invariant while loop.
    // Try this BEFORE running any iterations, so state vars are still in
    // their pre-loop form (typically constants). Fast path is much cheaper
    // per iter, so we can afford a larger unroll depth and get a smaller
    // residual tail.
    if (this._tryTranslationInvariantWhileLoop(stmt, 300, 1e-10)) return;

    const MAX_ITERATIONS = 10000;
    let iterations = 0;

    // Clear any existing __continue__ flag at start
    delete this.variables['__continue__'];

    while (iterations < MAX_ITERATIONS) {
      // Evaluate condition
      const condPv = this.evalExpr(stmt.condition);

      if (condPv.isConstant()) {
        // Deterministic condition - but body may still have probabilistic control flow
        const condValue = condPv.getConstantValue();
        if (!condValue) break;

        // Execute body with continue checking (handles probabilistic continue)
        try {
          this.executeBodyWithContinueCheck(stmt.body);
        } catch (e) {
          if (e && e.type === 'break') break;
          if (e && e.type === 'continue') {
            // Deterministic continue thrown directly
            delete this.variables['__continue__'];
            iterations++;
            continue;
          }
          throw e;
        }

        // Reset __continue__ for next iteration
        delete this.variables['__continue__'];

        iterations++;
      } else {
        // Probabilistic condition - unroll as nested conditionals
        return this.evalProbabilisticWhileLoop(stmt);
      }
    }

    // Clean up
    delete this.variables['__continue__'];

    if (iterations >= MAX_ITERATIONS) {
      throw new Error('while loop exceeded maximum iterations (infinite loop?)');
    }
  }

  /**
   * Evaluate while loop with probabilistic condition
   * Unrolls as nested if-statements until remaining probability mass is negligible
   */
  evalProbabilisticWhileLoop(stmt) {
    const MAX_UNROLL = 100;  // Maximum unroll depth
    const EPSILON = 1e-10;  // Stop when remaining mass is this small

    // Track remaining probability mass - estimated by decay per iteration
    let remainingMass = 1.0;
    let unrollDepth = 0;

    // Clear any existing __continue__ flag at start
    delete this.variables['__continue__'];

    // Unroll the loop as nested if-statements
    while (remainingMass > EPSILON && unrollDepth < MAX_UNROLL) {
      // Evaluate current condition
      const condPv = this.evalExpr(stmt.condition);

      if (condPv.isConstant()) {
        // Condition became deterministic
        if (!condPv.getConstantValue()) break;
        // If still true, continue but this might loop forever
        // Execute body with continue checking
        try {
          this.executeBodyWithContinueCheck(stmt.body);
        } catch (e) {
          if (e && e.type === 'break') break;
          throw e;
        }
        // Reset __continue__ for next iteration
        delete this.variables['__continue__'];
        unrollDepth++;
        continue;
      }

      // Calculate P(condition is true) for current state
      // This IS the remaining mass - no need to multiply!
      const condDist = condPv.toDistribution();
      let pContinue = 0;
      for (const [val, prob] of condDist.entries()) {
        if (val) pContinue += prob;
      }

      // pContinue is the fraction of total mass still looping
      remainingMass = pContinue;

      // If almost no mass remains, we can stop
      if (remainingMass < EPSILON) break;

      // Execute body as conditional: if (cond) { body with continue checking }
      // We need to handle continue at this level, so we execute statements one by one
      const syntheticIf = {
        branches: [{
          condition: stmt.condition,
          body: [{ type: 'bodyWithContinueCheck', statements: stmt.body }]
        }],
        elseBody: null
      };

      try {
        this.evalIfStatement(syntheticIf);
      } catch (e) {
        if (e && e.type === 'break') break;
        throw e;
      }

      // Reset __continue__ for next iteration
      delete this.variables['__continue__'];

      // Collapse joint state: materialize the joint distribution over all
      // currently probabilistic variables into a single new RandomSource,
      // so that the NEXT iteration doesn't add to an ever-growing source set.
      // This preserves correlations between variables (we enumerate the joint,
      // not independent marginals) while bounding source count at ~1 per iter.
      this.collapseJointState();

      unrollDepth++;
    }

    // Clean up __continue__ flag
    delete this.variables['__continue__'];

    // If we bailed out with residual mass still looping, mark that mass as
    // "???" for each variable modified in the loop body. This is more honest
    // than continuing to report their "stale" (partly-accurate but biased)
    // values as if the loop had converged. Skip when the residual is tiny
    // (< 0.1%) — at that point it's noise, not worth surfacing.
    const RESIDUAL_THRESHOLD = 0.001;
    if (unrollDepth >= MAX_UNROLL && remainingMass >= RESIDUAL_THRESHOLD) {
      const modifiedVars = this._collectLoopModifiedVars(stmt.body);
      if (modifiedVars.length > 0) {
        // Synthetic `if cond: each-var = '???'` — applied once. The existing
        // evalIfStatement correctly handles probabilistic conditions.
        const syntheticIf = {
          branches: [{
            condition: stmt.condition,
            body: modifiedVars.map(name => ({
              type: 'assignment',
              target: name,
              value: { type: 'literal', value: '???' },
            })),
          }],
          elseBody: null,
        };
        try {
          this.evalIfStatement(syntheticIf);
        } catch (e) { /* ignore — best effort */ }
      }
      if (remainingMass > 0.01) {
        console.warn(`Probabilistic while loop reached max unroll depth (${MAX_UNROLL}) with ${(remainingMass * 100).toFixed(2)}% remaining mass (marked as '???')`);
      }
    }
  }

  /**
   * Collect variable names that are assigned anywhere in a statement list.
   * Used to decide which variables to replace with '???' when a probabilistic
   * while loop bails out with residual mass.
   */
  /**
   * Collect "state vars" of a while-loop — vars read in body OR condition
   * AND written in body (= loop-carried counters/accumulators).
   * Returns null if body has constructs we don't analyze (nested loops etc.).
   */
  _collectWhileStateVars(body, condExpr) {
    // A "state var" is read BEFORE being written in the body (i.e. carries
    // a value from the previous iteration). Intra-body temporaries (written
    // before first read) don't count.
    const written = new Set();     // vars that have been written
    const stateVars = new Set();   // vars read-before-written

    const visitExprReadsOnly = (expr) => {
      if (!expr) return;
      switch (expr.type) {
        case 'variable':
          if (!written.has(expr.name)) stateVars.add(expr.name);
          break;
        case 'binOp':
        case 'binaryOp':
          visitExprReadsOnly(expr.left); visitExprReadsOnly(expr.right); break;
        case 'unaryOp': visitExprReadsOnly(expr.operand); break;
        case 'call':
          for (const a of expr.args || []) visitExprReadsOnly(a); break;
        case 'array':
        case 'list':
          for (const e of expr.elements || []) visitExprReadsOnly(e); break;
        case 'ternary':
        case 'ifExpr':
          visitExprReadsOnly(expr.condition);
          visitExprReadsOnly(expr.thenBranch || expr.then);
          visitExprReadsOnly(expr.elseBranch || expr.else);
          break;
        case 'subscript':
          visitExprReadsOnly(expr.object); visitExprReadsOnly(expr.index); break;
        case 'comparisonChain':
          for (const o of expr.operands || []) visitExprReadsOnly(o); break;
      }
    };

    // Condition expression is evaluated at top of each iter → its reads are
    // all "before writes" in this iter's body.
    visitExprReadsOnly(condExpr);

    let ok = true;
    const visitStmt = (stmt) => {
      if (!stmt) return;
      switch (stmt.type) {
        case 'assignment':
          visitExprReadsOnly(stmt.value);
          written.add(stmt.target);
          break;
        case 'augmentedAssignment':
          // X += expr reads X first, then writes.
          if (!written.has(stmt.target)) stateVars.add(stmt.target);
          visitExprReadsOnly(stmt.value);
          written.add(stmt.target);
          break;
        case 'tupleAssignment':
          for (const v of stmt.values || []) visitExprReadsOnly(v);
          for (const t of stmt.targets || []) written.add(t);
          break;
        case 'expression':
          visitExprReadsOnly(stmt.expression);
          break;
        case 'ifStatement':
          // Conservative: visit all branches. Vars written in branches are
          // considered written afterwards.
          for (const b of stmt.branches || []) {
            visitExprReadsOnly(b.condition);
            for (const s of b.body || []) visitStmt(s);
          }
          for (const s of stmt.elseBody || []) visitStmt(s);
          break;
        case 'whileLoop':
        case 'forLoop':
          ok = false; break;  // nested loop — don't analyze
        case 'break':
        case 'continue':
        case 'return':
          ok = false; break;
        default:
          ok = false; break;
      }
    };
    for (const s of body || []) { visitStmt(s); if (!ok) return null; }

    const result = [...stateVars];
    result.sort();
    return result;
  }

  /**
   * Phase 3 fast path. Detects whether a while-loop's body produces a
   * translation-invariant Markov kernel on the loop-carried integer state,
   * and if so, iterates via convolution instead of body-execution.
   *
   * Returns true if the fast path handled the loop (variables updated,
   * caller should exit). False to fall back.
   */
  _tryTranslationInvariantWhileLoop(stmt, MAX_UNROLL, EPSILON) {
    const stateVars = this._collectWhileStateVars(stmt.body, stmt.condition);
    if (!stateVars || stateVars.length === 0) return false;

    // Extract the current joint distribution of state vars (handles both
    // constant and probabilistic pre-states).
    const preJoint = this._extractJointOfVars(stateVars);
    if (!preJoint) return false;

    // Static syntactic check: accept only bodies we can prove are
    // translation-invariant from the AST (no false positives).
    const tiInfo = this._isTranslationInvariant(stmt.body, stateVars);
    if (!tiInfo) return false;

    // Single probe to extract the kernel (probe with pre=0 for all state
    // vars: for 'delta' vars the extracted "delta" is post - 0 (true delta);
    // for 'replace' vars the extracted value equals post (since post doesn't
    // depend on pre).
    const probePre = {};
    for (const name of stateVars) probePre[name] = 0;
    const deltas1 = this._probeBodyDelta(stmt.body, stateVars, probePre);
    if (!deltas1) return false;

    // Translation-invariant! Run the fast loop from the extracted pre-joint.
    return this._runTranslationInvariantLoop(
      stmt, stateVars, preJoint, deltas1, tiInfo.kinds, MAX_UNROLL, EPSILON);
  }

  /**
   * Syntactic check: is body's effect on each state var a function of only
   * that var's pre-value and non-state randomness? (No cross-state coupling
   * in the state-update functions.)
   *
   * Per-var taint analysis: track for each variable which state-pre values
   * its current symbolic form depends on. State var V starts with taint {V}.
   * Non-state vars start empty. Expressions propagate taint (union of reads).
   *
   * After the body, each state var V must have taint ⊆ {V}:
   *   - taint = {V}: "delta" kind — V_post = V_pre + f(randomness).
   *   - taint = ∅:   "replace" kind — V_post = f(randomness), no dep on V_pre.
   *   - taint has other state var W: REJECT — V's new value couples to W_pre.
   *
   * This accepts richer patterns than before (direct `V = expr` where expr
   * doesn't read state is now accepted as REPLACE-kind).
   *
   * Returns null if not compatible, else an object {kinds: {V: 'delta'|'replace'}}
   * for use by the fast path.
   */
  _isTranslationInvariant(body, stateVars) {
    const stateSet = new Set(stateVars);
    // taint: Map<varName, Set<stateVar>>  — which state pre-values varName
    // currently depends on. Undefined taint = "not yet written in this
    // body", meaning reads yield the pre-value directly.
    const taint = new Map();
    for (const v of stateVars) taint.set(v, new Set([v]));

    const getTaint = (name) => {
      if (taint.has(name)) return taint.get(name);
      // First read of a non-written var: state vars have their own taint
      // (already in map). Non-state and unseen names have empty taint
      // (they are fresh locals / constants).
      return new Set();
    };

    const exprTaint = (expr) => {
      if (!expr) return new Set();
      switch (expr.type) {
        case 'literal': return new Set();
        case 'variable': return new Set(getTaint(expr.name));
        case 'binOp':
        case 'binaryOp': {
          const t = exprTaint(expr.left);
          for (const x of exprTaint(expr.right)) t.add(x);
          return t;
        }
        case 'unaryOp': return exprTaint(expr.operand);
        case 'call': {
          const t = new Set();
          for (const a of expr.args || []) for (const x of exprTaint(a)) t.add(x);
          return t;
        }
        case 'array':
        case 'list': {
          const t = new Set();
          for (const e of expr.elements || []) for (const x of exprTaint(e)) t.add(x);
          return t;
        }
        case 'ternary':
        case 'ifExpr': {
          const t = exprTaint(expr.condition);
          for (const x of exprTaint(expr.thenBranch || expr.then)) t.add(x);
          for (const x of exprTaint(expr.elseBranch || expr.else)) t.add(x);
          return t;
        }
        case 'comparisonChain': {
          const t = new Set();
          for (const o of expr.operands || []) for (const x of exprTaint(o)) t.add(x);
          return t;
        }
        case 'subscript':
          return new Set([...exprTaint(expr.object), ...exprTaint(expr.index)]);
        default: {
          // Unknown expr type — treat as tainted by everything (conservative)
          return new Set(stateVars);
        }
      }
    };

    const mergeTaints = (a, b) => {
      const t = new Set(a);
      for (const x of b) t.add(x);
      return t;
    };

    let ok = true;
    const visitStmt = (stmt) => {
      if (!ok || !stmt) return;
      switch (stmt.type) {
        case 'assignment': {
          // X = RHS. New X's taint = RHS's taint.
          const rhsT = exprTaint(stmt.value);
          taint.set(stmt.target, rhsT);
          return;
        }
        case 'augmentedAssignment': {
          // X op= RHS.
          const op = stmt.operator;
          if (op !== '+=' && op !== '-=') {
            if (stateSet.has(stmt.target)) { ok = false; return; }
            taint.set(stmt.target, mergeTaints(getTaint(stmt.target), exprTaint(stmt.value)));
            return;
          }
          // For `+=` / `-=` on a state var: delta = RHS. For "delta-kind"
          // translation invariance, RHS's taint must NOT read any state var
          // (else delta depends on state).
          const rhsT = exprTaint(stmt.value);
          if (stateSet.has(stmt.target)) {
            for (const x of rhsT) {
              if (stateSet.has(x)) { ok = false; return; }
            }
          }
          const old = getTaint(stmt.target);
          taint.set(stmt.target, mergeTaints(old, rhsT));
          return;
        }
        case 'tupleAssignment': {
          // Handle split() specially (randomness is state-free)
          if (stmt.values.length === 1 && stmt.values[0].type === 'call' && stmt.values[0].name === 'split') {
            const inputT = exprTaint(stmt.values[0].args[0]);
            // Each target's taint = input's taint (propagates if input was tainted).
            for (const t of stmt.targets || []) taint.set(t, new Set(inputT));
            // split also implicitly zeroes out the input if it's a variable —
            // conservatively track it as "overwritten state-free" if the
            // original input was a pure state var.
            const inputExpr = stmt.values[0].args[0];
            if (inputExpr.type === 'variable' && stateSet.has(inputExpr.name)) {
              // After split, input-var is zero. Treat as freshly written, taint = ∅.
              taint.set(inputExpr.name, new Set());
            }
            return;
          }
          // General tuple assignment: each target takes corresponding value's taint.
          for (let i = 0; i < stmt.targets.length; i++) {
            const rhsT = exprTaint(stmt.values[i]);
            taint.set(stmt.targets[i], rhsT);
          }
          return;
        }
        case 'expression':
          // Expression as statement — no effect on taint.
          return;
        case 'ifStatement': {
          // Conservative branch merge. If any branch condition reads a state
          // var, writes inside cannot be TI (post-value varies with state),
          // so reject.
          for (const b of stmt.branches || []) {
            const cT = exprTaint(b.condition);
            for (const x of cT) if (stateSet.has(x)) { ok = false; return; }
          }
          const condT = exprTaint(stmt.branches?.[0]?.condition);
          // If condition reads a state var, branches are conditionally taken
          // on that state, which taints anything written in a branch by the
          // condition's taint. Merge condT into taints of all modified vars.
          const savedTaints = new Map(taint);
          const postBranches = [];
          for (const b of stmt.branches || []) {
            // restore pre-branch taint
            taint.clear();
            for (const [k, v] of savedTaints) taint.set(k, new Set(v));
            const bCondT = exprTaint(b.condition);
            for (const s of b.body || []) { visitStmt(s); if (!ok) return; }
            // Pollute each written var's taint with bCondT
            for (const [k, v] of taint) {
              const saved = savedTaints.get(k);
              if (!saved || !setsEqual(v, saved)) {
                // var was modified — taint with condition's taint
                for (const x of bCondT) v.add(x);
              }
            }
            postBranches.push(new Map(taint));
          }
          // Else branch
          taint.clear();
          for (const [k, v] of savedTaints) taint.set(k, new Set(v));
          for (const s of stmt.elseBody || []) { visitStmt(s); if (!ok) return; }
          postBranches.push(new Map(taint));
          // Merge all post-branch taints
          taint.clear();
          const allKeys = new Set();
          for (const m of postBranches) for (const k of m.keys()) allKeys.add(k);
          for (const k of savedTaints.keys()) allKeys.add(k);
          for (const k of allKeys) {
            const merged = new Set();
            for (const m of postBranches) {
              const t = m.get(k) || savedTaints.get(k);
              if (t) for (const x of t) merged.add(x);
            }
            taint.set(k, merged);
          }
          return;
        }
        case 'whileLoop':
        case 'forLoop':
        case 'break':
        case 'continue':
        case 'return':
          ok = false; return;
        default:
          ok = false; return;
      }
    };
    const setsEqual = (a, b) => {
      if (a.size !== b.size) return false;
      for (const x of a) if (!b.has(x)) return false;
      return true;
    };

    for (const s of body || []) { visitStmt(s); if (!ok) break; }
    if (!ok) return null;

    // Each state var's final taint must be ⊆ {itself}.
    const kinds = {};
    for (const v of stateVars) {
      const t = taint.get(v);
      if (!t) { kinds[v] = 'replace'; continue; }  // never written → constant across iters
      for (const x of t) {
        if (x !== v) return null;  // cross-state coupling
      }
      kinds[v] = t.has(v) ? 'delta' : 'replace';
    }
    return { kinds };
  }

  /**
   * Extract the joint distribution of given vars from current this.variables.
   * Returns Map<tupleKey, {tuple: number[], prob}> or null on failure.
   * Handles constants (single entry) and probabilistic values (enumerate
   * their sources).
   */
  _extractJointOfVars(varNames) {
    const pvs = varNames.map(n => this.variables[n]);
    for (const pv of pvs) {
      if (!pv) return null;
    }
    // Collect union of sources
    const allSources = new Set();
    for (const pv of pvs) {
      if (pv.sources) for (const s of pv.sources) allSources.add(s);
    }
    const sources = [...allSources];
    let numCombos = 1;
    for (const s of sources) numCombos *= s.outcomes.length;
    if (numCombos > 10000) return null;  // too large

    const joint = new Map();
    const assignment = {};
    const enumerate = (idx, prob) => {
      if (idx >= sources.length) {
        // Evaluate each var
        const tuple = new Array(varNames.length);
        for (let i = 0; i < varNames.length; i++) {
          const pv = pvs[i];
          let val;
          if (pv.isConstant && pv.isConstant()) {
            val = pv.getConstantValue();
          } else {
            val = pv.evaluator(assignment);
          }
          if (typeof val !== 'number') return;  // non-numeric abort
          tuple[i] = val;
        }
        const key = tuple.join(',');
        const existing = joint.get(key);
        if (existing) existing.prob += prob;
        else joint.set(key, { tuple, prob });
        return;
      }
      const s = sources[idx];
      const sid = s.id;
      for (const o of s.outcomes) {
        const np = prob * o.probability;
        if (np < 1e-14) continue;
        assignment[sid] = o.value;
        enumerate(idx + 1, np);
      }
      delete assignment[sid];
    };
    if (sources.length === 0) {
      // All constants
      const tuple = new Array(varNames.length);
      for (let i = 0; i < varNames.length; i++) {
        const pv = pvs[i];
        if (!pv.isConstant || !pv.isConstant()) return null;
        const v = pv.getConstantValue();
        if (typeof v !== 'number') return null;
        tuple[i] = v;
      }
      joint.set(tuple.join(','), { tuple, prob: 1.0 });
    } else {
      enumerate(0, 1.0);
    }
    return joint;
  }

  /**
   * Run body once with stateVars set to the given constant values. Extract
   * the joint delta distribution (post - pre) over stateVars. Restore state.
   * Returns Map<deltaTupleKey, { delta: Map<varName, number>, prob }> or null.
   */
  _probeBodyDelta(body, stateVars, preValues) {
    // Snapshot state for restore
    const savedVars = { ...this.variables };
    const savedSourcesLen = this.sources.length;

    // Set stateVars to preValues (constants), clear any other probabilistic
    // vars the body may reference implicitly.
    for (const v of stateVars) {
      this.variables[v] = ProbabilisticValue.constant(preValues[v]);
    }

    let ok = true;
    try {
      for (const s of body) this.evalStatement(s);
    } catch (e) {
      ok = false;
    }

    // Extract post-state distribution. We need the JOINT distribution of
    // stateVars after body execution. If stateVars have sources, evaluate
    // jointly via direct enumeration (same as collapseJointState approach).
    let deltaDist = null;
    if (ok) {
      try {
        deltaDist = this._extractStateVarJointDelta(stateVars, preValues, savedSourcesLen);
      } catch (e) {
        ok = false;
      }
    }

    // Restore variables and sources (drop any added during probe)
    for (const k of Object.keys(this.variables)) {
      if (!(k in savedVars)) delete this.variables[k];
    }
    for (const [k, v] of Object.entries(savedVars)) {
      this.variables[k] = v;
    }
    this.sources.length = savedSourcesLen;

    return ok ? deltaDist : null;
  }

  /** Extract joint delta distribution of stateVars after body ran. */
  _extractStateVarJointDelta(stateVars, preValues, savedSourcesLen) {
    // Gather all sources introduced by the body (those after savedSourcesLen).
    const bodySources = this.sources.slice(savedSourcesLen);
    // stateVars' PVs may also depend on earlier sources, but since we set them
    // to constants pre-body, they should only depend on body sources.
    // Enumerate all body-source combinations and compute stateVar post-values.
    let numCombos = 1;
    for (const s of bodySources) numCombos *= s.outcomes.length;
    if (numCombos > 50000) return null;

    const deltaMap = new Map();
    const assignment = {};
    const varsToEval = stateVars.map(name => ({ name, pv: this.variables[name] }));

    const enumerate = (idx, prob) => {
      if (idx >= bodySources.length) {
        // Compute delta tuple
        const delta = {};
        for (const { name, pv } of varsToEval) {
          let postVal;
          if (pv.isConstant && pv.isConstant()) {
            postVal = pv.getConstantValue();
          } else {
            postVal = pv.evaluator(assignment);
          }
          if (typeof postVal !== 'number') return;  // non-numeric — abort
          delta[name] = postVal - preValues[name];
        }
        const key = stateVars.map(v => delta[v]).join(',');
        const existing = deltaMap.get(key);
        if (existing) existing.prob += prob;
        else deltaMap.set(key, { delta: { ...delta }, prob });
        return;
      }
      const s = bodySources[idx];
      const sid = s.id;
      for (const o of s.outcomes) {
        const np = prob * o.probability;
        if (np < 1e-14) continue;
        assignment[sid] = o.value;
        enumerate(idx + 1, np);
      }
      delete assignment[sid];
    };
    if (bodySources.length === 0) {
      // No sources — body is deterministic
      const delta = {};
      for (const { name, pv } of varsToEval) {
        if (!pv.isConstant || !pv.isConstant()) return null;
        delta[name] = pv.getConstantValue() - preValues[name];
      }
      const key = stateVars.map(v => delta[v]).join(',');
      deltaMap.set(key, { delta, prob: 1.0 });
    } else {
      enumerate(0, 1.0);
    }
    return deltaMap;
  }

  /** Two delta kernels are equal if they have the same (delta, prob) entries. */
  _deltaKernelsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const [key, ea] of a) {
      const eb = b.get(key);
      if (!eb) return false;
      if (Math.abs(ea.prob - eb.prob) > 1e-9) return false;
    }
    return true;
  }

  /**
   * Main fast-path iteration: maintain the joint distribution over state
   * vars explicitly, apply the delta kernel each "iter", partition into
   * active (cond=true) and absorbed (cond=false) states.
   */
  _runTranslationInvariantLoop(stmt, stateVars, preJoint, deltaKernel, kinds, MAX_UNROLL, EPSILON) {
    // Hot loop representation: parallel arrays tuples[] (Int32Array per var)
    // and probs (Float64Array). Keys for deduplication via a Map<number, idx>
    // where the number is a packed integer combining var values.
    //
    // Build a JS evaluator for the condition expression.
    const condFn = this._compileCondForFastPathArr(stmt.condition, stateVars);
    if (!condFn) return false;

    // Pre-extract delta entries as parallel arrays for fast iteration.
    const deltas = [];  // [{deltas: [Δv0, Δv1, ...], prob}]
    for (const [, dEntry] of deltaKernel) {
      const d = new Array(stateVars.length);
      for (let i = 0; i < stateVars.length; i++) d[i] = dEntry.delta[stateVars[i]];
      deltas.push({ d, prob: dEntry.prob });
    }

    const nVars = stateVars.length;
    // Pack tuple into a single number (safe for small ints). Use per-var range shift.
    const SHIFT = 10000;  // allows var values ∈ [-5000, 5000]
    const HALF = SHIFT / 2;
    const packKey = (arr) => {
      let k = 0;
      for (let i = 0; i < nVars; i++) k = k * SHIFT + (arr[i] + HALF);
      return k;
    };

    // Initial active distribution = pre-loop joint of state vars.
    let activeKeys = new Map();
    let activeTuples = [];
    let activeProbs = [];
    for (const [, entry] of preJoint) {
      activeKeys.set(packKey(entry.tuple), activeTuples.length);
      activeTuples.push(entry.tuple.slice());
      activeProbs.push(entry.prob);
    }

    const absorbedKeys = new Map();
    const absorbedTuples = [];
    const absorbedProbs = [];

    const MAX_STATES = 500;  // aggressive cap — drop low-prob tail states

    let iters = 0;
    while (iters < MAX_UNROLL) {
      // Partition active: those passing cond continue; else → absorbed.
      const nextStillKeys = new Map();
      const nextStillTuples = [];
      const nextStillProbs = [];
      let activeMass = 0;
      for (let i = 0; i < activeTuples.length; i++) {
        const t = activeTuples[i];
        const p = activeProbs[i];
        if (condFn(t)) {
          const k = packKey(t);
          nextStillKeys.set(k, nextStillTuples.length);
          nextStillTuples.push(t);
          nextStillProbs.push(p);
          activeMass += p;
        } else {
          // absorbed
          const k = packKey(t);
          const existing = absorbedKeys.get(k);
          if (existing !== undefined) {
            absorbedProbs[existing] += p;
          } else {
            absorbedKeys.set(k, absorbedTuples.length);
            absorbedTuples.push(t);
            absorbedProbs.push(p);
          }
        }
      }
      if (activeMass < EPSILON) {
        activeKeys = nextStillKeys;
        activeTuples = nextStillTuples;
        activeProbs = nextStillProbs;
        break;
      }

      // Apply delta kernel to still-active.
      const nextKeys = new Map();
      const nextTuples = [];
      const nextProbs = [];
      for (let i = 0; i < nextStillTuples.length; i++) {
        const t = nextStillTuples[i];
        const p = nextStillProbs[i];
        for (let d = 0; d < deltas.length; d++) {
          const dv = deltas[d].d;
          const newTuple = new Array(nVars);
          for (let v = 0; v < nVars; v++) {
            // 'delta' vars: post = pre + extracted-delta.
            // 'replace' vars: post = extracted-value (pre was 0 at probe, so
            // dv[v] already equals the post value, independent of current pre).
            newTuple[v] = (kinds[stateVars[v]] === 'replace') ? dv[v] : (t[v] + dv[v]);
          }
          const k = packKey(newTuple);
          const np = p * deltas[d].prob;
          const existingIdx = nextKeys.get(k);
          if (existingIdx !== undefined) {
            nextProbs[existingIdx] += np;
          } else {
            nextKeys.set(k, nextTuples.length);
            nextTuples.push(newTuple);
            nextProbs.push(np);
          }
        }
      }

      // Cap if exploding
      if (nextTuples.length > MAX_STATES) {
        const indices = nextTuples.map((_, i) => i);
        indices.sort((a, b) => nextProbs[b] - nextProbs[a]);
        const kept = indices.slice(0, MAX_STATES);
        const newTuples = kept.map(i => nextTuples[i]);
        const newProbs = kept.map(i => nextProbs[i]);
        let total = 0;
        for (const p of newProbs) total += p;
        if (total > 0) {
          const scale = activeMass / total;
          for (let i = 0; i < newProbs.length; i++) newProbs[i] *= scale;
        }
        activeKeys = new Map();
        for (let i = 0; i < newTuples.length; i++) activeKeys.set(packKey(newTuples[i]), i);
        activeTuples = newTuples;
        activeProbs = newProbs;
      } else {
        activeKeys = nextKeys;
        activeTuples = nextTuples;
        activeProbs = nextProbs;
      }
      iters++;
    }

    // Residual & marginals
    let residual = 0;
    for (let i = 0; i < activeProbs.length; i++) residual += activeProbs[i];

    const marginals = {};
    for (const v of stateVars) marginals[v] = new Map();
    for (let i = 0; i < absorbedTuples.length; i++) {
      const t = absorbedTuples[i];
      const p = absorbedProbs[i];
      for (let j = 0; j < nVars; j++) {
        const v = stateVars[j];
        marginals[v].set(t[j], (marginals[v].get(t[j]) || 0) + p);
      }
    }
    // Only attribute residual to '???' if it's meaningful (>= 0.1%). Below
    // that, it's noise — just drop it and renormalize the other outcomes.
    const RESIDUAL_THRESHOLD = 0.001;
    if (residual >= RESIDUAL_THRESHOLD) {
      for (let i = 0; i < activeTuples.length; i++) {
        const p = activeProbs[i];
        for (const v of stateVars) {
          marginals[v].set('???', (marginals[v].get('???') || 0) + p);
        }
      }
    } else if (residual > 0) {
      // Renormalize non-??? outcomes so the marginals still sum to 1
      const keep = 1 / (1 - residual);
      for (const v of stateVars) {
        const m = marginals[v];
        for (const [k, p] of m) m.set(k, p * keep);
      }
    }

    // Install all state vars as projections of a SINGLE joint source so
    // downstream code sees correlated values. Installing per-var independent
    // sources would lose the joint — e.g. if A=B at exit but we install
    // independent marginals, `A == B` downstream would be wrong.
    const jointTuples = [];
    const jointProbs = [];
    for (let i = 0; i < absorbedTuples.length; i++) {
      jointTuples.push(absorbedTuples[i]);
      jointProbs.push(absorbedProbs[i]);
    }
    if (residual >= RESIDUAL_THRESHOLD) {
      for (let i = 0; i < activeTuples.length; i++) {
        // Replace values with sentinel for still-looping mass
        jointTuples.push(stateVars.map(() => '???'));
        jointProbs.push(activeProbs[i]);
      }
    } else if (residual > 0) {
      // Drop residual and renormalize jointProbs
      let kept = 0;
      for (const p of jointProbs) kept += p;
      if (kept > 0) {
        const scale = 1 / kept;
        for (let i = 0; i < jointProbs.length; i++) jointProbs[i] *= scale;
      }
    }

    if (jointTuples.length === 0) return true;  // empty result — unusual

    // Build one RandomSource whose outcomes index into the joint tuple list
    const outcomes = jointTuples.map((_, i) => ({ value: i, probability: jointProbs[i] }));
    const jointSrc = new RandomSource(outcomes, 'while-fast-joint');
    this.sources.push(jointSrc);

    // Per-var projection PV backed by jointSrc
    for (let j = 0; j < nVars; j++) {
      const v = stateVars[j];
      const table = jointTuples.map(t => t[j]);
      // Check if this var is constant across all joint outcomes
      let allSame = true;
      for (let i = 1; i < table.length; i++) {
        if (table[i] !== table[0]) { allSame = false; break; }
      }
      if (allSame) {
        this.variables[v] = ProbabilisticValue.constant(table[0]);
      } else {
        const pv = new ProbabilisticValue(
          (assignment) => table[assignment[jointSrc.id]],
          new Set([jointSrc])
        );
        // Cache marginal
        const marginalPmf = new Map();
        for (let i = 0; i < table.length; i++) {
          const k = table[i];
          marginalPmf.set(k, (marginalPmf.get(k) || 0) + jointProbs[i]);
        }
        pv._cachedMarginal = new Distribution(marginalPmf);
        this.variables[v] = pv;
      }
    }

    if (residual > 0.01) {
      console.warn(`while loop (fast path) reached MAX_UNROLL (${MAX_UNROLL}) with ${(residual * 100).toFixed(2)}% mass still looping (marked '???')`);
    }

    return true;
  }

  /**
   * Compile a DSL condition for the array-based fast-path: returns a
   * function (tupleArray) => boolean, using integer indices into stateVars.
   */
  _compileCondForFastPathArr(expr, stateVars) {
    const idxOf = new Map();
    for (let i = 0; i < stateVars.length; i++) idxOf.set(stateVars[i], i);
    try {
      const compile = (e) => {
        if (!e) throw new Error('empty expr');
        switch (e.type) {
          case 'literal':
            return () => e.value;
          case 'variable': {
            const ix = idxOf.get(e.name);
            if (ix === undefined) throw new Error('non-state var in cond');
            return (arr) => arr[ix];
          }
          case 'binOp':
          case 'binaryOp': {
            const l = compile(e.left), r = compile(e.right);
            const op = e.op || e.operator;
            switch (op) {
              case '+': return (a) => l(a) + r(a);
              case '-': return (a) => l(a) - r(a);
              case '*': return (a) => l(a) * r(a);
              case '/': return (a) => l(a) / r(a);
              case '%': return (a) => l(a) % r(a);
              case '==': return (a) => l(a) === r(a);
              case '!=': return (a) => l(a) !== r(a);
              case '<': return (a) => l(a) < r(a);
              case '>': return (a) => l(a) > r(a);
              case '<=': return (a) => l(a) <= r(a);
              case '>=': return (a) => l(a) >= r(a);
              case 'and': case '&&': return (a) => !!(l(a) && r(a));
              case 'or': case '||': return (a) => !!(l(a) || r(a));
              default: throw new Error('unsupported op: ' + op);
            }
          }
          case 'unaryOp': {
            const o = compile(e.operand);
            const op = e.op || e.operator;
            if (op === '-') return (a) => -o(a);
            if (op === '+') return (a) => +o(a);
            if (op === '!' || op === 'not') return (a) => !o(a);
            throw new Error('unsupported unary: ' + op);
          }
          default:
            throw new Error('unsupported expr type: ' + e.type);
        }
      };
      return compile(expr);
    } catch (e) {
      return null;
    }
  }

  /** Compile a DSL condition expression into a (state) => boolean function. */
  _compileCondForFastPath(expr, stateVars) {
    // Very small compiler: only handles arithmetic + comparisons over stateVars and constants.
    try {
      const compile = (e) => {
        if (!e) throw new Error('empty expr');
        switch (e.type) {
          case 'literal':
            return () => e.value;
          case 'variable':
            if (!stateVars.includes(e.name)) throw new Error('non-state var in cond');
            return (s) => s[e.name];
          case 'binOp':
          case 'binaryOp': {
            const l = compile(e.left), r = compile(e.right);
            const op = e.op || e.operator;
            switch (op) {
              case '+': return (s) => l(s) + r(s);
              case '-': return (s) => l(s) - r(s);
              case '*': return (s) => l(s) * r(s);
              case '/': return (s) => l(s) / r(s);
              case '%': return (s) => l(s) % r(s);
              case '==': return (s) => l(s) === r(s);
              case '!=': return (s) => l(s) !== r(s);
              case '<': return (s) => l(s) < r(s);
              case '>': return (s) => l(s) > r(s);
              case '<=': return (s) => l(s) <= r(s);
              case '>=': return (s) => l(s) >= r(s);
              case 'and': case '&&': return (s) => !!(l(s) && r(s));
              case 'or': case '||': return (s) => !!(l(s) || r(s));
              default: throw new Error('unsupported op: ' + op);
            }
          }
          case 'unaryOp': {
            const o = compile(e.operand);
            const op = e.op || e.operator;
            if (op === '-') return (s) => -o(s);
            if (op === '+') return (s) => +o(s);
            if (op === '!' || op === 'not') return (s) => !o(s);
            throw new Error('unsupported unary: ' + op);
          }
          default:
            throw new Error('unsupported expr type: ' + e.type);
        }
      };
      return compile(expr);
    } catch (e) {
      return null;
    }
  }

  _collectLoopModifiedVars(statements) {
    const names = new Set();
    const visit = (stmt) => {
      if (!stmt) return;
      switch (stmt.type) {
        case 'assignment':
        case 'augmentedAssignment':
          if (stmt.target) names.add(stmt.target);
          break;
        case 'tupleAssignment':
          for (const t of stmt.targets || []) names.add(t);
          break;
        case 'subscriptAssignment':
        case 'subscriptAugmentedAssignment':
          if (stmt.target && stmt.target.name) names.add(stmt.target.name);
          break;
        case 'ifStatement':
          for (const b of stmt.branches || []) for (const s of b.body || []) visit(s);
          for (const s of stmt.elseBody || []) visit(s);
          break;
        case 'whileLoop':
        case 'forLoop':
          for (const s of stmt.body || []) visit(s);
          break;
        case 'bodyWithContinueCheck':
          for (const s of stmt.statements || []) visit(s);
          break;
      }
    };
    for (const s of statements || []) visit(s);
    return [...names];
  }

  /**
   * Collapse the joint distribution over all currently probabilistic variables
   * into a single new RandomSource. Each variable is replaced by a
   * ProbabilisticValue that reads the new source and projects to its own slot.
   *
   * Purpose: in while-loop unrolling, variables accumulate sources across
   * iterations. Without collapse, joint-state enumeration blows up.
   * By collapsing at iteration boundaries, source count is bounded at ~1/iter.
   *
   * Preserves correlations between variables (enumerates joint, not marginals).
   * Falls back to no-op if the joint state space is too large.
   */
  collapseJointState() {
    // Find probabilistic variables to collapse.
    // Skip math constants + special internal vars.
    const SKIP = new Set(['pi', 'PI', 'e', 'E', '__continue__', '__return__', '__break__']);
    const varEntries = [];
    const allSources = new Set();
    for (const [name, pv] of Object.entries(this.variables)) {
      if (SKIP.has(name)) continue;
      if (!pv || !pv.sources) continue;
      if (pv.sources.size === 0) continue;  // already constant — no sources
      varEntries.push({ name, pv });
      for (const s of pv.sources) allSources.add(s);
    }

    if (varEntries.length === 0 || allSources.size === 0) return;

    // Bail out if the source count is already tiny: the point of collapse is
    // to PREVENT growth; at small sizes it just adds BFS overhead without win.
    if (allSources.size <= 2) return;

    const sourcesArray = Array.from(allSources);
    const MAX_ENUM_STEPS = 50000;
    const EPSILON = 1e-12;

    // Count total source-outcome combinations.
    let numCombos = 1;
    for (const s of sourcesArray) numCombos *= s.outcomes.length;
    if (numCombos > MAX_ENUM_STEPS) return;  // joint state space too large; bail

    // Direct enumeration: nested loop over all source outcomes. For each
    // complete assignment, call each var's evaluator directly (no Proxy,
    // no BFS). This is ~5-10× faster than the BFS+tryEvaluate path when
    // the joint state space is small enough to fully enumerate.
    const outcomes = new Map();
    let coveredMass = 0;
    const assignment = {};

    const enumerate = (idx, probSoFar) => {
      if (idx >= sourcesArray.length) {
        // Complete assignment: evaluate each var
        const values = {};
        for (let i = 0; i < varEntries.length; i++) {
          values[varEntries[i].name] = varEntries[i].pv.evaluator(assignment);
        }
        const keyParts = new Array(varEntries.length);
        for (let i = 0; i < varEntries.length; i++) {
          keyParts[i] = makeMapKey(values[varEntries[i].name]);
        }
        const key = keyParts.join('|');
        const existing = outcomes.get(key);
        if (existing) {
          existing.probability += probSoFar;
        } else {
          outcomes.set(key, { values: { ...values }, probability: probSoFar });
        }
        coveredMass += probSoFar;
        return;
      }
      const s = sourcesArray[idx];
      const sid = s.id;
      for (const o of s.outcomes) {
        const np = probSoFar * o.probability;
        if (np < EPSILON) continue;
        assignment[sid] = o.value;
        enumerate(idx + 1, np);
      }
      delete assignment[sid];
    };
    enumerate(0, 1.0);

    // If enumeration didn't cover full mass (all branches skipped due to
    // EPSILON), bail out of collapse.
    if (coveredMass < 1 - 1e-6) return;

    // Cap the number of joint-state outcomes. Per-iteration cost in a while
    // loop grows with outcomes.size × (#new-splits-per-iter). Without a cap,
    // long loops blow up to thousands of tuples and freeze the browser.
    // Keep the top MAX_JOINT_OUTCOMES by probability and renormalize.
    const MAX_JOINT_OUTCOMES = 200;
    let orderedOutcomes = [...outcomes.entries()];
    if (orderedOutcomes.length > MAX_JOINT_OUTCOMES) {
      orderedOutcomes.sort((a, b) => b[1].probability - a[1].probability);
      orderedOutcomes = orderedOutcomes.slice(0, MAX_JOINT_OUTCOMES);
      // Renormalize remaining probabilities to sum to 1
      let keptMass = 0;
      for (const [, entry] of orderedOutcomes) keptMass += entry.probability;
      if (keptMass > 0) {
        for (const [, entry] of orderedOutcomes) {
          entry.probability /= keptMass;
        }
      }
    }

    // Build a single new RandomSource whose outcomes are the joint tuples.
    const tupleOutcomes = [];
    let idx = 0;
    for (const [, entry] of orderedOutcomes) {
      tupleOutcomes.push({ value: idx, probability: entry.probability });
      idx++;
    }
    const newSource = new RandomSource(tupleOutcomes, `joint-collapse depth=${this._collapseDepth || 0}`);
    this._collapseDepth = (this._collapseDepth || 0) + 1;
    this.sources.push(newSource);

    // For each variable, build a lookup table indexed by tuple idx.
    const varLookups = {};
    for (const { name } of varEntries) varLookups[name] = [];
    idx = 0;
    for (const [, entry] of orderedOutcomes) {
      for (const { name } of varEntries) {
        varLookups[name][idx] = entry.values[name];
      }
      idx++;
    }

    // Replace each variable with a fresh PV backed by newSource + projection.
    const newSet = new Set([newSource]);
    for (const { name } of varEntries) {
      const table = varLookups[name];
      const pv = new ProbabilisticValue(
        (assignment) => {
          const tupleIdx = assignment[newSource.id];
          return table[tupleIdx];
        },
        newSet
      );
      // Also cache the marginal
      const marginalPmf = new Map();
      for (let i = 0; i < table.length; i++) {
        const p = tupleOutcomes[i].probability;
        const v = table[i];
        const k = makeMapKey(v);
        marginalPmf.set(parseMapKey(k), (marginalPmf.get(parseMapKey(k)) || 0) + p);
      }
      pv._cachedMarginal = new Distribution(marginalPmf);
      this.variables[name] = pv;
    }
  }

  /**
   * Execute a list of statements, checking __continue__ after each.
   * If __continue__ is set probabilistically, wrap remaining statements in conditional.
   */
  executeBodyWithContinueCheck(statements) {
    for (let i = 0; i < statements.length; i++) {
      this.evalStatement(statements[i]);

      // Check if __continue__ was set
      const contFlag = this.variables['__continue__'];
      if (contFlag) {
        if (contFlag.isConstant()) {
          const val = contFlag.getConstantValue();
          if (val === 1) {
            // Deterministically hit continue, skip remaining statements
            return;
          }
          // Constant 0, continue not hit, keep going
        } else {
          // Probabilistic continue - wrap remaining statements in conditional
          const remaining = statements.slice(i + 1);
          if (remaining.length > 0) {
            // Execute remaining only where __continue__ == 0
            const syntheticIf = {
              branches: [{
                condition: {
                  type: 'binOp',
                  op: '==',
                  left: { type: 'variable', name: '__continue__' },
                  right: { type: 'literal', value: 0 }
                },
                body: remaining
              }],
              elseBody: null
            };
            this.evalIfStatement(syntheticIf);
          }
          return;  // Don't continue normal iteration
        }
      }
    }
  }

  /**
   * Evaluate if statement
   * Supports both deterministic and probabilistic conditions
   */
  evalIfStatement(stmt) {
    // First, check if any condition is probabilistic
    const conditions = stmt.branches.map(branch => this.evalExpr(branch.condition));
    const hasProb = conditions.some(c => !c.isConstant());

    if (!hasProb) {
      // All conditions are deterministic - use original fast path
      for (let i = 0; i < stmt.branches.length; i++) {
        if (conditions[i].getConstantValue()) {
          for (const bodyStmt of stmt.branches[i].body) {
            this.evalStatement(bodyStmt);
          }
          return;
        }
      }
      // No branch taken, execute else if exists
      if (stmt.elseBody) {
        for (const bodyStmt of stmt.elseBody) {
          this.evalStatement(bodyStmt);
        }
      }
      return;
    }

    // Probabilistic condition - need to handle all branches
    this.evalProbabilisticIf(stmt, conditions);
  }

  /**
   * Evaluate if statement with probabilistic conditions
   * Creates conditional ProbabilisticValues for modified variables
   */
  evalProbabilisticIf(stmt, conditions) {
    // Save original variable state
    const originalVars = {};
    for (const varName of Object.keys(this.variables)) {
      originalVars[varName] = this.variables[varName];
    }

    // Execute each branch and collect resulting variable states
    const branchResults = [];

    // Track control flow PER BRANCH - each branch can hit continue/break independently
    const branchControlFlows = [];

    for (let i = 0; i < stmt.branches.length; i++) {
      // Restore original state before executing this branch
      for (const varName of Object.keys(originalVars)) {
        this.variables[varName] = originalVars[varName];
      }
      // Remove any variables that were added by previous branch
      for (const varName of Object.keys(this.variables)) {
        if (!(varName in originalVars)) {
          delete this.variables[varName];
        }
      }

      // Execute branch body, catching break/continue
      let branchCF = null;
      try {
        for (const bodyStmt of stmt.branches[i].body) {
          this.evalStatement(bodyStmt);
        }
      } catch (e) {
        if (e && (e.type === 'break' || e.type === 'continue')) {
          // Record control flow for THIS branch specifically
          branchCF = e;
        } else {
          throw e;
        }
      }
      branchControlFlows.push(branchCF);

      // Capture resulting state
      const result = {};
      for (const varName of Object.keys(this.variables)) {
        result[varName] = this.variables[varName];
      }
      branchResults.push(result);
    }

    // Execute else branch if exists
    let elseResult = null;
    let elseCF = null;
    if (stmt.elseBody) {
      // Restore original state
      for (const varName of Object.keys(originalVars)) {
        this.variables[varName] = originalVars[varName];
      }
      for (const varName of Object.keys(this.variables)) {
        if (!(varName in originalVars)) {
          delete this.variables[varName];
        }
      }

      try {
        for (const bodyStmt of stmt.elseBody) {
          this.evalStatement(bodyStmt);
        }
      } catch (e) {
        if (e && (e.type === 'break' || e.type === 'continue')) {
          elseCF = e;
        } else {
          throw e;
        }
      }

      elseResult = {};
      for (const varName of Object.keys(this.variables)) {
        elseResult[varName] = this.variables[varName];
      }
    }

    // Collect all variable names that might have been modified
    const allVarNames = new Set(Object.keys(originalVars));
    for (const result of branchResults) {
      for (const varName of Object.keys(result)) {
        allVarNames.add(varName);
      }
    }
    if (elseResult) {
      for (const varName of Object.keys(elseResult)) {
        allVarNames.add(varName);
      }
    }

    // Create conditional ProbabilisticValues for each variable
    for (const varName of allVarNames) {
      const originalVal = originalVars[varName];
      const branchVals = branchResults.map(r => r[varName]);
      const elseVal = elseResult ? elseResult[varName] : originalVal;

      // Check if this variable was actually modified
      let wasModified = false;
      for (const bv of branchVals) {
        if (bv !== originalVal) wasModified = true;
      }
      if (elseVal !== originalVal) wasModified = true;

      if (!wasModified) {
        // Variable unchanged, keep original
        this.variables[varName] = originalVal;
        continue;
      }

      // Create conditional ProbabilisticValue
      this.variables[varName] = this.createConditionalValue(
        conditions, branchVals, elseVal, originalVal
      );
    }

    // Handle control flow (break/continue) from probabilistic branches
    // Track per-branch: only set __continue__ for branches that actually hit continue
    const anyContinue = branchControlFlows.some(cf => cf?.type === 'continue') || elseCF?.type === 'continue';
    const allBreak = branchControlFlows.every(cf => cf?.type === 'break') &&
                     (!stmt.elseBody || elseCF?.type === 'break');

    if (anyContinue) {
      // Set __continue__ flag - 1 for branches that hit continue, 0 for others
      // This creates a probabilistic value based on which specific branches hit continue
      const continueVals = branchControlFlows.map(cf =>
        ProbabilisticValue.constant(cf?.type === 'continue' ? 1 : 0)
      );
      const elseContinueVal = ProbabilisticValue.constant(elseCF?.type === 'continue' ? 1 : 0);

      // Merge with existing __continue__ if present (from nested if inside this branch)
      const existingContinue = this.variables['__continue__'];
      if (existingContinue && !existingContinue.isConstant()) {
        // There's already a probabilistic __continue__ - OR them together
        // For now, just use max (either one triggers continue)
        const newContinue = this.createConditionalValue(
          conditions, continueVals, elseContinueVal, ProbabilisticValue.constant(0)
        );
        // Combine: __continue__ = max(existing, new)
        const allSources = new Set([...existingContinue.sources, ...newContinue.sources]);
        this.variables['__continue__'] = new ProbabilisticValue(
          (assignment) => Math.max(existingContinue.eval(assignment), newContinue.eval(assignment)),
          allSources
        );
      } else {
        this.variables['__continue__'] = this.createConditionalValue(
          conditions, continueVals, elseContinueVal, ProbabilisticValue.constant(0)
        );
      }
    }

    if (allBreak) {
      // All branches hit break - propagate it up
      throw { type: 'break' };
    }
    // Note: if only SOME branches hit break, we'd need __break__ flag too
    // For now, only handle the all-break case
  }

  /**
   * Create a ProbabilisticValue that selects between branch values based on conditions
   * Implements if-elif-else semantics: first true condition wins
   */
  createConditionalValue(conditions, branchVals, elseVal, originalVal) {
    // Collect all sources from conditions and values
    const allSources = new Set();
    for (const cond of conditions) {
      for (const s of cond.sources) allSources.add(s);
    }
    for (const val of branchVals) {
      if (val && val.sources) {
        for (const s of val.sources) allSources.add(s);
      }
    }
    if (elseVal && elseVal.sources) {
      for (const s of elseVal.sources) allSources.add(s);
    }
    if (originalVal && originalVal.sources) {
      for (const s of originalVal.sources) allSources.add(s);
    }

    return new ProbabilisticValue(
      (assignment) => {
        // Check conditions in order (if-elif-else semantics)
        for (let i = 0; i < conditions.length; i++) {
          const condVal = conditions[i].eval(assignment);
          if (condVal) {
            // This branch is taken
            const branchVal = branchVals[i];
            if (branchVal === undefined) {
              // Variable doesn't exist in this branch
              return originalVal ? originalVal.eval(assignment) : undefined;
            }
            if (branchVal instanceof ProbabilisticValue) {
              return branchVal.eval(assignment);
            }
            return branchVal;
          }
        }
        // No condition was true, use else value
        if (elseVal === undefined) {
          return originalVal ? originalVal.eval(assignment) : undefined;
        }
        if (elseVal instanceof ProbabilisticValue) {
          return elseVal.eval(assignment);
        }
        return elseVal;
      },
      allSources
    );
  }

  /**
   * Evaluate function definition
   */
  evalFunctionDef(stmt) {
    // Store the function definition in variables
    this.variables[stmt.name] = ProbabilisticValue.constant({
      type: 'function',
      params: stmt.params,
      defaults: stmt.defaults,
      body: stmt.body,
      closure: { ...this.variables }  // Capture current scope
    });
  }

  /**
   * Check if a value is a ProbabilisticValue (by duck typing)
   */
  isProbabilisticValue(val) {
    return val && typeof val === 'object' &&
           typeof val.eval === 'function' &&
           val.sources instanceof Set;
  }

  /**
   * Evaluate return statement
   */
  evalReturn(stmt) {
    // Evaluate the return value but don't compute distribution yet
    // Store the ProbabilisticValue so computeAllDistributions() can handle it
    let value = this.evalExpr(stmt.value);

    // Handle case where value is a constant array containing ProbabilisticValues
    // (happens when array is built via subscript assignment like arr[i] = pv)
    if (value.isConstant()) {
      const constVal = value.getConstantValue();
      if (Array.isArray(constVal) && constVal.some(el => this.isProbabilisticValue(el))) {
        // Convert to proper probabilistic array
        const elementPvs = constVal.map(el =>
          this.isProbabilisticValue(el) ? el : ProbabilisticValue.constant(el)
        );

        // Gather all sources
        const arraySources = new Set();
        for (const pv of elementPvs) {
          for (const src of pv.sources) {
            arraySources.add(src);
          }
        }

        // Create probabilistic array that evaluates elements
        value = new ProbabilisticValue(
          (assignment) => elementPvs.map(pv => pv.eval(assignment)),
          arraySources
        );
      }
    }

    this.returnPv = value;  // Store PV for later distribution computation
    // Store as special variable so it gets computed with all others
    this.variables['__return__'] = value;
  }

  /**
   * Evaluate an expression
   * @returns {ProbabilisticValue}
   */
  evalExpr(expr) {
    switch (expr.type) {
      case 'literal':
        return ProbabilisticValue.constant(expr.value);

      case 'variable':
        if (!this.variables.hasOwnProperty(expr.name)) {
          const lineInfo = expr.line ? ` (line ${expr.line})` : '';
          throw new Error(`Undefined variable: ${expr.name}${lineInfo}`);
        }
        return this.variables[expr.name];

      case 'binOp':
        return this.evalBinOp(expr);

      case 'comparisonChain':
        return this.evalComparisonChain(expr);

      case 'unaryOp':
        return this.evalUnaryOp(expr);

      case 'call':
        return this.evalCall(expr);

      case 'array':
        // Evaluate array literal - supports both constant and probabilistic elements
        const elementPvs = expr.elements.map(e => this.evalExpr(e));

        // Check if all elements are constant
        const allConstant = elementPvs.every(pv => pv.isConstant());
        if (allConstant) {
          const elements = elementPvs.map(pv => pv.getConstantValue());
          return ProbabilisticValue.constant(elements);
        }

        // Create probabilistic array - evaluates to array of evaluated elements
        const arraySources = new Set();
        for (const pv of elementPvs) {
          for (const src of pv.sources) {
            arraySources.add(src);
          }
        }

        return new ProbabilisticValue(
          (assignment) => elementPvs.map(pv => pv.eval(assignment)),
          arraySources
        );

      case 'tuple':
        // Evaluate tuple literal - supports both constant and probabilistic elements
        const tuplePvs = expr.elements.map(e => this.evalExpr(e));

        // Check if all elements are constant
        const tupleAllConstant = tuplePvs.every(pv => pv.isConstant());
        if (tupleAllConstant) {
          const tupleElements = tuplePvs.map(pv => pv.getConstantValue());
          return ProbabilisticValue.constant(tupleElements);
        }

        // Create probabilistic tuple
        const tupleSources = new Set();
        for (const pv of tuplePvs) {
          for (const src of pv.sources) {
            tupleSources.add(src);
          }
        }

        return new ProbabilisticValue(
          (assignment) => tuplePvs.map(pv => pv.eval(assignment)),
          tupleSources
        );

      case 'ternary':
        return this.evalTernary(expr);

      case 'lambda':
        return this.evalLambda(expr);

      case 'listComprehension':
        return this.evalListComprehension(expr);

      case 'method_call':
        return this.evalMethodCall(expr);

      case 'subscript':
        return this.evalSubscript(expr);

      case 'slice':
        return this.evalSlice(expr);

      case 'dict':
        return this.evalDict(expr);

      case 'set':
        return this.evalSet(expr);

      default:
        throw new Error(`Unknown expression type: ${expr.type}`);
    }
  }

  /**
   * Evaluate ternary expression: value if condition else other
   */
  evalTernary(expr) {
    const condPv = this.evalExpr(expr.condition);

    // If condition is constant, we can short-circuit
    if (condPv.isConstant()) {
      if (condPv.getConstantValue()) {
        return this.evalExpr(expr.thenValue);
      } else {
        return this.evalExpr(expr.elseValue);
      }
    }

    // Probabilistic condition - need to evaluate both branches
    const thenPv = this.evalExpr(expr.thenValue);
    const elsePv = this.evalExpr(expr.elseValue);

    const combinedSources = new Set([...condPv.sources, ...thenPv.sources, ...elsePv.sources]);

    return new ProbabilisticValue(
      (assignment) => {
        const cond = condPv.eval(assignment);
        if (cond) {
          return thenPv.eval(assignment);
        } else {
          return elsePv.eval(assignment);
        }
      },
      combinedSources
    );
  }

  /**
   * Evaluate lambda expression - returns a callable
   */
  evalLambda(expr) {
    const closure = { ...this.variables };
    return ProbabilisticValue.constant({
      type: 'lambda',
      params: expr.params,
      body: expr.body,
      closure
    });
  }

  /**
   * Evaluate list comprehension: [expr for x in iterable] or [expr for x in iterable if cond]
   */
  evalListComprehension(expr) {
    const iterPv = this.evalExpr(expr.iterable);
    if (!iterPv.isConstant()) {
      throw new Error('List comprehension iterable must be constant');
    }
    const iterable = iterPv.getConstantValue();
    if (!Array.isArray(iterable)) {
      throw new Error('List comprehension requires an iterable');
    }

    // Save current variable state
    const savedVar = this.variables[expr.loopVar];

    const result = [];
    for (const item of iterable) {
      this.variables[expr.loopVar] = ProbabilisticValue.constant(item);

      // Check filter if exists
      if (expr.filter) {
        const filterPv = this.evalExpr(expr.filter);
        if (!filterPv.isConstant()) {
          throw new Error('List comprehension filter must be constant');
        }
        if (!filterPv.getConstantValue()) continue;
      }

      // Evaluate expression
      const valuePv = this.evalExpr(expr.expr);
      if (!valuePv.isConstant()) {
        throw new Error('List comprehension expression must be constant');
      }
      result.push(valuePv.getConstantValue());
    }

    // Restore variable state
    if (savedVar !== undefined) {
      this.variables[expr.loopVar] = savedVar;
    } else {
      delete this.variables[expr.loopVar];
    }

    return ProbabilisticValue.constant(result);
  }

  /**
   * Check if two source sets are independent (disjoint)
   */
  areIndependent(sources1, sources2) {
    for (const s of sources1) {
      if (sources2.has(s)) return false;
    }
    return true;
  }

  /**
   * Get the operation function for combining distributions.
   * Returns null if operation doesn't support eager combination.
   */
  getBinOpFunction(op) {
    switch (op) {
      case '+': return (a, b) => {
        // Handle list concatenation
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
        // Handle string concatenation
        if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
        return a + b;
      };
      case '-': return (a, b) => a - b;
      case '*': return (a, b) => {
        // Handle list repetition
        if (Array.isArray(a) && typeof b === 'number') {
          const result = [];
          for (let i = 0; i < b; i++) result.push(...a);
          return result;
        }
        if (typeof a === 'number' && Array.isArray(b)) {
          const result = [];
          for (let i = 0; i < a; i++) result.push(...b);
          return result;
        }
        // Handle string repetition
        if (typeof a === 'string' && typeof b === 'number') return a.repeat(b);
        if (typeof a === 'number' && typeof b === 'string') return b.repeat(a);
        return a * b;
      };
      case '/': return (a, b) => b !== 0 ? a / b : 0;
      case '//': return (a, b) => b !== 0 ? Math.floor(a / b) : 0;
      case '%': return (a, b) => b !== 0 ? a % b : 0;
      case '**': return (a, b) => Math.pow(a, b);
      // Comparison operators - support eager combination
      case '==': return (a, b) => {
        if (Array.isArray(a) && Array.isArray(b)) {
          return JSON.stringify(a) === JSON.stringify(b) ? 1 : 0;
        }
        return a === b ? 1 : 0;
      };
      case '!=': return (a, b) => {
        if (Array.isArray(a) && Array.isArray(b)) {
          return JSON.stringify(a) !== JSON.stringify(b) ? 1 : 0;
        }
        return a !== b ? 1 : 0;
      };
      case '<': return (a, b) => a < b ? 1 : 0;
      case '>': return (a, b) => a > b ? 1 : 0;
      case '<=': return (a, b) => a <= b ? 1 : 0;
      case '>=': return (a, b) => a >= b ? 1 : 0;
      case 'and': return (a, b) => (a && b) ? 1 : 0;
      case 'or': return (a, b) => (a || b) ? 1 : 0;
      // 'in' and 'not in' are more complex, skip eager for now
      default: return null;
    }
  }

  /**
   * Evaluate binary operation
   * Uses eager distribution combination when operands are independent (no shared sources).
   * Falls back to lazy evaluation when operands share sources (are dependent).
   */
  evalBinOp(expr) {
    const left = this.evalExpr(expr.left);
    const right = this.evalExpr(expr.right);

    const combinedSources = new Set([...left.sources, ...right.sources]);

    // Check if operands are independent (no shared sources)
    const areIndependent = left.isIndependentOf(right);

    // Get the operation function for eager combination
    const opFunc = this.getBinOpFunction(expr.op);

    // Use eager combination for independent operands with supported operations
    if (areIndependent && opFunc) {
      // Get distributions of both operands
      const leftDist = left.toDistribution();
      const rightDist = right.toDistribution();

      // Combine distributions eagerly - O(|A| * |B|)
      const combinedDist = combineIndependentDistributions(leftDist, rightDist, opFunc);

      // Create result with precomputed distribution
      const result = new ProbabilisticValue(
        (assignment) => {
          const l = left.eval(assignment);
          const r = right.eval(assignment);
          return opFunc(l, r);
        },
        combinedSources
      );

      // Store the precomputed distribution
      result._cachedMarginal = combinedDist;

      return result;
    }

    // Fallback: lazy evaluation for dependent operands or unsupported operations
    const result = new ProbabilisticValue(
      (assignment) => {
        const l = left.eval(assignment);
        const r = right.eval(assignment);

        switch (expr.op) {
          case '+':
            // Handle list concatenation
            if (Array.isArray(l) && Array.isArray(r)) {
              return [...l, ...r];
            }
            // Handle string concatenation
            if (typeof l === 'string' || typeof r === 'string') {
              return String(l) + String(r);
            }
            return l + r;
          case '-': return l - r;
          case '*':
            // Handle list repetition: [1, 2] * 3 = [1, 2, 1, 2, 1, 2]
            if (Array.isArray(l) && typeof r === 'number') {
              const result = [];
              for (let i = 0; i < r; i++) result.push(...l);
              return result;
            }
            if (typeof l === 'number' && Array.isArray(r)) {
              const result = [];
              for (let i = 0; i < l; i++) result.push(...r);
              return result;
            }
            // Handle string repetition
            if (typeof l === 'string' && typeof r === 'number') {
              return l.repeat(r);
            }
            if (typeof l === 'number' && typeof r === 'string') {
              return r.repeat(l);
            }
            return l * r;
          case '/': return r !== 0 ? l / r : 0;
          case '//': return r !== 0 ? Math.floor(l / r) : 0;  // Integer division
          case '%': return r !== 0 ? l % r : 0;  // Modulo
          case '**': return Math.pow(l, r);  // Exponentiation
          case '==':
            // Handle array equality
            if (Array.isArray(l) && Array.isArray(r)) {
              return JSON.stringify(l) === JSON.stringify(r) ? 1 : 0;
            }
            return l === r ? 1 : 0;
          case '!=':
            if (Array.isArray(l) && Array.isArray(r)) {
              return JSON.stringify(l) !== JSON.stringify(r) ? 1 : 0;
            }
            return l !== r ? 1 : 0;
          case '<': return l < r ? 1 : 0;
          case '>': return l > r ? 1 : 0;
          case '<=': return l <= r ? 1 : 0;
          case '>=': return l >= r ? 1 : 0;
          case 'in':
            // Check if l is in r (r should be array, string, dict, or set)
            if (Array.isArray(r)) {
              return r.includes(l) ? 1 : 0;
            }
            if (typeof r === 'string') {
              return r.includes(l) ? 1 : 0;
            }
            if (r && typeof r === 'object' && r.__isDict__) {
              const keyStr = typeof l === 'string' ? l : JSON.stringify(l);
              return (keyStr in r && !keyStr.startsWith('__')) ? 1 : 0;
            }
            if (r && typeof r === 'object' && r.__isSet__) {
              return r.elements.includes(l) ? 1 : 0;
            }
            throw new Error("'in' requires array, string, dict, or set on right side");
          case 'not in':
            if (Array.isArray(r)) {
              return r.includes(l) ? 0 : 1;
            }
            if (typeof r === 'string') {
              return r.includes(l) ? 0 : 1;
            }
            if (r && typeof r === 'object' && r.__isDict__) {
              const keyStr = typeof l === 'string' ? l : JSON.stringify(l);
              return (keyStr in r && !keyStr.startsWith('__')) ? 0 : 1;
            }
            if (r && typeof r === 'object' && r.__isSet__) {
              return r.elements.includes(l) ? 0 : 1;
            }
            throw new Error("'not in' requires array, string, dict, or set on right side");
          case 'and': return (l && r) ? 1 : 0;  // Logical and
          case 'or': return (l || r) ? 1 : 0;   // Logical or
          default:
            throw new Error(`Unknown binary operator: ${expr.op}`);
        }
      },
      combinedSources
    );

    return result;
  }

  /**
   * Evaluate comparison chain: 0 < x < 10 means (0 < x) and (x < 10)
   */
  evalComparisonChain(expr) {
    const { operands, operators } = expr;

    // Evaluate all operands
    const evaledOperands = operands.map(op => this.evalExpr(op));

    // Combine all sources
    const allSources = new Set();
    for (const pv of evaledOperands) {
      for (const src of pv.sources) {
        allSources.add(src);
      }
    }

    return new ProbabilisticValue(
      (assignment) => {
        // Evaluate each comparison and AND them together
        for (let i = 0; i < operators.length; i++) {
          const left = evaledOperands[i].eval(assignment);
          const right = evaledOperands[i + 1].eval(assignment);
          const op = operators[i];

          let result;
          switch (op) {
            case '<': result = left < right; break;
            case '>': result = left > right; break;
            case '<=': result = left <= right; break;
            case '>=': result = left >= right; break;
            case '==':
              if (Array.isArray(left) && Array.isArray(right)) {
                result = JSON.stringify(left) === JSON.stringify(right);
              } else {
                result = left === right;
              }
              break;
            case '!=':
              if (Array.isArray(left) && Array.isArray(right)) {
                result = JSON.stringify(left) !== JSON.stringify(right);
              } else {
                result = left !== right;
              }
              break;
            case 'in':
              if (Array.isArray(right)) {
                result = right.includes(left);
              } else if (typeof right === 'string') {
                result = right.includes(left);
              } else if (right && typeof right === 'object' && right.__isDict__) {
                const keyStr = typeof left === 'string' ? left : JSON.stringify(left);
                result = keyStr in right && !keyStr.startsWith('__');
              } else if (right && typeof right === 'object' && right.__isSet__) {
                result = right.elements.includes(left);
              } else {
                throw new Error("'in' requires array, string, dict, or set on right side");
              }
              break;
            case 'not in':
              if (Array.isArray(right)) {
                result = !right.includes(left);
              } else if (typeof right === 'string') {
                result = !right.includes(left);
              } else if (right && typeof right === 'object' && right.__isDict__) {
                const keyStr = typeof left === 'string' ? left : JSON.stringify(left);
                result = !(keyStr in right && !keyStr.startsWith('__'));
              } else if (right && typeof right === 'object' && right.__isSet__) {
                result = !right.elements.includes(left);
              } else {
                throw new Error("'not in' requires array, string, dict, or set on right side");
              }
              break;
            default:
              throw new Error(`Unknown comparison operator: ${op}`);
          }

          // Short-circuit: if any comparison is false, the whole chain is false
          if (!result) {
            return 0;
          }
        }
        // All comparisons passed
        return 1;
      },
      allSources
    );
  }

  /**
   * Multiply two independent distributions
   */
  multiplyDistributions(dist1, dist2) {
    const result = new Map();
    for (const [v1, p1] of dist1.pmf) {
      for (const [v2, p2] of dist2.pmf) {
        const prod = v1 * v2;
        result.set(prod, (result.get(prod) || 0) + p1 * p2);
      }
    }
    return new Distribution(result);
  }

  /**
   * Evaluate unary operation
   */
  evalUnaryOp(expr) {
    const operand = this.evalExpr(expr.operand);

    return new ProbabilisticValue(
      (assignment) => {
        const val = operand.eval(assignment);
        switch (expr.op) {
          case '-': return -val;
          case '!': return val ? 0 : 1;
          default:
            throw new Error(`Unknown unary operator: ${expr.op}`);
        }
      },
      operand.sources
    );
  }

  /**
   * Evaluate function call
   */
  evalCall(expr) {
    const { name, args } = expr;

    // Check if it's a user-defined function
    if (this.variables.hasOwnProperty(name)) {
      const funcPv = this.variables[name];
      if (funcPv.isConstant()) {
        const func = funcPv.getConstantValue();
        if (func && (func.type === 'function' || func.type === 'lambda')) {
          return this.callUserFunction(func, args);
        }
      }
    }

    // Built-in functions
    switch (name) {
      case 'split':
        // split() should only appear in tuple assignment context
        throw new Error('split() must be used with tuple assignment: B, C = split(A, p)');

      case 'range': {
        // range(stop), range(start, stop), or range(start, stop, step)
        const evalArgs = args.map(a => {
          const pv = this.evalExpr(a);
          if (!pv.isConstant()) throw new Error('range() arguments must be constants');
          return pv.getConstantValue();
        });

        let start = 0, end, step = 1;
        if (evalArgs.length === 1) {
          end = evalArgs[0];
        } else if (evalArgs.length === 2) {
          start = evalArgs[0];
          end = evalArgs[1];
        } else if (evalArgs.length === 3) {
          start = evalArgs[0];
          end = evalArgs[1];
          step = evalArgs[2];
        } else {
          throw new Error('range() requires 1-3 arguments');
        }

        const result = [];
        if (step > 0) {
          for (let i = start; i < end; i += step) result.push(i);
        } else if (step < 0) {
          for (let i = start; i > end; i += step) result.push(i);
        } else {
          throw new Error('range() step cannot be 0');
        }
        return ProbabilisticValue.constant(result);
      }

      case 'len': {
        if (args.length !== 1) throw new Error('len() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('len() argument must be constant');
        const val = arg.getConstantValue();
        if (Array.isArray(val)) return ProbabilisticValue.constant(val.length);
        if (typeof val === 'string') return ProbabilisticValue.constant(val.length);
        if (val && typeof val === 'object' && val.__isSet__) return ProbabilisticValue.constant(val.size);
        if (val && typeof val === 'object' && val.__isDict__) {
          // Count keys, excluding internal markers
          const keyCount = Object.keys(val).filter(k => !k.startsWith('__')).length;
          return ProbabilisticValue.constant(keyCount);
        }
        throw new Error('len() argument must be array, string, set, or dict');
      }

      case 'sum': {
        if (args.length !== 1) throw new Error('sum() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('sum() argument must be constant');
        const arr = arg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('sum() argument must be an array');
        return ProbabilisticValue.constant(arr.reduce((a, b) => a + b, 0));
      }

      case 'abs': {
        if (args.length !== 1) throw new Error('abs() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.abs(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.abs(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'round': {
        if (args.length < 1 || args.length > 2) throw new Error('round() requires 1 or 2 arguments');
        const numArg = this.evalExpr(args[0]);
        const decimals = args.length === 2 ? this.evalExpr(args[1]).getConstantValue() : 0;
        const factor = Math.pow(10, decimals);

        if (numArg.isConstant()) {
          return ProbabilisticValue.constant(Math.round(numArg.getConstantValue() * factor) / factor);
        }
        return new ProbabilisticValue(
          (assignment) => Math.round(numArg.eval(assignment) * factor) / factor,
          numArg.sources
        );
      }

      case 'int': {
        if (args.length !== 1) throw new Error('int() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          const val = arg.getConstantValue();
          if (typeof val === 'string') return ProbabilisticValue.constant(parseInt(val, 10));
          return ProbabilisticValue.constant(Math.trunc(val));
        }
        return new ProbabilisticValue(
          (assignment) => Math.trunc(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'float': {
        if (args.length !== 1) throw new Error('float() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(parseFloat(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => parseFloat(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'str': {
        if (args.length !== 1) throw new Error('str() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(String(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => String(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'bool': {
        if (args.length !== 1) throw new Error('bool() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(arg.getConstantValue() ? true : false);
        }
        return new ProbabilisticValue(
          (assignment) => arg.eval(assignment) ? true : false,
          arg.sources
        );
      }

      case 'list': {
        if (args.length !== 1) throw new Error('list() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('list() argument must be constant');
        const val = arg.getConstantValue();
        if (Array.isArray(val)) return ProbabilisticValue.constant([...val]);  // Copy
        if (typeof val === 'string') return ProbabilisticValue.constant(val.split(''));
        throw new Error('list() argument must be iterable');
      }

      case 'sorted': {
        if (args.length !== 1) throw new Error('sorted() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('sorted() argument must be constant');
        const arr = arg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('sorted() argument must be an array');
        return ProbabilisticValue.constant([...arr].sort((a, b) => a - b));
      }

      case 'reversed': {
        if (args.length !== 1) throw new Error('reversed() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('reversed() argument must be constant');
        const arr = arg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('reversed() argument must be an array');
        return ProbabilisticValue.constant([...arr].reverse());
      }

      case 'any': {
        if (args.length !== 1) throw new Error('any() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('any() argument must be constant');
        const arr = arg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('any() argument must be an array');
        return ProbabilisticValue.constant(arr.some(x => x) ? 1 : 0);
      }

      case 'all': {
        if (args.length !== 1) throw new Error('all() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('all() argument must be constant');
        const arr = arg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('all() argument must be an array');
        return ProbabilisticValue.constant(arr.every(x => x) ? 1 : 0);
      }

      case 'enumerate': {
        if (args.length !== 1) throw new Error('enumerate() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (!arg.isConstant()) throw new Error('enumerate() argument must be constant');
        const arr = arg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('enumerate() argument must be an array');
        return ProbabilisticValue.constant(arr.map((v, i) => [i, v]));
      }

      case 'zip': {
        if (args.length < 2) throw new Error('zip() requires at least 2 arguments');
        const arrays = args.map(a => {
          const pv = this.evalExpr(a);
          if (!pv.isConstant()) throw new Error('zip() arguments must be constants');
          const val = pv.getConstantValue();
          if (!Array.isArray(val)) throw new Error('zip() arguments must be arrays');
          return val;
        });
        const minLen = Math.min(...arrays.map(a => a.length));
        const result = [];
        for (let i = 0; i < minLen; i++) {
          result.push(arrays.map(a => a[i]));
        }
        return ProbabilisticValue.constant(result);
      }

      case 'map': {
        if (args.length !== 2) throw new Error('map() requires exactly 2 arguments');
        const funcArg = this.evalExpr(args[0]);
        const iterArg = this.evalExpr(args[1]);
        if (!funcArg.isConstant()) throw new Error('map() function must be constant');
        if (!iterArg.isConstant()) throw new Error('map() iterable must be constant');
        const func = funcArg.getConstantValue();
        const arr = iterArg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('map() second argument must be an array');

        const result = arr.map(item => {
          const val = this.applyCallable(func, [ProbabilisticValue.constant(item)]);
          if (!val.isConstant()) throw new Error('map() function must return constant');
          return val.getConstantValue();
        });
        return ProbabilisticValue.constant(result);
      }

      case 'filter': {
        if (args.length !== 2) throw new Error('filter() requires exactly 2 arguments');
        const funcArg = this.evalExpr(args[0]);
        const iterArg = this.evalExpr(args[1]);
        if (!funcArg.isConstant()) throw new Error('filter() function must be constant');
        if (!iterArg.isConstant()) throw new Error('filter() iterable must be constant');
        const func = funcArg.getConstantValue();
        const arr = iterArg.getConstantValue();
        if (!Array.isArray(arr)) throw new Error('filter() second argument must be an array');

        const result = arr.filter(item => {
          const val = this.applyCallable(func, [ProbabilisticValue.constant(item)]);
          if (!val.isConstant()) throw new Error('filter() function must return constant');
          return val.getConstantValue();
        });
        return ProbabilisticValue.constant(result);
      }

      case 'print': {
        // Print function - just evaluate and ignore (for debugging)
        const values = args.map(a => {
          const pv = this.evalExpr(a);
          if (pv.isConstant()) return pv.getConstantValue();
          return pv.toDistribution().toString();
        });
        console.log(...values);
        return ProbabilisticValue.constant(null);
      }

      case 'max':
        return this.evalMax(args);

      case 'min':
        return this.evalMin(args);

      // Math functions
      case 'sqrt': {
        if (args.length !== 1) throw new Error('sqrt() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.sqrt(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.sqrt(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'sin': {
        if (args.length !== 1) throw new Error('sin() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.sin(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.sin(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'cos': {
        if (args.length !== 1) throw new Error('cos() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.cos(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.cos(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'tan': {
        if (args.length !== 1) throw new Error('tan() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.tan(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.tan(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'log': {
        if (args.length !== 1) throw new Error('log() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.log(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.log(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'log10': {
        if (args.length !== 1) throw new Error('log10() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.log10(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.log10(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'exp': {
        if (args.length !== 1) throw new Error('exp() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.exp(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.exp(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'floor': {
        if (args.length !== 1) throw new Error('floor() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.floor(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.floor(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'ceil': {
        if (args.length !== 1) throw new Error('ceil() requires exactly 1 argument');
        const arg = this.evalExpr(args[0]);
        if (arg.isConstant()) {
          return ProbabilisticValue.constant(Math.ceil(arg.getConstantValue()));
        }
        return new ProbabilisticValue(
          (assignment) => Math.ceil(arg.eval(assignment)),
          arg.sources
        );
      }

      case 'pow': {
        if (args.length !== 2) throw new Error('pow() requires exactly 2 arguments');
        const base = this.evalExpr(args[0]);
        const exp = this.evalExpr(args[1]);
        if (base.isConstant() && exp.isConstant()) {
          return ProbabilisticValue.constant(Math.pow(base.getConstantValue(), exp.getConstantValue()));
        }
        const combinedSources = new Set([...base.sources, ...exp.sources]);
        return new ProbabilisticValue(
          (assignment) => Math.pow(base.eval(assignment), exp.eval(assignment)),
          combinedSources
        );
      }

      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  /**
   * Call a user-defined function or lambda
   */
  callUserFunction(func, argExprs) {
    const params = func.params;
    const defaults = func.defaults || [];
    const evalArgs = argExprs.map(a => this.evalExpr(a));

    // Fill in default arguments
    if (evalArgs.length < params.length) {
      for (let i = evalArgs.length; i < params.length; i++) {
        if (defaults[i] !== null) {
          evalArgs.push(this.evalExpr(defaults[i]));
        } else {
          throw new Error(`Missing required argument: ${params[i]}`);
        }
      }
    }

    if (evalArgs.length !== params.length) {
      throw new Error(`Expected ${params.length} arguments, got ${evalArgs.length}`);
    }

    // Save current scope and set up function scope
    const savedVars = { ...this.variables };
    this.variables = { ...func.closure };

    // Bind arguments to parameters
    for (let i = 0; i < params.length; i++) {
      this.variables[params[i]] = evalArgs[i];
    }

    // Execute function body
    let returnValue = ProbabilisticValue.constant(null);

    if (func.type === 'lambda') {
      // Lambda just evaluates its body expression
      returnValue = this.evalExpr(func.body);
    } else {
      // Regular function executes statements
      try {
        for (const stmt of func.body) {
          this.evalStatement(stmt);
        }
        // If we have a returnValue set, use it
        if (this.returnValue) {
          // this.returnValue is a Distribution; extract the constant value if possible
          if (this.returnValue.isConstant()) {
            returnValue = ProbabilisticValue.constant(this.returnValue.getConstantValue());
          } else {
            // For non-constant distributions, we need to handle differently
            // For now, just return the most likely value
            const entries = this.returnValue.entries();
            if (entries.length > 0) {
              returnValue = ProbabilisticValue.constant(entries[0][0]);
            }
          }
          this.returnValue = null;  // Clear for next function call
        }
      } catch (e) {
        // Handle return as exception for early return
        if (e && e.type === 'return') {
          returnValue = e.value;
        } else {
          throw e;
        }
      }
    }

    // Restore scope
    this.variables = savedVars;

    return returnValue;
  }

  /**
   * Apply a callable (function or lambda) to arguments
   */
  applyCallable(func, argPvs) {
    if (func.type === 'function' || func.type === 'lambda') {
      const params = func.params;

      // Save current scope
      const savedVars = { ...this.variables };
      this.variables = { ...func.closure };

      // Bind arguments
      for (let i = 0; i < params.length && i < argPvs.length; i++) {
        this.variables[params[i]] = argPvs[i];
      }

      // Execute
      let result;
      if (func.type === 'lambda') {
        result = this.evalExpr(func.body);
      } else {
        // For regular functions, we'd need to handle return differently
        throw new Error('Cannot use regular functions as callbacks yet');
      }

      // Restore scope
      this.variables = savedVars;

      return result;
    }

    throw new Error('Not a callable');
  }

  /**
   * Evaluate max() function
   * Uses eager distribution combination when operands are independent.
   */
  evalMax(args) {
    // Handle single array argument
    if (args.length === 1) {
      const arg = this.evalExpr(args[0]);
      if (arg.isConstant()) {
        const val = arg.getConstantValue();
        if (Array.isArray(val)) {
          if (val.length === 0) throw new Error('max() argument is an empty sequence');
          return ProbabilisticValue.constant(Math.max(...val));
        }
      }
      throw new Error('max() with single argument requires an array');
    }

    let result = this.evalExpr(args[0]);

    for (let i = 1; i < args.length; i++) {
      const other = this.evalExpr(args[i]);
      const combinedSources = new Set([...result.sources, ...other.sources]);
      const prevResult = result;

      // Check if independent
      if (prevResult.isIndependentOf(other)) {
        // Eager combination
        const leftDist = prevResult.toDistribution();
        const rightDist = other.toDistribution();
        const combinedDist = combineIndependentDistributions(leftDist, rightDist, Math.max);

        const newResult = new ProbabilisticValue(
          (assignment) => Math.max(prevResult.eval(assignment), other.eval(assignment)),
          combinedSources
        );
        newResult._cachedMarginal = combinedDist;
        result = newResult;
      } else {
        // Lazy evaluation for dependent operands
        const newResult = new ProbabilisticValue(
          (assignment) => Math.max(prevResult.eval(assignment), other.eval(assignment)),
          combinedSources
        );
        result = newResult;
      }
    }

    return result;
  }

  /**
   * Evaluate min() function
   * Uses eager distribution combination when operands are independent.
   */
  evalMin(args) {
    // Handle single array argument
    if (args.length === 1) {
      const arg = this.evalExpr(args[0]);
      if (arg.isConstant()) {
        const val = arg.getConstantValue();
        if (Array.isArray(val)) {
          if (val.length === 0) throw new Error('min() argument is an empty sequence');
          return ProbabilisticValue.constant(Math.min(...val));
        }
      }
      throw new Error('min() with single argument requires an array');
    }

    let result = this.evalExpr(args[0]);

    for (let i = 1; i < args.length; i++) {
      const other = this.evalExpr(args[i]);
      const combinedSources = new Set([...result.sources, ...other.sources]);
      const prevResult = result;

      // Check if independent
      if (prevResult.isIndependentOf(other)) {
        // Eager combination
        const leftDist = prevResult.toDistribution();
        const rightDist = other.toDistribution();
        const combinedDist = combineIndependentDistributions(leftDist, rightDist, Math.min);

        const newResult = new ProbabilisticValue(
          (assignment) => Math.min(prevResult.eval(assignment), other.eval(assignment)),
          combinedSources
        );
        newResult._cachedMarginal = combinedDist;
        result = newResult;
      } else {
        // Lazy evaluation for dependent operands
        const newResult = new ProbabilisticValue(
          (assignment) => Math.min(prevResult.eval(assignment), other.eval(assignment)),
          combinedSources
        );
        result = newResult;
      }
    }

    return result;
  }

  /**
   * Get the distribution for a variable (uses pre-computed distributions)
   */
  getVariableDistribution(name) {
    // Fast path: use pre-computed distributions
    if (this.distributions && this.distributions[name]) {
      return this.distributions[name];
    }
    // Fallback: compute on demand (will be slow if budget was used up)
    const pv = this.variables[name];
    if (!pv) return null;
    return pv.getMarginal();
  }

  /**
   * Evaluate mutating method call as a statement (e.g., list.append(x))
   * Modifies the variable in place like Python
   */
  evalMutatingMethodCall(expr) {
    const method = expr.method;
    const args = expr.args.map(a => this.evalExpr(a));

    // Find the variable name being mutated
    let varName = null;
    let objExpr = expr.object;

    // Handle direct variable: arr.append(x)
    if (objExpr.type === 'variable') {
      varName = objExpr.name;
    }
    // Handle chained subscript: arr[i].append(x) - not supported for mutation

    if (!varName) {
      throw new Error(`Cannot mutate: method call target must be a variable`);
    }

    if (!this.variables.hasOwnProperty(varName)) {
      const lineInfo = objExpr.line ? ` (line ${objExpr.line})` : '';
      throw new Error(`Undefined variable: ${varName}${lineInfo}`);
    }

    const pv = this.variables[varName];
    if (!pv.isConstant()) {
      const lineInfo = objExpr.line ? ` (line ${objExpr.line})` : '';
      throw new Error(`Cannot mutate probabilistic value with ${method}()${lineInfo}`);
    }

    const arr = pv.getConstantValue();
    if (!Array.isArray(arr)) {
      throw new Error(`Method '${method}' called on non-array value`);
    }

    switch (method) {
      case 'append': {
        if (args.length !== 1) {
          throw new Error('append() requires exactly 1 argument');
        }
        const argPv = args[0];
        if (!argPv.isConstant()) {
          throw new Error('append() argument must be constant');
        }
        arr.push(argPv.getConstantValue());
        return;  // No return value (like Python)
      }

      case 'pop': {
        if (arr.length === 0) {
          throw new Error('pop() on empty array');
        }
        arr.pop();
        return;  // No return value
      }

      case 'clear': {
        arr.length = 0;
        return;
      }

      case 'extend': {
        if (args.length !== 1) {
          throw new Error('extend() requires exactly 1 argument');
        }
        const argPv = args[0];
        if (!argPv.isConstant()) {
          throw new Error('extend() argument must be constant');
        }
        const items = argPv.getConstantValue();
        if (!Array.isArray(items)) {
          throw new Error('extend() argument must be an array');
        }
        arr.push(...items);
        return;
      }

      case 'insert': {
        if (args.length !== 2) {
          throw new Error('insert() requires exactly 2 arguments');
        }
        const idxPv = args[0];
        const valPv = args[1];
        if (!idxPv.isConstant() || !valPv.isConstant()) {
          throw new Error('insert() arguments must be constants');
        }
        let idx = idxPv.getConstantValue();
        // Normalize negative index
        if (idx < 0) idx = Math.max(0, arr.length + idx + 1);
        if (idx > arr.length) idx = arr.length;
        arr.splice(idx, 0, valPv.getConstantValue());
        return;
      }

      case 'remove': {
        if (args.length !== 1) {
          throw new Error('remove() requires exactly 1 argument');
        }
        const argPv = args[0];
        if (!argPv.isConstant()) {
          throw new Error('remove() argument must be constant');
        }
        const val = argPv.getConstantValue();
        const idx = arr.indexOf(val);
        if (idx === -1) {
          throw new Error(`${val} not in list`);
        }
        arr.splice(idx, 1);
        return;
      }

      case 'reverse': {
        arr.reverse();
        return;
      }

      case 'sort': {
        arr.sort((a, b) => a - b);
        return;
      }

      // Non-mutating methods used as statements - just evaluate them
      case 'sum':
      case 'len':
      case 'length':
      case 'index':
      case 'count':
      case 'copy':
        return;  // Discard the result

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Evaluate method call as expression (e.g., arr.sum(), arr.len())
   * For non-mutating methods that return values
   */
  evalMethodCall(expr) {
    const obj = this.evalExpr(expr.object);
    const method = expr.method;
    const args = expr.args.map(a => this.evalExpr(a));

    // For now, we only support methods on constant arrays
    if (!obj.isConstant()) {
      throw new Error(`Method calls only supported on constant values, got probabilistic value`);
    }

    const objValue = obj.getConstantValue();

    if (!Array.isArray(objValue)) {
      throw new Error(`Method '${method}' called on non-array value`);
    }

    switch (method) {
      case 'append':
        throw new Error('append() modifies in place and returns nothing. Use as statement: arr.append(x)');

      case 'pop':
        throw new Error('pop() modifies in place. Use as statement: arr.pop()');

      case 'sum': {
        // Returns the sum of array elements
        const sum = objValue.reduce((a, b) => a + b, 0);
        return ProbabilisticValue.constant(sum);
      }

      case 'len':
      case 'length': {
        // Returns the length of the array
        return ProbabilisticValue.constant(objValue.length);
      }

      case 'index': {
        // Returns the index of the first occurrence
        if (args.length !== 1) throw new Error('index() requires exactly 1 argument');
        if (!args[0].isConstant()) throw new Error('index() argument must be constant');
        const val = args[0].getConstantValue();
        const idx = objValue.indexOf(val);
        if (idx === -1) throw new Error(`${val} is not in list`);
        return ProbabilisticValue.constant(idx);
      }

      case 'count': {
        // Returns the count of occurrences
        if (args.length !== 1) throw new Error('count() requires exactly 1 argument');
        if (!args[0].isConstant()) throw new Error('count() argument must be constant');
        const val = args[0].getConstantValue();
        const count = objValue.filter(x => x === val).length;
        return ProbabilisticValue.constant(count);
      }

      case 'copy': {
        // Returns a shallow copy
        return ProbabilisticValue.constant([...objValue]);
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Normalize index (handle negative indexing like Python)
   */
  normalizeIndex(idx, length) {
    if (idx < 0) {
      idx = length + idx;
    }
    if (idx < 0 || idx >= length) {
      throw new Error(`Index ${idx} out of bounds for array of length ${length}`);
    }
    return idx;
  }

  /**
   * Evaluate subscript (e.g., arr[i] or arr[-1] or dict[key])
   */
  evalSubscript(expr) {
    const obj = this.evalExpr(expr.object);
    const index = this.evalExpr(expr.index);

    // Handle constant array with constant index
    if (obj.isConstant() && index.isConstant()) {
      const arr = obj.getConstantValue();
      let idx = index.getConstantValue();

      // Handle dictionary subscript
      if (arr && typeof arr === 'object' && arr.__isDict__) {
        const keyStr = typeof idx === 'string' ? idx : JSON.stringify(idx);
        if (!(keyStr in arr) || keyStr.startsWith('__')) {
          throw new Error(`Key not found: ${idx}`);
        }
        return ProbabilisticValue.constant(arr[keyStr]);
      }

      // Handle string subscript
      if (typeof arr === 'string') {
        idx = this.normalizeIndex(idx, arr.length);
        return ProbabilisticValue.constant(arr[idx]);
      }

      if (!Array.isArray(arr)) {
        throw new Error('Subscript on non-array/dict value');
      }

      idx = this.normalizeIndex(idx, arr.length);

      const element = arr[idx];
      // If element is already a ProbabilisticValue, return it directly
      if (element instanceof ProbabilisticValue) {
        return element;
      }
      return ProbabilisticValue.constant(element);
    }

    // Handle probabilistic subscript (array is constant, index is probabilistic)
    if (obj.isConstant() && !index.isConstant()) {
      const arr = obj.getConstantValue();
      if (!Array.isArray(arr)) {
        throw new Error('Subscript on non-array value');
      }

      // Collect all sources from probabilistic elements in the array
      const elementSources = new Set();
      for (const el of arr) {
        if (el instanceof ProbabilisticValue) {
          for (const s of el.sources) elementSources.add(s);
        }
      }
      const combinedSources = new Set([...index.sources, ...elementSources]);

      return new ProbabilisticValue(
        (assignment) => {
          let idx = index.eval(assignment);
          idx = idx < 0 ? arr.length + idx : idx;
          if (idx < 0 || idx >= arr.length) {
            throw new Error(`Index ${idx} out of bounds for array of length ${arr.length}`);
          }
          const element = arr[idx];
          if (element instanceof ProbabilisticValue) {
            return element.eval(assignment);
          }
          return element;
        },
        combinedSources
      );
    }

    throw new Error('Subscript with probabilistic array not supported');
  }

  /**
   * Evaluate dictionary literal
   */
  evalDict(expr) {
    const dict = {};
    for (const entry of expr.entries) {
      const keyPv = this.evalExpr(entry.key);
      const valuePv = this.evalExpr(entry.value);

      if (!keyPv.isConstant()) {
        throw new Error('Dictionary keys must be constants');
      }
      if (!valuePv.isConstant()) {
        throw new Error('Dictionary values must be constants');
      }

      const key = keyPv.getConstantValue();
      const value = valuePv.getConstantValue();

      // JavaScript object keys are strings, so convert if needed
      const keyStr = typeof key === 'string' ? key : JSON.stringify(key);
      dict[keyStr] = value;
      // Also store the original key type for proper retrieval
      if (typeof key !== 'string') {
        dict['__key_type_' + keyStr] = typeof key;
      }
    }

    // Mark as a dictionary object
    dict.__isDict__ = true;
    return ProbabilisticValue.constant(dict);
  }

  /**
   * Evaluate set literal
   */
  evalSet(expr) {
    const elements = [];
    for (const elem of expr.elements) {
      const pv = this.evalExpr(elem);
      if (!pv.isConstant()) {
        throw new Error('Set elements must be constants');
      }
      const value = pv.getConstantValue();
      // Only add if not already present (set semantics)
      const valueStr = JSON.stringify(value);
      if (!elements.some(e => JSON.stringify(e) === valueStr)) {
        elements.push(value);
      }
    }

    // Return as a special set object
    const setObj = {
      __isSet__: true,
      elements: elements,
      has: (val) => elements.some(e => JSON.stringify(e) === JSON.stringify(val)),
      size: elements.length
    };
    return ProbabilisticValue.constant(setObj);
  }

  /**
   * Evaluate slice (e.g., arr[1:3], arr[::2], arr[:-1])
   */
  evalSlice(expr) {
    const obj = this.evalExpr(expr.object);

    if (!obj.isConstant()) {
      throw new Error('Slicing probabilistic arrays not supported');
    }

    const arr = obj.getConstantValue();
    if (!Array.isArray(arr) && typeof arr !== 'string') {
      throw new Error('Slice on non-sequence value');
    }

    const len = arr.length;

    // Evaluate start, stop, step (defaulting to null if not specified)
    let start = expr.start ? this.evalExpr(expr.start).getConstantValue() : null;
    let stop = expr.stop ? this.evalExpr(expr.stop).getConstantValue() : null;
    let step = expr.step ? this.evalExpr(expr.step).getConstantValue() : null;

    // Default step is 1
    if (step === null) step = 1;
    if (step === 0) throw new Error('slice step cannot be zero');

    // Handle negative indices and defaults based on step direction
    if (step > 0) {
      // Forward slice
      if (start === null) start = 0;
      if (stop === null) stop = len;

      // Normalize negative indices
      if (start < 0) start = Math.max(0, len + start);
      if (stop < 0) stop = Math.max(0, len + stop);

      // Clamp to bounds
      start = Math.min(start, len);
      stop = Math.min(stop, len);
    } else {
      // Reverse slice (step < 0)
      if (start === null) start = len - 1;
      if (stop === null) stop = -len - 1;  // Special value to go to beginning

      // Normalize negative indices
      if (start < 0) start = len + start;
      if (stop < 0 && stop !== -len - 1) stop = len + stop;

      // Clamp to bounds
      start = Math.min(Math.max(start, -1), len - 1);
    }

    // Build the result
    const result = [];
    if (step > 0) {
      for (let i = start; i < stop; i += step) {
        result.push(arr[i]);
      }
    } else {
      for (let i = start; i > stop; i += step) {
        if (i >= 0 && i < len) {
          result.push(arr[i]);
        }
      }
    }

    // Return same type as input (array or string)
    if (typeof arr === 'string') {
      return ProbabilisticValue.constant(result.join(''));
    }
    return ProbabilisticValue.constant(result);
  }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RandomSource, ProbabilisticValue, DSLInterpreter, globalBFSBudget, computeAllDistributions };
}
