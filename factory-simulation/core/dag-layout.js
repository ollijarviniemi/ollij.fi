/**
 * DAG Layout Engine - Probability-Weighted Layout
 *
 * Each branch moves at its own pace based on probability:
 * - Frame height = baseHeight * probability
 * - Gap = baseGap * probability
 * - Width = baseWidth * probability
 *
 * This means lower-probability branches show more frames per vertical distance,
 * keeping them "temporally synced" with higher-probability branches.
 */

class DAGLayout {
  constructor(config = {}) {
    this.config = {
      baseFrameWidth: config.frameWidth || 400,
      baseFrameHeight: config.frameHeight || 100,
      baseGap: config.sankeyGap || 30,
      horizontalPadding: config.horizontalPadding || 10,
      minFrameHeight: config.minFrameHeight || 40,
      minGap: config.minGap || 10,
      ...config
    };
  }

  /**
   * Compute layout for entire DAG
   */
  layout(dag) {
    // Find probability range for opacity scaling
    const { pMin, pMax } = this.computeProbabilityRange(dag);
    dag.pMin = pMin;
    dag.pMax = pMax;

    // Assign X ranges (horizontal position based on ancestry)
    this.assignXRanges(dag);

    // Assign Y positions (probability-weighted frame heights)
    this.assignYPositions(dag);

    // Compute total dimensions
    this.computeTotalDimensions(dag);
  }

  /**
   * Compute min/max probability across all nodes
   */
  computeProbabilityRange(dag) {
    let pMin = 1;
    let pMax = 0;

    for (const node of dag.nodes.values()) {
      if (node.probability > 0) {
        pMin = Math.min(pMin, node.probability);
        pMax = Math.max(pMax, node.probability);
      }
    }

    return { pMin, pMax };
  }

  /**
   * Assign horizontal X ranges based on ancestry
   * Each node inherits and subdivides its parent's X range
   */
  assignXRanges(dag) {
    // Root gets full range [0, 1]
    dag.root.xStart = 0;
    dag.root.xEnd = 1;

    // Track which nodes have been assigned
    const assigned = new Set([dag.root.id]);

    // BFS to assign ranges to children
    const queue = [dag.root];

    while (queue.length > 0) {
      const node = queue.shift();

      if (node.outgoingEdges.length === 0) continue;

      // Get children and their flow probabilities
      const children = node.outgoingEdges.map(e => ({
        node: e.to,
        edge: e,
        flowProb: e.flowProbability
      }));

      // Sort children by flow probability (largest first, for left-to-right)
      children.sort((a, b) => b.flowProb - a.flowProb);

      // Calculate total flow probability for normalization
      const totalFlow = children.reduce((sum, c) => sum + c.flowProb, 0);

      // Assign X ranges proportionally
      let currentX = node.xStart;
      const parentWidth = node.xEnd - node.xStart;

      for (const child of children) {
        const childWidthRatio = child.flowProb / totalFlow;
        const childWidth = parentWidth * childWidthRatio;

        // Only assign if not already assigned (handles merges - first parent wins)
        if (!assigned.has(child.node.id)) {
          child.node.xStart = currentX;
          child.node.xEnd = currentX + childWidth;
          assigned.add(child.node.id);
          queue.push(child.node);
        }

        currentX += childWidth;
      }
    }
  }

  /**
   * Assign Y positions with probability-weighted frame heights
   * All children of a node start at the same Y position
   */
  assignYPositions(dag) {
    const { baseFrameHeight, baseGap, minFrameHeight, minGap } = this.config;

    // Root starts at Y = 0 with full height
    dag.root.y = 0;
    dag.root.frameHeight = baseFrameHeight;
    dag.root.gapAfter = baseGap;

    // Track assigned nodes
    const assigned = new Set([dag.root.id]);

    // BFS traversal
    const queue = [dag.root];

    while (queue.length > 0) {
      const node = queue.shift();

      // Calculate where children start (just after this node)
      const childStartY = node.y + node.frameHeight + node.gapAfter;

      for (const edge of node.outgoingEdges) {
        const child = edge.to;

        // Only assign if not already assigned
        if (!assigned.has(child.id)) {
          child.y = childStartY;

          // Use edge flow probability (not node probability) for scaling
          // Edge flow probability is always in [0,1], even when paths merge
          const scale = Math.min(1.0, edge.flowProbability);
          child.frameHeight = Math.max(minFrameHeight, baseFrameHeight * scale);
          child.gapAfter = Math.max(minGap, baseGap * scale);

          if (child.timeStep < 3) {
            const totalVertical = child.frameHeight + child.gapAfter;
            console.log(`[Layout Debug] t=${child.timeStep}, prob=${scale.toFixed(3)}, height=${child.frameHeight.toFixed(0)}px+${child.gapAfter.toFixed(0)}px=${totalVertical.toFixed(0)}px`);
          }

          assigned.add(child.id);
          queue.push(child);
        }
      }
    }
  }

  /**
   * Compute total dimensions of the layout
   */
  computeTotalDimensions(dag) {
    let maxY = 0;
    let maxX = 0;
    let maxYNode = null;

    for (const node of dag.nodes.values()) {
      const nodeBottom = node.y + node.frameHeight;
      if (nodeBottom > maxY) {
        maxY = nodeBottom;
        maxYNode = node;
      }

      const nodeRight = node.xEnd * this.config.baseFrameWidth + this.config.horizontalPadding;
      maxX = Math.max(maxX, nodeRight);
    }

    dag.totalHeight = maxY + this.config.baseGap; // Add padding at bottom
    dag.totalWidth = maxX + this.config.horizontalPadding;

    if (maxYNode) {
      console.log('[DAGLayout] Max Y node:', {
        id: maxYNode.id,
        timeStep: maxYNode.timeStep,
        y: maxYNode.y,
        frameHeight: maxYNode.frameHeight,
        probability: maxYNode.probability,
        totalHeight: dag.totalHeight
      });
    }
  }

  /**
   * Convert node layout to pixel coordinates
   */
  toPixels(node, containerWidth) {
    const { baseFrameWidth, horizontalPadding } = this.config;

    // X and width from xStart/xEnd range
    const x = horizontalPadding + node.xStart * baseFrameWidth;
    const width = (node.xEnd - node.xStart) * baseFrameWidth;

    return {
      x: x,
      width: width,
      y: node.y,
      height: node.frameHeight
    };
  }

  /**
   * Compute Sankey flow paths between parent and children
   */
  computeSankeyPaths(dag, fromNode, containerWidth) {
    const paths = [];
    const { baseFrameWidth, horizontalPadding } = this.config;

    for (const edge of fromNode.outgoingEdges) {
      const toNode = edge.to;

      // Parent bottom edge
      const fromX = horizontalPadding + fromNode.xStart * baseFrameWidth;
      const fromWidth = (fromNode.xEnd - fromNode.xStart) * baseFrameWidth;
      const y1 = fromNode.y + fromNode.frameHeight;

      // Child top edge
      const toX = horizontalPadding + toNode.xStart * baseFrameWidth;
      const toWidth = (toNode.xEnd - toNode.xStart) * baseFrameWidth;
      const y2 = toNode.y;

      paths.push({
        edge,
        x1Start: fromX,
        x1End: fromX + fromWidth,
        x2Start: toX,
        x2End: toX + toWidth,
        y1: y1,
        y2: y2,
        probability: edge.flowProbability
      });
    }

    return paths;
  }

  /**
   * Get all edges for Sankey rendering in a Y range
   */
  getEdgesInRange(dag, minY, maxY) {
    const edges = [];

    for (const node of dag.nodes.values()) {
      const nodeBottom = node.y + node.frameHeight;

      // Check if this node's outgoing edges are in the visible range
      if (nodeBottom >= minY && node.y <= maxY) {
        for (const edge of node.outgoingEdges) {
          edges.push({ from: node, edge });
        }
      }
    }

    return edges;
  }
}

/**
 * Generate SVG path for a Sankey flow
 */
function generateSankeyPath(flow) {
  const { x1Start, x1End, x2Start, x2End, y1, y2 } = flow;

  const controlOffset = (y2 - y1) * 0.4;

  const leftPath = `M ${x1Start} ${y1} ` +
    `C ${x1Start} ${y1 + controlOffset}, ${x2Start} ${y2 - controlOffset}, ${x2Start} ${y2}`;

  const rightPath = `L ${x2End} ${y2} ` +
    `C ${x2End} ${y2 - controlOffset}, ${x1End} ${y1 + controlOffset}, ${x1End} ${y1}`;

  return leftPath + rightPath + ' Z';
}

/**
 * Get nodes visible in a viewport
 */
function getVisibleNodes(dag, scrollY, viewportHeight) {
  const nodes = [];

  for (const node of dag.nodes.values()) {
    const nodeBottom = node.y + node.frameHeight;

    // Check if node overlaps with viewport
    if (nodeBottom >= scrollY && node.y <= scrollY + viewportHeight) {
      nodes.push(node);
    }
  }

  return nodes;
}

// Export for browser
if (typeof window !== 'undefined') {
  window.DAGLayout = DAGLayout;
  window.generateSankeyPath = generateSankeyPath;
  window.getVisibleNodes = getVisibleNodes;
}
