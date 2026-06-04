/**
 * Hypothesis Builder
 *
 * Generates hypothesis space from structured specifications
 */

class HypothesisBuilder {
  constructor(spec) {
    this.spec = spec;
  }

  /**
   * Build hypothesis list from specification
   */
  build() {
    switch (this.spec.type) {
      case "independent":
        return this.buildIndependent();
      case "permutation":
        // New format: hypotheses are pre-generated from editor
        if (this.spec.hypotheses) {
          return this.spec.hypotheses;
        }
        // Old format: generate from components and distributions
        return this.buildPermutation();
      case "oddOneOut":
        return this.buildOddOneOut();
      default:
        throw new Error(`Unknown hypothesis spec type: ${this.spec.type}`);
    }
  }

  /**
   * Build independent alternatives (Cartesian product)
   */
  buildIndependent() {
    const componentIds = Object.keys(this.spec.components);
    const alternatives = componentIds.map(id => this.spec.components[id].alternatives);

    const hypotheses = [];

    this.cartesianProduct(alternatives, [], (combination) => {
      const params = {};
      componentIds.forEach((id, i) => {
        params[id] = {contents: combination[i]};
      });

      hypotheses.push({
        id: `h${hypotheses.length}`,
        params: params,
        label: this.generateLabel(componentIds, combination)
      });
    });

    return hypotheses;
  }

  /**
   * Build permutation (assign distributions to components)
   */
  buildPermutation() {
    const componentIds = this.spec.components;
    const distributions = this.spec.distributions;

    const hypotheses = [];

    this.permute(distributions, (perm) => {
      const params = {};
      componentIds.forEach((id, i) => {
        params[id] = {contents: perm[i]};
      });

      hypotheses.push({
        id: `h${hypotheses.length}`,
        params: params,
        label: this.generatePermutationLabel(componentIds, perm)
      });
    });

    return hypotheses;
  }

  /**
   * Build odd-one-out (N-1 components have uniform distribution, 1 is different)
   */
  buildOddOneOut() {
    const componentIds = this.spec.components;
    const uniform = this.spec.uniformDistribution;
    const oddAlternatives = this.spec.oddAlternatives;

    const hypotheses = [];

    // For each position of the odd one
    componentIds.forEach((oddId, oddIndex) => {
      // For each alternative for the odd one
      oddAlternatives.forEach(oddDist => {
        const params = {};
        componentIds.forEach((id, i) => {
          params[id] = {
            contents: i === oddIndex ? oddDist : uniform
          };
        });

        hypotheses.push({
          id: `h${hypotheses.length}`,
          params: params,
          label: `${oddId} is odd (${this.distToString(oddDist)})`
        });
      });
    });

    return hypotheses;
  }

  /**
   * Cartesian product helper
   */
  cartesianProduct(arrays, current, callback) {
    if (arrays.length === 0) {
      callback(current);
      return;
    }

    const [first, ...rest] = arrays;
    first.forEach(item => {
      this.cartesianProduct(rest, [...current, item], callback);
    });
  }

  /**
   * Permutation helper
   */
  permute(array, callback) {
    if (array.length === 0) {
      callback([]);
      return;
    }

    array.forEach((item, i) => {
      const rest = [...array.slice(0, i), ...array.slice(i + 1)];
      this.permute(rest, (perm) => {
        callback([item, ...perm]);
      });
    });
  }

  /**
   * Generate label for hypothesis
   */
  generateLabel(componentIds, combination) {
    return componentIds
      .map((id, i) => `${id}: ${this.distToString(combination[i])}`)
      .join(", ");
  }

  /**
   * Generate label for permutation
   */
  generatePermutationLabel(componentIds, permutation) {
    return componentIds
      .map((id, i) => `${id}: ${this.distToString(permutation[i])}`)
      .join(", ");
  }

  /**
   * Convert distribution to string
   */
  distToString(dist) {
    return Object.entries(dist)
      .map(([color, count]) => `${color[0].toUpperCase()}:${count}`)
      .join(",");
  }
}
