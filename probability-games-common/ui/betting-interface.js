/**
 * Betting Interface (shared)
 *
 * Single source of truth for the betting UI used by all three games:
 *   - Tehdas (hypothesis betting — column = possible sack distribution)
 *   - Mallit (bucket betting — column = outcome bucket / observation point)
 *   - Päättely (same as Mallit)
 *
 * The UI is a 10-row × N-column grid with click/drag to set a probability
 * per column, an optional normalize step (3+ columns), and a submit button.
 * After submit, the ground truth is shown as green lines and a max-per-bucket
 * error is computed for star scoring.
 *
 * Game-specific concerns (sack visualisations vs colored boxes vs text labels,
 * binary mode for "reaches" predictions, localized strings) are exposed via
 * config callbacks so each game's pelaa.html only has to plug in its
 * column-label renderer and pass a `numColumns` count + an `onComplete`
 * callback. No game should re-implement the grid drawing or click handling.
 */

class BettingInterface {
  /**
   * @param {HTMLElement} container - container element
   * @param {Object} config
   *
   * Required:
   *   numColumns           — number of columns (1 in binary mode, N otherwise)
   *   onComplete           — function called when user submits (no args; read
   *                          getProbabilities() to get the values)
   *
   * Either:
   *   distributions        — Tehdas: array of {dist:{red,blue,...}, prob}.
   *                          Implies numColumns = distributions.length and a
   *                          default sack-visualization label renderer.
   * Or:
   *   numColumns + renderColumnLabel(ctx, colIdx, x, y, w, h)
   *                        — Mallit/Päättely: caller draws its own labels
   *                          (text, colored boxes, etc.) below the grid.
   *
   * Optional:
   *   binary               — true for single-column reaches mode (Yes/No).
   *                          binaryLabels: {top, bottom} are drawn above and
   *                          below the column instead of below-grid labels.
   *   labelHeight          — px reserved below the grid for column labels
   *                          (ignored if binary). Default: 60 (or 100/120 for
   *                          sack visualizations, see _defaultLabelHeight).
   *   cellHeight           — row height in px. Default: 40 (binary: 45).
   *   submitLabel          — submit button text. Default: 'Submit answer'.
   *   normalizeLabel       — normalize button text. Default: 'Normalize to 100%'.
   *   starThresholds       — [3★,2★,1★] max-per-bucket-error thresholds.
   *                          Default: [0.06, 0.11, 0.21].
   *   sackId               — Tehdas-only, kept for backwards compatibility.
   */
  constructor(container, config) {
    this.container = container;

    // Tehdas-style: distributions array (also used by showResults Map fallback)
    this.distributions = config.distributions || null;
    this.sackId = config.sackId || null;

    this.numColumns = config.numColumns ?? this.distributions?.length;
    if (!this.numColumns) {
      throw new Error('BettingInterface: must supply numColumns or distributions');
    }

    this.binary = !!config.binary;
    this.binaryLabels = config.binaryLabels || { top: '', bottom: '' };

    // Renderer for column labels (below-grid). Default = sack visualization.
    this.renderColumnLabel = config.renderColumnLabel || this._defaultSackLabelRenderer.bind(this);
    this.labelHeight = config.labelHeight ?? this._defaultLabelHeight();

    this.submitLabel = config.submitLabel || 'Submit answer';
    this.normalizeLabel = config.normalizeLabel || 'Normalize to 100%';
    this.starThresholds = config.starThresholds || [0.06, 0.11, 0.21];

    this.onComplete = null; // caller assigns after construction

    // Layout constants
    this.granularity = 10; // always 10 rows (10% buckets)
    this.cellHeight = config.cellHeight ?? (this.binary ? 45 : 40);
    this.labelWidth = 28;
    this.topMargin = this.binary ? 24 : 15;
    // In binary mode, bottom margin must fit the bottom label ('Ei' etc.)
    this.bottomMargin = this.binary ? 28 : 10;

    // State
    this.groundTruth = null;       // array<number> indexed by colIdx
    this.enabled = false;
    this.gridSelections = new Map(); // colIdx -> { clickY, probability }
    this.isNormalized = false;
    this.gridCanvas = null;
    this.submitButton = null;
    this.normalizeButton = null;
    this.isDragging = false;
    this.dragColumnIndex = null;

    this.render();
  }

  // ---------- public API ----------

  enable() { this.enabled = true; this.render(); }
  disable() { this.enabled = false; this.render(); }

  reset() {
    this.groundTruth = null;
    this.enabled = false;
    this.gridSelections.clear();
    this.isNormalized = false;
    this.gridCanvas = null;
    this.submitButton = null;
    this.normalizeButton = null;
    this.render();
  }

  /**
   * Show ground truth and compute the max-per-bucket-error score.
   *
   * @param {number[]|Map<string,number>} truth
   *   Either an array of probabilities indexed by column, OR (Tehdas-style)
   *   a Map<distKey, probability> that we look up via this.distributions.
   * @returns {{loss: number, stars: number}}
   */
  showResults(truth) {
    this.groundTruth = this._coerceTruth(truth);
    this.enabled = false;
    this.render();
    const maxError = this.calculateMaxError();
    const stars = this.getStarRating(maxError);
    return { loss: maxError, stars };
  }

  /** Update the green ground-truth lines without redrawing the buttons. */
  setGroundTruth(truth) {
    this.groundTruth = this._coerceTruth(truth);
    if (this.gridCanvas && this.gridCanvas.parentNode) this.drawGrid();
  }

  /** Tehdas-back-compat alias. */
  setGroundTruthFromPosteriors(truth) { this.setGroundTruth(truth); }

  /** Tehdas-back-compat: set green to uniform distribution. */
  setGroundTruthUniform() {
    this.setGroundTruth(new Array(this.numColumns).fill(1 / this.numColumns));
  }

  /** Returns the player's current probability per column (array of length numColumns). */
  getProbabilities() {
    const out = new Array(this.numColumns).fill(0);
    this.gridSelections.forEach((sel, idx) => { out[idx] = sel.probability; });
    return out;
  }

  /**
   * Set the player's probabilities programmatically (e.g. from a DSL-evaluated
   * answer in Mallit). Marks all cells as "selected" with the given probabilities.
   *
   * @param {number[]} probArray - one entry per column. For binary mode pass an
   *   array of length 1 (the probability of the top label).
   * @param {boolean} [isNormalized=true] - whether the selections are already
   *   normalized to sum to 1.
   */
  setProbabilities(probArray, isNormalized = true) {
    if (!this._layout) {
      // Render hasn't run yet; defer.
      this._pendingProbabilities = { probArray, isNormalized };
      return;
    }
    const { gridY, gridH } = this._layout;
    this.gridSelections.clear();
    for (let i = 0; i < this.numColumns; i++) {
      const p = probArray[i] ?? 0;
      this.gridSelections.set(i, {
        clickY: gridY + (1 - p) * gridH,
        probability: p,
      });
    }
    this.isNormalized = isNormalized;
    this.drawGrid();
    this.updateButtonStates();
  }

  /** True iff the player has provided a usable submission. */
  isReadyToSubmit() {
    if (this.groundTruth) return false;
    if (this.gridSelections.size !== this.numColumns) return false;
    return this._needsNormalizeButton() ? this.isNormalized : true;
  }

  // ---------- rendering ----------

  render() {
    this.container.innerHTML = '';
    this.renderGrid();
  }

  /**
   * Cell width: pick the largest "comfortable" width that still lets the canvas
   * fit in the container. We have a desired width per column-count (looks best
   * with this many columns) and a hard min so labels stay readable.
   */
  static desiredCellWidth(numColumns) {
    if (numColumns <= 3) return 80;
    if (numColumns <= 5) return 70;
    if (numColumns <= 8) return 65;
    return 55;
  }
  static minCellWidth() { return 18; }
  /** Backwards-compat shim (used by some game-specific layout code). */
  static getCellWidth(numColumns) { return BettingInterface.desiredCellWidth(numColumns); }

  /**
   * Compute the actual cellWidth given the container's available width.
   * Shrinks cells (down to minCellWidth) to fit; otherwise picks the desired width.
   */
  _computeCellWidth() {
    if (this.binary) return 120;
    const desired = BettingInterface.desiredCellWidth(this.numColumns);
    const available = this.container.clientWidth;
    if (!available) return desired;  // before layout runs, just use desired
    // canvasWidth = labelWidth + numColumns*cellW + rightPad + 2
    // Solve for cellW: (available - 2*labelWidth - 2) / numColumns
    const overhead = 2 * this.labelWidth + 2;  // labelWidth + rightPad + border
    const fits = Math.floor((available - overhead) / this.numColumns);
    return Math.max(BettingInterface.minCellWidth(), Math.min(desired, fits));
  }

  renderGrid() {
    // Fixed visual layout — same across all 3 games for consistency.
    const cellW = this._computeCellWidth();
    const cellH = this.cellHeight;
    const gridW = this.numColumns * cellW;
    const gridH = this.granularity * cellH;
    const labelH = this.binary ? 0 : this.labelHeight;
    const rightPad = this.labelWidth; // visual balance with left labels
    const canvasWidth = this.labelWidth + gridW + rightPad + 2;
    const canvasHeight = this.topMargin + gridH + this.bottomMargin + labelH;

    // Cache for click handler / drawing
    this._layout = {
      cellW, cellH, gridW, gridH, labelH, rightPad,
      gridX: this.labelWidth,
      gridY: this.topMargin,
    };

    // Container styling — vertical flex, buttons on top, canvas below.
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '10px';
    this.container.style.minHeight = 'auto';
    this.container.style.maxHeight = 'none';
    this.container.style.overflow = 'visible';

    // ---- buttons row (always at the TOP) ----
    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.flexDirection = 'row';
    buttonRow.style.gap = '10px';
    buttonRow.style.width = '100%';
    buttonRow.style.justifyContent = 'center';

    if (this._needsNormalizeButton()) {
      this.normalizeButton = this._mkButton(this.normalizeLabel, () => {
        if (!this.normalizeButton.disabled) this.normalizeSelections();
      });
      buttonRow.appendChild(this.normalizeButton);
    }
    this.submitButton = this._mkButton(this.submitLabel, () => {
      if (!this.submitButton.disabled && this.onComplete) this.onComplete();
    });
    buttonRow.appendChild(this.submitButton);
    this.container.appendChild(buttonRow);

    // ---- canvas ----
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto';
    this.gridCanvas = canvas;

    // If a setProbabilities call came in before render, apply it now.
    if (this._pendingProbabilities) {
      const { probArray, isNormalized } = this._pendingProbabilities;
      this._pendingProbabilities = null;
      this.setProbabilities(probArray, isNormalized);
    }

    this.drawGrid();
    this.updateButtonStates();

    if (this.enabled) {
      canvas.style.cursor = 'pointer';
      canvas.addEventListener('mousedown', (e) => {
        const r = this.getGridPositionFromEvent(e);
        if (r) {
          this.isDragging = true;
          this.dragColumnIndex = r.colIndex;
          this.updateSelectionAtPosition(r.colIndex, r.y, r.probability);
        }
      });
      canvas.addEventListener('mousemove', (e) => {
        if (this.isDragging && this.dragColumnIndex !== null) {
          const r = this.getGridPositionFromEvent(e, this.dragColumnIndex);
          if (r) this.updateSelectionAtPosition(this.dragColumnIndex, r.y, r.probability);
        }
      });
      const stopDrag = () => { this.isDragging = false; this.dragColumnIndex = null; };
      canvas.addEventListener('mouseup', stopDrag);
      canvas.addEventListener('mouseleave', stopDrag);
    }

    this.container.appendChild(canvas);
  }

  drawGrid() {
    if (!this.gridCanvas) return;
    const canvas = this.gridCanvas;
    const ctx = canvas.getContext('2d');
    const { cellW, cellH, gridW, gridH, gridX, gridY } = this._layout;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Binary mode: top label above column 0, bottom label below.
    if (this.binary) {
      ctx.fillStyle = '#000';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(this.binaryLabels.top || '', gridX + gridW / 2, gridY - 6);
      ctx.textBaseline = 'top';
      ctx.fillText(this.binaryLabels.bottom || '', gridX + gridW / 2, gridY + gridH + 6);
    }

    // Vertical dividers
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let col = 0; col <= this.numColumns; col++) {
      const x = gridX + col * cellW;
      ctx.beginPath();
      ctx.moveTo(x, gridY);
      ctx.lineTo(x, gridY + gridH);
      ctx.stroke();
    }

    // Horizontal dividers — major (20% intervals) thicker/darker, minor lighter
    ctx.setLineDash([4, 4]);
    for (let row = 1; row < this.granularity; row++) {
      const y = gridY + row * cellH;
      const isMajor = row % 2 === 0;
      ctx.strokeStyle = isMajor ? '#666' : '#888';
      ctx.lineWidth = isMajor ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(gridX, y);
      ctx.lineTo(gridX + gridW, y);
      ctx.stroke();
    }

    // Top/bottom boundaries
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(gridX, gridY);
    ctx.lineTo(gridX + gridW, gridY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gridX, gridY + gridH);
    ctx.lineTo(gridX + gridW, gridY + gridH);
    ctx.stroke();

    // Left percentage labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= this.granularity; i++) {
      const percent = ((this.granularity - i) / this.granularity) * 100;
      const y = gridY + i * cellH;
      const isMajor = i % 2 === 0;
      ctx.fillStyle = isMajor ? '#333' : '#777';
      ctx.font = isMajor ? '500 10px sans-serif' : '10px sans-serif';
      ctx.fillText(`${percent}%`, this.labelWidth - 5, y);
    }

    // User selections (blue lines at exact click position)
    ctx.strokeStyle = 'blue';
    ctx.lineWidth = 3;
    this.gridSelections.forEach((selection, colIndex) => {
      const x1 = gridX + colIndex * cellW;
      const x2 = gridX + (colIndex + 1) * cellW;
      const y = selection.clickY;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    });

    // Ground truth (green lines at exact probability position)
    if (this.groundTruth) {
      ctx.strokeStyle = 'green';
      ctx.lineWidth = 3;
      for (let colIndex = 0; colIndex < this.numColumns; colIndex++) {
        const trueProbability = this.groundTruth[colIndex] || 0;
        const y = gridY + (1 - trueProbability) * gridH;
        const x1 = gridX + colIndex * cellW;
        const x2 = gridX + (colIndex + 1) * cellW;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }
    }

    // Column labels below grid (skip in binary mode — labels are above/below)
    if (!this.binary && this.labelHeight > 0) {
      const labelY = gridY + gridH + this.bottomMargin;
      for (let colIndex = 0; colIndex < this.numColumns; colIndex++) {
        const x = gridX + colIndex * cellW;
        this.renderColumnLabel(ctx, colIndex, x, labelY, cellW, this.labelHeight);
      }
    }
  }

  // ---------- mouse + selection ----------

  getGridPositionFromEvent(e, forceColumn = null) {
    const canvas = this.gridCanvas;
    const rect = canvas.getBoundingClientRect();
    // Scale to canvas pixel coords (handles CSS-shrunk canvas / hi-DPI)
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * sx;
    const y = (e.clientY - rect.top) * sy;

    const { cellW, cellH, gridX, gridY, gridH } = this._layout;
    if (forceColumn === null && (x < gridX || x > gridX + this.numColumns * cellW)) return null;
    if (y < gridY || y > gridY + gridH) return null;

    const colIndex = forceColumn !== null ? forceColumn : Math.floor((x - gridX) / cellW);
    const probability = Math.max(0, Math.min(1, 1 - (y - gridY) / gridH));
    return { colIndex, y, probability };
  }

  updateSelectionAtPosition(colIndex, y, probability) {
    const { cellH, gridY, gridH } = this._layout;

    if (this.numColumns === 2 && !this.binary) {
      // Auto-fill complementary column
      const other = 1 - colIndex;
      this.gridSelections.set(colIndex, { clickY: y, probability });
      const otherProb = 1 - probability;
      this.gridSelections.set(other, {
        clickY: gridY + (1 - otherProb) * gridH,
        probability: otherProb,
      });
      this.isNormalized = true;
    } else {
      this.gridSelections.set(colIndex, { clickY: y, probability });
      this.isNormalized = false;
    }

    this.drawGrid();
    this.updateButtonStates();
  }

  normalizeSelections() {
    if (this.gridSelections.size !== this.numColumns) return;
    let sum = 0;
    this.gridSelections.forEach(s => { sum += s.probability; });
    if (sum === 0) return;
    const { gridY, gridH } = this._layout;
    this.gridSelections.forEach((selection, colIndex) => {
      const p = selection.probability / sum;
      this.gridSelections.set(colIndex, {
        clickY: gridY + (1 - p) * gridH,
        probability: p,
      });
    });
    this.isNormalized = true;
    this.drawGrid();
    this.updateButtonStates();
  }

  updateButtonStates() {
    const allSelected = this.gridSelections.size === this.numColumns;

    if (this.normalizeButton) {
      const enable = allSelected && !this.isNormalized;
      this.normalizeButton.disabled = !enable;
      this.normalizeButton.style.opacity = enable ? '1' : '0.5';
    }

    if (this.submitButton && !this.groundTruth) {
      const ready = this.isReadyToSubmit();
      this.submitButton.disabled = !ready;
      this.submitButton.style.opacity = ready ? '1' : '0.5';
    }
  }

  // ---------- scoring ----------

  /** Largest per-column absolute error: max_i |truth_i - user_i|. */
  calculateMaxError() {
    if (!this.groundTruth || this.gridSelections.size === 0) return Infinity;
    let maxError = 0;
    for (let colIndex = 0; colIndex < this.numColumns; colIndex++) {
      const truth = this.groundTruth[colIndex] || 0;
      const sel = this.gridSelections.get(colIndex);
      if (!sel) return Infinity;
      const err = Math.abs(sel.probability - truth);
      if (err > maxError) maxError = err;
    }
    return maxError;
  }

  getStarRating(err) {
    if (err === Infinity || isNaN(err)) return 0;
    if (err <= this.starThresholds[0]) return 3;
    if (err <= this.starThresholds[1]) return 2;
    if (err <= this.starThresholds[2]) return 1;
    return 0;
  }

  getStarDisplay(stars) {
    return '★'.repeat(stars) + '☆'.repeat(3 - stars);
  }

  // ---------- internals ----------

  _needsNormalizeButton() {
    // 1-col binary auto-syncs; 2-col multi-col auto-syncs. 3+ needs explicit.
    return !this.binary && this.numColumns >= 3;
  }

  _mkButton(label, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.padding = '10px 20px';
    b.style.fontSize = '14px';
    b.style.fontWeight = '500';
    b.style.cursor = 'pointer';
    b.style.border = '2px solid #000';
    b.style.background = '#fff';
    b.style.fontFamily = 'inherit';
    b.style.flex = '1';
    b.style.minWidth = '0';
    b.addEventListener('click', onClick);
    return b;
  }

  _defaultLabelHeight() {
    if (this.distributions) return this.numColumns >= 5 ? 120 : 100;
    return 60;
  }

  _coerceTruth(truth) {
    if (Array.isArray(truth)) return truth;
    if (truth instanceof Map && this.distributions) {
      // Tehdas-style: Map<distKey, probability>, look up per distribution.
      return this.distributions.map(d => truth.get(JSON.stringify(d.dist)) || 0);
    }
    throw new Error('BettingInterface: truth must be array or (with distributions) Map');
  }

  /** Default column-label renderer: draws a sack visualization (Tehdas mode). */
  _defaultSackLabelRenderer(ctx, colIdx, x, y, w, h) {
    if (!this.distributions) return;
    const renderer = window.SackRenderer;
    const sackWidth = w * (renderer?.SACK_WIDTH_RATIO || 0.8);
    const sackHeight = w * (renderer?.SACK_HEIGHT_RATIO || 0.85);
    const sackX = x + (w - sackWidth) / 2;
    if (renderer) {
      ctx.setLineDash([]);
      renderer.renderSack(ctx, sackX, y, sackWidth, sackHeight, {
        contents: this.distributions[colIdx].dist,
        showContents: true,
      });
    } else {
      ctx.fillStyle = window.ComponentColors?.COLORS?.sack || '#B8A090';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(sackX, y);
      ctx.lineTo(sackX, y + sackHeight);
      ctx.lineTo(sackX + sackWidth, y + sackHeight);
      ctx.lineTo(sackX + sackWidth, y);
      ctx.stroke();
      ctx.fill();
    }
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.BettingInterface = BettingInterface;
}
