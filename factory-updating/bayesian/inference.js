/**
 * Bayesian Inference System with Factorized State Representation
 *
 * Tracks probability distributions P(state | hypothesis) efficiently by exploiting
 * conditional independence structure. States are factorized into independence groups,
 * where balls within a group have joint distributions, but groups are independent.
 *
 * Key operations:
 * - Sample: Create new singleton group from sack
 * - Shuffle: Merge groups and apply permutation
 * - Observe: Condition on observed color and update hypothesis posteriors
 * - Collect: Marginalize out collected ball
 */

/**
 * Represents one independence group - a set of balls with joint color distribution
 */
class IndependenceGroup {
  /**
   * @param {Array<string>} ballIds - IDs of balls in this group
   * @param {Array<string>} colors - Possible ball colors
   */
  constructor(ballIds, colors) {
    this.ballIds = ballIds;
    this.colors = colors;

    // Joint distribution per hypothesis
    // Map: hypothesisId -> Map<colorTuple, probability>
    // colorTuple format: "red,blue,green" for 3 balls
    this.distributions = new Map();
  }

  /**
   * Initialize distribution for a hypothesis
   * @param {string} hypothesisId
   * @param {Map<string, number>} distribution - Map from color tuple to probability
   */
  setDistribution(hypothesisId, distribution) {
    this.distributions.set(hypothesisId, new Map(distribution));
  }

  /**
   * Get probability of a color tuple under a hypothesis
   */
  getProbability(hypothesisId, colorTuple) {
    const dist = this.distributions.get(hypothesisId);
    if (!dist) return 0;
    return dist.get(colorTuple) || 0;
  }

  /**
   * Condition on observing a ball's color
   * @param {string} hypothesisId
   * @param {number} ballIndex - Index within this group
   * @param {string} observedColor - The observed color
   * @returns {number} P(observation | hypothesis) - marginal probability before conditioning
   */
  conditionOnObservation(hypothesisId, ballIndex, observedColor) {
    const dist = this.distributions.get(hypothesisId);
    if (!dist) return 0;

    let totalProb = 0;
    const newDist = new Map();

    // Filter to states consistent with observation
    for (const [colorTuple, prob] of dist.entries()) {
      const colors = colorTuple.split(',');
      if (colors[ballIndex] === observedColor) {
        newDist.set(colorTuple, prob);
        totalProb += prob;
      }
    }

    // Normalize (if observation is possible under this hypothesis)
    if (totalProb > 0) {
      for (const [colorTuple, prob] of newDist.entries()) {
        newDist.set(colorTuple, prob / totalProb);
      }
      this.distributions.set(hypothesisId, newDist);
    } else {
      // Zero probability observation - set to empty distribution
      this.distributions.set(hypothesisId, new Map());
    }

    return totalProb; // Return P(observation | hypothesis) for Bayes update
  }

  /**
   * Marginalize out a ball from the group
   * @param {number} ballIndex - Index within this group to remove
   * @returns {IndependenceGroup} New group without that ball
   */
  marginalize(ballIndex) {
    const newBallIds = this.ballIds.filter((_, i) => i !== ballIndex);
    const newGroup = new IndependenceGroup(newBallIds, this.colors);

    for (const [hypothesisId, dist] of this.distributions.entries()) {
      const newDist = new Map();

      for (const [colorTuple, prob] of dist.entries()) {
        const colors = colorTuple.split(',');
        const newColors = colors.filter((_, i) => i !== ballIndex);
        const newTuple = newColors.join(',');

        newDist.set(newTuple, (newDist.get(newTuple) || 0) + prob);
      }

      newGroup.setDistribution(hypothesisId, newDist);
    }

    return newGroup;
  }

  /**
   * Create a merged group from two independent groups
   * Used when balls from different groups need to interact (e.g., shuffler)
   */
  static merge(group1, group2, colors) {
    const mergedBallIds = [...group1.ballIds, ...group2.ballIds];
    const merged = new IndependenceGroup(mergedBallIds, colors);

    // Get all hypotheses
    const hypotheses = new Set([...group1.distributions.keys(), ...group2.distributions.keys()]);

    for (const hypothesisId of hypotheses) {
      const dist1 = group1.distributions.get(hypothesisId);
      const dist2 = group2.distributions.get(hypothesisId);

      if (!dist1 || !dist2) continue;

      const mergedDist = new Map();

      // Cartesian product: P(A, B) = P(A) * P(B) for independent groups
      for (const [tuple1, prob1] of dist1.entries()) {
        for (const [tuple2, prob2] of dist2.entries()) {
          const mergedTuple = tuple1 + ',' + tuple2;
          mergedDist.set(mergedTuple, prob1 * prob2);
        }
      }

      merged.setDistribution(hypothesisId, mergedDist);
    }

    return merged;
  }

  /**
   * Apply shuffler operation to two balls in this group
   * Assumes uniform shuffling: each output permutation equally likely
   *
   * @param {string} hypothesisId
   * @param {number} ball1Index - Index of first ball to shuffle
   * @param {number} ball2Index - Index of second ball to shuffle
   */
  applyShuffle(hypothesisId, ball1Index, ball2Index) {
    const dist = this.distributions.get(hypothesisId);
    if (!dist) return;

    const newDist = new Map();

    for (const [colorTuple, prob] of dist.entries()) {
      const colors = colorTuple.split(',');

      // Outcome 1: balls stay in same order (probability 0.5)
      const outcome1 = [...colors];
      const tuple1 = outcome1.join(',');
      newDist.set(tuple1, (newDist.get(tuple1) || 0) + prob * 0.5);

      // Outcome 2: balls swap positions (probability 0.5)
      const outcome2 = [...colors];
      [outcome2[ball1Index], outcome2[ball2Index]] = [outcome2[ball2Index], outcome2[ball1Index]];
      const tuple2 = outcome2.join(',');
      newDist.set(tuple2, (newDist.get(tuple2) || 0) + prob * 0.5);
    }

    this.distributions.set(hypothesisId, newDist);
  }

  /**
   * Apply shuffler operation to N balls in this group
   * Assumes uniform shuffling: all N! permutations equally likely
   *
   * @param {string} hypothesisId
   * @param {Array<number>} ballIndices - Indices of balls to shuffle
   */
  applyShuffleMultiple(hypothesisId, ballIndices) {
    const dist = this.distributions.get(hypothesisId);
    if (!dist) return;

    // Generate all permutations of the ball indices
    const permutations = this.generatePermutations(ballIndices);
    const numPermutations = permutations.length;
    const probPerPermutation = 1 / numPermutations;

    const newDist = new Map();

    for (const [colorTuple, prob] of dist.entries()) {
      const colors = colorTuple.split(',');

      // For each possible permutation of the shuffled balls
      for (const perm of permutations) {
        const outcome = [...colors];

        // Apply this permutation to the ball positions
        for (let i = 0; i < ballIndices.length; i++) {
          outcome[ballIndices[i]] = colors[perm[i]];
        }

        const tuple = outcome.join(',');
        newDist.set(tuple, (newDist.get(tuple) || 0) + prob * probPerPermutation);
      }
    }

    this.distributions.set(hypothesisId, newDist);
  }

  /**
   * Generate all permutations of an array
   */
  generatePermutations(arr) {
    if (arr.length === 0) return [[]];
    if (arr.length === 1) return [[arr[0]]];

    const result = [];
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
      const remainingPerms = this.generatePermutations(remaining);

      for (const perm of remainingPerms) {
        result.push([current, ...perm]);
      }
    }
    return result;
  }
}

/**
 * Main Bayesian tracker for hypothesis updating
 */
class BayesianTracker {
  /**
   * @param {Array<Object>} hypotheses - List of hypothesis objects
   *   Each: {id, sackAssignments: Map<sackPosition, distribution>}
   *   where distribution is {color: count, ...}
   * @param {Array<string>} colors - Possible ball colors (e.g., ['red', 'blue', 'green'])
   */
  constructor(hypotheses, colors) {

    this.hypotheses = hypotheses;
    this.colors = colors;

    // Uniform prior over hypotheses
    this.posteriors = new Map();
    for (const h of hypotheses) {
      this.posteriors.set(h.id, 1.0 / hypotheses.length);
    }


    // Log hypothesis structure
    for (const h of hypotheses) {
      for (const [sackId, dist] of h.sackAssignments.entries()) {
      }
    }

    // Independence groups (factorized state representation)
    this.groups = [];

    // Ball tracking
    this.ballToGroup = new Map(); // ballId -> {groupIndex, ballIndex}
    this.ballOrigins = new Map(); // ballId -> sackPosition
    this.ballToSack = new Map();  // ballId -> sackId
  }

  /**
   * Called when a ball is spawned from a sack
   * Creates a new singleton independence group
   */
  onBallSpawned(ballId, sackPosition) {

    // Create new singleton independence group
    const group = new IndependenceGroup([ballId], this.colors);

    // Initialize distribution from sack under each hypothesis
    let distributionsFound = 0;
    for (const hypothesis of this.hypotheses) {
      const distribution = hypothesis.sackAssignments.get(sackPosition);
      if (!distribution) {
        throw new Error(`[Bayesian ERROR] No distribution for sack position "${sackPosition}" (type: ${typeof sackPosition}) in hypothesis ${hypothesis.id}. Available sack IDs: ${Array.from(hypothesis.sackAssignments.keys()).join(', ')}. This indicates sack ID mismatch between simulation and hypothesis space, or string vs number type issues.`);
      }

      distributionsFound++;

      // Normalize distribution to probabilities
      const total = Object.values(distribution).reduce((a, b) => a + b, 0);
      const tupleMap = new Map();
      for (const [color, count] of Object.entries(distribution)) {
        tupleMap.set(color, count / total);
      }

      group.setDistribution(hypothesis.id, tupleMap);
    }

    if (distributionsFound === 0) {
      throw new Error(`[Bayesian ERROR] Ball ${ballId} spawned but NO distributions were found for sack "${sackPosition}". This indicates sack ID mismatch or hypothesis generation failure.`);
    }


    const groupIndex = this.groups.length;
    this.groups.push(group);
    this.ballToGroup.set(ballId, {groupIndex, ballIndex: 0});
    this.ballOrigins.set(ballId, sackPosition);
    this.ballToSack.set(ballId, sackPosition); // sackPosition is actually sackId from simulation
  }

  /**
   * Called when a ball is observed
   * Conditions all distributions and updates hypothesis posteriors
   */
  onObservation(ballId, observedColor) {
    // If color is null (obscured by plex glass), we don't update based on color
    // We still track the ball, but no Bayesian update occurs
    if (observedColor === null) {
      return;
    }


    const location = this.ballToGroup.get(ballId);
    if (!location) {
      throw new Error(`[Bayesian ERROR] Ball ${ballId} not tracked for observation. This indicates ball creation outside normal flow or observation before spawn tracking. Tracked balls: ${Array.from(this.ballToGroup.keys()).join(', ')}`);
    }

    const group = this.groups[location.groupIndex];

    // Store priors for comparison
    const priorsBefore = new Map(this.posteriors);

    // Condition each hypothesis's distribution and collect likelihoods
    const likelihoods = [];
    for (const hypothesis of this.hypotheses) {
      const dist = group.distributions.get(hypothesis.id);
      if (!dist) {
        throw new Error(`[Bayesian ERROR] No distribution for hypothesis ${hypothesis.id} in group ${location.groupIndex}. This indicates desynchronization between group creation and hypothesis list, or memory corruption. Group has distributions for: ${Array.from(group.distributions.keys()).join(', ')}`);
      }


      // Show the distribution before conditioning
      const distEntries = Array.from(dist.entries()).slice(0, 5);

      const obsProb = group.conditionOnObservation(
        hypothesis.id,
        location.ballIndex,
        observedColor
      );

      likelihoods.push({id: hypothesis.id, likelihood: obsProb});

      // Bayes update: P(h | obs) ∝ P(obs | h) * P(h)
      const prior = this.posteriors.get(hypothesis.id);
      const unnormalized = obsProb * prior;
      this.posteriors.set(hypothesis.id, unnormalized);
    }

    // Normalize posteriors
    this.normalizePosteriors();


    // Debug: Check if posteriors actually changed
    let changed = false;
    let maxDiff = 0;
    for (const [id, posteriorAfter] of this.posteriors.entries()) {
      const posteriorBefore = priorsBefore.get(id);
      const diff = Math.abs(posteriorAfter - posteriorBefore);
      if (diff > 0.001) {
        changed = true;
        maxDiff = Math.max(maxDiff, diff);
      }
    }

    if (!changed) {
    } else {
    }
  }

  /**
   * Called when a ball goes through a filter's non-match output
   * We learn that the ball's color is NOT the excluded color
   */
  onFilterExclusion(ballId, excludedColor) {

    const location = this.ballToGroup.get(ballId);
    if (!location) {
      throw new Error(`[Bayesian ERROR] Ball ${ballId} not tracked for filter exclusion. Tracked balls: ${Array.from(this.ballToGroup.keys()).join(', ')}`);
    }

    const group = this.groups[location.groupIndex];

    // Store priors for comparison
    const priorsBefore = new Map(this.posteriors);

    // For each hypothesis, condition on "color ≠ excludedColor"
    for (const hypothesis of this.hypotheses) {
      const dist = group.distributions.get(hypothesis.id);
      if (!dist) {
        throw new Error(`[Bayesian ERROR] No distribution for hypothesis ${hypothesis.id} in group ${location.groupIndex}`);
      }

      // Calculate P(color ≠ excludedColor | hypothesis)
      let probNotExcluded = 0;
      const newDist = new Map();

      for (const [colorTuple, prob] of dist.entries()) {
        const ballColor = colorTuple.split(',')[location.ballIndex];

        if (ballColor !== excludedColor) {
          // This color assignment is consistent with exclusion
          newDist.set(colorTuple, prob);
          probNotExcluded += prob;
        }
        // If ballColor === excludedColor, we don't add it (probability becomes 0)
      }

      // Normalize the new distribution
      if (probNotExcluded > 0) {
        for (const [colorTuple, prob] of newDist.entries()) {
          newDist.set(colorTuple, prob / probNotExcluded);
        }
      }

      // Update the group's distribution for this hypothesis
      dist.clear();
      for (const [colorTuple, prob] of newDist.entries()) {
        dist.set(colorTuple, prob);
      }


      // Bayes update: P(h | observation) ∝ P(observation | h) * P(h)
      const prior = this.posteriors.get(hypothesis.id);
      const unnormalized = probNotExcluded * prior;
      this.posteriors.set(hypothesis.id, unnormalized);
    }

    // Normalize posteriors
    this.normalizePosteriors();

  }

  /**
   * Called when two balls go through a shuffler
   * Merges their independence groups and applies shuffle operation
   */
  onShuffle(ball1Id, ball2Id) {

    const loc1 = this.ballToGroup.get(ball1Id);
    const loc2 = this.ballToGroup.get(ball2Id);

    if (!loc1 || !loc2) {
      return;
    }


    // If balls are in different groups, merge first
    if (loc1.groupIndex !== loc2.groupIndex) {
      const group1 = this.groups[loc1.groupIndex];
      const group2 = this.groups[loc2.groupIndex];

      const mergedGroup = IndependenceGroup.merge(group1, group2, this.colors);

      // Add merged group
      const newGroupIndex = this.groups.length;
      this.groups.push(mergedGroup);

      // Update ball locations
      for (let i = 0; i < group1.ballIds.length; i++) {
        this.ballToGroup.set(group1.ballIds[i], {groupIndex: newGroupIndex, ballIndex: i});
      }
      for (let i = 0; i < group2.ballIds.length; i++) {
        this.ballToGroup.set(group2.ballIds[i], {
          groupIndex: newGroupIndex,
          ballIndex: group1.ballIds.length + i
        });
      }

      // Update locations for subsequent shuffle
      loc1.groupIndex = newGroupIndex;
      loc1.ballIndex = loc1.ballIndex; // stays same
      loc2.groupIndex = newGroupIndex;
      loc2.ballIndex = group1.ballIds.length + loc2.ballIndex;
    }

    // Apply shuffle operation to the group
    const group = this.groups[loc1.groupIndex];

    for (const hypothesis of this.hypotheses) {
      group.applyShuffle(hypothesis.id, loc1.ballIndex, loc2.ballIndex);
    }
  }

  /**
   * Called when N balls go through a shuffler
   * Merges their independence groups and applies N-way shuffle operation
   */
  onShuffleMultiple(ballIds) {
    if (ballIds.length < 2) {
      throw new Error(`onShuffleMultiple requires at least 2 balls, got ${ballIds.length}`);
    }


    // Find locations for all balls
    const locations = ballIds.map(ballId => {
      const loc = this.ballToGroup.get(ballId);
      if (!loc) {
        throw new Error(`[Bayesian ERROR] Ball ${ballId} not tracked for shuffle. This indicates ball tracking desynchronization. Tracked balls: ${Array.from(this.ballToGroup.keys()).join(', ')}`);
      }
      return {ballId, ...loc};
    });

    // Find all unique group indices
    const uniqueGroupIndices = [...new Set(locations.map(loc => loc.groupIndex))];

    // If balls are in different groups, merge them all
    let targetGroupIndex;
    if (uniqueGroupIndices.length > 1) {

      // Start with first group
      let mergedGroup = this.groups[uniqueGroupIndices[0]];

      // Merge in each additional group
      for (let i = 1; i < uniqueGroupIndices.length; i++) {
        const groupToMerge = this.groups[uniqueGroupIndices[i]];
        mergedGroup = IndependenceGroup.merge(mergedGroup, groupToMerge, this.colors);
      }


      // Add merged group
      targetGroupIndex = this.groups.length;
      this.groups.push(mergedGroup);

      // Update all ball locations to point to new merged group
      for (let i = 0; i < mergedGroup.ballIds.length; i++) {
        this.ballToGroup.set(mergedGroup.ballIds[i], {groupIndex: targetGroupIndex, ballIndex: i});
      }
    } else {
      // All balls already in same group
      targetGroupIndex = uniqueGroupIndices[0];
    }

    // Get updated locations after potential merge
    const ballIndices = ballIds.map(ballId => {
      const loc = this.ballToGroup.get(ballId);
      return loc.ballIndex;
    });

    // Apply N-way shuffle operation to the group
    const group = this.groups[targetGroupIndex];

    for (const hypothesis of this.hypotheses) {
      group.applyShuffleMultiple(hypothesis.id, ballIndices);
    }
  }

  /**
   * Called when a ball is collected/removed from the board
   * Marginalizes it out from its independence group
   */
  onBallCollected(ballId) {
    const location = this.ballToGroup.get(ballId);
    if (!location) return;

    const group = this.groups[location.groupIndex];

    if (group.ballIds.length === 1) {
      // Last ball in group - just mark group as null
      this.groups[location.groupIndex] = null;
    } else {
      // Marginalize out this ball
      const newGroup = group.marginalize(location.ballIndex);
      this.groups[location.groupIndex] = newGroup;

      // Update ball indices for remaining balls
      for (let i = 0; i < newGroup.ballIds.length; i++) {
        const remainingBallId = newGroup.ballIds[i];
        this.ballToGroup.set(remainingBallId, {
          groupIndex: location.groupIndex,
          ballIndex: i
        });
      }
    }

    this.ballToGroup.delete(ballId);
    this.ballOrigins.delete(ballId);
  }

  /**
   * Normalize posterior probabilities to sum to 1
   */
  normalizePosteriors() {
    let total = 0;
    for (const prob of this.posteriors.values()) {
      total += prob;
    }

    if (total > 0) {
      for (const [id, prob] of this.posteriors.entries()) {
        this.posteriors.set(id, prob / total);
      }
    } else {
      // All hypotheses have zero probability - this means the observations are impossible
      throw new Error(
        'All hypotheses have zero probability after normalization. ' +
        'This indicates that the observed data is impossible under all hypotheses. ' +
        'Check your level setup: the observations may be inconsistent with the hypothesis definitions.'
      );
    }
  }

  /**
   * Get current posterior probabilities over hypotheses
   */
  getPosteriors() {
    return new Map(this.posteriors);
  }

  /**
   * Get marginal posteriors for each sack position
   * Returns: Map<sackPosition, Map<distributionKey, probability>>
   */
  getSackPosteriors() {

    const sackPositions = new Set();
    for (const h of this.hypotheses) {
      for (const pos of h.sackAssignments.keys()) {
        sackPositions.add(pos);
      }
    }


    const result = new Map();

    for (const pos of sackPositions) {
      const distProbs = new Map();


      for (const hypothesis of this.hypotheses) {
        const dist = hypothesis.sackAssignments.get(pos);
        const distKey = JSON.stringify(dist);
        const posterior = this.posteriors.get(hypothesis.id);

        const currentProb = distProbs.get(distKey) || 0;
        distProbs.set(distKey, currentProb + posterior);

      }

      result.set(pos, distProbs);

      for (const [distKey, prob] of distProbs.entries()) {
      }

      // Debug: Check if all posteriors are roughly uniform (indicating no updating happened)
      const posteriorValues = Array.from(distProbs.values());
      const allSimilar = posteriorValues.every(p => Math.abs(p - posteriorValues[0]) < 0.01);
      if (allSimilar && posteriorValues.length > 1) {
      }
    }

    return result;
  }

  /**
   * Ball duplicated - add duplicate to same independence group as original
   * Duplicated balls have identical distributions per hypothesis
   *
   * @param {string} originalBallId - ID of original ball
   * @param {string} duplicatedBallId - ID of newly created duplicate ball
   */
  onBallDuplicated(originalBallId, duplicatedBallId) {
    const loc = this.ballToGroup.get(originalBallId);
    if (!loc) {
      console.error(`Cannot duplicate ball ${originalBallId}: not tracked`);
      return;
    }

    const group = this.groups[loc.groupIndex];
    const originalIndex = loc.ballIndex;

    // Add duplicated ball to same group
    const duplicateIndex = group.ballIds.length;
    group.ballIds.push(duplicatedBallId);

    // Track new ball
    this.ballToGroup.set(duplicatedBallId, {
      groupIndex: loc.groupIndex,
      ballIndex: duplicateIndex
    });

    // Also track to same sack
    const sackId = this.ballToSack.get(originalBallId);
    if (sackId) {
      this.ballToSack.set(duplicatedBallId, sackId);
    } else {
      console.warn(
        `Duplicator: Ball ${duplicatedBallId} duplicated from ${originalBallId} has no sack association. ` +
        `This may happen if the original ball was created outside normal flow (e.g., mid-shuffler).`
      );
    }

    // Extend distributions: duplicate has same marginal as original
    for (const [hypothesisId, distribution] of group.distributions.entries()) {
      const newDistribution = new Map();

      for (const [colorTuple, prob] of distribution.entries()) {
        const colors = colorTuple.split(',');
        const originalColor = colors[originalIndex];

        // Append duplicate's color (same as original)
        const newColors = [...colors, originalColor];
        const newTuple = newColors.join(',');

        newDistribution.set(newTuple, prob);
      }

      group.distributions.set(hypothesisId, newDistribution);
    }
  }

  /**
   * Reset tracker to uniform prior (for reset/new game)
   */
  reset() {
    // Reset to uniform prior over hypotheses
    this.posteriors.clear();
    for (const h of this.hypotheses) {
      this.posteriors.set(h.id, 1.0 / this.hypotheses.length);
    }

    // Clear all independence groups
    this.groups = [];

    // Clear ball tracking
    this.ballToGroup.clear();
    this.ballToSack.clear();
  }
}
