/**
 * Branching Renderer
 *
 * Renders the world DAG visualization with viewport-based lazy rendering:
 * - Canvas stays viewport-sized (never exceeds browser limits)
 * - Spacer element creates scrollable area
 * - Only visible nodes are rendered
 * - Sankey diagram flows between time steps
 * - Probability-based opacity
 * - Smooth zooming
 */

/**
 * Render static factory background to an offscreen canvas
 * @param {number} gridWidth - Grid width in cells
 * @param {number} gridHeight - Grid height in cells
 * @param {Array} components - Array of component objects
 * @param {Object} options - Optional settings (skipArms: boolean)
 * @returns {HTMLCanvasElement} Offscreen canvas with rendered background
 */
function renderStaticFactoryBackground(gridWidth, gridHeight, components, options = {}) {
  // Use high resolution for smooth circles when zoomed in
  const cellSize = options.cellSize || 64;
  const canvasWidth = gridWidth * cellSize;
  const canvasHeight = gridHeight * cellSize;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas._gridSize = cellSize;  // Required by component renderers

  const ctx = canvas.getContext('2d');

  // Fill background (skipped when caller will fill its own background)
  if (!options.transparentBackground) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // Draw grid lines (optional — the branching view skips these because
  // drawImage-scaling interpolates 1px lines into blurry bands that no longer
  // align with cached component edges. It draws grid lines live per-world.)
  if (!options.skipGrid) {
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvasWidth; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
    for (let y = 0; y <= canvasHeight; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }
  }

  // Set up button connections for rendering (find host conveyor/conveyor-turn and target arm)
  const buttons = components.filter(c => c.type === 'button');
  const buttonSpec = ComponentRegistry.get('button');
  for (const button of buttons) {
    // Find host component (conveyor or conveyor-turn at same position)
    button.hostComponent = components.find(c =>
      (c.type === 'conveyor' || c.type === 'conveyor-turn') &&
      c.position.x === button.position.x &&
      c.position.y === button.position.y
    );

    // Find target arm using button spec's method (checks adjacent arms, then adjacent sacks)
    if (buttonSpec && buttonSpec.findAdjacentArm) {
      button.targetArm = buttonSpec.findAdjacentArm(button, {components: components});
    }
  }

  // Draw button wires first (under other components)
  if (buttonSpec && buttonSpec.visual && buttonSpec.visual.renderWire) {
    for (const button of buttons) {
      if (button.targetArm) {
        buttonSpec.visual.renderWire(ctx, button);
      }
    }
  }

  // Draw regular components first
  for (const comp of components) {
    if (options.skipArms && comp.type === 'arm') continue;

    const spec = ComponentRegistry.get(comp.type);
    if (spec && spec.visual && spec.visual.render && !spec.isOverlay) {
      ctx.save();
      spec.visual.render(ctx, comp);
      ctx.restore();
    }
  }

  // Draw overlay components (buttons) on top
  for (const comp of components) {
    const spec = ComponentRegistry.get(comp.type);
    if (spec && spec.visual && spec.visual.render && spec.isOverlay) {
      ctx.save();
      spec.visual.render(ctx, comp);
      ctx.restore();
    }
  }

  // Draw cell labels (A1, B2, etc.) if enabled
  if (!options.skipLabels && components.length > 0) {
    // Compute bounding box
    let minX = Infinity, minY = Infinity;
    for (const comp of components) {
      minX = Math.min(minX, comp.position.x);
      minY = Math.min(minY, comp.position.y);
    }

    // Draw label for each cell
    ctx.save();
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    for (const comp of components) {
      const relX = comp.position.x - minX;
      const relY = comp.position.y - minY;
      const colLetter = String.fromCharCode(65 + relX);  // 65 = 'A'
      const rowNumber = relY + 1;  // 1-indexed
      const label = `${colLetter}${rowNumber}`;

      const pixelX = comp.position.x * cellSize;
      const pixelY = comp.position.y * cellSize;

      // Draw label in top-left corner with small padding
      ctx.fillText(label, pixelX + 3, pixelY + 2);
    }
    ctx.restore();
  }

  return canvas;
}

class BranchingRenderer {
  constructor(container, factoryInfo, config = {}) {
    this.container = container;
    this.factoryInfo = factoryInfo;  // {gridWidth, gridHeight}

    this.config = {
      frameWidth: config.frameWidth || 200,
      frameHeight: config.frameHeight || 150,
      sankeyGap: config.sankeyGap || 40,
      minZoom: config.minZoom || 0.1,
      maxZoom: config.maxZoom || 3.0,
      zoomSpeed: config.zoomSpeed || 0.5,
      maxZoomVelocity: config.maxZoomVelocity || 0.5,
      ...config
    };

    // State
    this.dag = null;
    this.layout = null;
    this.zoom = 1.0;
    this.targetZoom = 1.0;

    // Cached static background (factory components without balls)
    this._staticBackgroundCanvas = null;
    this._staticBackgroundRendered = false;

    // Components and level (set externally)
    this.components = null;
    this.level = null;

    // Animation frame
    this._animationFrame = null;

    // Setup DOM
    this.setupDOM();
  }

  setupDOM() {
    // Make container scrollable (both directions) with hidden scrollbar
    this.container.style.position = 'relative';
    this.container.style.overflowX = 'auto';
    this.container.style.overflowY = 'auto';
    this.container.style.background = '#ffffff';
    this.container.style.scrollbarWidth = 'none';
    this.container.style.msOverflowStyle = 'none';

    // Hide webkit scrollbar
    if (!document.getElementById('branching-scroll-style')) {
      const style = document.createElement('style');
      style.id = 'branching-scroll-style';
      style.textContent = `
        .branching-canvas-area::-webkit-scrollbar { display: none; }
      `;
      document.head.appendChild(style);
    }

    // Create spacer element (determines scrollable height)
    this.spacer = document.createElement('div');
    this.spacer.style.cssText = `
      position: relative;
      width: 100%;
    `;
    this.container.appendChild(this.spacer);

    // Create canvas (fixed to viewport, positioned over scroll area)
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: sticky;
      top: 0;
      left: 0;
      display: block;
      image-rendering: crisp-edges;
    `;
    this.spacer.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Bind events
    this.container.addEventListener('scroll', this.onScroll.bind(this));
    this.container.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
  }

  /**
   * Set the level and components for rendering
   */
  setLevel(level, components) {
    this.level = level;
    this.components = components;

    // Pre-render static background
    this._renderStaticBackground();
  }

  /**
   * Pre-render the static factory background (components only, no balls)
   */
  _renderStaticBackground() {
    if (!this.level || !this.components) return;

    this._staticBackgroundCanvas = renderStaticFactoryBackground(
      this.factoryInfo.gridWidth,
      this.factoryInfo.gridHeight,
      this.components
    );
    this._staticBackgroundRendered = true;
  }

  /**
   * Set the DAG to render
   */
  setDAG(dag, layout) {
    this.dag = dag;
    this.layout = layout;

    // Reset view
    this.zoom = 1.0;
    this.targetZoom = 1.0;

    // Setup canvas and spacer
    this.updateLayout();

    // Scroll to top
    this.container.scrollTop = 0;

    // Initial render
    this.render();
  }

  /**
   * Update canvas size and spacer height based on zoom
   */
  updateLayout() {
    if (!this.dag || !this.layout) return;

    // Canvas is always viewport-sized
    const viewportWidth = this.container.clientWidth;
    const viewportHeight = this.container.clientHeight;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = viewportWidth * dpr;
    this.canvas.height = viewportHeight * dpr;
    this.canvas.style.width = viewportWidth + 'px';
    this.canvas.style.height = viewportHeight + 'px';
    this.dpr = dpr;

    // Spacer creates the full scrollable area
    const totalHeight = this.dag.totalHeight * this.zoom;
    this.spacer.style.height = totalHeight + 'px';

    console.log('[BranchingRenderer] updateLayout:', {
      viewportHeight,
      dagTotalHeight: this.dag.totalHeight,
      zoom: this.zoom,
      spacerHeight: totalHeight,
      scrollable: totalHeight > viewportHeight
    });

    // Content width based on base frame width (ensure it's wide enough to scroll horizontally when zoomed)
    const contentWidth = this.layout.config.baseFrameWidth + 2 * this.layout.config.horizontalPadding;
    const scaledWidth = contentWidth * this.zoom;
    this.spacer.style.width = scaledWidth + 'px';
    this.spacer.style.minWidth = viewportWidth + 'px';
  }

  /**
   * Main render function - only renders visible content
   */
  render() {
    if (!this.dag || !this.layout) return;

    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const cssWidth = width / dpr;
    const cssHeight = height / dpr;

    // Clear (match canvas-area background)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Apply DPI scaling
    ctx.save();
    ctx.scale(dpr, dpr);

    // Get scroll position (both directions)
    const scrollY = this.container.scrollTop;
    const scrollX = this.container.scrollLeft;

    // Get visible nodes based on Y position (not time steps)
    const visibleNodes = getVisibleNodes(this.dag, scrollY / this.zoom, cssHeight / this.zoom);

    // Save context and translate to account for scroll (both directions)
    ctx.save();
    ctx.translate(-scrollX, -scrollY);

    // Draw Sankey flows first (behind frames)
    for (const node of visibleNodes) {
      this.renderSankeyFlowsForNode(node);
    }

    // Draw world frames
    for (const node of visibleNodes) {
      this.renderWorldFrame(node);
    }

    ctx.restore(); // scroll translate
    ctx.restore(); // dpr scale
  }

  /**
   * Render a single world frame
   */
  renderWorldFrame(node) {
    const ctx = this.ctx;
    const containerWidth = this.canvas.width / (this.dpr || 1);

    // Get pixel position and scale all coordinates
    const pos = this.layout.toPixels(node, containerWidth);
    const scaledX = pos.x * this.zoom;
    const scaledY = pos.y * this.zoom;
    const scaledWidth = pos.width * this.zoom;
    const scaledHeight = pos.height * this.zoom;

    // Render factory snapshot (includes probability label)
    this.renderFactorySnapshot(node, scaledX, scaledY, scaledWidth, scaledHeight);
  }

  /**
   * Render the factory state inside a frame
   * Uses cached static background + draws balls on top
   * Maintains proper aspect ratio (centers factory within frame)
   */
  renderFactorySnapshot(node, x, y, width, height) {
    const ctx = this.ctx;
    const snapshot = node.snapshot;

    if (!snapshot) return;

    // Calculate aspect-ratio-preserving dimensions
    const gridWidth = this.factoryInfo?.gridWidth || 8;
    const gridHeight = this.factoryInfo?.gridHeight || 6;
    const factoryAspect = gridWidth / gridHeight;
    const frameAspect = width / height;

    let drawWidth, drawHeight, drawX, drawY;

    if (factoryAspect > frameAspect) {
      drawWidth = width;
      drawHeight = width / factoryAspect;
      drawX = x;
      drawY = y + (height - drawHeight) / 2;
    } else {
      drawHeight = height;
      drawWidth = height * factoryAspect;
      drawX = x + (width - drawWidth) / 2;
      drawY = y;
    }

    // Render factory directly at frame size (no offscreen canvas scaling)
    const frameCellSize = drawWidth / gridWidth;
    const savedGridSize = ctx.canvas._gridSize;
    ctx.canvas._gridSize = frameCellSize;

    ctx.save();
    ctx.translate(drawX, drawY);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, drawWidth, drawHeight);

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= gridWidth; gx++) {
      ctx.beginPath();
      ctx.moveTo(gx * frameCellSize, 0);
      ctx.lineTo(gx * frameCellSize, drawHeight);
      ctx.stroke();
    }
    for (let gy = 0; gy <= gridHeight; gy++) {
      ctx.beginPath();
      ctx.moveTo(0, gy * frameCellSize);
      ctx.lineTo(drawWidth, gy * frameCellSize);
      ctx.stroke();
    }

    if (this.components) {
      for (const comp of this.components) {
        if (comp.type === 'arm') continue;
        const spec = ComponentRegistry.get(comp.type);
        if (spec && spec.visual && spec.visual.render && !spec.isOverlay) {
          ctx.save();
          spec.visual.render(ctx, comp);
          ctx.restore();
        }
      }
      for (const comp of this.components) {
        const spec = ComponentRegistry.get(comp.type);
        if (spec && spec.visual && spec.visual.render && spec.isOverlay) {
          ctx.save();
          spec.visual.render(ctx, comp);
          ctx.restore();
        }
      }
    }

    ctx.restore();
    ctx.canvas._gridSize = savedGridSize;

    // Draw probability label in top-left corner (same style as grid labels)
    const probText = (node.probability * 100).toFixed(0) + '%';
    const fontSize = Math.max(10, Math.min(14, drawWidth / 30));
    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(probText, drawX + 3, drawY + 2);
    ctx.restore();

    if (!snapshot.balls) return;

    // Calculate scale from factory grid to drawn area
    const scaleX = drawWidth / gridWidth;
    const scaleY = drawHeight / gridHeight;
    const ballRadius = Math.min(scaleX, scaleY) * 0.2;

    // Draw balls
    for (const ball of snapshot.balls) {
      if (ball.componentState === 'observed' || ball.componentState === 'consumed') {
        continue;  // Don't draw collected balls
      }

      const ballX = drawX + ball.x * scaleX;
      const ballY = drawY + ball.y * scaleY;

      // Ball color
      const color = BallColors.getHex(ball.color);

      ctx.beginPath();
      ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, scaleX * 3 / 64);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  /**
   * Render Sankey flows from a node to its children
   */
  renderSankeyFlowsForNode(node) {
    const ctx = this.ctx;
    const containerWidth = this.canvas.width / (this.dpr || 1);

    const paths = this.layout.computeSankeyPaths(this.dag, node, containerWidth);

    for (const flow of paths) {
      this.renderSankeyFlow(flow);
    }
  }

  /**
   * Render a single Sankey flow
   */
  renderSankeyFlow(flow) {
    const ctx = this.ctx;

    // Scale coordinates
    const x1Start = flow.x1Start * this.zoom;
    const x1End = flow.x1End * this.zoom;
    const x2Start = flow.x2Start * this.zoom;
    const x2End = flow.x2End * this.zoom;
    const y1 = flow.y1 * this.zoom;
    const y2 = flow.y2 * this.zoom;

    ctx.save();
    ctx.globalAlpha = 0.3;  // Subtle flows

    // Generate path
    const controlOffset = (y2 - y1) * 0.4;

    ctx.beginPath();
    ctx.moveTo(x1Start, y1);
    ctx.bezierCurveTo(
      x1Start, y1 + controlOffset,
      x2Start, y2 - controlOffset,
      x2Start, y2
    );
    ctx.lineTo(x2End, y2);
    ctx.bezierCurveTo(
      x2End, y2 - controlOffset,
      x1End, y1 + controlOffset,
      x1End, y1
    );
    ctx.closePath();

    // Fill with subtle gray
    ctx.fillStyle = 'rgba(180, 180, 180, 0.5)';
    ctx.fill();

    ctx.restore();
  }

  /**
   * Handle scroll events
   */
  onScroll(event) {
    this.render();
  }

  /**
   * Handle wheel events for zoom (normal scrolling is handled by browser)
   */
  onWheel(event) {
    // Only intercept Ctrl/Cmd+wheel for zoom, let browser handle normal scrolling
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();

      // Compute zoom delta with velocity cap
      const delta = -event.deltaY * this.config.zoomSpeed * 0.01;
      const cappedDelta = Math.max(-this.config.maxZoomVelocity, Math.min(this.config.maxZoomVelocity, delta));

      this.targetZoom = Math.max(
        this.config.minZoom,
        Math.min(this.config.maxZoom, this.targetZoom * (1 + cappedDelta))
      );

      // Smooth zoom animation
      this.animateZoom();
    }
  }

  /**
   * Animate zoom smoothly
   */
  animateZoom() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
    }

    const animate = () => {
      const diff = this.targetZoom - this.zoom;

      if (Math.abs(diff) < 0.001) {
        this.zoom = this.targetZoom;
        this.updateLayout();
        this.render();
        return;
      }

      // Ease toward target
      this.zoom += diff * 0.15;
      this.updateLayout();
      this.render();

      this._animationFrame = requestAnimationFrame(animate);
    };

    animate();
  }

  /**
   * Set zoom level directly
   */
  setZoom(level) {
    this.targetZoom = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, level));
    this.animateZoom();
  }

  /**
   * Scroll to a specific node
   */
  scrollToNode(node) {
    if (node && node.y !== undefined) {
      this.container.scrollTop = node.y * this.zoom;
    }
  }

  /**
   * Clean up
   */
  destroy() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
    }
    this.container.innerHTML = '';
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.renderStaticFactoryBackground = renderStaticFactoryBackground;
  window.BranchingRenderer = BranchingRenderer;
}
