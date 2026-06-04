/**
 * Rectangle Partitioner
 *
 * Handles N-way splits of rectangular areas for the animated branching visualization.
 * Chooses split direction (horizontal vs vertical) to maximize factory canvas size
 * within each resulting sub-rectangle.
 */

class RectanglePartitioner {
  /**
   * @param {number} factoryAspectRatio - Width/height ratio of the factory canvas
   */
  constructor(factoryAspectRatio) {
    this.factoryAspectRatio = factoryAspectRatio;
  }

  /**
   * Partition a rectangle into N sub-rectangles with areas proportional to probabilities.
   *
   * @param {Object} rect - {x, y, width, height} of the area to partition
   * @param {number[]} probabilities - Array of N probabilities (should sum to 1)
   * @returns {Object[]} - Array of N rectangles {x, y, width, height}
   */
  partition(rect, probabilities) {
    const n = probabilities.length;

    if (n === 1) {
      return [{ ...rect }];
    }

    if (n === 2) {
      return this.partitionBinary(rect, probabilities);
    }

    if (n === 3) {
      return this.partitionTernary(rect, probabilities);
    }

    if (n === 4) {
      return this.partitionQuaternary(rect, probabilities);
    }

    // Fallback for n > 4: use strips
    return this.partitionStrips(rect, probabilities);
  }

  /**
   * Binary partition (N=2): Choose H or V based on aspect ratio.
   */
  partitionBinary(rect, probs) {
    const [p1, p2] = probs;
    const direction = this.chooseDirection(rect);

    if (direction === 'vertical') {
      // Split vertically (side by side)
      const w1 = rect.width * p1;
      const w2 = rect.width * p2;
      return [
        { x: rect.x, y: rect.y, width: w1, height: rect.height },
        { x: rect.x + w1, y: rect.y, width: w2, height: rect.height }
      ];
    } else {
      // Split horizontally (stacked)
      const h1 = rect.height * p1;
      const h2 = rect.height * p2;
      return [
        { x: rect.x, y: rect.y, width: rect.width, height: h1 },
        { x: rect.x, y: rect.y + h1, width: rect.width, height: h2 }
      ];
    }
  }

  /**
   * Ternary partition (N=3): Use hierarchical split.
   * First split one region vs two-region group, then split the two-region group.
   */
  partitionTernary(rect, probs) {
    const [p1, p2, p3] = probs;

    // Try different groupings and pick the one that gives best aspect ratios
    const options = [
      { single: 0, pair: [1, 2], singleProb: p1, pairProb: p2 + p3 },
      { single: 1, pair: [0, 2], singleProb: p2, pairProb: p1 + p3 },
      { single: 2, pair: [0, 1], singleProb: p3, pairProb: p1 + p2 }
    ];

    let bestOption = options[0];
    let bestScore = -Infinity;

    for (const opt of options) {
      const score = this.scoreTernaryOption(rect, opt, probs);
      if (score > bestScore) {
        bestScore = score;
        bestOption = opt;
      }
    }

    // First split: single vs pair
    const direction = this.chooseDirection(rect);
    const results = new Array(3);

    if (direction === 'vertical') {
      const wSingle = rect.width * bestOption.singleProb;
      const wPair = rect.width * bestOption.pairProb;

      const singleRect = { x: rect.x, y: rect.y, width: wSingle, height: rect.height };
      const pairRect = { x: rect.x + wSingle, y: rect.y, width: wPair, height: rect.height };

      results[bestOption.single] = singleRect;

      // Split the pair rectangle
      const pairProbs = [probs[bestOption.pair[0]], probs[bestOption.pair[1]]];
      const normalizedPairProbs = pairProbs.map(p => p / bestOption.pairProb);
      const pairResults = this.partitionBinary(pairRect, normalizedPairProbs);
      results[bestOption.pair[0]] = pairResults[0];
      results[bestOption.pair[1]] = pairResults[1];
    } else {
      const hSingle = rect.height * bestOption.singleProb;
      const hPair = rect.height * bestOption.pairProb;

      const singleRect = { x: rect.x, y: rect.y, width: rect.width, height: hSingle };
      const pairRect = { x: rect.x, y: rect.y + hSingle, width: rect.width, height: hPair };

      results[bestOption.single] = singleRect;

      // Split the pair rectangle
      const pairProbs = [probs[bestOption.pair[0]], probs[bestOption.pair[1]]];
      const normalizedPairProbs = pairProbs.map(p => p / bestOption.pairProb);
      const pairResults = this.partitionBinary(pairRect, normalizedPairProbs);
      results[bestOption.pair[0]] = pairResults[0];
      results[bestOption.pair[1]] = pairResults[1];
    }

    return results;
  }

  /**
   * Score a ternary partition option based on resulting aspect ratios.
   */
  scoreTernaryOption(rect, opt, probs) {
    // Simulate the partition and score the resulting rectangles
    const direction = this.chooseDirection(rect);
    let singleRect, pairRect;

    if (direction === 'vertical') {
      const wSingle = rect.width * opt.singleProb;
      const wPair = rect.width * opt.pairProb;
      singleRect = { width: wSingle, height: rect.height };
      pairRect = { width: wPair, height: rect.height };
    } else {
      const hSingle = rect.height * opt.singleProb;
      const hPair = rect.height * opt.pairProb;
      singleRect = { width: rect.width, height: hSingle };
      pairRect = { width: rect.width, height: hPair };
    }

    // Score based on how well rectangles fit the factory aspect ratio
    const singleScore = this.computeCanvasFillRatio(singleRect);

    // For the pair, compute approximate scores for sub-rectangles
    const pairDirection = this.chooseDirection(pairRect);
    const p0 = probs[opt.pair[0]] / opt.pairProb;
    const p1 = probs[opt.pair[1]] / opt.pairProb;

    let subRect0, subRect1;
    if (pairDirection === 'vertical') {
      subRect0 = { width: pairRect.width * p0, height: pairRect.height };
      subRect1 = { width: pairRect.width * p1, height: pairRect.height };
    } else {
      subRect0 = { width: pairRect.width, height: pairRect.height * p0 };
      subRect1 = { width: pairRect.width, height: pairRect.height * p1 };
    }

    const pairScore = (this.computeCanvasFillRatio(subRect0) + this.computeCanvasFillRatio(subRect1)) / 2;

    // Weight by probability
    return singleScore * opt.singleProb + pairScore * opt.pairProb;
  }

  /**
   * Quaternary partition (N=4): Use 2x2 grid approach.
   * Split into two rows, then split each row.
   */
  partitionQuaternary(rect, probs) {
    const [p1, p2, p3, p4] = probs;

    // Group into two rows: (p1, p2) and (p3, p4)
    // Could also try other groupings, but this is reasonable default
    const row1Prob = p1 + p2;
    const row2Prob = p3 + p4;

    const direction = this.chooseDirection(rect);

    if (direction === 'vertical') {
      // Prefer columns approach for wide rectangles
      // First split vertically, then each column horizontally
      const col1Prob = p1 + p3;
      const col2Prob = p2 + p4;

      const w1 = rect.width * col1Prob;
      const w2 = rect.width * col2Prob;

      const col1Rect = { x: rect.x, y: rect.y, width: w1, height: rect.height };
      const col2Rect = { x: rect.x + w1, y: rect.y, width: w2, height: rect.height };

      // Split column 1 (p1 top, p3 bottom)
      const col1h1 = col1Rect.height * (p1 / col1Prob);
      const col1h2 = col1Rect.height * (p3 / col1Prob);

      // Split column 2 (p2 top, p4 bottom)
      const col2h1 = col2Rect.height * (p2 / col2Prob);
      const col2h2 = col2Rect.height * (p4 / col2Prob);

      return [
        { x: col1Rect.x, y: col1Rect.y, width: w1, height: col1h1 },  // p1
        { x: col2Rect.x, y: col2Rect.y, width: w2, height: col2h1 },  // p2
        { x: col1Rect.x, y: col1Rect.y + col1h1, width: w1, height: col1h2 },  // p3
        { x: col2Rect.x, y: col2Rect.y + col2h1, width: w2, height: col2h2 }   // p4
      ];
    } else {
      // Prefer rows approach for tall rectangles
      const h1 = rect.height * row1Prob;
      const h2 = rect.height * row2Prob;

      const row1Rect = { x: rect.x, y: rect.y, width: rect.width, height: h1 };
      const row2Rect = { x: rect.x, y: rect.y + h1, width: rect.width, height: h2 };

      // Split row 1 (p1 left, p2 right)
      const row1w1 = row1Rect.width * (p1 / row1Prob);
      const row1w2 = row1Rect.width * (p2 / row1Prob);

      // Split row 2 (p3 left, p4 right)
      const row2w1 = row2Rect.width * (p3 / row2Prob);
      const row2w2 = row2Rect.width * (p4 / row2Prob);

      return [
        { x: row1Rect.x, y: row1Rect.y, width: row1w1, height: h1 },  // p1
        { x: row1Rect.x + row1w1, y: row1Rect.y, width: row1w2, height: h1 },  // p2
        { x: row2Rect.x, y: row2Rect.y, width: row2w1, height: h2 },  // p3
        { x: row2Rect.x + row2w1, y: row2Rect.y, width: row2w2, height: h2 }   // p4
      ];
    }
  }

  /**
   * Fallback: partition into strips (all horizontal or all vertical).
   */
  partitionStrips(rect, probs) {
    const direction = this.chooseDirection(rect);
    const results = [];

    if (direction === 'vertical') {
      let currentX = rect.x;
      for (const p of probs) {
        const w = rect.width * p;
        results.push({ x: currentX, y: rect.y, width: w, height: rect.height });
        currentX += w;
      }
    } else {
      let currentY = rect.y;
      for (const p of probs) {
        const h = rect.height * p;
        results.push({ x: rect.x, y: currentY, width: rect.width, height: h });
        currentY += h;
      }
    }

    return results;
  }

  /**
   * Choose split direction based on area aspect ratio vs factory aspect ratio.
   *
   * If area is wider than factory → vertical split (makes sub-areas less wide)
   * If area is taller than factory → horizontal split (makes sub-areas less tall)
   */
  chooseDirection(rect) {
    const areaAspect = rect.width / rect.height;

    if (areaAspect > this.factoryAspectRatio) {
      return 'vertical';  // Area too wide, split vertically to narrow it
    } else {
      return 'horizontal';  // Area too tall, split horizontally to shorten it
    }
  }

  /**
   * Compute how much of the rectangle area is filled by the factory canvas.
   * Returns a ratio between 0 and 1.
   */
  computeCanvasFillRatio(rect) {
    const areaAspect = rect.width / rect.height;
    const factoryAspect = this.factoryAspectRatio;

    if (areaAspect > factoryAspect) {
      // Area is wider - factory is height-constrained
      // Canvas fills: (height * factoryAspect) * height = height^2 * factoryAspect
      // Area is: width * height
      // Ratio: (height * factoryAspect) / width = factoryAspect / areaAspect
      return factoryAspect / areaAspect;
    } else {
      // Area is taller - factory is width-constrained
      // Canvas fills: width * (width / factoryAspect) = width^2 / factoryAspect
      // Area is: width * height
      // Ratio: (width / factoryAspect) / height = areaAspect / factoryAspect
      return areaAspect / factoryAspect;
    }
  }

  /**
   * Compute the factory canvas dimensions that fit inside an area rectangle.
   * Returns {x, y, width, height} of the canvas position within the area.
   */
  computeCanvasRect(areaRect) {
    const areaAspect = areaRect.width / areaRect.height;
    const factoryAspect = this.factoryAspectRatio;

    let canvasWidth, canvasHeight;

    if (areaAspect > factoryAspect) {
      // Area is wider than factory - fit to height
      canvasHeight = areaRect.height;
      canvasWidth = canvasHeight * factoryAspect;
    } else {
      // Area is taller than factory - fit to width
      canvasWidth = areaRect.width;
      canvasHeight = canvasWidth / factoryAspect;
    }

    // Center the canvas within the area
    const canvasX = areaRect.x + (areaRect.width - canvasWidth) / 2;
    const canvasY = areaRect.y + (areaRect.height - canvasHeight) / 2;

    return {
      x: canvasX,
      y: canvasY,
      width: canvasWidth,
      height: canvasHeight
    };
  }

  /**
   * Get the split lines that would result from partitioning.
   * Returns array of {x1, y1, x2, y2} line segments.
   */
  getSplitLines(rect, probabilities) {
    const subRects = this.partition(rect, probabilities);
    const lines = [];

    // Find boundaries between adjacent rectangles
    for (let i = 0; i < subRects.length; i++) {
      for (let j = i + 1; j < subRects.length; j++) {
        const line = this.findSharedEdge(subRects[i], subRects[j]);
        if (line) {
          lines.push(line);
        }
      }
    }

    return lines;
  }

  /**
   * Find the shared edge between two rectangles, if any.
   */
  findSharedEdge(rect1, rect2) {
    const epsilon = 0.001;

    // Check for vertical shared edge (side by side)
    if (Math.abs(rect1.x + rect1.width - rect2.x) < epsilon) {
      const y1 = Math.max(rect1.y, rect2.y);
      const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
      if (y2 > y1) {
        return { x1: rect2.x, y1: y1, x2: rect2.x, y2: y2 };
      }
    }
    if (Math.abs(rect2.x + rect2.width - rect1.x) < epsilon) {
      const y1 = Math.max(rect1.y, rect2.y);
      const y2 = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
      if (y2 > y1) {
        return { x1: rect1.x, y1: y1, x2: rect1.x, y2: y2 };
      }
    }

    // Check for horizontal shared edge (stacked)
    if (Math.abs(rect1.y + rect1.height - rect2.y) < epsilon) {
      const x1 = Math.max(rect1.x, rect2.x);
      const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
      if (x2 > x1) {
        return { x1: x1, y1: rect2.y, x2: x2, y2: rect2.y };
      }
    }
    if (Math.abs(rect2.y + rect2.height - rect1.y) < epsilon) {
      const x1 = Math.max(rect1.x, rect2.x);
      const x2 = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
      if (x2 > x1) {
        return { x1: x1, y1: rect1.y, x2: x2, y2: rect1.y };
      }
    }

    return null;
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.RectanglePartitioner = RectanglePartitioner;
}
