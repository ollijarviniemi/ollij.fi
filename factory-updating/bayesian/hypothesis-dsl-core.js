/**
 * Hypothesis DSL Core - Shared List class implementation
 *
 * PURPOSE: Single source of truth for the List class used by BOTH editor and playback.
 * This file contains the core DSL logic that is common to both use cases.
 *
 * DO NOT DUPLICATE THIS LOGIC IN OTHER FILES!
 *
 * USAGE:
 * - hypothesis-editor-v2.js imports this and wraps it for editor-specific needs
 * - hypothesis-playback-v2.js imports this and wraps it for playback-specific needs
 *
 * KEY DESIGN: The List class is parameterized via a config object that allows
 * wrappers to customize behavior while keeping the core logic unified.
 *
 * CRITICAL FIX: select() adds animation instructions IMMEDIATELY (not later).
 * This ensures correct instruction ordering: define → permute → select → select
 * for each list, rather than all define/permute then all selects.
 */

// VERSION MARKER

/**
 * Create a List constructor with configurable behavior
 *
 * @param {Object} config - Configuration object
 * @param {Array} config.animationInstructions - Shared array to push animation instructions to
 * @param {Function} config.generateListId - Function that returns a unique list ID
 * @param {Function} config.onDefine - Optional callback after define (list, distributions)
 * @param {Function} config.onPermute - Optional callback after permute (list)
 * @param {Function} config.onSelect - Optional callback after select (list, index, distribution, instruction)
 * @param {Function} config.wrapSelectReturn - Function to wrap the return value of select()
 * @returns {Class} List constructor
 */
function createListClass(config) {
  const {
    animationInstructions,
    generateListId,
    onDefine = null,
    onPermute = null,
    onSelect = null,
    wrapSelectReturn = (dist) => dist  // Default: return distribution as-is
  } = config;

  if (!animationInstructions || !Array.isArray(animationInstructions)) {
    throw new Error('createListClass requires animationInstructions array');
  }
  if (!generateListId || typeof generateListId !== 'function') {
    throw new Error('createListClass requires generateListId function');
  }

  class List {
    constructor() {
      this.listId = generateListId();
      this.distributions = [];
      this.currentOrder = [];  // Indices after permutation (used by editor)
      this.templates = [];     // Templates array (used by playback)
      this.isPermuted = false;
      this.selections = [];    // Track selections for both editor and playback

    }

    /**
     * Define distributions for this list
     * @param {Array<Object>} distributions - Array of distribution objects like {red: 70, blue: 30}
     */
    define(distributions) {

      if (!Array.isArray(distributions)) {
        throw new Error('List.define() requires an array of distributions');
      }

      // Store distributions (deep copy for editor, reference for playback)
      this.distributions = JSON.parse(JSON.stringify(distributions));
      this.templates = distributions; // Also store as templates for playback compatibility
      this.currentOrder = distributions.map((_, i) => i); // [0, 1, 2, ...]

      // Add animation instruction
      const defineInstruction = {
        phase: 'define',
        listId: this.listId,
        distributions: distributions
      };
      animationInstructions.push(defineInstruction);

      // Call optional callback
      if (onDefine) {
        onDefine(this, distributions);
      }

      return this;
    }

    /**
     * Permute the list (Fisher-Yates shuffle)
     */
    permute() {

      if (this.distributions.length === 0) {
        throw new Error('List.permute() called before define()');
      }

      // Fisher-Yates shuffle of indices
      for (let i = this.currentOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.currentOrder[i], this.currentOrder[j]] = [this.currentOrder[j], this.currentOrder[i]];
      }

      this.isPermuted = true;

      // Add animation instruction
      const permuteInstruction = {
        phase: 'permute',
        listId: this.listId
      };
      animationInstructions.push(permuteInstruction);

      // Call optional callback
      if (onPermute) {
        onPermute(this);
      }

      return this;
    }

    /**
     * Select distribution at index (after permutation)
     *
     * CRITICAL: This adds the select animation instruction IMMEDIATELY when called,
     * not later during export processing. This ensures animation instructions appear
     * in the correct order (define → permute → select for each list).
     *
     * @param {number} index - Which position in the permuted list to select
     */
    select(index) {

      if (this.distributions.length === 0) {
        throw new Error('List.select() called before define()');
      }
      if (index < 0 || index >= this.distributions.length) {
        throw new Error(`List.select() index ${index} out of bounds [0, ${this.distributions.length - 1}]`);
      }

      // Get actual distribution (after permutation)
      const actualIndex = this.currentOrder[index];
      const distribution = this.distributions[actualIndex];

      // Track selection
      this.selections.push({ index, actualIndex, distribution });

      // Add select animation instruction IMMEDIATELY (with placeholder templateId)
      // This is THE FIX that ensures correct instruction ordering
      const selectInstruction = {
        phase: 'select',
        listId: this.listId,
        templateId: null,  // Will be filled by wrapper's export handler
        index: index,
        __placeholderForExport: true  // Mark for export handler to update
      };
      animationInstructions.push(selectInstruction);

      // Store reference to the instruction so export handler can update it
      distribution.__selectInstruction = selectInstruction;
      distribution.__listInstance = this;  // Store list reference for wrapper
      distribution.__selectIndex = index;  // Store index for wrapper

      // Call optional callback (wrapper can modify distribution or instruction)
      if (onSelect) {
        onSelect(this, index, distribution, selectInstruction);
      }

      // Wrap return value using wrapper's function
      const returnValue = wrapSelectReturn(distribution, this, index, selectInstruction);

      return returnValue;
    }
  }

  return List;
}

/**
 * Helper function: Generate sequential list IDs (for editor)
 */
function createSequentialListIdGenerator() {
  let counter = 0;
  return function() {
    return `list${counter++}`;
  };
}

/**
 * Helper function: Generate random list IDs (for playback)
 */
function createRandomListIdGenerator() {
  return function() {
    return `list_${Math.random().toString(36).substr(2, 9)}`;
  };
}

/**
 * Helper function: Update a select instruction's templateId
 * This should be called by the wrapper's export handler after the sack is named
 */
function updateSelectInstructionTemplateId(distribution, templateId) {
  if (distribution.__selectInstruction) {
    distribution.__selectInstruction.templateId = templateId;
    delete distribution.__selectInstruction.__placeholderForExport;
    return true;
  } else {
    console.error(`[DSL-Core] ERROR: No __selectInstruction found on distribution!`);
    return false;
  }
}

// Export functions for use by wrappers
if (typeof window !== 'undefined') {
  window.HypothesisDSLCore = {
    createListClass,
    createSequentialListIdGenerator,
    createRandomListIdGenerator,
    updateSelectInstructionTemplateId
  };
}
