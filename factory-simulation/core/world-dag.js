/**
 * World DAG - Directed Acyclic Graph of branching world states
 *
 * Used to visualize all possible outcomes of a probabilistic simulation.
 * Supports merging when two different paths lead to identical states.
 */

/**
 * Hash a simulation state for merge detection
 * Two states hash the same if they would be indistinguishable going forward
 */
function hashSimulationState(snapshot) {
  // Sort balls by position for consistent hashing
  const ballsStr = snapshot.balls
    .map(b => `${b.id}:${Math.round(b.x * 100)},${Math.round(b.y * 100)},${b.color},${b.componentId || ''},${b.componentState || ''}`)
    .sort()
    .join('|');

  // Sack contents (sorted)
  const sacksStr = Object.entries(snapshot.sackContents || {})
    .map(([id, contents]) => `${id}:${JSON.stringify(contents)}`)
    .sort()
    .join('|');

  // Component states (for shufflers, splitters with pending balls)
  const componentsStr = Object.entries(snapshot.componentStates || {})
    .map(([id, state]) => `${id}:${JSON.stringify(state)}`)
    .sort()
    .join('|');

  // Combine and hash
  const combined = `${snapshot.time}||${ballsStr}||${sacksStr}||${componentsStr}`;
  return simpleHash(combined);
}

/**
 * Simple string hash function
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

/**
 * Edge between two WorldNodes
 */
class WorldEdge {
  constructor(from, to, probability, outcome) {
    this.from = from;           // WorldNode
    this.to = to;               // WorldNode
    this.probability = probability;  // P(this transition | from node)
    this.outcome = outcome;     // Description: "red ball drawn", "went left", etc.

    // Flow probability = from.probability * this.probability
    // (computed during layout)
    this.flowProbability = 0;
  }
}

/**
 * Node in the world DAG
 * Represents a distinct simulation state at a point in time
 */
class WorldNode {
  constructor(id, timeStep, probability, snapshot, stateHash) {
    this.id = id;
    this.timeStep = timeStep;           // Discrete time step (frame index)
    this.probability = probability;     // Total probability of reaching this state
    this.snapshot = snapshot;           // Simulation state snapshot
    this.stateHash = stateHash;         // For merge detection

    this.incomingEdges = [];            // Edges from parent(s)
    this.outgoingEdges = [];            // Edges to children (computed lazily)

    // Layout info (computed by dag-layout.js)
    this.x = 0;                         // Horizontal position [0, 1]
    this.width = 0;                     // Width proportional to probability
    this.y = 0;                         // Vertical position (pixels)

    // Rendering (lazy)
    this._frameRendered = false;
    this._frameCanvas = null;

    // For lazy child computation
    this._childrenComputed = false;

    // Time scale for variable-speed rendering (future feature)
    this.timeScale = 1.0;
  }

  /**
   * Add an incoming edge (from parent)
   */
  addIncomingEdge(edge) {
    this.incomingEdges.push(edge);
    // Accumulate probability from all incoming paths
    this.probability += edge.flowProbability;
  }

  /**
   * Check if children have been computed
   */
  hasComputedChildren() {
    return this._childrenComputed;
  }

  /**
   * Mark children as computed
   */
  markChildrenComputed() {
    this._childrenComputed = true;
  }
}

/**
 * The World DAG structure
 * Contains all possible world states organized by time step
 */
class WorldDAG {
  constructor() {
    this.nodes = new Map();           // id -> WorldNode
    this.nodesByTimeStep = new Map(); // timeStep -> WorldNode[]
    this.nodesByHash = new Map();     // stateHash -> WorldNode (for merge detection)
    this.root = null;
    this.nextNodeId = 0;
    this.maxTimeStep = 0;

    // Statistics
    this.totalNodes = 0;
    this.mergeCount = 0;
  }

  /**
   * Create the root node from initial simulation state
   */
  createRoot(snapshot) {
    const hash = hashSimulationState(snapshot);
    const node = new WorldNode(
      `node_${this.nextNodeId++}`,
      0,                    // timeStep
      1.0,                  // probability (100% at root)
      snapshot,
      hash
    );

    this.root = node;
    this.addNode(node);
    return node;
  }

  /**
   * Add a node to the DAG
   */
  addNode(node) {
    this.nodes.set(node.id, node);

    // Index by time step
    if (!this.nodesByTimeStep.has(node.timeStep)) {
      this.nodesByTimeStep.set(node.timeStep, []);
    }
    this.nodesByTimeStep.get(node.timeStep).push(node);

    // Index by hash (for merge detection)
    this.nodesByHash.set(node.stateHash, node);

    this.maxTimeStep = Math.max(this.maxTimeStep, node.timeStep);
    this.totalNodes++;
  }

  /**
   * Create a child node or merge with existing
   * @param {WorldNode} parent - Parent node
   * @param {Object} snapshot - Child simulation state
   * @param {number} probability - P(this transition | parent)
   * @param {string} outcome - Description of what happened
   * @returns {WorldNode} The child node (new or existing)
   */
  createOrMergeChild(parent, snapshot, probability, outcome) {
    const timeStep = parent.timeStep + 1;
    const hash = hashSimulationState(snapshot);

    // Calculate flow probability
    const flowProbability = parent.probability * probability;

    // Design decision: always create new nodes, no merging of identical states.
    // This keeps the DAG a proper tree structure for simpler probability flow.

    // Create new node
    const node = new WorldNode(
      `node_${this.nextNodeId++}`,
      timeStep,
      flowProbability,
      snapshot,
      hash
    );

    // Create edge
    const edge = new WorldEdge(parent, node, probability, outcome);
    edge.flowProbability = flowProbability;

    parent.outgoingEdges.push(edge);
    node.incomingEdges.push(edge);

    this.addNode(node);
    return node;
  }

  /**
   * Get all nodes at a given time step
   */
  getNodesAtTimeStep(timeStep) {
    return this.nodesByTimeStep.get(timeStep) || [];
  }

  /**
   * Get nodes in a time range (for viewport culling)
   */
  getNodesInRange(minTimeStep, maxTimeStep) {
    const nodes = [];
    for (let t = minTimeStep; t <= maxTimeStep; t++) {
      const nodesAtT = this.nodesByTimeStep.get(t);
      if (nodesAtT) {
        nodes.push(...nodesAtT);
      }
    }
    return nodes;
  }

  /**
   * Get all edges between two consecutive time steps
   */
  getEdgesBetween(timeStep1, timeStep2) {
    const edges = [];
    const nodesAtT1 = this.nodesByTimeStep.get(timeStep1) || [];

    for (const node of nodesAtT1) {
      for (const edge of node.outgoingEdges) {
        if (edge.to.timeStep === timeStep2) {
          edges.push(edge);
        }
      }
    }

    return edges;
  }

  /**
   * Compute layout for all nodes
   * Called after DAG is built
   */
  computeLayout(layoutEngine) {
    layoutEngine.layout(this);
  }

  /**
   * Get statistics about the DAG
   */
  getStats() {
    return {
      totalNodes: this.totalNodes,
      maxTimeStep: this.maxTimeStep,
      mergeCount: this.mergeCount,
      nodesByTimeStep: Array.from(this.nodesByTimeStep.entries())
        .map(([t, nodes]) => ({ timeStep: t, count: nodes.length }))
    };
  }
}

/**
 * Opacity function: probability -> opacity
 * Uses log scale to handle many orders of magnitude
 * Configurable and easy to swap out
 */
const OpacityFunction = {
  // Configuration
  minOpacity: 0.12,
  maxOpacity: 1.0,

  /**
   * Compute opacity from probability
   * @param {number} p - Probability of this world
   * @param {number} pMin - Minimum probability in the DAG (for scaling)
   * @param {number} pMax - Maximum probability in the DAG (for scaling)
   */
  compute(p, pMin, pMax) {
    if (pMax <= pMin) return this.maxOpacity;
    if (p <= 0) return this.minOpacity;

    // Log scale
    const logP = Math.log(p);
    const logMin = Math.log(Math.max(pMin, 1e-10));
    const logMax = Math.log(pMax);

    if (logMax <= logMin) return this.maxOpacity;

    const t = (logP - logMin) / (logMax - logMin);
    const clamped = Math.max(0, Math.min(1, t));

    return this.minOpacity + (this.maxOpacity - this.minOpacity) * clamped;
  }
};

// Export for browser
if (typeof window !== 'undefined') {
  window.WorldNode = WorldNode;
  window.WorldEdge = WorldEdge;
  window.WorldDAG = WorldDAG;
  window.OpacityFunction = OpacityFunction;
  window.hashSimulationState = hashSimulationState;
}
