/**
 * Animated Branching View
 *
 * Displays an animated visualization of branching probability worlds.
 * Starts with 100% probability world, splits into sub-worlds at decision points.
 * Each world has its own simulation running in lockstep.
 */

// Minimum probability before a world is auto-terminated
const MIN_PROBABILITY_THRESHOLD = 1e-5;
// Maximum number of active (non-terminated) worlds before refusing new splits
const MAX_ACTIVE_WORLDS = 200;

/**
 * Represents a single "world" - one possible path through the probability space
 */
class BranchingWorld {
  constructor(id, probability, rect, simulation, depth = 0) {
    this.id = id;
    this.probability = probability;
    this.rect = { ...rect };  // {x, y, width, height} in normalized [0,1] space
    this.simulation = simulation;
    this.depth = depth;  // How many splits deep this world is

    // Pre-tick state for branching (updated before each tick)
    this.preTickState = null;

    this.terminated = false;
    this.terminatedByLowProbability = false;  // True if terminated due to low probability (stays gray)
    this.reachedTarget = null;  // For "reaches" prediction: true/false/null
    this.reachedObservationIndex = null;  // For "dist" prediction: which observation point (0=A, 1=B, etc.)
    this.targetBallCount = null;  // For "total" prediction: how many balls reached the target

    // Split animation state
    this.splitStartRect = null;  // Starting rect (slightly offset toward split center)
    this.animationProgress = 1.0;  // 0 to 1, 1 = no animation
  }

  /**
   * Get the current display rectangle (interpolated during animation)
   */
  getCurrentRect() {
    if (this.animationProgress < 1 && this.splitStartRect) {
      // Use linear interpolation for consistent speed throughout
      const t = this.animationProgress;
      return {
        x: this.lerp(this.splitStartRect.x, this.rect.x, t),
        y: this.lerp(this.splitStartRect.y, this.rect.y, t),
        width: this.lerp(this.splitStartRect.width, this.rect.width, t),
        height: this.lerp(this.splitStartRect.height, this.rect.height, t)
      };
    }
    return this.rect;
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
}

/**
 * Represents an active split animation
 */
class SplitAnimation {
  constructor(parentWorld, childWorlds, splitLines, startTime, duration) {
    this.parentWorld = parentWorld;
    this.childWorlds = childWorlds;
    this.splitLines = splitLines;
    this.startTime = startTime;
    this.duration = duration;
    this.completed = false;
  }

  getProgress(currentTime) {
    const elapsed = currentTime - this.startTime;
    return Math.min(1, elapsed / this.duration);
  }
}

/**
 * Main animated branching view controller
 */
class AnimatedBranchingView {
  constructor(container, level, config = {}) {
    this.container = container;
    this.level = level;

    this.config = {
      splitAnimationDuration: config.splitAnimationDuration || 1200,  // 1.2s for visible slide effect
      initialWait: config.initialWait || 300,  // Wait before animation starts
      minZoom: config.minZoom || 1.0,  // Don't allow zooming out beyond default view
      minWorldSizeForZoom: config.minWorldSizeForZoom || 1.0,  // Target: smallest world should fill at least this fraction when fully zoomed
      probLabelMaxSize: config.probLabelMaxSize || 14,  // Maximum font size for probability labels
      probLabelSizeMultiplier: config.probLabelSizeMultiplier || 0.12,  // Multiplier for rect size to font size
      ...config
    };

    // Factory info
    this.gridWidth = level.grid.width;
    this.gridHeight = level.grid.height;
    this.factoryAspectRatio = this.gridWidth / this.gridHeight;

    // Rectangle partitioner
    this.partitioner = new RectanglePartitioner(this.factoryAspectRatio);

    // State
    this.worlds = [];
    this.nextWorldId = 0;
    this.activeAnimations = [];
    this.completedSplitLines = [];

    // Playback
    this.running = false;
    this.speed = 1;
    this.lastFrameTime = null;

    // Zoom/pan (using content-space coordinates)
    this.zoom = 1.0;
    this.offsetX = 0;  // Content offset in content coordinates
    this.offsetY = 0;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Prediction info
    this.predictionType = null;
    this.predictionTarget = null;  // For "reaches" mode: observation component ID
    this.observationPoints = [];   // For "dist" mode: sorted list of {id, index, color}

    // Pre-rendered static factory background
    this._staticBackgroundCanvas = null;

    // Cell highlight (for DSL variable hover)
    this.highlightedCell = null;

    // Setup
    this.setupDOM();
    this.setupEvents();
  }

  /**
   * Set the highlighted cell (called from DSL editor hover)
   * @param {Object|null} cell - {gridX, gridY, half: 'full'|'left'|'right'|'top'|'bottom'} or null
   */
  setHighlightedCell(cell) {
    this.highlightedCell = cell;
    // Request a re-render if not currently animating
    if (!this.running) {
      this.render(performance.now());
    }
  }

  setupDOM() {
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.background = '#fafafa';

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    `;
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
  }

  resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    this.dpr = 1;  // Match normal renderer (no DPI scaling)

    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.viewportWidth = rect.width;
    this.viewportHeight = rect.height;
  }

  setupEvents() {
    // Zoom with wheel (zoom toward mouse position)
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Convert mouse position to content coordinates before zoom
      const contentX = (mouseX - this.offsetX * this.zoom) / this.zoom;
      const contentY = (mouseY - this.offsetY * this.zoom) / this.zoom;

      // Compute dynamic max zoom based on smallest world size
      const dynamicMaxZoom = this.computeDynamicMaxZoom();

      // Apply zoom
      const zoomFactor = e.deltaY > 0 ? 0.96 : 1.04;
      const newZoom = Math.max(
        this.config.minZoom,
        Math.min(dynamicMaxZoom, this.zoom * zoomFactor)
      );

      // Adjust offset to keep mouse position fixed in content space
      this.offsetX = (mouseX / newZoom) - contentX;
      this.offsetY = (mouseY / newZoom) - contentY;
      this.zoom = newZoom;

    }, { passive: false });

    // Pan with mouse drag
    this.canvas.addEventListener('mousedown', (e) => {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    });

    // Stored as bound methods so destroy() can remove them. Without this, each
    // replay leaks 3 window-level listeners that pin the old view in memory.
    this._onWindowMouseMove = (e) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.offsetX += dx / this.zoom;
        this.offsetY += dy / this.zoom;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    };
    this._onWindowMouseUp = () => {
      this.isPanning = false;
      this.canvas.style.cursor = 'grab';
    };
    this._onWindowResize = () => this.resizeCanvas();
    window.addEventListener('mousemove', this._onWindowMouseMove);
    window.addEventListener('mouseup', this._onWindowMouseUp);
    window.addEventListener('resize', this._onWindowResize);

    this.canvas.style.cursor = 'grab';
  }

  /**
   * Compute dynamic maximum zoom based on smallest world size.
   * Allows zooming in so the smallest world can fill minWorldSizeForZoom of the view.
   */
  computeDynamicMaxZoom() {
    if (this.worlds.length === 0) {
      return 1.0;
    }

    // Find the smallest world (by minimum dimension)
    let smallestSize = 1.0;
    for (const world of this.worlds) {
      const rect = world.getCurrentRect();
      const minDimension = Math.min(rect.width, rect.height);
      if (minDimension < smallestSize) {
        smallestSize = minDimension;
      }
    }

    // maxZoom = minWorldSizeForZoom / smallestSize
    // This ensures smallest world can fill minWorldSizeForZoom of the view when fully zoomed
    // Always at least 1.0 (no zooming out restriction already handled by minZoom)
    return Math.max(1.0, this.config.minWorldSizeForZoom / smallestSize);
  }

  /**
   * Initialize with level and prediction info
   */
  initialize(predictionType, predictionTarget) {
    this.predictionType = predictionType;

    // Validate prediction type
    if (predictionType !== 'reaches' && predictionType !== 'dist' && predictionType !== 'total') {
      throw new Error(`Unsupported prediction type: "${predictionType}". Supported types: "reaches", "dist", "total".`);
    }

    if (predictionType === 'total' || predictionType === 'reaches') {
      // Find prediction target - either passed explicitly or find component with isPredictionTarget
      if (predictionTarget) {
        this.predictionTarget = predictionTarget;
      } else {
        // Find the observation component marked as prediction target
        const targetComp = this.level.components.find(
          c => c.type === 'observation' && c.params?.isPredictionTarget
        );
        if (targetComp) {
          this.predictionTarget = targetComp.id;
        } else {
          throw new Error('No prediction target found. Set isPredictionTarget on an observation component.');
        }
      }
      console.log(`[AnimatedBranchingView] ${predictionType} mode, target:`, this.predictionTarget);
    } else if (predictionType === 'dist') {
      // Find all observation points and sort by x-coordinate
      this.setupDistModeObservationPoints();
      console.log('[AnimatedBranchingView] dist mode, observation points:', this.observationPoints.map(o => o.id));
    }

    this.renderStaticBackground();

    // Create initial world
    const initialRect = { x: 0, y: 0, width: 1, height: 1 };
    const simulation = this.createSimulation();

    const world = new BranchingWorld(
      this.nextWorldId++,
      1.0,
      initialRect,
      simulation
    );
    // Save initial state
    world.preTickState = serializeSimState(simulation);

    this.worlds = [world];
    this.activeAnimations = [];
    this.completedSplitLines = [];

    // Reset view
    this.zoom = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  /**
   * Setup observation points for "dist" mode.
   * Finds all observation components, sorts by x-coordinate, and assigns indices (A=0, B=1, etc.)
   */
  setupDistModeObservationPoints() {
    // Find all observation components
    const obsComps = this.level.components.filter(c => c.type === 'observation');

    if (obsComps.length === 0) {
      throw new Error('No observation points found for dist mode');
    }

    // Sort by x-coordinate (left to right)
    obsComps.sort((a, b) => a.position.x - b.position.x);

    // Assign indices and colors
    this.observationPoints = obsComps.map((comp, index) => {
      // Set the observationIndex on the component params for rendering
      comp.params.observationIndex = index;

      return {
        id: comp.id,
        index: index,
        label: ObservationColors.getLabel(index),
        color: ObservationColors.getColor(index)
      };
    });
  }

  /**
   * Create a fresh simulation with BranchingRNG
   */
  createSimulation() {
    const simConfig = { ...(this.level.simulation || {}) };
    simConfig.seed = 12345;

    const simulation = new Simulation(this.level, simConfig);
    simulation.resolveReferences();
    BranchingRNG.installOn(simulation);

    return simulation;
  }

  /**
   * Pre-render static factory background
   */
  renderStaticBackground() {
    this._staticBackgroundCanvas = renderStaticFactoryBackground(
      this.gridWidth,
      this.gridHeight,
      this.level.components,
      { skipArms: true }  // Arms need to be rendered dynamically with time
    );
  }

  start() {
    this.running = true;
    this.lastFrameTime = performance.now();
    this.animationStartTime = this.lastFrameTime;
    this.loop();
  }

  pause() {
    this.running = false;
  }

  setSpeed(speed) {
    if (speed === 0) {
      this.pause();
    } else {
      this.speed = speed;
      if (!this.running) {
        this.start();
      }
    }
  }

  loop() {
    if (this._destroyed) return;  // Stop reschedule chain after destroy()

    const currentTime = performance.now();
    const rawDelta = currentTime - this.lastFrameTime;
    const deltaTime = this.running ? rawDelta * this.speed : 0;
    this.lastFrameTime = currentTime;

    // Check if we're still in the initial wait period
    const timeSinceStart = currentTime - this.animationStartTime;
    const inInitialWait = timeSinceStart < this.config.initialWait;

    if (this.running && !inInitialWait) {
      this.stepSimulations(deltaTime, currentTime);
      this.updateAnimations(currentTime, rawDelta);
    }

    this.render(currentTime);

    this._rafId = requestAnimationFrame(() => this.loop());
  }

  /**
   * Step all world simulations
   */
  stepSimulations(deltaTime, currentTime) {
    const worldsToSplit = [];

    for (const world of this.worlds) {
      // Skip terminated worlds
      if (world.terminated) continue;

      const sim = world.simulation;
      const rng = sim.rng;

      // CRITICAL: Save state BEFORE tick for potential branching
      world.preTickState = serializeSimState(sim);

      // Clear any stale pending decision
      rng.consumePendingDecision();

      // Tick
      const wasRunning = sim.running;
      sim.tick(deltaTime);

      // Check for decision
      if (rng.hasPendingDecision()) {
        const decision = rng.consumePendingDecision();
        worldsToSplit.push({
          world,
          decision,
          preTickState: world.preTickState,
          deltaTime  // Pass deltaTime for child re-tick
        });
      }

      // Check termination
      if (wasRunning && !sim.running) {
        this.handleWorldTermination(world);
      }
    }

    // Process splits
    for (const { world, decision, preTickState, deltaTime: dt } of worldsToSplit) {
      this.splitWorld(world, decision, preTickState, dt, currentTime);
    }
  }

  /**
   * Split a world into multiple child worlds
   */
  splitWorld(parentWorld, decision, preTickState, deltaTime, currentTime) {
    const outcomes = decision.outcomes;
    const n = outcomes.length;

    if (n < 2) return;

    // Refuse to split if too many active worlds already
    const activeCount = this.worlds.filter(w => !w.terminated).length;
    if (activeCount + n - 1 > MAX_ACTIVE_WORLDS) {
      // Just let the parent continue with the default outcome (no split)
      return;
    }

    // Compute child probabilities (relative to parent)
    const childProbabilities = outcomes.map(o => o.probability * parentWorld.probability);

    // Get partition of parent's rectangle
    const relativeProbabilities = outcomes.map(o => o.probability);
    const childRects = this.partitioner.partition(parentWorld.rect, relativeProbabilities);
    const splitLines = this.partitioner.getSplitLines(parentWorld.rect, relativeProbabilities);

    // Compute starting rects for slide-apart animation
    // Children start slightly offset toward the center of the split, then slide to their final positions
    const startRects = this.computeSlideStartRects(parentWorld.rect, childRects);

    // Create child worlds
    const childWorlds = [];

    for (let i = 0; i < n; i++) {
      const outcome = outcomes[i];

      // Create new simulation and restore to PRE-TICK state
      const childSim = this.createSimulation();
      restoreSimState(childSim, preTickState);

      // Force this specific outcome for the pending decision
      childSim.rng.forcedOutcome = outcome.value;

      // Re-tick with same deltaTime as parent to reach decision point
      childSim.tick(deltaTime);
      childSim.rng.consumePendingDecision();  // Clear any nested decisions

      const childWorld = new BranchingWorld(
        this.nextWorldId++,
        childProbabilities[i],
        childRects[i],  // Final position
        childSim,
        parentWorld.depth + 1  // Increment depth
      );

      // Setup slide-apart animation
      childWorld.splitStartRect = startRects[i];
      childWorld.animationProgress = 0;

      // Check probability threshold - terminate if too unlikely (stays gray, no target check)
      if (childWorld.probability < MIN_PROBABILITY_THRESHOLD) {
        childWorld.terminated = true;
        childWorld.terminatedByLowProbability = true;
      }

      // Initialize preTickState for future ticks
      childWorld.preTickState = serializeSimState(childSim);

      childWorlds.push(childWorld);
    }

    // Create animation record (use currentTime for consistent timing)
    const animation = new SplitAnimation(
      parentWorld,
      childWorlds,
      splitLines,
      currentTime,
      this.config.splitAnimationDuration
    );
    this.activeAnimations.push(animation);

    // Add children to world list
    this.worlds.push(...childWorlds);

    // Remove parent immediately (children cover the same area even during animation)
    const idx = this.worlds.indexOf(parentWorld);
    if (idx >= 0) {
      this.worlds.splice(idx, 1);
    }
  }

  /**
   * Compute starting rectangles for split animation.
   * All children start at the parent's exact position and size,
   * then animate to their final positions independently.
   */
  computeSlideStartRects(parentRect, childRects) {
    // All children start at the parent's position and size
    return childRects.map(() => ({ ...parentRect }));
  }

  /**
   * Update split animations (child slide-apart + split line fade-in)
   */
  updateAnimations(currentTime, rawDelta) {
    for (const anim of this.activeAnimations) {
      const progress = anim.getProgress(currentTime);

      // Update child animation progress
      for (const child of anim.childWorlds) {
        child.animationProgress = progress;
        if (progress >= 1) {
          // Clear animation state
          child.splitStartRect = null;
          child.animationProgress = 1;
        }
      }

      if (progress >= 1) {
        anim.completed = true;
        // Move split lines to permanent collection
        this.completedSplitLines.push(...anim.splitLines);
      }
    }

    this.activeAnimations = this.activeAnimations.filter(a => !a.completed);
  }

  /**
   * Handle world termination
   */
  handleWorldTermination(world) {
    world.terminated = true;

    if (this.predictionType === 'reaches') {
      world.reachedTarget = this.checkReachedTarget(world);
    } else if (this.predictionType === 'dist') {
      world.reachedObservationIndex = this.findReachedObservationIndex(world);
    } else if (this.predictionType === 'total') {
      world.targetBallCount = this.countBallsAtTarget(world);
    }
  }

  /**
   * Count how many balls reached the target observation point (for "total" mode)
   */
  countBallsAtTarget(world) {
    const sim = world.simulation;
    let count = 0;

    for (const ball of sim.balls) {
      if (ball.componentId === this.predictionTarget) {
        if (ball.componentState === 'arriving' || ball.componentState === 'observed') {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Check if world reached prediction target (for "reaches" mode)
   */
  checkReachedTarget(world) {
    const sim = world.simulation;

    // Check if any ball is at the target observation point
    for (const ball of sim.balls) {
      if (ball.componentId === this.predictionTarget) {
        if (ball.componentState === 'arriving' || ball.componentState === 'observed') {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Find which observation point a ball reached (for "dist" mode)
   * Returns the observation index (0=A, 1=B, etc.) or null if none reached
   */
  findReachedObservationIndex(world) {
    const sim = world.simulation;

    // Check each observation point
    for (const obsPoint of this.observationPoints) {
      for (const ball of sim.balls) {
        if (ball.componentId === obsPoint.id) {
          if (ball.componentState === 'arriving' || ball.componentState === 'observed') {
            return obsPoint.index;
          }
        }
      }
    }

    return null;  // Ball didn't reach any observation point (e.g., black pit)
  }

  /**
   * Main render function
   */
  render(currentTime) {
    const ctx = this.ctx;
    const width = this.viewportWidth;
    const height = this.viewportHeight;

    // Clear
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Apply zoom and pan transform
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(this.offsetX, this.offsetY);

    // Draw all worlds first
    for (const world of this.worlds) {
      this.renderWorld(ctx, world, width, height);
    }

    // Draw split lines on top of worlds for clean separation
    this.drawSplitLines(ctx, this.completedSplitLines, width, height, 1.0);

    // Draw animating split lines
    for (const anim of this.activeAnimations) {
      const progress = anim.getProgress(currentTime);
      this.drawSplitLines(ctx, anim.splitLines, width, height, progress);
    }

    ctx.restore();
  }

  /**
   * Draw split lines
   * Line thickness scales linearly with line length (longer lines = larger worlds = thicker)
   */
  drawSplitLines(ctx, lines, viewWidth, viewHeight, alpha) {
    if (alpha <= 0) return;

    ctx.save();
    ctx.lineCap = 'round';

    for (const line of lines) {
      // Calculate line length in normalized coordinates (0-1 range)
      const lineLength = Math.sqrt(
        Math.pow(line.x2 - line.x1, 2) + Math.pow(line.y2 - line.y1, 2)
      );

      // Scale thickness linearly with line length
      // Full-height/width line (length ~1.0) gets thickness 3, scales down linearly
      const baseThickness = 3;
      ctx.lineWidth = (baseThickness * lineLength) / this.zoom;
      ctx.strokeStyle = `rgba(80, 80, 80, ${alpha * 0.8})`;

      ctx.beginPath();
      ctx.moveTo(line.x1 * viewWidth, line.y1 * viewHeight);
      ctx.lineTo(line.x2 * viewWidth, line.y2 * viewHeight);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Render a single world
   */
  renderWorld(ctx, world, viewWidth, viewHeight) {
    const rect = world.getCurrentRect();

    // Convert to pixels
    const pixelRect = {
      x: rect.x * viewWidth,
      y: rect.y * viewHeight,
      width: rect.width * viewWidth,
      height: rect.height * viewHeight
    };

    // Skip if too small (less than 3 pixels in either dimension at current zoom)
    const minSize = 3 / this.zoom;
    if (pixelRect.width < minSize || pixelRect.height < minSize) {
      return;
    }

    // Compute canvas rect (aspect-ratio preserved)
    const canvasRect = this.partitioner.computeCanvasRect(pixelRect);

    // Render factory using ctx.scale from a reference cell size.
    // The reference matches the normal renderer's cell size (full-viewport).
    // This ensures borders/fonts scale proportionally when worlds shrink.
    const refCellSize = Math.floor(Math.min(
      this.viewportWidth / this.gridWidth,
      this.viewportHeight / this.gridHeight
    ));
    const frameCellSize = canvasRect.width / this.gridWidth;
    const scaleRatio = frameCellSize / refCellSize;

    const savedGridSize = ctx.canvas._gridSize;
    ctx.canvas._gridSize = refCellSize;

    ctx.save();
    ctx.translate(canvasRect.x, canvasRect.y);
    ctx.scale(scaleRatio, scaleRatio);

    const refWidth = this.gridWidth * refCellSize;
    const refHeight = this.gridHeight * refCellSize;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, refWidth, refHeight);

    // Grid lines
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= this.gridWidth; gx++) {
      ctx.beginPath();
      ctx.moveTo(gx * refCellSize, 0);
      ctx.lineTo(gx * refCellSize, refHeight);
      ctx.stroke();
    }
    for (let gy = 0; gy <= this.gridHeight; gy++) {
      ctx.beginPath();
      ctx.moveTo(0, gy * refCellSize);
      ctx.lineTo(refWidth, gy * refCellSize);
      ctx.stroke();
    }

    // Components
    for (const comp of this.level.components) {
      if (comp.type === 'arm') continue;
      const spec = ComponentRegistry.get(comp.type);
      if (spec && spec.visual && spec.visual.render && !spec.isOverlay) {
        ctx.save();
        spec.visual.render(ctx, comp);
        ctx.restore();
      }
    }
    for (const comp of this.level.components) {
      const spec = ComponentRegistry.get(comp.type);
      if (spec && spec.visual && spec.visual.render && spec.isOverlay) {
        ctx.save();
        spec.visual.render(ctx, comp);
        ctx.restore();
      }
    }

    // Cell labels (A1, B2, etc.)
    if (this.level.components.length > 0) {
      let minX = Infinity, minY = Infinity;
      for (const comp of this.level.components) {
        minX = Math.min(minX, comp.position.x);
        minY = Math.min(minY, comp.position.y);
      }
      ctx.save();
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (const comp of this.level.components) {
        const relX = comp.position.x - minX;
        const relY = comp.position.y - minY;
        const label = `${String.fromCharCode(65 + relX)}${relY + 1}`;
        ctx.fillText(label, comp.position.x * refCellSize + 3, comp.position.y * refCellSize + 2);
      }
      ctx.restore();
    }

    ctx.restore();
    ctx.canvas._gridSize = savedGridSize;

    // Draw dynamic components (arms) that need time parameter
    this.renderDynamicComponents(ctx, world, canvasRect);

    // Draw balls
    this.renderBalls(ctx, world, canvasRect);

    // Draw cell highlight if active
    this.renderCellHighlight(ctx, canvasRect);

    // Draw terminal state overlay
    // Skip overlay for low-probability-terminated worlds (they stay gray)
    if (world.terminated && !world.terminatedByLowProbability) {
      ctx.save();

      if (this.predictionType === 'reaches') {
        // Green for success, red for failure
        if (world.reachedTarget) {
          ctx.fillStyle = 'rgba(76, 175, 80, 0.35)';
        } else {
          ctx.fillStyle = 'rgba(244, 67, 54, 0.35)';
        }
      } else if (this.predictionType === 'dist') {
        // Color by observation point reached
        if (world.reachedObservationIndex !== null) {
          const color = ObservationColors.getColor(world.reachedObservationIndex);
          // Convert hex to rgba with alpha
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`;
        } else {
          // Ball didn't reach any observation point - gray
          ctx.fillStyle = 'rgba(128, 128, 128, 0.35)';
        }
      } else if (this.predictionType === 'total') {
        // Heat map gradient based on ball count
        const { min, max } = this.computeCountRange();
        const count = world.targetBallCount !== null ? world.targetBallCount : 0;
        const color = this.getHeatMapColor(count, min, max);
        // Convert hex to rgba with alpha
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
      }

      // Fill the entire pixel rect (covers both background and canvas)
      ctx.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height);
      ctx.restore();
    }

    // Draw probability label in top-left of AREA (not canvas)
    this.renderProbabilityLabel(ctx, world, pixelRect);

    // Draw border around the area for clarity
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1 / this.zoom;
    ctx.strokeRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height);
    ctx.restore();
  }

  /**
   * Render dynamic components (arms) that need time parameter
   */
  renderDynamicComponents(ctx, world, canvasRect) {
    const sim = world.simulation;
    const time = sim.getTime();

    const scaleX = canvasRect.width / this.gridWidth;
    const scaleY = canvasRect.height / this.gridHeight;
    const scale = Math.min(scaleX, scaleY);

    // Find arm components in the simulation
    for (const comp of sim.components) {
      if (comp.type !== 'arm') continue;

      const spec = ComponentRegistry.get('arm');
      if (!spec) continue;

      // Get pivot center (in grid coordinates, then convert to pixels)
      const pivotGrid = spec.getPivotCenter(comp);
      const centerX = canvasRect.x + pivotGrid.x * scaleX;
      const centerY = canvasRect.y + pivotGrid.y * scaleY;

      // Get current arm angle
      const armAngle = spec.getCurrentArmAngle(comp, time);

      // Render in screen coordinates to avoid text drift at small scales
      const screenCenterX = (centerX + this.offsetX) * this.zoom;
      const screenCenterY = (centerY + this.offsetY) * this.zoom;
      const screenScale = scale * this.zoom;

      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);  // Reset to screen coordinates (preserving DPR)
      spec.renderAtPosition(ctx, screenCenterX, screenCenterY, armAngle, screenScale, comp.params.drawCount);
      ctx.restore();
    }
  }

  /**
   * Render balls
   */
  renderBalls(ctx, world, canvasRect) {
    const sim = world.simulation;
    const time = sim.getTime();

    const scaleX = canvasRect.width / this.gridWidth;
    const scaleY = canvasRect.height / this.gridHeight;
    const defaultBallRadius = Math.min(scaleX, scaleY) * 0.2;

    for (const ball of sim.balls) {
      // Skip consumed balls only (not observed - they should be visible)
      if (ball.componentState === 'consumed') {
        continue;
      }

      // Get ball position - use trajectory if available, otherwise use component's getPosition
      let x, y;
      let scale = 1.0;
      let opacity = 1.0;
      let progress = 0;

      const component = sim.componentsById.get(ball.componentId);
      const spec = component ? ComponentRegistry.get(component.type) : null;
      const stateSpec = (spec && ball.componentState) ? spec.states?.[ball.componentState] : null;

      if (ball.trajectory) {
        // Ball is following a trajectory
        const effectiveTime = Math.max(
          ball.trajectoryStartTime,
          Math.min(time, ball.trajectoryStartTime + ball.trajectoryDuration)
        );
        const elapsed = effectiveTime - ball.trajectoryStartTime;
        progress = ball.trajectoryDuration > 0
          ? Math.min(1, elapsed / ball.trajectoryDuration)
          : 0;
        const pos = ball.trajectory(progress);
        x = pos.x;
        y = pos.y;

        // Apply visual properties from state spec (e.g., black-pit arriving state fades/shrinks)
        if (stateSpec && stateSpec.visual) {
          if (stateSpec.visual.scale !== undefined) {
            scale = typeof stateSpec.visual.scale === 'function'
              ? stateSpec.visual.scale(progress)
              : stateSpec.visual.scale;
          }
          if (stateSpec.visual.opacity !== undefined) {
            opacity = typeof stateSpec.visual.opacity === 'function'
              ? stateSpec.visual.opacity(progress)
              : stateSpec.visual.opacity;
          }
        }
      } else if (component && ball.componentState) {
        // No trajectory - use component state's getPosition method
        if (stateSpec && stateSpec.getPosition) {
          const pos = stateSpec.getPosition(ball, component, time);
          x = pos.x;
          y = pos.y;
        } else if (ball.position) {
          // State has no getPosition method - use stored position
          x = ball.position.x;
          y = ball.position.y;
        } else {
          throw new Error(`[AnimatedBranchingView] Ball ${ball.id} in state '${ball.componentState}' has no position`);
        }

        // Get visual properties from state spec
        if (stateSpec && stateSpec.visual) {
          if (stateSpec.visual.scale !== undefined) {
            scale = typeof stateSpec.visual.scale === 'function'
              ? stateSpec.visual.scale(0)
              : stateSpec.visual.scale;
          }
          if (stateSpec.visual.opacity !== undefined) {
            opacity = typeof stateSpec.visual.opacity === 'function'
              ? stateSpec.visual.opacity(0)
              : stateSpec.visual.opacity;
          }
        }
      } else if (ball.position) {
        // No trajectory and no component - use stored position
        x = ball.position.x;
        y = ball.position.y;
      } else {
        throw new Error(`[AnimatedBranchingView] Ball ${ball.id} has no trajectory, no component (${ball.componentId}), and no position`);
      }

      // Skip rendering fully transparent balls
      if (opacity <= 0) {
        continue;
      }

      const ballX = canvasRect.x + x * scaleX;
      const ballY = canvasRect.y + y * scaleY;
      const ballRadius = defaultBallRadius * scale;

      // Calculate on-screen position and size (accounting for zoom and offset)
      const screenX = (ballX + this.offsetX) * this.zoom;
      const screenY = (ballY + this.offsetY) * this.zoom;
      const screenRadius = ballRadius * this.zoom;

      // Draw in screen coordinates to ensure arc has proper segment count
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);  // Reset to screen coordinates (preserving DPR)
      ctx.globalAlpha = opacity;

      ctx.beginPath();
      ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
      ctx.fillStyle = BallColors.getHex(ball.color);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = Math.max(0.5, scaleX * this.zoom * 0.03);
      ctx.stroke();

      // Colorblind marker
      if (window.BallColors.colorblindMode && ball.colorVisible !== false) {
        window.BallColors.drawMarker(ctx, screenX, screenY, screenRadius, ball.color);
      }

      ctx.restore();
    }
  }

  /**
   * Render cell highlight overlay
   */
  renderCellHighlight(ctx, canvasRect) {
    if (!this.highlightedCell) return;

    const { gridX, gridY, half } = this.highlightedCell;

    // Calculate the scale from grid to canvas
    const scaleX = canvasRect.width / this.gridWidth;
    const scaleY = canvasRect.height / this.gridHeight;

    // Calculate cell position in canvas space
    const cellX = canvasRect.x + gridX * scaleX;
    const cellY = canvasRect.y + gridY * scaleY;
    const cellWidth = scaleX;
    const cellHeight = scaleY;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 0, 0.35)';  // Yellow highlight

    if (half === 'left') {
      ctx.fillRect(cellX, cellY, cellWidth / 2, cellHeight);
    } else if (half === 'right') {
      ctx.fillRect(cellX + cellWidth / 2, cellY, cellWidth / 2, cellHeight);
    } else if (half === 'top') {
      ctx.fillRect(cellX, cellY, cellWidth, cellHeight / 2);
    } else if (half === 'bottom') {
      ctx.fillRect(cellX, cellY + cellHeight / 2, cellWidth, cellHeight / 2);
    } else {
      ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
    }

    // Draw border
    ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
    ctx.lineWidth = Math.max(1, 2 / this.zoom);
    if (half === 'left') {
      ctx.strokeRect(cellX + 1, cellY + 1, cellWidth / 2 - 2, cellHeight - 2);
    } else if (half === 'right') {
      ctx.strokeRect(cellX + cellWidth / 2 + 1, cellY + 1, cellWidth / 2 - 2, cellHeight - 2);
    } else if (half === 'top') {
      ctx.strokeRect(cellX + 1, cellY + 1, cellWidth - 2, cellHeight / 2 - 2);
    } else if (half === 'bottom') {
      ctx.strokeRect(cellX + 1, cellY + cellHeight / 2 + 1, cellWidth - 2, cellHeight / 2 - 2);
    } else {
      ctx.strokeRect(cellX + 1, cellY + 1, cellWidth - 2, cellHeight - 2);
    }

    ctx.restore();
  }

  /**
   * Render probability label
   * Rendered in screen coordinates with clamped font size for consistent appearance
   */
  renderProbabilityLabel(ctx, world, pixelRect) {
    const rectSize = Math.min(pixelRect.width, pixelRect.height);

    // Desired on-screen font size: proportional to world's on-screen size
    const desiredOnScreenFontSize = rectSize * this.zoom * this.config.probLabelSizeMultiplier;

    // Clamp to reasonable on-screen range
    const minFontSize = 6;   // Minimum readable size
    const maxFontSize = 24;  // Maximum size (prevents massive labels)
    const onScreenFontSize = Math.max(minFontSize, Math.min(maxFontSize, desiredOnScreenFontSize));

    // Don't render if would be too small
    if (desiredOnScreenFontSize < minFontSize * 0.5) {
      return;
    }

    // Format: 2 decimals if <1%, otherwise 1 decimal
    const probPercent = world.probability * 100;
    const probText = probPercent < 1
      ? probPercent.toFixed(2) + '%'
      : probPercent.toFixed(1) + '%';

    // Render in screen coordinates for consistent text rendering
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);  // Reset to screen coordinates (preserving DPR)

    ctx.font = `bold ${onScreenFontSize}px sans-serif`;

    // Measure text dimensions
    const metrics = ctx.measureText(probText);
    const textWidth = metrics.width;
    const textHeight = metrics.actualBoundingBoxAscent !== undefined
      ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
      : onScreenFontSize;

    const padding = Math.max(2, onScreenFontSize * 0.2);

    // Convert world position to screen position
    const screenX = (pixelRect.x + this.offsetX) * this.zoom;
    const screenY = (pixelRect.y + this.offsetY) * this.zoom;

    // Background position and size (in screen coordinates)
    const bgX = screenX + padding;
    const bgY = screenY + padding;
    const bgW = textWidth + padding * 2;
    const bgH = textHeight + padding * 2;

    // Draw background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(bgX, bgY, bgW, bgH);

    // Draw text
    ctx.fillStyle = '#000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const textX = bgX + padding;
    const textY = bgY + padding + (metrics.actualBoundingBoxAscent !== undefined
      ? metrics.actualBoundingBoxAscent
      : onScreenFontSize * 0.8);
    ctx.fillText(probText, textX, textY);

    ctx.restore();
  }

  /**
   * Check if all worlds terminated
   */
  isComplete() {
    return this.worlds.length > 0 &&
           this.worlds.every(w => w.terminated);
  }

  /**
   * Get success probability (for "reaches" mode)
   */
  getSuccessProbability() {
    return this.worlds
      .filter(w => w.terminated && w.reachedTarget)
      .reduce((sum, w) => sum + w.probability, 0);
  }

  /**
   * Get the true distribution over observation points (for "dist" mode)
   * Returns an array of {index, label, color, probability} for each observation point
   */
  getTrueDistribution() {
    if (this.predictionType !== 'dist') {
      throw new Error('getTrueDistribution() only available in dist mode');
    }

    // Sum probabilities for each observation point
    const probByIndex = new Map();
    for (const obsPoint of this.observationPoints) {
      probByIndex.set(obsPoint.index, 0);
    }

    for (const world of this.worlds) {
      if (world.terminated && world.reachedObservationIndex !== null) {
        const current = probByIndex.get(world.reachedObservationIndex) || 0;
        probByIndex.set(world.reachedObservationIndex, current + world.probability);
      }
    }

    // Build result array
    return this.observationPoints.map(obsPoint => ({
      index: obsPoint.index,
      label: obsPoint.label,
      color: obsPoint.color,
      probability: probByIndex.get(obsPoint.index) || 0
    }));
  }

  /**
   * Get number of observation points (for "dist" mode)
   */
  getObservationPointCount() {
    return this.observationPoints.length;
  }

  /**
   * Get observation points info (for betting interface)
   */
  getObservationPointsInfo() {
    return this.observationPoints.map(p => ({
      index: p.index,
      label: p.label,
      color: p.color
    }));
  }

  /**
   * Compute the range of ball counts across all terminated worlds (for "total" mode)
   * Returns {min, max}
   */
  computeCountRange() {
    let min = Infinity;
    let max = 0;

    for (const world of this.worlds) {
      if (world.terminated && !world.terminatedByLowProbability && world.targetBallCount !== null) {
        if (world.targetBallCount < min) min = world.targetBallCount;
        if (world.targetBallCount > max) max = world.targetBallCount;
      }
    }

    return {
      min: min === Infinity ? 0 : min,
      max: max || 1
    };
  }

  /**
   * Get heat map gradient color for a ball count (for "total" mode)
   * Uses yellow → orange → red gradient
   * @param {number} count - Ball count
   * @param {number} minCount - Minimum count in range
   * @param {number} maxCount - Maximum count in range
   * @returns {string} Hex color
   */
  getHeatMapColor(count, minCount, maxCount) {
    // Normalize count to 0-1 range
    const normalized = (maxCount > minCount)
      ? (count - minCount) / (maxCount - minCount)
      : 0.5;

    // Heat map: yellow (#FFEB3B) → orange (#FF9800) → red (#F44336)
    if (normalized < 0.5) {
      // Yellow to orange (0 → 0.5)
      const t = normalized * 2;
      return this.interpolateColor('#FFEB3B', '#FF9800', t);
    } else {
      // Orange to red (0.5 → 1)
      const t = (normalized - 0.5) * 2;
      return this.interpolateColor('#FF9800', '#F44336', t);
    }
  }

  /**
   * Interpolate between two hex colors
   */
  interpolateColor(color1, color2, t) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Clean up
   */
  destroy() {
    this.running = false;
    this._destroyed = true;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._onWindowMouseMove) window.removeEventListener('mousemove', this._onWindowMouseMove);
    if (this._onWindowMouseUp) window.removeEventListener('mouseup', this._onWindowMouseUp);
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
    this.container.innerHTML = '';
  }
}

// Export
if (typeof window !== 'undefined') {
  window.AnimatedBranchingView = AnimatedBranchingView;
  window.BranchingWorld = BranchingWorld;
  window.SplitAnimation = SplitAnimation;
}
