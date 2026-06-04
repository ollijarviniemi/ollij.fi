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
      sources: this.sources,
      errors: this.errors
    };
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
   * Evaluate while loop
   * Supports both deterministic and probabilistic conditions
   */
  evalWhileLoop(stmt) {
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

      unrollDepth++;
    }

    // Clean up __continue__ flag
    delete this.variables['__continue__'];

    if (unrollDepth >= MAX_UNROLL && remainingMass > 0.01) {
      console.warn(`Probabilistic while loop reached max unroll depth (${MAX_UNROLL}) with ${(remainingMass * 100).toFixed(2)}% remaining mass`);
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
