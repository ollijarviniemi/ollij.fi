/**
 * Hypothesis Playback System - Runtime execution of hypothesis scripts
 *
 * PURPOSE: This file is used by play.html for executing hypothesis scripts during gameplay/playback.
 * It provides the DSL (Domain-Specific Language) for defining permutation-based hypothesis spaces
 * at runtime and generates all possible hypotheses for Bayesian inference.
 *
 * USAGE: play.html only (NOT used by editor.html - see editor/hypothesis-editor.js for that)
 *
 * KEY FEATURES:
 * - List.select() returns selector objects with _sackId property
 * - Supports schedule() function for sampling schedule
 * - Exports executeHypothesisScript() function
 * - Generates full hypothesis space with componentAssignments
 *
 * Example usage:
 *   const list = new List();
 *   list.define([
 *     {red: 70, blue: 30},
 *     {red: 30, blue: 70}
 *   ]);
 *   list.permute();
 *   export const sackA = list.select(0).forBetting();
 *   export const sackB = list.select(1);
 *   schedule([[sackA, 0], [sackB, 1]]);
 */

/**
 * Create a List constructor that records animation instructions
 */
function createListConstructorWithAnimation(animationInstructions) {
  return class List {
    constructor() {
      this.templates = [];
      this.isPermuted = false;
      this._id = `list_${Math.random().toString(36).substr(2, 9)}`;
      this._animationInstructions = animationInstructions;
    }

    /**
     * Define the templates in this list
     * @param {Array<Object>} templates - Array of distribution objects like {red: 70, blue: 30}
     */
    define(templates) {
      this.templates = templates;

      // Record animation instruction
      this._animationInstructions.push({
        phase: 'define',
        listId: this._id,
        distributions: templates
      });

      return this;
    }

    /**
     * Mark this list as permuted (all orderings equally likely)
     */
    permute() {
      this.isPermuted = true;

      // Record animation instruction
      this._animationInstructions.push({
        phase: 'permute',
        listId: this._id
      });

      return this;
    }

    /**
     * Select a specific index from this list
     * Returns a selector object that will be resolved during hypothesis generation
     * @param {number} index - Which position in the permuted list to select
     */
    select(index) {
      const selector = {
        _type: 'selection',
        _listId: this._id,
        _index: index,
        _list: this,
        _forBetting: false,
        _sackId: null  // Will be set during export processing
      };

      // Add forBetting() method to selector
      selector.forBetting = function() {
        this._forBetting = true;
        return this;
      };

      return selector;
    }
  };
}

/**
 * Execute a hypothesis script and generate all hypotheses
 *
 * @param {string} scriptCode - The script code to execute
 * @returns {Object} - {lists: Map, hypotheses: Array, sackTemplates: Object, animationInstructions: Array, ballCount: number, samplingSchedule: Array}
 */
function executeHypothesisScript(scriptCode) {
  // Transform ES6 export syntax to CommonJS-style exports
  // Convert: export const sackA = ... → const sackA = exports.sackA = ...
  // This creates both a local variable and an export property
  const transformedCode = scriptCode.replace(/export\s+const\s+(\w+)\s*=/g, 'const $1 = exports.$1 =');

  // Track animation instructions during execution
  const animationInstructions = [];

  // Track sampling schedule (store raw schedule during execution)
  let rawSchedule = null;

  // Parse script to extract exports
  const exports = {};
  const List_constructor = createListConstructorWithAnimation(animationInstructions);

  // Create helper function for sampling schedule
  // Store raw schedule with selector references - will resolve sack IDs later
  const schedule = function(scheduleArray) {
    rawSchedule = scheduleArray;
  };

  // Create execution context
  const contextCode = `
    const List = List_constructor;
    const schedule = _schedule;
    ${transformedCode}
    return exports;
  `;

  // Execute script
  const scriptFunction = new Function('List_constructor', '_schedule', 'exports', contextCode);
  const result = scriptFunction(List_constructor, schedule, exports);

  // Extract lists and selections
  const lists = new Map();
  const selections = new Map(); // sackId -> {listId, index}
  let bettingSack = null; // Track which sack is marked for betting

  Object.entries(result).forEach(([exportName, value]) => {
    if (value && value._type === 'selection') {
      const list = value._list;

      // Add sackId to selector for schedule() function
      value._sackId = exportName;

      // Register list
      if (!lists.has(list._id)) {
        lists.set(list._id, {
          id: list._id,
          templates: list.templates,
          isPermuted: list.isPermuted
        });
      }

      // Register selection
      selections.set(exportName, {
        listId: list._id,
        index: value._index
      });

      // Track betting designation
      if (value._forBetting) {
        if (bettingSack !== null) {
          throw new Error(`Multiple sacks marked for betting: ${bettingSack} and ${exportName}. Only one sack can be marked with .forBetting()`);
        }
        bettingSack = exportName;
      }

      // Record animation instruction for select
      animationInstructions.push({
        phase: 'select',
        listId: list._id,
        templateId: exportName,
        index: value._index
      });
    }
  });

  // Generate all hypotheses
  const hypotheses = generatePermutationHypotheses(lists, selections);

  // Create sackTemplates for compatibility
  const sackTemplates = {};
  selections.forEach((selection, sackId) => {
    const list = lists.get(selection.listId);
    sackTemplates[sackId] = {
      process: {
        listId: selection.listId,
        selectedIndex: selection.index
      },
      // No distribution - represents uncertainty over hypothesis space
      distribution: null
    };
  });

  // Resolve sampling schedule now that we have sack IDs
  let samplingSchedule = null;
  if (rawSchedule) {
    samplingSchedule = rawSchedule.map(entry => {
      const [sackRef, time] = entry;

      // Get sack ID from selector reference
      let sackId;
      if (typeof sackRef === 'string') {
        sackId = sackRef;
      } else if (sackRef && sackRef._sackId) {
        sackId = sackRef._sackId;
      } else {
        throw new Error('Invalid sack reference in schedule. Must be a sack selector or string ID.');
      }

      return {sackId, time};
    });
  }

  // Derive ball count from schedule (or default to 10 if no schedule)
  const ballCount = samplingSchedule ? samplingSchedule.length : 10;

  return {
    lists: lists,
    hypotheses: hypotheses,
    sackTemplates: sackTemplates,
    selections: selections,
    animationInstructions: animationInstructions,
    bettingSack: bettingSack,  // Export name of sack marked for betting (or null)
    ballCount: ballCount,  // Number of balls to sample (derived from schedule or default)
    samplingSchedule: samplingSchedule  // Schedule array or null
  };
}

/**
 * Generate all permutation hypotheses from lists and selections
 */
function generatePermutationHypotheses(lists, selections) {
  const hypotheses = [];
  let nextId = 0;

  // For each list that needs permutation, generate all orderings
  const listPermutations = new Map();

  lists.forEach((list, listId) => {
    if (list.isPermuted) {
      // Generate all permutations of templates
      const perms = generatePermutations(list.templates);
      listPermutations.set(listId, perms);
    } else {
      // Single ordering (identity)
      listPermutations.set(listId, [list.templates]);
    }
  });

  // Generate Cartesian product of all list permutations
  const listIds = Array.from(lists.keys());

  function generateHypothesesRecursive(listIndex, currentPermutations) {
    if (listIndex === listIds.length) {
      // Complete hypothesis - assign sacks based on selections
      const componentAssignments = {};

      selections.forEach((selection, sackId) => {
        const listId = selection.listId;
        const index = selection.index;
        const permutation = currentPermutations.get(listId);
        componentAssignments[sackId] = permutation[index];
      });

      hypotheses.push({
        id: `h${nextId++}`,
        componentAssignments: componentAssignments,
        probability: 1.0 // Uniform prior (will be normalized)
      });
      return;
    }

    const listId = listIds[listIndex];
    const permutations = listPermutations.get(listId);

    // Try each permutation for this list
    permutations.forEach(perm => {
      const newPermutations = new Map(currentPermutations);
      newPermutations.set(listId, perm);
      generateHypothesesRecursive(listIndex + 1, newPermutations);
    });
  }

  generateHypothesesRecursive(0, new Map());

  // Normalize probabilities
  const totalProb = hypotheses.length;
  hypotheses.forEach(h => {
    h.probability = 1.0 / totalProb;
  });

  return hypotheses;
}

/**
 * Generate all permutations of an array
 */
function generatePermutations(array) {
  if (array.length === 0) return [[]];
  if (array.length === 1) return [[array[0]]];

  const permutations = [];

  for (let i = 0; i < array.length; i++) {
    const current = array[i];
    const remaining = [...array.slice(0, i), ...array.slice(i + 1)];
    const remainingPerms = generatePermutations(remaining);

    remainingPerms.forEach(perm => {
      permutations.push([current, ...perm]);
    });
  }

  return permutations;
}
