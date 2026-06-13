/**
 * Level Editor for Todennakoisyyspaattely
 *
 * Interactive editor for creating probability model levels
 * Adapted from todennakoisyystehdas level editor
 */

const DEFAULT_DGP_SCRIPT = `
sack("compX", {red: 100});

const arm1 = arm();

schedule({
  arm1: [0]
});

predict("compX", "reaches");

montecarlo(1000);`;

// Rotate sides 90° clockwise (right→down→left→up). Preserves type and count.
function rotateSidesClockwise(sides) {
  const map = {right: 'down', down: 'left', left: 'up', up: 'right'};
  const out = {
    up: {type: 'none', count: 0},
    right: {type: 'none', count: 0},
    down: {type: 'none', count: 0},
    left: {type: 'none', count: 0}
  };
  for (const side of ['up', 'right', 'down', 'left']) {
    if (sides[side] && sides[side].type !== 'none') {
      out[map[side]] = {...sides[side]};
    }
  }
  return out;
}

function defaultDuplicatorSides(params) {
  const count = params.copies || 2;
  return {
    up: {type: 'none', count: 0},
    right: {type: 'output', count: count},
    down: {type: 'none', count: 0},
    left: {type: 'input', count: 0}
  };
}

function defaultShufflerSides(params) {
  const count = params.numInputs || 2;
  const outputSide = params.outputSide || 'down';
  const sides = {
    up: {type: 'none', count: 0},
    right: {type: 'none', count: 0},
    down: {type: 'none', count: 0},
    left: {type: 'none', count: 0}
  };
  sides[outputSide] = {type: 'output', count: count};
  const opposite = {up: 'down', right: 'left', down: 'up', left: 'right'};
  sides[opposite[outputSide]] = {type: 'input', count: 0};
  return sides;
}

function sidesToOutputPattern(sides) {
  if (!sides) return [];
  const pattern = [];
  for (const side of ['up', 'right', 'down', 'left']) {
    if (sides[side] && sides[side].type === 'output' && sides[side].count > 0) {
      pattern.push({side, count: sides[side].count});
    }
  }
  return pattern;
}

function patternToSides(pattern, existingSides) {
  const sides = {
    up: {type: 'none', count: 0},
    right: {type: 'none', count: 0},
    down: {type: 'none', count: 0},
    left: {type: 'none', count: 0}
  };
  if (existingSides) {
    for (const side of ['up', 'right', 'down', 'left']) {
      if (existingSides[side] && existingSides[side].type === 'input') {
        sides[side] = {...existingSides[side]};
      }
    }
  }
  for (const entry of pattern) {
    if (entry.side && ['up', 'right', 'down', 'left'].includes(entry.side)) {
      sides[entry.side] = {type: 'output', count: entry.count};
    }
  }
  return sides;
}

class LevelEditor {
  constructor() {
    this.canvas = document.getElementById('editor-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.gridSize = 64;
    this.gridWidth = 10;
    this.gridHeight = 8;

    // Editor state
    this.currentTool = 'select';
    this.selectedComponentType = null;
    this.pendingComponentParams = {}; // Parameters for component about to be placed
    this.components = [];
    this.connections = [];
    this.selectedComponent = null;
    this.clipboard = null;
    this.nextComponentId = 1;

    // Track which DSL-defined arms have been placed
    this.placedArms = new Set();

    // Veil state: set of "x,y" strings for veiled tiles
    this.veiledTiles = new Set();

    // DGP versions: snapshots of components on veiled tiles
    this.dgpVersions = [];       // Array of {id, label, components: [...], connections: [...]}
    this.activeVersionIndex = -1; // -1 = no version loaded, editing freely

    // DGP (Data Generating Process) configuration
    this.dgpScript = '';           // The DGP DSL script
    this.dgpResult = null;         // Parsed result from DGPEngine
    this.computedDistribution = {};  // Computed distribution from simulation
    this.modelScript = '';         // Reference DSL solution (shown to player after)

    // Track loaded level for updates
    this.loadedLevelId = null;     // ID of level loaded from registry (null = new level)

    // DGP Engine instance
    this.dgpEngine = new DGPEngine();

    // History for undo/redo
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;

    // Interaction state
    this.isDragging = false;
    this.dragStart = null;
    this.connectFrom = null;
    this.mouseGridPos = null; // Track mouse position for preview

    // Display options
    this.showLabels = true;  // Component labels like A1, B2

    this.init();
  }

  init() {
    this.updateCanvasSize();
    this.populateComponentPalette();
    this.setupEventListeners();
    this.setupDgpAlternativesPanel();
    this.updateAutomaticConnections(); // Initialize connections
    this.saveState();
    this.render();
  }

  updateCanvasSize() {
    this.canvas.width = this.gridWidth * this.gridSize;
    this.canvas.height = this.gridHeight * this.gridSize;
  }

  populateComponentPalette() {
    const palette = document.getElementById('component-palette');

    // Component types with hotkeys - stored for keyboard handler
    this.componentTypes = [
      {type: 'sack', icon: '🎒', hotkey: 'S'},
      {type: 'arm', icon: '🦾', hotkey: 'A'},
      {type: 'conveyor', icon: '→', hotkey: 'B'},
      {type: 'conveyor-turn', icon: '↪', hotkey: 'T'},
      {type: 'shuffler', icon: '🔀', hotkey: 'H'},
      {type: 'splitter', icon: '⑂', hotkey: 'L'},
      {type: 'observation', icon: '🗑️', hotkey: 'O'},
      {type: 'black-pit', icon: '⚫', hotkey: 'K'},
      {type: 'duplicator', icon: '×', hotkey: 'U'},
      {type: 'filter', icon: '⊲', hotkey: 'F'},
      {type: 'merger', icon: '⊳', hotkey: 'G'},
      {type: 'button', icon: '🔴', hotkey: 'N'},
      {type: 'switch', icon: '⇥', hotkey: 'I'}
    ];

    // Build hotkey lookup map (case-insensitive)
    this.hotkeyToType = new Map();
    for (const item of this.componentTypes) {
      this.hotkeyToType.set(item.hotkey.toLowerCase(), item.type);
    }

    this.componentTypes.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'component-btn';
      btn.dataset.type = item.type;
      btn.innerHTML = `
        <span class="icon">${item.icon}</span>
        <span class="name">${item.type}</span>
        <span class="hotkey">${item.hotkey}</span>
      `;
      btn.onclick = () => this.selectComponentType(item.type);
      palette.appendChild(btn);
    });
  }

  setupEventListeners() {
    // Canvas events
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTool(btn.dataset.tool);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.onKeyDown(e));

    // Header buttons
    document.getElementById('new-level').onclick = () => this.newLevel();
    document.getElementById('load-level').onclick = () => this.loadLevel();
    document.getElementById('save-level').onclick = () => this.saveLevel();
    document.getElementById('test-level').onclick = () => this.testLevel();

    // Grid size buttons - columns
    document.getElementById('add-col-left').onclick = () => this.addColumn('left');
    document.getElementById('add-col-right').onclick = () => this.addColumn('right');
    document.getElementById('remove-col-left').onclick = () => this.removeColumn('left');
    document.getElementById('remove-col-right').onclick = () => this.removeColumn('right');
    // Grid size buttons - rows
    document.getElementById('add-row-top').onclick = () => this.addRow('top');
    document.getElementById('add-row-bottom').onclick = () => this.addRow('bottom');
    document.getElementById('remove-row-top').onclick = () => this.removeRow('top');
    document.getElementById('remove-row-bottom').onclick = () => this.removeRow('bottom');

    // Update grid size displays
    this.updateGridSizeDisplays();

    // DGP Script editor
    this.setupDGPEditor();
  }

  setupDGPEditor() {
    // DGP Script textarea
    const dgpScript = document.getElementById('dgp-script');
    if (dgpScript) {
      // Set default script if empty
      if (!dgpScript.value.trim()) {
        dgpScript.value = DEFAULT_DGP_SCRIPT;
      }
      this.dgpScript = dgpScript.value;
      dgpScript.addEventListener('input', (e) => {
        this.dgpScript = e.target.value;
      });
    }

    // Execute DGP button
    const executeBtn = document.getElementById('execute-dgp');
    if (executeBtn) {
      executeBtn.onclick = () => this.executeDGP();
    }

    // Model script textarea (shown to player after)
    const modelScript = document.getElementById('model-script');
    if (modelScript) {
      modelScript.addEventListener('input', (e) => {
        this.modelScript = e.target.value;
      });
    }
  }

  /**
   * Execute the DGP script and compute the distribution
   */
  executeDGP() {
    const resultDiv = document.getElementById('dgp-result');
    const distDiv = document.getElementById('computed-distribution');
    const distBars = document.getElementById('distribution-bars');

    if (!resultDiv) return;

    // Execute the DGP script
    this.dgpResult = this.dgpEngine.execute(this.dgpScript);

    // Reset placed arms tracking, then re-populate from existing components
    this.placedArms = new Set();
    this.components.filter(c => c.type === 'arm' && c.params.varName).forEach(comp => {
      if (this.dgpResult.arms?.[comp.params.varName]) {
        this.placedArms.add(comp.params.varName);
      }
    });

    // Display result
    let html = '';

    if (this.dgpResult.errors.length > 0) {
      // Show errors
      this.dgpResult.errors.forEach(err => {
        html += `<div class="error">❌ ${err.message}</div>`;
      });
      if (distDiv) distDiv.style.display = 'none';
      this.setStatus('DGP errors - check script', 'error');
    } else {
      // Show success info
      const sackCount = Object.keys(this.dgpResult.sacks).length;
      const armCount = Object.keys(this.dgpResult.arms).length;
      const ballCount = this.dgpResult.ballCount;

      html += `<div class="success">✓ DGP parsed successfully</div>`;
      html += `<div class="info">Sacks defined: ${sackCount} (${Object.keys(this.dgpResult.sacks).join(', ')})</div>`;
      html += `<div class="info">Arms defined: ${armCount}</div>`;
      html += `<div class="info">Ball count: ${ballCount}</div>`;
      html += `<div class="info">Question: "${this.dgpResult.questionText}"</div>`;

      const predictionWhat = this.dgpResult.prediction?.what;
      const targetLabel = this.dgpResult.prediction?.target;

      // Clear isPredictionTarget from all observation components
      this.components.filter(c => c.type === 'observation').forEach(c => {
        if (!c.params) c.params = {};
        c.params.isPredictionTarget = false;
        delete c.params.observationIndex;  // Clear dist mode indices
      });

      if (predictionWhat === 'dist') {
        // "dist" mode: distribution over all observation points
        html += `<div class="info">Predict: distribution over observation points</div>`;

        // Get observation points sorted by x-coordinate (left to right)
        const obsPoints = this.components
          .filter(c => c.type === 'observation')
          .sort((a, b) => a.position.x - b.position.x);

        if (obsPoints.length === 0) {
          html += `<div class="error">⚠ No observation points found. Add at least one observation point.</div>`;
        } else {
          // Assign observation indices for rendering (A=0, B=1, C=2, ...)
          obsPoints.forEach((comp, index) => {
            if (!comp.params) comp.params = {};
            comp.params.observationIndex = index;
          });

          const labels = obsPoints.map((_, i) => String.fromCharCode(65 + i)).join(', ');
          html += `<div class="info">Observation points: ${labels} (left-to-right)</div>`;
        }
      } else {
        // Other modes: validate single target
        html += `<div class="info">Predict: ${predictionWhat} in "${targetLabel}"</div>`;

        const targetComponent = this.components.find(c =>
          (c.type === 'observation') && (c.params.label === targetLabel || c.id === targetLabel)
        );

        if (targetComponent) {
          targetComponent.params.isPredictionTarget = true;
        } else {
          html += `<div class="error">⚠ Target "${targetLabel}" not found. Add an observation point with label "${targetLabel}".</div>`;
        }
      }

      // Set drawCount on arm components from schedule
      // Count actual schedule entries for each arm by varName
      const schedule = this.dgpResult.schedule || [];

      this.components.filter(c => c.type === 'arm').forEach(armComp => {
        const varName = armComp.params.varName;
        if (varName) {
          // Count schedule entries for this specific arm
          const count = schedule.filter(entry => entry.armVarName === varName).length;
          armComp.params.drawCount = count;
        } else {
          // Arm not linked to DSL - no scheduled draws
          armComp.params.drawCount = 0;
        }
      });

      // Validate that defined sacks exist in placed components and ensure showContents is true
      for (const label of Object.keys(this.dgpResult.sacks)) {
        const sackComp = this.components.find(c =>
          c.type === 'sack' && c.params.label === label
        );
        if (!sackComp) {
          html += `<div class="error">⚠ Sack "${label}" not found. Add a sack with label "${label}".</div>`;
        } else {
          // Ensure sack contents are shown and apply DGP contents
          sackComp.params.showContents = true;
          sackComp.params.contents = { ...this.dgpResult.sacks[label].contents };
        }
      }

      // Compute distribution via Monte Carlo simulation
      this.computeDistributionMonteCarlo();

      // Show computed distribution
      if (Object.keys(this.computedDistribution).length > 0 && distDiv) {
        distDiv.style.display = 'block';
        this.renderDistributionBars();
      }

      this.setStatus('DGP executed successfully', 'success');

      // Re-render to show updated sack contents and arm draw counts
      this.render();
    }

    resultDiv.innerHTML = html;
  }

  /**
   * Compute the correct distribution via Monte Carlo simulation
   * Uses the Simulation class from probability-games-common
   */
  computeDistributionMonteCarlo() {
    if (!this.dgpResult || !this.dgpResult.prediction) {
      this.computedDistribution = {};
      return;
    }

    const { sacks, schedule, prediction } = this.dgpResult;

    let targetComponent = null;
    let observationPoints = null;

    if (prediction.what === 'dist') {
      observationPoints = this.components
        .filter(c => c.type === 'observation')
        .sort((a, b) => a.position.x - b.position.x)
        .map((comp, index) => ({
          id: comp.id,
          index: index,
          label: String.fromCharCode(65 + index)
        }));

      if (observationPoints.length === 0) {
        console.error('No observation points found for dist mode');
        this.computedDistribution = {};
        return;
      }
    } else {
      const targetLabel = prediction.target;
      targetComponent = this.components.find(c =>
        c.type === 'observation' &&
        (c.params?.label === targetLabel || c.id === targetLabel)
      );

      if (!targetComponent) {
        console.error(`Target "${targetLabel}" not found`);
        this.computedDistribution = {};
        return;
      }
    }

    const level = this.buildSimulationLevel(sacks, schedule);
    if (!level) {
      console.error('Failed to build simulation level');
      this.computedDistribution = {};
      return;
    }

    const targetId = targetComponent ? targetComponent.id : null;
    this.computedDistribution = this.computeDistributionBranching(
      level, prediction, targetId, observationPoints
    );
    console.log(`Computed distribution (branching):`, this.computedDistribution);
  }

  /**
   * Compute the exact outcome distribution by analytically branching at every
   * random decision point (sack draw, splitter, etc.) instead of sampling.
   * Falls back to renormalization if maxBranches is exceeded.
   */
  computeDistributionBranching(simLevel, prediction, targetId, observationPoints, maxBranches = 1000) {
    const config = {
      ballProductionInterval: 1000,
      ballSpeed: 1.0,
      ballsToSpawn: simLevel.samplingSchedule.length,
      seed: 0
    };

    const sim = new Simulation(simLevel, config);
    sim.resolveReferences();

    const branchingRng = BranchingRNG.installOn(sim);

    const outcomes = {};
    // Pre-populate dist mode keys with 0
    if (prediction.what === 'dist' && observationPoints) {
      for (const obs of observationPoints) {
        outcomes[obs.label] = 0;
      }
    }

    // Priority queue: always process highest-probability branch first
    const queue = [{ simState: serializeSimState(sim), probability: 1.0 }];
    let totalCovered = 0;
    let branchCount = 0;
    const TICK_DT = 20;
    const MAX_TICKS_PER_BRANCH = 2000;
    const BFS_BUDGET = 2000;
    const MC_SAMPLES = 500;
    const EPSILON = 1e-8;

    // Phase 1: Exact BFS with priority queue (highest probability first)
    while (queue.length > 0 && branchCount < BFS_BUDGET) {
      // Find and remove highest-probability entry
      let maxIdx = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i].probability > queue[maxIdx].probability) maxIdx = i;
      }
      const { simState, probability } = queue.splice(maxIdx, 1)[0];

      if (probability < EPSILON) continue;
      branchCount++;

      restoreSimState(sim, simState);

      let decisionFound = false;
      let ticks = 0;

      while ((sim.running || hasActiveBalls(sim)) && !decisionFound && ticks < MAX_TICKS_PER_BRANCH) {
        const stateBeforeTick = serializeSimState(sim);
        sim.tick(TICK_DT);
        ticks++;

        if (branchingRng.hasPendingDecision()) {
          decisionFound = true;
          const decision = branchingRng.consumePendingDecision();

          for (const outcome of decision.outcomes) {
            if (outcome.probability <= 0) continue;
            restoreSimState(sim, stateBeforeTick);
            branchingRng.forcedOutcome = outcome.value;
            sim.tick(TICK_DT);
            if (branchingRng.hasPendingDecision()) {
              branchingRng.consumePendingDecision();
            }
            queue.push({
              simState: serializeSimState(sim),
              probability: probability * outcome.probability
            });
          }
        }
      }

      if (!decisionFound) {
        const outcome = this.extractOutcomeFromSim(sim, prediction, targetId, observationPoints);
        outcomes[outcome] = (outcomes[outcome] || 0) + probability;
        totalCovered += probability;
      }
    }

    // Phase 2: Stratified MC for remaining branches
    const remainingMass = queue.reduce((s, e) => s + e.probability, 0);
    if (remainingMass > EPSILON && queue.length > 0) {
      console.log(`[Branching] Phase 2: ${queue.length} branches remaining (${(remainingMass * 100).toFixed(2)}% mass), using ${MC_SAMPLES} MC samples`);

      // Build CDF over strata for weighted sampling
      const cdf = [];
      let cumProb = 0;
      for (const item of queue) {
        cumProb += item.probability;
        cdf.push({ cumProb, item });
      }

      // Each MC sample: pick stratum proportionally, run sim, weight = remainingMass / MC_SAMPLES
      const weightPerSample = remainingMass / MC_SAMPLES;
      for (let s = 0; s < MC_SAMPLES; s++) {
        // Pick stratum
        const r = Math.random() * remainingMass;
        let chosen = cdf[cdf.length - 1].item;
        for (const entry of cdf) {
          if (r <= entry.cumProb) { chosen = entry.item; break; }
        }

        restoreSimState(sim, chosen.simState);
        const savedRng = sim.rng;
        sim.rng = branchingRng.realRng;
        sim.rng.state = Math.floor(Math.random() * 2147483647);

        let mcTicks = 0;
        while ((sim.running || hasActiveBalls(sim)) && mcTicks < MAX_TICKS_PER_BRANCH) {
          sim.tick(TICK_DT);
          mcTicks++;
        }

        const outcome = this.extractOutcomeFromSim(sim, prediction, targetId, observationPoints);
        outcomes[outcome] = (outcomes[outcome] || 0) + weightPerSample;

        sim.rng = savedRng;
      }
      totalCovered += remainingMass;
    }

    console.log(`[Branching] Done: ${branchCount} exact branches, ${(totalCovered * 100).toFixed(4)}% covered`);

    return outcomes;
  }

  extractOutcomeFromSim(sim, prediction, targetId, observationPoints) {
    if (prediction.what === 'dist') {
      if (!observationPoints || observationPoints.length === 0) return 'unknown';
      for (const obs of observationPoints) {
        const comp = sim.components.find(c => c.id === obs.id);
        if (comp) {
          const count = (comp.observedBalls?.length || 0) + (comp.observations?.length || 0);
          if (count > 0) return obs.label;
        }
      }
      return 'none';
    }

    const targetComp = sim.components.find(c => c.id === targetId);
    if (!targetComp) return 0;

    if (prediction.what === 'reaches') {
      const count = (targetComp.observedBalls?.length || 0) + (targetComp.observations?.length || 0);
      return count > 0 ? 'yes' : 'no';
    } else if (prediction.what === 'total') {
      if (targetComp.observedBalls) return targetComp.observedBalls.length;
      if (targetComp.observations) return targetComp.observations.length;
      return 0;
    } else {
      // Color count (red, blue, etc.)
      const color = prediction.what;
      if (targetComp.observations) {
        return targetComp.observations.filter(obs => obs.color === color).length;
      }
      if (targetComp.observedBalls) {
        return targetComp.observedBalls.filter(ball => ball.color === color).length;
      }
      return 0;
    }
  }

  /**
   * Build a level object suitable for the Simulation class
   */
  buildSimulationLevel(dgpSacks, dgpSchedule) {
    // Deep copy components and apply DGP sack contents
    const components = this.components.map(comp => {
      const copy = {
        id: comp.id,
        type: comp.type,
        position: { x: comp.position.x, y: comp.position.y },
        params: { ...comp.params }
      };

      // Apply DGP-defined sack contents
      if (comp.type === 'sack' && dgpSacks[comp.params.label]) {
        copy.params.contents = { ...dgpSacks[comp.params.label].contents };
      }

      return copy;
    });

    // Build connections from automatic connections
    const connections = this.connections.map(conn => ({
      from: conn.from,
      to: conn.to
    }));

    // Convert DGP schedule to simulation format
    // DGP schedule uses arm variable names, we need to map to actual arm IDs
    const samplingSchedule = [];

    if (dgpSchedule) {
      for (const entry of dgpSchedule) {
        // Find the arm component that matches this entry
        // The DGP uses armVarName like "arm1", we need to find matching component
        const armVarName = entry.armVarName;
        const armDef = this.dgpResult.arms[armVarName];

        if (armDef) {
          // Find the arm component by matching label (set to varName when placed via autoPlaceNextArm)
          const armComponents = this.components.filter(c => c.type === 'arm');

          // Match by label (should work for arms placed via 'A' hotkey with DSL tracking)
          let armComp = armComponents.find(c => c.params.label === armVarName);
          if (!armComp) {
            // Fallback: match by index extracted from variable name (e.g., "arm1" -> index 0)
            const armIndex = parseInt(armVarName.replace(/\D/g, '')) - 1;
            if (!isNaN(armIndex) && armIndex >= 0 && armIndex < armComponents.length) {
              armComp = armComponents[armIndex];
            }
          }

          if (!armComp) {
            throw new Error(`[LevelEditor] DSL variable '${armVarName}' does not match any arm component. ` +
              `Available arms: ${armComponents.map(c => c.params.label || c.id).join(', ')}`);
          }

          samplingSchedule.push({
            armId: armComp.id,
            time: entry.time
          });
        }
      }
    }

    return {
      grid: {
        width: this.gridWidth,
        height: this.gridHeight
      },
      components,
      connections,
      samplingSchedule,
      hypothesisSpace: null  // Not needed for probability modeling
    };
  }

  /**
   * Run a single simulation and return the outcome
   * @param {Object} level - The level configuration
   * @param {string|null} targetId - Target component ID (null for dist mode)
   * @param {Object} prediction - Prediction configuration
   * @param {number} seed - Random seed
   * @param {Array|null} observationPoints - For dist mode: array of {id, index, label}
   */
  runSingleSimulation(level, targetId, prediction, seed, observationPoints = null) {
    // Create simulation with unique seed for this run
    const config = {
      ballProductionInterval: 1000,
      ballSpeed: 1.0,
      ballsToSpawn: level.samplingSchedule.length,
      seed: seed
    };

    // Debug logging (only on first run)
    if (seed === 0) {
      console.log('[MC] Level components:', level.components.map(c => ({id: c.id, type: c.type, pos: c.position})));
      console.log('[MC] Level connections:', level.connections);
      console.log('[MC] Sampling schedule:', level.samplingSchedule);
      console.log('[MC] Target ID:', targetId);
      console.log('[MC] Observation points:', observationPoints);
    }

    const simulation = new Simulation(level, config);
    simulation.resolveReferences();  // IMPORTANT: Set up component connections

    // Run simulation until complete
    const maxTicks = 10000;  // Safety limit
    const tickDelta = 100;   // 100ms per tick

    for (let tick = 0; tick < maxTicks && simulation.running; tick++) {
      simulation.tick(tickDelta);
    }

    // Debug logging (only on first run)
    if (seed === 0) {
      console.log('[MC] Simulation completed. Balls produced:', simulation.ballsProduced);
      console.log('[MC] All balls:', simulation.balls.map(b => ({id: b.id, state: b.componentState, compId: b.componentId})));
    }

    // Handle "dist" mode: find which observation point received the ball
    if (prediction.what === 'dist') {
      if (!observationPoints || observationPoints.length === 0) {
        return 'unknown';
      }

      // Find which observation point received the ball
      for (const obs of observationPoints) {
        const obsComp = simulation.getComponent(obs.id);
        if (obsComp) {
          const ballCount = (obsComp.observedBalls?.length || 0) + (obsComp.observations?.length || 0);
          if (ballCount > 0) {
            if (seed === 0) {
              console.log(`[MC] Ball reached observation point ${obs.label} (${obs.id})`);
            }
            return obs.label;  // Return "A", "B", "C", etc.
          }
        }
      }

      // No ball reached any observation point
      if (seed === 0) {
        console.log('[MC] No ball reached any observation point');
      }
      return 'none';
    }

    // For other modes, extract outcome from target component
    const targetComp = simulation.getComponent(targetId);

    if (!targetComp) {
      if (seed === 0) console.log('[MC] Target component not found!');
      return 0;
    }

    // Debug logging (only on first run)
    if (seed === 0) {
      console.log('[MC] Target component:', targetComp);
      console.log('[MC] Target observedBalls:', targetComp.observedBalls);
      console.log('[MC] Target observations:', targetComp.observations);
    }

    // Count based on prediction type
    if (prediction.what === 'reaches') {
      // Binary: did at least one ball reach the target?
      const count = (targetComp.observedBalls?.length || 0) + (targetComp.observations?.length || 0);
      return count > 0 ? 'yes' : 'no';
    } else if (prediction.what === 'total') {
      // Total balls at target
      if (targetComp.observedBalls) {
        return targetComp.observedBalls.length;
      }
      if (targetComp.observations) {
        return targetComp.observations.length;
      }
      return 0;
    } else {
      // Count specific color
      const color = prediction.what;
      if (targetComp.observations) {
        return targetComp.observations.filter(obs => obs.color === color).length;
      }
      if (targetComp.observedBalls) {
        return targetComp.observedBalls.filter(ball => ball.color === color).length;
      }
      return 0;
    }
  }

  /**
   * Render the computed distribution as bars
   */
  renderDistributionBars() {
    const container = document.getElementById('distribution-bars');
    if (!container) return;

    container.innerHTML = '';

    // Sort outcomes - handle both numeric and string keys (like 'yes'/'no')
    const outcomes = Object.keys(this.computedDistribution).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      // If both are numbers, sort numerically
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      // If one is 'yes', put it first
      if (a === 'yes') return -1;
      if (b === 'yes') return 1;
      // Otherwise sort alphabetically
      return a.localeCompare(b);
    });

    // Find max probability for scaling
    const maxProb = Math.max(...Object.values(this.computedDistribution), 0.01);

    outcomes.forEach(outcome => {
      const prob = this.computedDistribution[outcome];
      const percentage = (prob / maxProb) * 100;

      // Format label - capitalize 'yes'/'no' for display
      let label = outcome;
      if (outcome === 'yes') label = 'Yes';
      if (outcome === 'no') label = 'No';

      const row = document.createElement('div');
      row.className = 'distribution-bar';
      row.innerHTML = `
        <span class="label">${label}</span>
        <div class="bar"><div class="bar-fill" style="width: ${percentage}%"></div></div>
        <span class="prob">${(prob * 100).toFixed(1)}%</span>
      `;
      container.appendChild(row);
    });
  }

  // Tool Management
  setTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    this.selectedComponentType = null;
    document.querySelectorAll('.component-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.updateCursor();
    this.render();
  }

  selectComponentType(type) {
    this.selectedComponentType = type;
    this.currentTool = 'place';

    // Deselect any currently selected component on the board
    this.selectedComponent = null;
    this.updatePropertiesPanel();

    // Initialize pending params with defaults
    const spec = ComponentRegistry.get(type);
    this.pendingComponentParams = this.getDefaultParams(spec);

    document.querySelectorAll('.component-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.updateCursor();
    this.render(); // Re-render to show pending rotation in cursor preview if applicable
  }

  updateCursor() {
    this.canvas.className = '';
    if (this.currentTool === 'select') this.canvas.classList.add('selecting');
    else if (this.currentTool === 'move') this.canvas.classList.add('moving');
    else if (this.currentTool === 'connect') this.canvas.classList.add('connecting');
    else if (this.currentTool === 'delete') this.canvas.classList.add('deleting');
    else if (this.currentTool === 'veil') this.canvas.classList.add('veiling');
  }

  // Mouse Events
  onMouseDown(e) {
    const gridPos = this.getMouseGridPosition(e);
    const clickedComponent = this.getComponentAt(gridPos.x, gridPos.y);

    // Veil tool: toggle veil on the clicked tile (regardless of component)
    if (this.currentTool === 'veil') {
      const key = `${gridPos.x},${gridPos.y}`;
      if (this.veiledTiles.has(key)) {
        this.veiledTiles.delete(key);
      } else {
        this.veiledTiles.add(key);
      }
      this.saveState();
      this.render();
      return;
    }

    // Handle tool-specific actions on clicked components
    if (clickedComponent) {
      // Delete tool: delete the component
      if (this.currentTool === 'delete') {
        this.deleteComponent(clickedComponent);
        return;
      }

      // Connect tool: handle connection logic
      if (this.currentTool === 'connect') {
        if (!this.connectFrom) {
          this.connectFrom = clickedComponent;
        } else {
          this.createConnection(this.connectFrom, clickedComponent);
          this.connectFrom = null;
        }
        this.render();
        return;
      }

      // Special handling for duplicator quadrant clicking
      // Only handle quadrant clicks if duplicator is already selected (not first click)
      if (clickedComponent.type === 'duplicator' &&
          this.currentTool === 'select' &&
          this.selectedComponent === clickedComponent) {
        const handled = this.handleDuplicatorClick(clickedComponent, e, gridPos);
        if (handled) {
          return;
        }
      }

      // Special handling for shuffler quadrant/center clicking
      if (clickedComponent.type === 'shuffler' &&
          this.currentTool === 'select' &&
          this.selectedComponent === clickedComponent) {
        const handled = this.handleShufflerClick(clickedComponent, e, gridPos);
        if (handled) {
          return;
        }
      }

      // Special handling for switch component clicking (adjust N value)
      if (clickedComponent.type === 'switch' &&
          this.currentTool === 'select' &&
          this.selectedComponent === clickedComponent) {
        const handled = this.handleSwitchClick(clickedComponent, e);
        if (handled) {
          return;
        }
      }

      // Special handling for overlay components (buttons): allow placing on top of existing components
      if (this.currentTool === 'place' && this.selectedComponentType) {
        const spec = ComponentRegistry.get(this.selectedComponentType);
        if (spec && spec.isOverlay) {
          // Place overlay on top of existing component
          this.placeComponent(gridPos.x, gridPos.y);
          return;
        }
      }

      // Default: select component and start drag
      this.selectComponent(clickedComponent);
      this.selectedComponentType = null;
      this.pendingComponentParams = {};

      // Start dragging
      this.isDragging = true;
      this.dragStart = {
        x: gridPos.x - clickedComponent.position.x,
        y: gridPos.y - clickedComponent.position.y
      };
      return;
    }

    // If no component clicked, proceed with tool actions
    if (this.currentTool === 'place' && this.selectedComponentType) {
      this.placeComponent(gridPos.x, gridPos.y);
    } else if (this.currentTool === 'select') {
      // Clicking empty space deselects
      this.selectComponent(null);
    } else if (this.currentTool === 'connect') {
      // Clicking empty space cancels connection
      this.connectFrom = null;
      this.render();
    } else if (this.currentTool === 'delete') {
      // Nothing to delete on empty space
    }
  }

  onMouseMove(e) {
    const gridPos = this.getMouseGridPosition(e);
    this.mouseGridPos = gridPos;

    if (this.isDragging && this.selectedComponent) {
      this.selectedComponent.position.x = Math.max(0, Math.min(this.gridWidth - 1, gridPos.x - this.dragStart.x));
      this.selectedComponent.position.y = Math.max(0, Math.min(this.gridHeight - 1, gridPos.y - this.dragStart.y));
      this.render();
    } else if (this.currentTool === 'place' && this.selectedComponentType) {
      // Re-render to update preview position
      this.render();
    }
  }

  onMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.updateAutomaticConnections();
      this.saveState();
      this.render();
    }
  }

  onMouseLeave(e) {
    // Clear mouse position to hide preview
    this.mouseGridPos = null;
    this.render();
  }

  // Keyboard Events
  onKeyDown(e) {
    // Don't process shortcuts when typing in text fields
    const activeElement = document.activeElement;
    if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
      return;
    }

    const ctrl = e.ctrlKey || e.metaKey;

    // ESC to deselect
    if (e.key === 'Escape') {
      this.selectedComponent = null;
      this.selectedComponentType = null;
      this.pendingComponentParams = {};
      this.updatePropertiesPanel();
      this.render();
      e.preventDefault();
      return;
    }

    // Tool shortcuts
    if (!ctrl && !e.shiftKey) {
      if (e.key === 'v' || e.key === 'V') {
        this.setTool('select');
        e.preventDefault();
      } else if (e.key === 'm' || e.key === 'M') {
        this.setTool('move');
        e.preventDefault();
      } else if (e.key === 'w' || e.key === 'W') {
        this.setTool('veil');
        e.preventDefault();
      } else if (e.key === 'c' || e.key === 'C') {
        this.setTool('connect');
        e.preventDefault();
      } else if (e.key === 'd' || e.key === 'D') {
        this.setTool('delete');
        e.preventDefault();
      } else if (e.key === 'r' || e.key === 'R') {
        // Rotate selected component OR rotate component about to be placed
        if (this.selectedComponent) {
          this.rotateComponent(this.selectedComponent);
          e.preventDefault();
        } else if (this.selectedComponentType) {
          this.rotatePendingComponent();
          e.preventDefault();
        }
      } else if (e.key === 'e' || e.key === 'E') {
        // Cycle filter color for selected filter OR filter about to be placed
        if (this.selectedComponent && this.selectedComponent.type === 'filter') {
          this.cycleFilterColor(this.selectedComponent);
          e.preventDefault();
        } else if (this.selectedComponentType === 'filter') {
          this.cyclePendingFilterColor();
          e.preventDefault();
        }
      }
      // Number keys: set shuffler capacity (minBufferSize)
      else if (e.key >= '0' && e.key <= '9') {
        if (this.selectedComponent && this.selectedComponent.type === 'shuffler') {
          const capacity = parseInt(e.key);
          if (capacity >= 0) {
            this.selectedComponent.params.minBufferSize = capacity;
            this.saveState();
            this.render();
            this.setStatus(`Shuffler capacity: ${capacity}`, 'info');
            e.preventDefault();
          }
        }
      }
      // Component shortcuts - select component types (data-driven)
      else {
        const hotkeyType = this.hotkeyToType.get(e.key.toLowerCase());
        if (hotkeyType) {
          // Special handling for arm hotkey - use autoPlaceNextArm
          if (hotkeyType === 'arm') {
            this.autoPlaceNextArm();
            e.preventDefault();
          } else if (this.selectedComponentType === hotkeyType) {
            // Toggle off if already selected
            this.selectedComponentType = null;
            this.pendingComponentParams = {};
            document.querySelectorAll('.component-btn').forEach(btn => btn.classList.remove('active'));
            this.render();
          } else {
            this.selectComponentType(hotkeyType);
          }
          e.preventDefault();
        } else if (e.key === 'p' || e.key === 'P') {
          // Toggle plex glass on selected component (all types except sack)
          if (this.selectedComponent && this.selectedComponent.type !== 'sack') {
            this.selectedComponent.params.plex = !this.selectedComponent.params.plex;
            this.updatePropertiesPanel();
            this.saveState();
            this.render();
            e.preventDefault();
          }
        }
      }
    }

    // Delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedComponent) {
        this.deleteComponent(this.selectedComponent);
        e.preventDefault();
      }
    }

    // Undo/Redo
    if (ctrl && e.key === 'z') {
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
      e.preventDefault();
    }
    if (ctrl && e.key === 'y') {
      this.redo();
      e.preventDefault();
    }

    // Copy/Paste
    if (ctrl && e.key === 'c') {
      if (this.selectedComponent) {
        this.copy();
        e.preventDefault();
      }
    }
    if (ctrl && e.key === 'v') {
      this.paste();
      e.preventDefault();
    }
  }

  // Component Operations
  placeComponent(x, y) {
    // Check if position is valid
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
      return;
    }

    const spec = ComponentRegistry.get(this.selectedComponentType);
    console.log(`[Editor] Placing ${this.selectedComponentType}, spec:`, spec, 'isOverlay:', spec?.isOverlay);

    if (!spec) {
      this.setStatus(`Unknown component type: ${this.selectedComponentType}`, 'error');
      return;
    }

    // Handle overlay components (buttons) - must be placed on valid host
    if (spec.isOverlay) {
      const existingComponent = this.getComponentAt(x, y);
      const allowedTypes = spec.allowedHostTypes || [];
      console.log(`[Editor] Overlay placement at (${x}, ${y}): existingComponent=`, existingComponent, 'allowedTypes=', allowedTypes);

      if (!existingComponent) {
        this.setStatus(`${spec.displayName} must be placed on a conveyor`, 'error');
        return;
      }

      if (!allowedTypes.includes(existingComponent.type)) {
        this.setStatus(`${spec.displayName} can only be placed on: ${allowedTypes.join(', ')}`, 'error');
        return;
      }

      // Check if there's already a button at this position
      const existingButton = this.components.find(c =>
        c.type === 'button' &&
        c.position.x === x &&
        c.position.y === y
      );
      if (existingButton) {
        this.setStatus('Button already exists here', 'error');
        return;
      }

      // Check for adjacent arm (directly, or via adjacent sack)
      // Use button spec's findAdjacentArm method for consistent logic
      const buttonSpec = ComponentRegistry.get('button');
      const tempButton = { position: { x, y } };
      const targetArm = buttonSpec?.findAdjacentArm(tempButton, { components: this.components });
      console.log(`[Editor] Adjacent arm check: targetArm=${targetArm?.id || 'none'}`);

      if (!targetArm) {
        this.setStatus('Button must be adjacent to an arm or sack', 'error');
        return;
      }

      console.log('[Editor] Button placement validation passed!');
    } else {
      // Normal component - check if position is occupied
      if (this.getComponentAt(x, y)) {
        this.setStatus('Position occupied', 'error');
        return;
      }
    }
    // Use pending params (which include any rotations applied before placement)
    // Ensure all default params are present
    const defaultParams = this.getDefaultParams(spec);

    // Use DSL-defined ID if placing a sack/arm from DSL
    const componentId = (this.pendingComponentParams.id) || this.generateId();

    const component = {
      id: componentId,
      type: this.selectedComponentType,
      position: {x, y},
      params: this.deepClone({...defaultParams, ...this.pendingComponentParams})
    };

    // Handle sack placement - simplified for todennakoisyysmallit
    if (component.type === 'sack') {
      // Initialize with default contents if not specified
      if (!component.params.contents) {
        component.params.contents = {red: 5, blue: 5};
      }
      component.params.label = component.id;
    }

    // Handle arm placement - link to DSL-defined arm
    if (component.type === 'arm') {
      const varName = this.pendingComponentParams.varName;

      if (varName && this.dgpResult?.arms?.[varName]) {
        // This is a DSL-defined arm
        component.params.varName = varName;
        component.params.label = varName;  // Display variable name
        this.placedArms.add(varName);

        // Check if this was the last arm - if so, auto-deselect
        if (this.placedArms.size === Object.keys(this.dgpResult.arms).length) {
          this.selectedComponentType = null;
          this.pendingComponentParams = {};
        } else {
          // Auto-select next arm
          this.autoPlaceNextArm();
        }
      } else {
        // Non-DSL arm (fallback to ID)
        component.params.label = component.id;
      }
    }

    this.components.push(component);
    console.log(`[Editor] Component added:`, component, 'Total components:', this.components.length, 'Buttons:', this.components.filter(c => c.type === 'button').length);
    this.updateAutomaticConnections();
    this.saveState();
    this.setStatus(`Placed ${spec.displayName}${component.params.varName ? ' (' + component.params.varName + ')' : ''}`, 'success');
    this.render();
  }

  deleteComponent(component) {
    const index = this.components.indexOf(component);
    if (index > -1) {
      this.components.splice(index, 1);

      // If this was a DSL-defined arm, mark it as unplaced
      if (component.type === 'arm' && component.params.varName) {
        this.placedArms.delete(component.params.varName);
      }

      if (this.selectedComponent === component) {
        this.selectedComponent = null;
        this.updatePropertiesPanel();
      }

      this.updateAutomaticConnections();
      this.saveState();
      this.setStatus('Component deleted', 'success');
      this.render();
    }
  }

  /**
   * Apply rotation to component params based on type
   * @param {string} type - Component type
   * @param {Object} params - Component params object (mutated in place)
   * @returns {boolean} true if rotation was applied
   */
  applyRotationToParams(type, params) {
    const DIRECTIONS = ['right', 'down', 'left', 'up'];
    const TURNS = [
      'right-to-down', 'down-to-left', 'left-to-up', 'up-to-right',
      'right-to-up', 'up-to-left', 'left-to-down', 'down-to-right'
    ];

    if (type === 'conveyor') {
      const current = DIRECTIONS.indexOf(params.direction || 'right');
      params.direction = DIRECTIONS[(current + 1) % 4];
      return true;
    }

    if (type === 'conveyor-turn') {
      const current = TURNS.indexOf(params.turn || 'right-to-down');
      params.turn = TURNS[(current + 1) % 8];
      return true;
    }

    if (type === 'duplicator') {
      params.sides = rotateSidesClockwise(params.sides || defaultDuplicatorSides(params));
      delete params.outputPattern;  // legacy field, no longer used
      return true;
    }

    if (type === 'merger') {
      const spec = ComponentRegistry.get('merger');
      if (spec && spec.getNextRotation) {
        const nextConfig = spec.getNextRotation(params);
        params.input1Side = nextConfig.input1Side;
        params.input2Side = nextConfig.input2Side;
        params.input3Side = nextConfig.input3Side || null;
        params.direction = nextConfig.direction;
        return true;
      }
    }

    if (type === 'filter') {
      const spec = ComponentRegistry.get('filter');
      if (spec && spec.getNextRotation) {
        const nextConfig = spec.getNextRotation(params);
        params.inputSide = nextConfig.inputSide;
        params.matchOutputSide = nextConfig.matchOutputSide;
        params.nonMatchOutputSide = nextConfig.nonMatchOutputSide;
        return true;
      }
    }

    if (type === 'switch') {
      const spec = ComponentRegistry.get('switch');
      if (spec && spec.getNextRotation) {
        const nextConfig = spec.getNextRotation(params);
        params.inputSide = nextConfig.inputSide;
        params.firstNOutputSide = nextConfig.firstNOutputSide;
        params.restOutputSide = nextConfig.restOutputSide;
        return true;
      }
    }

    if (type === 'shuffler') {
      params.sides = rotateSidesClockwise(params.sides || defaultShufflerSides(params));
      delete params.outputPattern;  // legacy field, no longer used
      return true;
    }

    // Splitter: no rotation, auto-detects channels from neighbors
    return false;
  }

  rotateComponent(component) {
    if (component.type === 'splitter') {
      // Splitter auto-detects channels from neighbors, rotation not applicable
      // Just re-detect channels (useful if neighbors changed)
      this.autoDetectSplitterChannels(component);
    } else {
      this.applyRotationToParams(component.type, component.params);
    }

    this.updateAutomaticConnections();
    this.saveState();
    this.updatePropertiesPanel();
    this.render();
  }

  rotatePendingComponent() {
    const type = this.selectedComponentType;
    this.applyRotationToParams(type, this.pendingComponentParams);

    this.setStatus(`Rotated ${type} to ${this.pendingComponentParams.direction || this.pendingComponentParams.turn || this.pendingComponentParams.outputSide}`, 'info');
    this.render();
  }

  cycleFilterColor(component) {
    if (component.type !== 'filter') return;

    if (!window.BallColors) {
      throw new Error('BallColors not loaded!');
    }

    const currentColor = component.params.targetColor || 'red';
    component.params.targetColor = window.BallColors.getNext(currentColor);

    this.updateAutomaticConnections();
    this.saveState();
    this.updatePropertiesPanel();
    this.render();

    this.setStatus(`Filter color: ${component.params.targetColor}`, 'info');
  }

  cyclePendingFilterColor() {
    if (this.selectedComponentType !== 'filter') return;

    if (!window.BallColors) {
      throw new Error('BallColors not loaded!');
    }

    const currentColor = this.pendingComponentParams.targetColor || 'red';
    this.pendingComponentParams.targetColor = window.BallColors.getNext(currentColor);

    this.render();

    this.setStatus(`Filter color: ${this.pendingComponentParams.targetColor}`, 'info');
  }

  // Handle duplicator quadrant clicks
  handleDuplicatorClick(component, event, gridPos) {
    // Get pixel position within component, accounting for canvas scaling
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const pixelX = (event.clientX - rect.left) * scaleX;
    const pixelY = (event.clientY - rect.top) * scaleY;


    // Calculate relative position within component (0-gridSize range)
    const compPixelX = pixelX - component.position.x * this.gridSize;
    const compPixelY = pixelY - component.position.y * this.gridSize;


    // Determine quadrant using diagonal divisions
    // Diagonals: y = x and y = gridSize - x
    // Four triangular regions: up, right, down, left
    let side;


    if (compPixelY < compPixelX && compPixelY < (this.gridSize - compPixelX)) {
      side = 'up';
    } else if (compPixelY < compPixelX && compPixelY >= (this.gridSize - compPixelX)) {
      side = 'right';
    } else if (compPixelY >= compPixelX && compPixelY >= (this.gridSize - compPixelX)) {
      side = 'down';
    } else {
      side = 'left';
    }


    // Initialize sides if not present
    if (!component.params.sides) {
      const spec = ComponentRegistry.get('duplicator');
      component.params.sides = spec.behavior.getDefaultSides();
    }

    const isLeftClick = event.button === 0;
    const isRightClick = event.button === 2;

    if (isLeftClick) {
      // Cycle side type: none → input → output → none
      const currentType = component.params.sides[side].type;
      if (currentType === 'none') {
        component.params.sides[side].type = 'input';
        component.params.sides[side].count = 0;
      } else if (currentType === 'input') {
        component.params.sides[side].type = 'output';
        component.params.sides[side].count = 1;
      } else {
        component.params.sides[side].type = 'none';
        component.params.sides[side].count = 0;
      }

      this.updateAutomaticConnections();
      this.saveState();
      this.render();
      this.setStatus(`Duplicator ${side}: ${component.params.sides[side].type}`, 'info');
      return true;
    }

    if (isRightClick) {
      // Cycle output count if this is an output side
      if (component.params.sides[side].type === 'output') {
        const currentCount = component.params.sides[side].count || 1;
        const newCount = (currentCount % 5) + 1;  // Cycle 1→2→3→4→5→1
        component.params.sides[side].count = newCount;

        this.saveState();
        this.render();
        this.setStatus(`Duplicator ${side} output: ${newCount}`, 'info');
        return true;
      }
    }

    return false;
  }

  // Handle shuffler quadrant clicks (similar to duplicator)
  handleShufflerClick(component, event, gridPos) {
    // Get pixel position within component, accounting for canvas scaling
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const pixelX = (event.clientX - rect.left) * scaleX;
    const pixelY = (event.clientY - rect.top) * scaleY;

    // Calculate relative position within component (0-gridSize range)
    const compPixelX = pixelX - component.position.x * this.gridSize;
    const compPixelY = pixelY - component.position.y * this.gridSize;

    // Initialize sides if not present
    if (!component.params.sides) {
      const spec = ComponentRegistry.get('shuffler');
      component.params.sides = spec.behavior.getDefaultSides();
    }

    const isLeftClick = event.button === 0;
    const isRightClick = event.button === 2;

    // Check if click is in center region (for retain count adjustment)
    const centerX = this.gridSize / 2;
    const centerY = this.gridSize / 2;
    const dx = compPixelX - centerX;
    const dy = compPixelY - centerY;
    const distFromCenter = Math.sqrt(dx * dx + dy * dy);
    const centerRadius = this.gridSize * 0.25;

    // Right-click on center: cycle retain count
    if (distFromCenter < centerRadius && isRightClick) {
      const currentRetain = component.params.retainCount || 0;
      const newRetain = (currentRetain + 1) % 6; // Cycle 0→1→2→3→4→5→0
      component.params.retainCount = newRetain;

      this.saveState();
      this.render();
      this.setStatus(`Shuffler retain: ${newRetain}`, 'info');
      return true;
    }

    // Determine quadrant using diagonal divisions (like duplicator)
    // Diagonals: y = x and y = gridSize - x
    let side;

    if (compPixelY < compPixelX && compPixelY < (this.gridSize - compPixelX)) {
      side = 'up';
    } else if (compPixelY < compPixelX && compPixelY >= (this.gridSize - compPixelX)) {
      side = 'right';
    } else if (compPixelY >= compPixelX && compPixelY >= (this.gridSize - compPixelX)) {
      side = 'down';
    } else {
      side = 'left';
    }

    if (isLeftClick) {
      // Cycle side type: input → output → none → input
      const currentType = component.params.sides[side].type;
      if (currentType === 'input') {
        component.params.sides[side].type = 'output';
        component.params.sides[side].count = 2; // Default output count
      } else if (currentType === 'output') {
        component.params.sides[side].type = 'none';
        component.params.sides[side].count = 0;
      } else {
        component.params.sides[side].type = 'input';
        component.params.sides[side].count = 0;
      }

      this.updateAutomaticConnections();
      this.saveState();
      this.render();
      this.setStatus(`Shuffler ${side}: ${component.params.sides[side].type}`, 'info');
      return true;
    }

    if (isRightClick) {
      // Increase output count if this is an output side (like duplicator)
      if (component.params.sides[side].type === 'output') {
        const currentCount = component.params.sides[side].count || 1;
        const newCount = (currentCount % 9) + 1;  // Cycle 1→2→3→4→5→1
        component.params.sides[side].count = newCount;

        this.saveState();
        this.render();
        this.setStatus(`Shuffler ${side} output: ${newCount}`, 'info');
        return true;
      }
    }

    return false;
  }

  // Handle switch component clicks to adjust N value
  handleSwitchClick(component, event) {
    const isLeftClick = event.button === 0;
    const isRightClick = event.button === 2;

    // Initialize n if not present
    if (component.params.n === undefined) {
      component.params.n = 1;
    }

    if (isLeftClick) {
      // Increment N
      component.params.n++;
      this.saveState();
      this.updatePropertiesPanel();
      this.render();
      this.setStatus(`Switch N: ${component.params.n}`, 'info');
      return true;
    }

    if (isRightClick) {
      // Decrement N (minimum 1)
      if (component.params.n > 1) {
        component.params.n--;
        this.saveState();
        this.updatePropertiesPanel();
        this.render();
        this.setStatus(`Switch N: ${component.params.n}`, 'info');
      } else {
        this.setStatus('Switch N must be at least 1', 'warning');
      }
      return true;
    }

    return false;
  }

  selectComponent(component) {
    this.selectedComponent = component;
    this.updatePropertiesPanel();
    this.render();
  }

  createConnection(from, to) {
    // Check if components are adjacent
    const dx = Math.abs(from.position.x - to.position.x);
    const dy = Math.abs(from.position.y - to.position.y);
    const isAdjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1);

    if (!isAdjacent) {
      this.setStatus('Components must be adjacent to connect', 'error');
      return;
    }

    // Check if connection already exists
    const exists = this.connections.some(conn =>
      conn.from === from.id && conn.to === to.id
    );

    if (exists) {
      this.setStatus('Connection already exists', 'error');
      return;
    }

    this.connections.push({from: from.id, to: to.id});
    this.saveState();
    this.setStatus('Connection created', 'success');
    this.render();
  }

  // Clipboard Operations
  copy() {
    if (this.selectedComponent) {
      this.clipboard = JSON.parse(JSON.stringify(this.selectedComponent));
      delete this.clipboard.id; // Remove ID so paste creates new component
      this.setStatus('Component copied', 'success');
    }
  }

  paste() {
    if (!this.clipboard) {
      this.setStatus('Nothing to paste', 'error');
      return;
    }

    const component = JSON.parse(JSON.stringify(this.clipboard));
    component.id = this.generateId();

    // Offset position slightly
    component.position.x = Math.min(this.gridWidth - 1, component.position.x + 1);
    component.position.y = Math.min(this.gridHeight - 1, component.position.y + 1);

    this.components.push(component);
    this.selectedComponent = component;
    this.updatePropertiesPanel();
    this.updateAutomaticConnections();
    this.saveState();
    this.setStatus('Component pasted', 'success');
    this.render();
  }

  // History Management
  saveState() {
    const state = {
      components: JSON.parse(JSON.stringify(this.components)),
      connections: JSON.parse(JSON.stringify(this.connections)),
      veiledTiles: [...this.veiledTiles],
      dgpVersions: JSON.parse(JSON.stringify(this.dgpVersions)),
      activeVersionIndex: this.activeVersionIndex
    };

    // Remove future history if we're not at the end
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push(state);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreState(this.history[this.historyIndex]);
      this.setStatus('Undo', 'success');
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreState(this.history[this.historyIndex]);
      this.setStatus('Redo', 'success');
    }
  }

  restoreState(state) {
    this.components = JSON.parse(JSON.stringify(state.components));

    // Restore veil and versions
    this.veiledTiles = new Set(state.veiledTiles || []);
    this.dgpVersions = JSON.parse(JSON.stringify(state.dgpVersions || []));
    this.activeVersionIndex = state.activeVersionIndex != null ? state.activeVersionIndex : -1;

    // Update nextComponentId to avoid ID conflicts after undo/redo
    this._updateNextComponentId();

    // Rebuild connections from spatial layout rather than saved connections
    this.updateAutomaticConnections();

    // Clear selection if component no longer exists
    if (this.selectedComponent) {
      const stillExists = this.components.some(c => c.id === this.selectedComponent.id);
      if (!stillExists) {
        this.selectedComponent = null;
        this.updatePropertiesPanel();
      }
    }

    this.renderVersionList();
    this.render();
  }

  // Properties Panel
  updatePropertiesPanel() {
    const panel = document.getElementById('properties-panel');

    if (!this.selectedComponent) {
      panel.innerHTML = '<p class="help-text">Select a component to edit properties</p>';
      return;
    }

    const component = this.selectedComponent;
    const spec = ComponentRegistry.get(component.type);

    let html = `<div class="property-item">
      <label>Component ID</label>
      <input type="text" value="${component.id}" readonly>
    </div>`;

    // Add parameter editors based on component type
    if (component.type === 'sack') {
      html += `<div class="property-item">
        <label>Label</label>
        <input type="text" value="${component.params.label || ''}"
               onchange="editor.updateComponentParam('label', this.value)">
      </div>`;

      // Sack contents editor
      html += `<div class="property-item">
        <label>Contents (JSON)</label>
        <textarea rows="3" style="font-family: monospace; font-size: 11px;"
                  onchange="editor.updateComponentContents(this.value)">${JSON.stringify(component.params.contents, null, 2)}</textarea>
        <small style="color: #888; font-size: 10px;">Example: {"red": 7, "blue": 3}</small>
      </div>`;
    } else if (component.type === 'conveyor') {
      html += `<div class="property-item">
        <label>Direction</label>
        <select onchange="editor.updateComponentParam('direction', this.value)">
          <option value="right" ${component.params.direction === 'right' ? 'selected' : ''}>Right</option>
          <option value="left" ${component.params.direction === 'left' ? 'selected' : ''}>Left</option>
          <option value="down" ${component.params.direction === 'down' ? 'selected' : ''}>Down</option>
          <option value="up" ${component.params.direction === 'up' ? 'selected' : ''}>Up</option>
        </select>
      </div>
      <div class="property-item">
        <label>Speed</label>
        <input type="number" step="0.1" value="${component.params.speed || 1.0}"
               onchange="editor.updateComponentParam('speed', parseFloat(this.value))">
      </div>
      <div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    } else if (component.type === 'conveyor-turn') {
      html += `<div class="property-item">
        <label>Turn Type</label>
        <select onchange="editor.updateComponentParam('turn', this.value)">
          <option value="right-to-down" ${component.params.turn === 'right-to-down' ? 'selected' : ''}>Right → Down</option>
          <option value="right-to-up" ${component.params.turn === 'right-to-up' ? 'selected' : ''}>Right → Up</option>
          <option value="left-to-down" ${component.params.turn === 'left-to-down' ? 'selected' : ''}>Left → Down</option>
          <option value="left-to-up" ${component.params.turn === 'left-to-up' ? 'selected' : ''}>Left → Up</option>
          <option value="down-to-right" ${component.params.turn === 'down-to-right' ? 'selected' : ''}>Down → Right</option>
          <option value="down-to-left" ${component.params.turn === 'down-to-left' ? 'selected' : ''}>Down → Left</option>
          <option value="up-to-right" ${component.params.turn === 'up-to-right' ? 'selected' : ''}>Up → Right</option>
          <option value="up-to-left" ${component.params.turn === 'up-to-left' ? 'selected' : ''}>Up → Left</option>
        </select>
      </div>
      <div class="property-item">
        <label>Speed</label>
        <input type="number" step="0.1" value="${component.params.speed || 1.0}"
               onchange="editor.updateComponentParam('speed', parseFloat(this.value))">
      </div>
      <div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    } else if (component.type === 'shuffler') {
      html += `<div class="property-item">
        <label>Number of Inputs</label>
        <select onchange="editor.updateComponentParam('numInputs', parseInt(this.value))">
          <option value="2" ${component.params.numInputs === 2 ? 'selected' : ''}>2 Inputs</option>
          <option value="3" ${component.params.numInputs === 3 ? 'selected' : ''}>3 Inputs</option>
        </select>
      </div>
      <div class="property-item">
        <label>Input 1 Side</label>
        <select onchange="editor.updateComponentParam('input1Side', this.value)">
          <option value="up" ${component.params.input1Side === 'up' ? 'selected' : ''}>Up</option>
          <option value="down" ${component.params.input1Side === 'down' ? 'selected' : ''}>Down</option>
          <option value="left" ${component.params.input1Side === 'left' ? 'selected' : ''}>Left</option>
          <option value="right" ${component.params.input1Side === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
      <div class="property-item">
        <label>Input 2 Side</label>
        <select onchange="editor.updateComponentParam('input2Side', this.value)">
          <option value="up" ${component.params.input2Side === 'up' ? 'selected' : ''}>Up</option>
          <option value="down" ${component.params.input2Side === 'down' ? 'selected' : ''}>Down</option>
          <option value="left" ${component.params.input2Side === 'left' ? 'selected' : ''}>Left</option>
          <option value="right" ${component.params.input2Side === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
      ${component.params.numInputs === 3 ? `
      <div class="property-item">
        <label>Input 3 Side</label>
        <select onchange="editor.updateComponentParam('input3Side', this.value)">
          <option value="up" ${component.params.input3Side === 'up' ? 'selected' : ''}>Up</option>
          <option value="down" ${component.params.input3Side === 'down' ? 'selected' : ''}>Down</option>
          <option value="left" ${component.params.input3Side === 'left' ? 'selected' : ''}>Left</option>
          <option value="right" ${component.params.input3Side === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>` : ''}
      <div class="property-item">
        <label>Output Side</label>
        <select onchange="editor.updateComponentParam('outputSide', this.value)">
          <option value="up" ${component.params.outputSide === 'up' ? 'selected' : ''}>Up</option>
          <option value="down" ${component.params.outputSide === 'down' ? 'selected' : ''}>Down</option>
          <option value="left" ${component.params.outputSide === 'left' ? 'selected' : ''}>Left</option>
          <option value="right" ${component.params.outputSide === 'right' ? 'selected' : ''}>Right</option>
        </select>
        <small style="color: #888; font-size: 10px;">Used if no output pattern is defined</small>
      </div>
      <div class="property-item">
        <label>Min Buffer Size</label>
        <input type="number" min="1" max="10" value="${component.params.minBufferSize || component.params.numInputs || 2}"
               onchange="editor.updateComponentParam('minBufferSize', parseInt(this.value))">
        <small style="color: #888; font-size: 10px;">Balls required before shuffle (default = numInputs)</small>
      </div>
      <div class="property-item">
        <label>Output Pattern</label>
        <button onclick="editor.editShufflerPattern()" style="width: 100%; padding: 6px;">
          Edit Output Pattern
        </button>
        <small style="color: #888; font-size: 10px;">Define distribution and retention</small>
        <div style="padding: 8px; background: #2a2a2a; border-radius: 4px; font-size: 11px; margin-top: 4px; color: #aaa;">
          ${this.formatShufflerPattern(sidesToOutputPattern(component.params.sides))}
        </div>
      </div>
      <div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    } else if (component.type === 'splitter') {
      // Show auto-detected channels
      const sides = component.params.sides || {};
      const channelInfo = ['up', 'down', 'left', 'right']
        .filter(s => sides[s]?.type !== 'none')
        .map(s => `${s}: ${sides[s].type}`)
        .join(', ') || 'none detected';

      html += `<div class="property-item">
        <label>Channels (auto-detected)</label>
        <div style="padding: 8px; background: #2a2a2a; border-radius: 4px; font-size: 11px; color: #aaa;">
          ${channelInfo}
        </div>
        <small style="color: #888; font-size: 10px;">Place adjacent conveyors to create channels</small>
      </div>
      <div class="property-item">
        <label>Bounce Duration (ms)</label>
        <input type="number" step="100" min="100" value="${component.params.bounceDuration || 600}"
               onchange="editor.updateComponentParam('bounceDuration', parseInt(this.value))">
      </div>
      <div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    } else if (component.type === 'duplicator') {
      html += `<div class="property-item">
        <label>Number of Copies</label>
        <input type="number" min="2" max="10" value="${component.params.copies || 2}"
               onchange="editor.updateComponentParam('copies', parseInt(this.value))">
      </div>
      <div class="property-item">
        <label>Output Pattern</label>
        <button onclick="editor.editOutputPattern()" style="width: 100%; padding: 6px;">
          Edit Output Pattern
        </button>
        <small style="color: #888; font-size: 10px;">Define distribution to each output side</small>
        <div style="padding: 8px; background: #2a2a2a; border-radius: 4px; font-size: 11px; margin-top: 4px; color: #aaa;">
          ${this.formatOutputPattern(sidesToOutputPattern(component.params.sides))}
        </div>
      </div>
      <div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    } else if (component.type === 'observation') {
      html += `<div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    } else if (component.type === 'arm') {
      html += `<div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    } else if (component.type === 'switch') {
      html += `<div class="property-item">
        <label>N (first N balls to firstN output)</label>
        <input type="number" min="1" value="${component.params.n || 1}"
               onchange="editor.updateComponentParam('n', parseInt(this.value))">
        <small style="color: #888; font-size: 10px;">Left-click to increment, right-click to decrement</small>
      </div>
      <div class="property-item">
        <label>Input Side</label>
        <select onchange="editor.updateComponentParam('inputSide', this.value)">
          <option value="up" ${component.params.inputSide === 'up' ? 'selected' : ''}>Up</option>
          <option value="down" ${component.params.inputSide === 'down' ? 'selected' : ''}>Down</option>
          <option value="left" ${component.params.inputSide === 'left' ? 'selected' : ''}>Left</option>
          <option value="right" ${component.params.inputSide === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
      <div class="property-item">
        <label>First N Output Side</label>
        <select onchange="editor.updateComponentParam('firstNOutputSide', this.value)">
          <option value="up" ${component.params.firstNOutputSide === 'up' ? 'selected' : ''}>Up</option>
          <option value="down" ${component.params.firstNOutputSide === 'down' ? 'selected' : ''}>Down</option>
          <option value="left" ${component.params.firstNOutputSide === 'left' ? 'selected' : ''}>Left</option>
          <option value="right" ${component.params.firstNOutputSide === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
      <div class="property-item">
        <label>Rest Output Side</label>
        <select onchange="editor.updateComponentParam('restOutputSide', this.value)">
          <option value="up" ${component.params.restOutputSide === 'up' ? 'selected' : ''}>Up</option>
          <option value="down" ${component.params.restOutputSide === 'down' ? 'selected' : ''}>Down</option>
          <option value="left" ${component.params.restOutputSide === 'left' ? 'selected' : ''}>Left</option>
          <option value="right" ${component.params.restOutputSide === 'right' ? 'selected' : ''}>Right</option>
        </select>
      </div>
      <div class="property-item">
        <label>
          <input type="checkbox" ${component.params.plex ? 'checked' : ''}
                 onchange="editor.updateComponentParam('plex', this.checked)">
          Plex Glass
        </label>
      </div>`;
    }

    panel.innerHTML = html;
  }

  updateComponentParam(key, value) {
    if (this.selectedComponent) {
      this.selectedComponent.params[key] = value;
      this.saveState();
      this.render();
    }
  }

  updateComponentContents(jsonStr) {
    if (!this.selectedComponent) return;

    try {
      const contents = JSON.parse(jsonStr);
      this.selectedComponent.params.contents = contents;
      this.saveState();
      this.setStatus('Contents updated', 'success');
    } catch (error) {
      this.setStatus('Invalid JSON: ' + error.message, 'error');
    }
  }

  formatOutputPattern(pattern) {
    // Format output pattern for display
    if (!pattern || !Array.isArray(pattern)) {
      return 'Invalid pattern';
    }

    return pattern.map(entry => {
      return `${entry.count} copies → ${entry.side}`;
    }).join('<br>');
  }

  editOutputPattern() {
    if (!this.selectedComponent) return;
    const component = this.selectedComponent;

    const currentPattern = sidesToOutputPattern(component.params.sides) || [{side: 'right', count: component.params.copies || 2}];

    const patternStr = prompt(
      'Edit output pattern as JSON array.\n\n' +
      'Example: [{"side": "right", "count": 3}, {"side": "up", "count": 2}]\n\n' +
      'Valid sides: right, down, left, up\n' +
      'Total count = number of copies.\n\n' +
      'Current pattern:',
      JSON.stringify(currentPattern, null, 2)
    );

    if (patternStr !== null) {
      try {
        const pattern = JSON.parse(patternStr);
        if (!Array.isArray(pattern)) {
          throw new Error('Pattern must be an array');
        }
        const validSides = ['right', 'down', 'left', 'up'];
        let totalCount = 0;
        for (const entry of pattern) {
          if (!entry.side || !validSides.includes(entry.side)) {
            throw new Error(`Invalid side: ${entry.side}. Must be one of: ${validSides.join(', ')}`);
          }
          if (!Number.isInteger(entry.count) || entry.count < 0) {
            throw new Error(`Invalid count: ${entry.count}. Must be a non-negative integer`);
          }
          totalCount += entry.count;
        }

        component.params.sides = patternToSides(pattern, component.params.sides);
        component.params.copies = totalCount;
        delete component.params.outputPattern;  // strip legacy field
        this.updateAutomaticConnections();
        this.updatePropertiesPanel();
        this.saveState();
        this.render();
        this.setStatus('Output pattern updated', 'success');
      } catch (error) {
        this.setStatus('Invalid pattern: ' + error.message, 'error');
      }
    }
  }

  formatShufflerPattern(pattern) {
    // Format shuffler output pattern for display
    if (!pattern || !Array.isArray(pattern)) {
      return 'Invalid pattern';
    }

    return pattern.map(entry => {
      if (entry.retain) {
        return `${entry.count} balls → retained`;
      } else {
        return `${entry.count} balls → ${entry.side}`;
      }
    }).join('<br>');
  }

  editShufflerPattern() {
    if (!this.selectedComponent) return;
    const component = this.selectedComponent;

    const currentPattern = sidesToOutputPattern(component.params.sides) || [
      {side: component.params.outputSide || 'down', count: component.params.numInputs || 2}
    ];

    const patternStr = prompt(
      'Edit shuffler output pattern as JSON array.\n\n' +
      'Example (multi-output): [{"side": "right", "count": 2}, {"side": "down", "count": 1}]\n\n' +
      'Valid sides: right, down, left, up.\n' +
      'Retained balls = minBufferSize - sum(output counts), set retention via Min Buffer Size.\n\n' +
      'Current pattern:',
      JSON.stringify(currentPattern, null, 2)
    );

    if (patternStr !== null) {
      try {
        const pattern = JSON.parse(patternStr);
        if (!Array.isArray(pattern)) {
          throw new Error('Pattern must be an array');
        }
        const validSides = ['right', 'down', 'left', 'up'];
        let totalOutput = 0;
        for (const entry of pattern) {
          if (!entry.side || !validSides.includes(entry.side)) {
            throw new Error(`Invalid side: ${entry.side}. Must be one of: ${validSides.join(', ')}`);
          }
          if (!Number.isInteger(entry.count) || entry.count < 0) {
            throw new Error(`Invalid count: ${entry.count}. Must be a non-negative integer`);
          }
          totalOutput += entry.count;
        }

        component.params.sides = patternToSides(pattern, component.params.sides);
        delete component.params.outputPattern;  // strip legacy field
        const minBufferSize = component.params.minBufferSize || component.params.numInputs || 2;
        if (totalOutput > minBufferSize) {
          component.params.minBufferSize = totalOutput;
        }
        this.updateAutomaticConnections();
        this.updatePropertiesPanel();
        this.saveState();
        this.render();
        this.setStatus('Shuffler pattern updated', 'success');
      } catch (error) {
        this.setStatus('Invalid pattern: ' + error.message, 'error');
      }
    }
  }

  // File Operations
  newLevel() {
    this.components = [];
    this.connections = [];
    this.selectedComponent = null;
    this.history = [];
    this.historyIndex = -1;
    this.nextComponentId = 1;

    // Clear loaded level tracking
    this.loadedLevelId = null;

    // Clear veil and DGP versions
    this.veiledTiles = new Set();
    this.dgpVersions = [];
    this.activeVersionIndex = -1;

    // Clear DGP configuration
    this.dgpScript = '';
    this.dgpResult = null;
    this.computedDistribution = {};
    this.modelScript = '';
    this.placedArms = new Set();

    // Update UI elements
    const dgpScript = document.getElementById('dgp-script');
    if (dgpScript) dgpScript.value = DEFAULT_DGP_SCRIPT;
    this.dgpScript = dgpScript?.value || '';

    const modelScript = document.getElementById('model-script');
    if (modelScript) modelScript.value = '';

    const dgpResult = document.getElementById('dgp-result');
    if (dgpResult) dgpResult.innerHTML = '<p class="info">Click "Execute DGP" to validate and compute distribution</p>';

    const distDiv = document.getElementById('computed-distribution');
    if (distDiv) distDiv.style.display = 'none';

    this.updatePropertiesPanel();
    this.renderVersionList();
    this.saveState();
    this.render();
    this.setStatus('Level cleared', 'success');
  }

  loadLevel() {
    const savedLevels = this.getSavedLevels();

    if (savedLevels.length === 0) {
      alert('No saved levels!');
      return;
    }

    // Build level selection dialog
    let message = 'Choose a level to load:\n\n';
    savedLevels.forEach((level, index) => {
      message += `${index + 1}. ${level.meta.title || level.meta.id}\n`;
      if (level.meta.description) {
        message += `   ${level.meta.description}\n`;
      }
    });
    message += '\nEnter the level number:';

    const selection = prompt(message);
    if (selection === null) return; // User cancelled

    const levelIndex = parseInt(selection) - 1;
    if (isNaN(levelIndex) || levelIndex < 0 || levelIndex >= savedLevels.length) {
      alert('Invalid level number!');
      return;
    }

    const level = savedLevels[levelIndex];

    // Load level data
    this.gridWidth = level.grid.width;
    this.gridHeight = level.grid.height;
    this.components = level.components || [];
    this.connections = level.connections || [];

    // Load veil and DGP versions
    this.veiledTiles = new Set(
      (level.veiledTiles || []).map(t => `${t.x},${t.y}`)
    );
    this.dgpVersions = level.dgpAlternatives || [];
    this.activeVersionIndex = this.dgpVersions.length > 0 ? 0 : -1;

    // Migrate shuffler components from old format to new format
    this.components.forEach(comp => {
      if (comp.type === 'shuffler') {
        const spec = ComponentRegistry.get('shuffler');
        if (spec && spec.behavior && spec.behavior.migrateParams) {
          comp.params = spec.behavior.migrateParams(comp.params);
        }
      }
    });

    // Load DGP script
    this.dgpScript = level.dgpScript || '';
    this.computedDistribution = level.correctDistribution || {};
    this.modelScript = level.intendedModel || '';

    // Update UI elements
    const dgpScriptEl = document.getElementById('dgp-script');
    if (dgpScriptEl) dgpScriptEl.value = this.dgpScript;
    const modelScriptEl = document.getElementById('model-script');
    if (modelScriptEl) modelScriptEl.value = this.modelScript;

    // Update nextComponentId to avoid ID conflicts
    this._updateNextComponentId();

    // Reset editor state
    this.selectedComponent = null;
    this.history = [];
    this.historyIndex = -1;

    // Update UI
    this.updateCanvasSize();
    this.updateGridSizeDisplays();
    this.updatePropertiesPanel();
    // If versions exist, load version 0's hidden components into the editor
    if (this.dgpVersions.length > 0) {
      const ver = this.dgpVersions[0];
      for (const comp of ver.components) {
        this.components.push(JSON.parse(JSON.stringify(comp)));
      }
      for (const conn of ver.connections) {
        this.connections.push(JSON.parse(JSON.stringify(conn)));
      }
      this._updateNextComponentId();
    }

    this.renderVersionList();
    this.updateAutomaticConnections();

    // Re-execute DGP to show result
    if (this.dgpScript) {
      this.executeDGP();
    }

    this.saveState();
    this.render();

    // Track loaded level for updates
    this.loadedLevelId = level.meta.id;

    this.setStatus(`Loaded: ${level.meta.title || level.meta.id}`, 'success');
  }

  saveLevel() {
    // Validate DGP script has been executed
    if (!this.dgpResult) {
      this.setStatus('Error: Execute DGP first', 'error');
      alert('Error: Click "Execute DGP" first to validate the data generating process');
      return;
    }

    if (this.dgpResult.errors.length > 0) {
      this.setStatus('Error: DGP has errors', 'error');
      alert('Error: Fix DGP script errors before saving');
      return;
    }

    // Validate distribution is computed
    if (Object.keys(this.computedDistribution).length === 0) {
      this.setStatus('Error: Distribution not computed', 'error');
      alert('Error: Distribution must be computed. Check that all sacks are properly connected.');
      return;
    }

    // A playable level needs at least two observation points — otherwise the
    // server's lockLevel rejects it only later, when the GM tries to start it.
    const obsCount = this.components.filter(c => c.type === 'observation').length;
    if (obsCount < 2) {
      this.setStatus('Error: Need at least 2 observation points', 'error');
      alert(`Error: A level needs at least 2 observation points (has ${obsCount}).`);
      return;
    }

    // Get existing levels from LevelRegistry
    const savedLevels = LevelRegistry.getAllLevels();

    // Find maximum existing level number to avoid ID collisions
    const maxLevelNumber = Math.max(0, ...savedLevels.map(l => {
      const match = l.meta.id.match(/^level-(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    }));

    const levelNumber = maxLevelNumber + 1;
    const levelId = `level-${levelNumber}`;

    // Title and description from DGP result
    const title = `Level ${levelNumber}`;
    const description = this.dgpResult.questionText || `Probability-model level`;

    const ballCount = this.dgpResult.ballCount || (this.dgpResult.schedule?.length || 0);

    // Recompute correctDistribution AND connections for all DGP versions before saving.
    // Switch to each version, rebuild connections from spatial adjacency, run MC, store results.
    if (this.dgpVersions.length > 0) {
      const originalIndex = this.activeVersionIndex;
      for (let i = 0; i < this.dgpVersions.length; i++) {
        this.switchToVersion(i);
        // switchToVersion loads components + calls updateAutomaticConnections + recomputes MC.
        // Now capture the fresh hidden connections for this version.
        this.dgpVersions[i].connections = JSON.parse(JSON.stringify(this.getHiddenConnections()));
      }
      // Restore original version
      if (originalIndex >= 0 && originalIndex < this.dgpVersions.length) {
        this.switchToVersion(originalIndex);
      }
      console.log(`[Save] Recomputed connections + correctDistribution for ${this.dgpVersions.length} versions`);
    }

    const level = {
      meta: {
        id: levelId,
        title: title,
        description: description,
        bettingConfig: {
          granularity: 10  // Always 10 betting buckets
        }
      },
      grid: {
        width: this.gridWidth,
        height: this.gridHeight
      },
      veiledTiles: [...this.veiledTiles].map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      }),
      dgpAlternatives: JSON.parse(JSON.stringify(this.dgpVersions)),
      components: this.getVisibleComponents(),
      connections: this.getVisibleConnections(),
      dgpScript: this.dgpScript,
      dgpResult: {
        sacks: this.dgpResult.sacks,
        arms: this.dgpResult.arms,
        schedule: this.dgpResult.schedule,
        questionText: this.dgpResult.questionText,
        prediction: this.dgpResult.prediction,
        buckets: this.dgpResult.buckets,
        monteCarloSamples: this.dgpResult.monteCarloSamples,
        showFullDistribution: this.dgpResult.showFullDistribution,
        fineGrainedDisplay: this.dgpResult.fineGrainedDisplay,
        disableBranching: this.dgpResult.disableBranching,
        ballCount: ballCount
      },
      // Sampling schedule at top level (required by Simulation)
      samplingSchedule: this.dgpResult.schedule,
      correctDistribution: this.computedDistribution,
      intendedModel: this.modelScript,
      simulation: {
        ballProductionInterval: 3000,
        ballSpeed: 1.0,
        ballsToSpawn: ballCount
        // No seed - will use random via SeedManager when played
      }
    };

    // Save to LevelRegistry
    savedLevels.push(level);
    LevelRegistry.saveLevels(savedLevels);

    // Add to "other" group by default
    const groups = LevelRegistry.loadGroups();
    if (!groups.other.includes(levelId)) {
      groups.other.push(levelId);
      LevelRegistry.saveGroups(groups);
    }

    this.setStatus(`Saved to level ${levelNumber}`, 'success');
    alert(`Saved to level ${levelNumber}!`);
  }

  getSavedLevels() {
    return LevelRegistry.getAllLevels();
  }

  loadLevelById(levelId) {
    const level = LevelRegistry.getLevel(levelId);

    if (!level) {
      console.error(`Level ${levelId} not found`);
      this.setStatus(`Level ${levelId} not found`, 'error');
      return false;
    }

    // Load level data
    this.gridWidth = level.grid.width;
    this.gridHeight = level.grid.height;
    this.components = level.components || [];
    this.connections = level.connections || [];

    // Load veil and DGP versions
    this.veiledTiles = new Set(
      (level.veiledTiles || []).map(t => `${t.x},${t.y}`)
    );
    this.dgpVersions = level.dgpAlternatives || [];
    this.activeVersionIndex = this.dgpVersions.length > 0 ? 0 : -1;

    // Migrate shuffler components from old format to new format
    this.components.forEach(comp => {
      if (comp.type === 'shuffler') {
        const spec = ComponentRegistry.get('shuffler');
        if (spec && spec.behavior && spec.behavior.migrateParams) {
          comp.params = spec.behavior.migrateParams(comp.params);
        }
      }
    });

    // Load DGP configuration
    this.dgpScript = level.dgpScript || '';
    this.computedDistribution = level.correctDistribution || {};
    this.modelScript = level.intendedModel || '';

    // Update UI elements
    const dgpScriptEl = document.getElementById('dgp-script');
    if (dgpScriptEl) dgpScriptEl.value = this.dgpScript;
    const modelScriptEl = document.getElementById('model-script');
    if (modelScriptEl) modelScriptEl.value = this.modelScript;

    // Update nextComponentId to avoid ID conflicts
    this._updateNextComponentId();

    // If versions exist, load version 0's hidden components into the editor
    if (this.dgpVersions.length > 0) {
      const ver = this.dgpVersions[0];
      for (const comp of ver.components) {
        this.components.push(JSON.parse(JSON.stringify(comp)));
      }
      for (const conn of ver.connections) {
        this.connections.push(JSON.parse(JSON.stringify(conn)));
      }
      this._updateNextComponentId();
    }

    this.updateCanvasSize();
    this.updateAutomaticConnections();
    this.updatePropertiesPanel();
    this.renderVersionList();

    // Execute DGP to show results
    if (this.dgpScript) {
      this.executeDGP();
    }

    this.saveState();
    this.render();

    // Track loaded level for updates
    this.loadedLevelId = level.meta.id;

    this.setStatus(`Loaded level: ${level.meta.title || levelId}`, 'success');
    return true;
  }

  addColumn(side) {
    if (this.gridWidth >= 20) return;
    this.gridWidth++;

    if (side === 'left') {
      // Shift all components right by 1
      this.components.forEach(comp => {
        comp.position.x += 1;
      });
      // Shift veiled tiles right by 1
      this.veiledTiles = new Set([...this.veiledTiles].map(key => {
        const [x, y] = key.split(',').map(Number);
        return `${x + 1},${y}`;
      }));
    }
    // 'right' side: no shift needed

    this.updateCanvasSize();
    this.updateGridSizeDisplays();
    this.saveState();
    this.render();
  }

  removeColumn(side) {
    if (this.gridWidth <= 3) return;

    if (side === 'left') {
      // Remove components in column 0, shift others left
      this.components = this.components.filter(comp => comp.position.x > 0);
      this.components.forEach(comp => {
        comp.position.x -= 1;
      });
      // Shift veiled tiles
      const newVeiled = new Set();
      for (const key of this.veiledTiles) {
        const [x, y] = key.split(',').map(Number);
        if (x > 0) newVeiled.add(`${x - 1},${y}`);
      }
      this.veiledTiles = newVeiled;
    } else {
      // Remove components in rightmost column
      this.components = this.components.filter(comp => comp.position.x < this.gridWidth - 1);
      // Remove veiled tiles in rightmost column
      for (const key of this.veiledTiles) {
        const [x] = key.split(',').map(Number);
        if (x >= this.gridWidth - 1) this.veiledTiles.delete(key);
      }
    }

    this.gridWidth--;
    this.updateCanvasSize();
    this.updateGridSizeDisplays();
    this.updateAutomaticConnections();
    this.saveState();
    this.render();
  }

  addRow(side) {
    if (this.gridHeight >= 15) return;
    this.gridHeight++;

    if (side === 'top') {
      // Shift all components down by 1
      this.components.forEach(comp => {
        comp.position.y += 1;
      });
      // Shift veiled tiles down by 1
      this.veiledTiles = new Set([...this.veiledTiles].map(key => {
        const [x, y] = key.split(',').map(Number);
        return `${x},${y + 1}`;
      }));
    }
    // 'bottom' side: no shift needed

    this.updateCanvasSize();
    this.updateGridSizeDisplays();
    this.saveState();
    this.render();
  }

  removeRow(side) {
    if (this.gridHeight <= 3) return;

    if (side === 'top') {
      // Remove components in row 0, shift others up
      this.components = this.components.filter(comp => comp.position.y > 0);
      this.components.forEach(comp => {
        comp.position.y -= 1;
      });
      // Shift veiled tiles
      const newVeiled = new Set();
      for (const key of this.veiledTiles) {
        const [x, y] = key.split(',').map(Number);
        if (y > 0) newVeiled.add(`${x},${y - 1}`);
      }
      this.veiledTiles = newVeiled;
    } else {
      // Remove components in bottom row
      this.components = this.components.filter(comp => comp.position.y < this.gridHeight - 1);
      // Remove veiled tiles in bottom row
      for (const key of this.veiledTiles) {
        const [, y] = key.split(',').map(Number);
        if (y >= this.gridHeight - 1) this.veiledTiles.delete(key);
      }
    }

    this.gridHeight--;
    this.updateCanvasSize();
    this.updateGridSizeDisplays();
    this.updateAutomaticConnections();
    this.saveState();
    this.render();
  }

  updateGridSizeDisplays() {
    document.getElementById('grid-width-display').textContent = this.gridWidth;
    document.getElementById('grid-height-display').textContent = this.gridHeight;
  }

  testLevel() {
    // Validate DGP has been executed
    if (!this.dgpResult) {
      this.setStatus('Error: Execute DGP first', 'error');
      alert('Error: Click "Execute DGP" first before testing');
      return;
    }

    if (this.dgpResult.errors.length > 0) {
      this.setStatus('Error: DGP has errors', 'error');
      alert('Error: Fix DGP script errors before testing');
      return;
    }

    const ballCount = this.dgpResult.ballCount || (this.dgpResult.schedule?.length || 0);

    // Recompute connections + correctDistribution for all DGP versions before testing.
    if (this.dgpVersions.length > 0) {
      const originalIndex = this.activeVersionIndex;
      for (let i = 0; i < this.dgpVersions.length; i++) {
        this.switchToVersion(i);
        this.dgpVersions[i].connections = JSON.parse(JSON.stringify(this.getHiddenConnections()));
      }
      if (originalIndex >= 0 && originalIndex < this.dgpVersions.length) {
        this.switchToVersion(originalIndex);
      }
      console.log(`[Test] Recomputed connections + correctDistribution for ${this.dgpVersions.length} versions`);
    }

    // Build level object
    const level = {
      meta: {
        id: this.loadedLevelId || "test-level",
        title: this.loadedLevelId ? `Level ${this.loadedLevelId.replace('level-', '')}` : "Test Level",
        description: this.dgpResult.questionText || "Testing from editor",
        bettingConfig: {
          granularity: 10  // Always 10 betting buckets
        }
      },
      grid: {
        width: this.gridWidth,
        height: this.gridHeight
      },
      veiledTiles: [...this.veiledTiles].map(key => {
        const [x, y] = key.split(',').map(Number);
        return { x, y };
      }),
      dgpAlternatives: JSON.parse(JSON.stringify(this.dgpVersions)),
      components: this.getVisibleComponents(),
      connections: this.getVisibleConnections(),
      dgpScript: this.dgpScript,
      dgpResult: {
        sacks: this.dgpResult.sacks,
        arms: this.dgpResult.arms,
        schedule: this.dgpResult.schedule,
        questionText: this.dgpResult.questionText,
        prediction: this.dgpResult.prediction,
        buckets: this.dgpResult.buckets,
        monteCarloSamples: this.dgpResult.monteCarloSamples,
        showFullDistribution: this.dgpResult.showFullDistribution,
        fineGrainedDisplay: this.dgpResult.fineGrainedDisplay,
        disableBranching: this.dgpResult.disableBranching,
        ballCount: ballCount
      },
      // Sampling schedule at top level (required by Simulation)
      samplingSchedule: this.dgpResult.schedule,
      correctDistribution: this.computedDistribution,
      intendedModel: this.modelScript,
      simulation: {
        ballProductionInterval: 3000,
        ballSpeed: 1.0,
        ballsToSpawn: ballCount,
        seed: SeedManager.generateRandomSeed()  // Random seed for each test
      }
    };

    // If editing an existing level, update it in the registry
    if (this.loadedLevelId) {
      const savedLevels = LevelRegistry.getAllLevels();
      const levelIndex = savedLevels.findIndex(l => l.meta.id === this.loadedLevelId);
      if (levelIndex !== -1) {
        // Preserve original title if it exists
        level.meta.title = savedLevels[levelIndex].meta.title || level.meta.title;
        savedLevels[levelIndex] = level;
        LevelRegistry.saveLevels(savedLevels);
        this.setStatus(`Updated: ${level.meta.title}`, 'success');
      }
    }

    localStorage.setItem('factory-market_testLevel', JSON.stringify(level));
    window.open('preview.html', '_blank');
  }

  // Rendering
  render() {
    // Store gridSize on canvas for components to access
    this.canvas._gridSize = this.gridSize;

    // Clear canvas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Draw connections
    this.drawConnections();

    // Draw regular components first
    this.components.forEach(comp => {
      const spec = ComponentRegistry.get(comp.type);
      if (!spec || !spec.isOverlay) {
        this.drawComponent(comp);
      }
    });

    // Set up hostComponent for overlay components (buttons) before rendering
    this.components.forEach(comp => {
      const spec = ComponentRegistry.get(comp.type);
      if (spec && spec.isOverlay) {
        // Find host component (conveyor or conveyor-turn at same position)
        comp.hostComponent = this.components.find(c =>
          (c.type === 'conveyor' || c.type === 'conveyor-turn') &&
          c.position.x === comp.position.x &&
          c.position.y === comp.position.y
        );
      }
    });

    // Draw overlay components (buttons) on top
    this.components.forEach(comp => {
      const spec = ComponentRegistry.get(comp.type);
      if (spec && spec.isOverlay) {
        this.drawComponent(comp);
      }
    });

    // Draw veiled tiles
    this.drawVeiledTiles();

    // Draw component labels
    if (this.showLabels && this.components.length > 0) {
      this.drawComponentLabels();
    }

    // Draw veil tool preview
    if (this.currentTool === 'veil' && this.mouseGridPos) {
      const px = this.mouseGridPos.x * this.gridSize;
      const py = this.mouseGridPos.y * this.gridSize;
      const key = `${this.mouseGridPos.x},${this.mouseGridPos.y}`;
      const willRemove = this.veiledTiles.has(key);
      this.ctx.strokeStyle = willRemove ? 'rgba(255, 100, 100, 0.8)' : 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(px + 1, py + 1, this.gridSize - 2, this.gridSize - 2);
      this.ctx.setLineDash([]);
    }

    // Draw component preview (for placement)
    if (this.currentTool === 'place' && this.selectedComponentType && this.mouseGridPos) {
      this.drawComponentPreview();
    }

    // Draw selection
    if (this.selectedComponent) {
      this.drawSelection(this.selectedComponent);
    }

    // Draw connection preview
    if (this.connectFrom) {
      this.drawConnectionPreview(this.connectFrom);
    }
  }

  drawGrid() {
    this.ctx.strokeStyle = '#2c2c2c';
    this.ctx.lineWidth = 1;

    for (let x = 0; x <= this.gridWidth; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * this.gridSize, 0);
      this.ctx.lineTo(x * this.gridSize, this.canvas.height);
      this.ctx.stroke();
    }

    for (let y = 0; y <= this.gridHeight; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * this.gridSize);
      this.ctx.lineTo(this.canvas.width, y * this.gridSize);
      this.ctx.stroke();
    }
  }

  /**
   * Compute bounding rectangle of all components
   * Returns {minX, minY, maxX, maxY} in grid coordinates
   */
  computeBoundingBox() {
    if (this.components.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.components.forEach(comp => {
      const x = comp.position.x;
      const y = comp.position.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    return { minX, minY, maxX, maxY };
  }

  /**
   * Get label for a component position relative to bounding box
   * Returns string like "A1", "B2", etc.
   * Column = letter (A, B, C...), Row = number (1, 2, 3...)
   */
  getComponentLabel(position, boundingBox) {
    const relX = position.x - boundingBox.minX;
    const relY = position.y - boundingBox.minY;

    // Column letter (A, B, C, ...)
    const colLetter = String.fromCharCode(65 + relX);  // 65 = 'A'
    // Row number (1-indexed)
    const rowNumber = relY + 1;

    return `${colLetter}${rowNumber}`;
  }

  /**
   * Draw component labels in the top-left corner of each cell
   */
  drawComponentLabels() {
    const boundingBox = this.computeBoundingBox();

    this.ctx.save();
    this.ctx.font = 'bold 10px sans-serif';
    this.ctx.fillStyle = '#000000';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    this.components.forEach(comp => {
      const label = this.getComponentLabel(comp.position, boundingBox);
      const px = comp.position.x * this.gridSize;
      const py = comp.position.y * this.gridSize;

      // Draw label in top-left corner with small padding
      this.ctx.fillText(label, px + 2, py + 2);
    });

    this.ctx.restore();
  }

  drawComponent(component) {
    const spec = ComponentRegistry.get(component.type);
    if (spec.visual.render) {
      this.ctx.save();
      spec.visual.render(this.ctx, component);
      this.ctx.restore();
    }

    const px = component.position.x * this.gridSize;
    const py = component.position.y * this.gridSize;

    // Draw plex glass overlay
    if (component.params && component.params.plex) {
      this.ctx.fillStyle = 'rgba(100, 150, 255, 0.3)'; // Semi-transparent blue
      this.ctx.fillRect(px, py, this.gridSize, this.gridSize);

      // Draw border
      this.ctx.strokeStyle = 'rgba(100, 150, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(px, py, this.gridSize, this.gridSize);

      // Question mark
      this.ctx.fillStyle = 'rgba(100, 150, 255, 0.9)';
      this.ctx.font = 'bold 24px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('?', px + this.gridSize / 2, py + this.gridSize / 2);
    }

    // Draw label (varName for sacks/arms, otherwise ID)
    const label = component.params?.varName || component.id;
    this.ctx.font = 'bold 11px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    // White outline for contrast
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.lineWidth = 3;
    this.ctx.strokeText(label, px + 2, py + 2);
    // Black fill
    this.ctx.fillStyle = '#000000';
    this.ctx.fillText(label, px + 2, py + 2);

    // If varName exists, also show ID in smaller font below
    if (component.params?.varName) {
      this.ctx.font = 'bold 9px monospace';
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeText(`(${component.id})`, px + 2, py + 15);
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillText(`(${component.id})`, px + 2, py + 15);
    }
  }

  drawSelection(component) {
    const px = component.position.x * this.gridSize;
    const py = component.position.y * this.gridSize;

    this.ctx.strokeStyle = '#1E88E5';
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(px + 2, py + 2, this.gridSize - 4, this.gridSize - 4);
  }

  drawConnections() {
    this.ctx.strokeStyle = '#4CAF50';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([4, 4]);

    this.connections.forEach(conn => {
      const from = this.components.find(c => c.id === conn.from);
      const to = this.components.find(c => c.id === conn.to);

      if (from && to) {
        const fromCenter = {
          x: (from.position.x + 0.5) * this.gridSize,
          y: (from.position.y + 0.5) * this.gridSize
        };
        const toCenter = {
          x: (to.position.x + 0.5) * this.gridSize,
          y: (to.position.y + 0.5) * this.gridSize
        };

        this.ctx.beginPath();
        this.ctx.moveTo(fromCenter.x, fromCenter.y);
        this.ctx.lineTo(toCenter.x, toCenter.y);
        this.ctx.stroke();

        // Draw arrow
        const angle = Math.atan2(toCenter.y - fromCenter.y, toCenter.x - fromCenter.x);
        const arrowSize = 8;
        this.ctx.beginPath();
        this.ctx.moveTo(toCenter.x, toCenter.y);
        this.ctx.lineTo(
          toCenter.x - arrowSize * Math.cos(angle - Math.PI / 6),
          toCenter.y - arrowSize * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.moveTo(toCenter.x, toCenter.y);
        this.ctx.lineTo(
          toCenter.x - arrowSize * Math.cos(angle + Math.PI / 6),
          toCenter.y - arrowSize * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.stroke();
      }
    });

    this.ctx.setLineDash([]);
  }

  drawConnectionPreview(component) {
    const center = {
      x: (component.position.x + 0.5) * this.gridSize,
      y: (component.position.y + 0.5) * this.gridSize
    };

    this.ctx.fillStyle = '#4CAF50';
    this.ctx.beginPath();
    this.ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawComponentPreview() {
    const x = this.mouseGridPos.x;
    const y = this.mouseGridPos.y;

    // Check if position is valid
    if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
      return;
    }

    // Check if position is occupied
    const isOccupied = this.getComponentAt(x, y) !== undefined;

    // Create a temporary component for preview
    const previewComponent = {
      id: 'preview',
      type: this.selectedComponentType,
      position: {x, y},
      params: {...this.pendingComponentParams}
    };

    // Save current context state
    this.ctx.save();

    // Set reduced opacity for preview
    this.ctx.globalAlpha = isOccupied ? 0.3 : 0.5;

    // Draw the component using its normal render method
    const spec = ComponentRegistry.get(this.selectedComponentType);
    if (spec.visual.render) {
      spec.visual.render(this.ctx, previewComponent);
    }

    // Draw red tint if position is occupied
    if (isOccupied) {
      const px = x * this.gridSize;
      const py = y * this.gridSize;
      this.ctx.globalAlpha = 0.4;
      this.ctx.fillStyle = '#ff0000';
      this.ctx.fillRect(px, py, this.gridSize, this.gridSize);
    }

    // Restore context state
    this.ctx.restore();
  }

  // Utility Methods
  getMouseGridPosition(e) {
    // Get accurate mouse position relative to canvas
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    return {
      x: Math.floor(x / this.gridSize),
      y: Math.floor(y / this.gridSize)
    };
  }

  screenToGrid(screenX, screenY) {
    return {
      x: Math.floor(screenX / this.gridSize),
      y: Math.floor(screenY / this.gridSize)
    };
  }

  /**
   * Check if a component type can receive balls (has input ports)
   * @param {string} type - Component type
   * @returns {boolean} True if component can receive balls
   */
  canReceiveBalls(type) {
    // List of all component types that can receive balls
    // This centralizes the logic to avoid forgetting new components
    return [
      'conveyor',
      'conveyor-turn',
      'observation',
      'black-pit',
      'splitter',
      'shuffler',
      'duplicator',
      'filter',
      'merger',
      'switch'
    ].includes(type);
  }

  /**
   * Check if an arm at armPos can output to target component.
   * For conveyors/conveyor-turns, the arm must be on the INPUT side based on direction.
   * For other components (observation, black-pit, etc.), any adjacent position is valid.
   * @param {Object} armPos - Position of the arm {x, y}
   * @param {Object} target - Target component
   * @returns {boolean} True if arm can output to this component
   */
  isValidArmOutput(armPos, target) {
    if (!this.canReceiveBalls(target.type)) {
      return false;
    }

    // For straight conveyors, check if arm is on the input side
    if (target.type === 'conveyor') {
      const direction = target.params.direction || 'right';
      const relX = armPos.x - target.position.x;
      const relY = armPos.y - target.position.y;

      // Input side is opposite to the direction of travel
      // direction "right" → input from left → arm must be at relX=-1, relY=0
      // direction "left" → input from right → arm must be at relX=+1, relY=0
      // direction "down" → input from top → arm must be at relX=0, relY=-1
      // direction "up" → input from bottom → arm must be at relX=0, relY=+1
      switch (direction) {
        case 'right': return relX === -1 && relY === 0;
        case 'left': return relX === 1 && relY === 0;
        case 'down': return relX === 0 && relY === -1;
        case 'up': return relX === 0 && relY === 1;
        default: return false;
      }
    }

    // For conveyor-turns, check if arm is on the entry side
    if (target.type === 'conveyor-turn') {
      const turn = target.params.turn || 'right-to-down';
      const relX = armPos.x - target.position.x;
      const relY = armPos.y - target.position.y;

      // Turn format: "entry_direction-to-exit_direction"
      // Entry side is opposite to entry direction
      // e.g., "right-to-down" = balls traveling right, so entry from left
      const turnToEntrySide = {
        'right-to-down': 'left',
        'right-to-up': 'left',
        'left-to-down': 'right',
        'left-to-up': 'right',
        'down-to-right': 'up',
        'down-to-left': 'up',
        'up-to-right': 'down',
        'up-to-left': 'down'
      };

      const entrySide = turnToEntrySide[turn];
      if (!entrySide) return false;

      // Check if arm is on the entry side
      switch (entrySide) {
        case 'left': return relX === -1 && relY === 0;
        case 'right': return relX === 1 && relY === 0;
        case 'up': return relX === 0 && relY === -1;
        case 'down': return relX === 0 && relY === 1;
        default: return false;
      }
    }

    // For mergers, check if arm is on any input side
    if (target.type === 'merger') {
      const relX = armPos.x - target.position.x;
      const relY = armPos.y - target.position.y;

      // Determine which side the arm is on
      let armSide = null;
      if (relX === -1 && relY === 0) armSide = 'left';
      else if (relX === 1 && relY === 0) armSide = 'right';
      else if (relX === 0 && relY === -1) armSide = 'up';
      else if (relX === 0 && relY === 1) armSide = 'down';

      if (!armSide) return false;

      // Check if arm is on any of the merger's input sides
      const input1 = target.params.input1Side;
      const input2 = target.params.input2Side;
      const input3 = target.params.input3Side;

      return armSide === input1 || armSide === input2 || armSide === input3;
    }

    // For shuffler, splitter, duplicator, filter - check if arm is on an input side
    if (['shuffler', 'splitter', 'duplicator', 'filter'].includes(target.type)) {
      if (!target.params.sides) {
        return false; // Not configured yet
      }

      const relX = armPos.x - target.position.x;
      const relY = armPos.y - target.position.y;

      // Determine which side the arm is on
      let side = null;
      if (relX === -1 && relY === 0) side = 'left';
      else if (relX === 1 && relY === 0) side = 'right';
      else if (relX === 0 && relY === -1) side = 'up';
      else if (relX === 0 && relY === 1) side = 'down';

      if (!side) return false;

      // Check if that side is configured as input
      const sideConfig = target.params.sides[side];
      return sideConfig && sideConfig.type === 'input';
    }

    // For switch - check if arm is on the input side
    if (target.type === 'switch') {
      const inputSide = target.params.inputSide;
      const relX = armPos.x - target.position.x;
      const relY = armPos.y - target.position.y;

      // Check if arm is on the input side
      switch (inputSide) {
        case 'left': return relX === -1 && relY === 0;
        case 'right': return relX === 1 && relY === 0;
        case 'up': return relX === 0 && relY === -1;
        case 'down': return relX === 0 && relY === 1;
        default: return false;
      }
    }

    // For observation and black-pit, any adjacent position is valid
    return true;
  }

  getComponentAt(x, y) {
    return this.components.find(c => c.position.x === x && c.position.y === y);
  }

  generateId() {
    return `comp${this.nextComponentId++}`;
  }

  deepClone(obj) {
    // Deep clone using JSON serialization
    // This ensures nested objects are copied, not shared by reference
    return JSON.parse(JSON.stringify(obj));
  }

  getDefaultParams(spec) {
    // Use editor.defaultParams if present, otherwise fall back to component's defaultParams
    const params = spec.editor?.defaultParams || spec.defaultParams || {};
    return JSON.parse(JSON.stringify(params));
  }

  /**
   * Auto-detect splitter input/output channels from adjacent components
   * Handles: conveyors, conveyor-turns, mergers
   */
  autoDetectSplitterChannels(comp) {
    if (comp.type !== 'splitter') return;

    const sides = {
      up: {type: 'none'},
      right: {type: 'none'},
      down: {type: 'none'},
      left: {type: 'none'}
    };

    const opposites = {up: 'down', down: 'up', left: 'right', right: 'left'};
    const dirOffsets = {
      up: {x: 0, y: -1},
      down: {x: 0, y: 1},
      left: {x: -1, y: 0},
      right: {x: 1, y: 0}
    };

    // Conveyor-turn: map turn param to entry/exit sides
    // "right-to-down" = balls traveling right turn to travel down
    // Entry side is opposite of entry direction, exit side is same as exit direction
    const turnToSides = {
      "right-to-down": {entry: 'left', exit: 'down'},
      "down-to-left": {entry: 'up', exit: 'left'},
      "left-to-up": {entry: 'right', exit: 'up'},
      "up-to-right": {entry: 'down', exit: 'right'},
      "right-to-up": {entry: 'left', exit: 'up'},
      "up-to-left": {entry: 'down', exit: 'left'},
      "left-to-down": {entry: 'right', exit: 'down'},
      "down-to-right": {entry: 'up', exit: 'right'}
    };

    // Check each adjacent cell
    for (const side of ['up', 'down', 'left', 'right']) {
      const offset = dirOffsets[side];
      const neighborPos = {
        x: comp.position.x + offset.x,
        y: comp.position.y + offset.y
      };
      const neighbor = this.getComponentAt(neighborPos.x, neighborPos.y);
      if (!neighbor) continue;

      const oppositeSide = opposites[side];

      if (neighbor.type === 'conveyor') {
        const neighborDir = neighbor.params?.direction;
        if (neighborDir === oppositeSide) {
          sides[side] = {type: 'input'};
        } else if (neighborDir === side) {
          sides[side] = {type: 'output'};
        }

      } else if (neighbor.type === 'conveyor-turn') {
        const turn = neighbor.params?.turn || 'right-to-down';
        const turnSides = turnToSides[turn];
        if (turnSides) {
          // If turn's exit faces us, we receive from it
          if (turnSides.exit === oppositeSide) {
            sides[side] = {type: 'input'};
          }
          // If turn's entry faces us, we output to it
          if (turnSides.entry === oppositeSide) {
            sides[side] = {type: 'output'};
          }
        }

      } else if (neighbor.type === 'merger') {
        const outputDir = neighbor.params?.direction;
        const input1 = neighbor.params?.input1Side;
        const input2 = neighbor.params?.input2Side;
        const input3 = neighbor.params?.input3Side;

        if (outputDir === oppositeSide) {
          sides[side] = {type: 'input'};
        }
        if (input1 === oppositeSide || input2 === oppositeSide || input3 === oppositeSide) {
          sides[side] = {type: 'output'};
        }

      } else if (neighbor.type === 'switch') {
        const inputSide = neighbor.params?.inputSide;
        const firstNOutputSide = neighbor.params?.firstNOutputSide;
        const restOutputSide = neighbor.params?.restOutputSide;

        // If switch's output faces us, we receive from it
        if (firstNOutputSide === oppositeSide || restOutputSide === oppositeSide) {
          sides[side] = {type: 'input'};
        }
        // If switch's input faces us, we output to it
        if (inputSide === oppositeSide) {
          sides[side] = {type: 'output'};
        }

      } else if (neighbor.type === 'filter') {
        const inputSide = neighbor.params?.inputSide;
        const matchOutputSide = neighbor.params?.matchOutputSide;
        const nonMatchOutputSide = neighbor.params?.nonMatchOutputSide;

        // If filter's output faces us, we receive from it
        if (matchOutputSide === oppositeSide || nonMatchOutputSide === oppositeSide) {
          sides[side] = {type: 'input'};
        }
        // If filter's input faces us, we output to it
        if (inputSide === oppositeSide) {
          sides[side] = {type: 'output'};
        }
      }
    }

    // Update component params
    comp.params.sides = sides;
  }

  updateAutomaticConnections() {
    // Clear existing connections
    this.connections = [];


    // Auto-connect based on spatial adjacency
    this.components.forEach(comp => {
      const adjacent = this.getAdjacentComponents(comp);

      if (comp.type === 'sack') {
        // Sack connects to ALL adjacent arms (can have multiple)
        const arms = adjacent.filter(c => c.type === 'arm');
        arms.forEach(arm => {
          this.addConnection(comp.id, arm.id);
        });
      } else if (comp.type === 'arm') {
        // Arm receives from sack (already handled above)
        // Arm outputs to component that can receive balls AND arm is on input side
        const output = adjacent.find(c => this.isValidArmOutput(comp.position, c));
        if (output) {
          this.addConnection(comp.id, output.id);
        }
      } else if (comp.type === 'conveyor' || comp.type === 'conveyor-turn') {
        // Conveyor connects to adjacent conveyor/turn/observation/splitter/machine based on direction
        const nextComp = this.getComponentInDirection(comp);
        if (nextComp && this.canReceiveBalls(nextComp.type)) {
          this.addConnection(comp.id, nextComp.id);
        }
      } else if (comp.type === 'shuffler') {
        // Shuffler has multiple outputs based on sides configuration
        if (!comp.params.sides) {
          // Skip connection creation if not configured yet (during editing)
          return;
        }

        const sides = comp.params.sides;

        // Create connections for each output side
        for (const side in sides) {
          if (sides[side].type === 'output' && sides[side].count > 0) {
            let outputPos;

            switch (side) {
              case 'right': outputPos = {x: comp.position.x + 1, y: comp.position.y}; break;
              case 'down': outputPos = {x: comp.position.x, y: comp.position.y + 1}; break;
              case 'left': outputPos = {x: comp.position.x - 1, y: comp.position.y}; break;
              case 'up': outputPos = {x: comp.position.x, y: comp.position.y - 1}; break;
            }

            if (outputPos) {
              const output = this.getComponentAt(outputPos.x, outputPos.y);
              if (output && this.canReceiveBalls(output.type)) {
                this.addConnection(comp.id, output.id);
              }
            }
          }
        }
      } else if (comp.type === 'splitter') {
        // First, auto-detect channels from neighbors
        this.autoDetectSplitterChannels(comp);

        // Splitter has outputs based on sides configuration (like shuffler)
        if (!comp.params.sides) {
          return;
        }

        const sides = comp.params.sides;

        // Create connections for each output side
        for (const side in sides) {
          if (sides[side].type === 'output') {
            let outputPos;

            switch (side) {
              case 'right': outputPos = {x: comp.position.x + 1, y: comp.position.y}; break;
              case 'down': outputPos = {x: comp.position.x, y: comp.position.y + 1}; break;
              case 'left': outputPos = {x: comp.position.x - 1, y: comp.position.y}; break;
              case 'up': outputPos = {x: comp.position.x, y: comp.position.y - 1}; break;
            }

            if (outputPos) {
              const output = this.getComponentAt(outputPos.x, outputPos.y);
              if (output && this.canReceiveBalls(output.type)) {
                this.addConnection(comp.id, output.id);
              }
            }
          }
        }
      } else if (comp.type === 'duplicator') {
        // Duplicator has multiple outputs based on sides configuration
        if (!comp.params.sides) {
          // Skip connection creation if not configured yet (during editing)
          return;
        }

        const sides = comp.params.sides;

        // Create connections for each output side
        for (const side in sides) {
          if (sides[side].type === 'output' && sides[side].count > 0) {
            let outputPos;

            switch (side) {
              case 'right': outputPos = {x: comp.position.x + 1, y: comp.position.y}; break;
              case 'down': outputPos = {x: comp.position.x, y: comp.position.y + 1}; break;
              case 'left': outputPos = {x: comp.position.x - 1, y: comp.position.y}; break;
              case 'up': outputPos = {x: comp.position.x, y: comp.position.y - 1}; break;
            }

            if (outputPos) {
              const output = this.getComponentAt(outputPos.x, outputPos.y);
              if (output && this.canReceiveBalls(output.type)) {
                this.addConnection(comp.id, output.id);
              }
            }
          }
        }
      } else if (comp.type === 'filter') {
        // Filter has two outputs based on matchOutputSide and nonMatchOutputSide
        const matchSide = comp.params.matchOutputSide;
        const nonMatchSide = comp.params.nonMatchOutputSide;
        const outputSides = [matchSide, nonMatchSide];

        outputSides.forEach(side => {
          let outputPos;

          switch (side) {
            case 'up':
              outputPos = {x: comp.position.x, y: comp.position.y - 1};
              break;
            case 'down':
              outputPos = {x: comp.position.x, y: comp.position.y + 1};
              break;
            case 'left':
              outputPos = {x: comp.position.x - 1, y: comp.position.y};
              break;
            case 'right':
              outputPos = {x: comp.position.x + 1, y: comp.position.y};
              break;
          }

          if (outputPos) {
            const output = this.getComponentAt(outputPos.x, outputPos.y);
            if (output && this.canReceiveBalls(output.type)) {
              this.addConnection(comp.id, output.id);
            }
          }
        });
      } else if (comp.type === 'merger') {
        // Merger has single inline output based on direction
        const direction = comp.params.direction || 'right';
        let outputPos;

        switch (direction) {
          case 'right': outputPos = {x: comp.position.x + 1, y: comp.position.y}; break;
          case 'down': outputPos = {x: comp.position.x, y: comp.position.y + 1}; break;
          case 'left': outputPos = {x: comp.position.x - 1, y: comp.position.y}; break;
          case 'up': outputPos = {x: comp.position.x, y: comp.position.y - 1}; break;
        }

        if (outputPos) {
          const output = this.getComponentAt(outputPos.x, outputPos.y);
          if (output && this.canReceiveBalls(output.type)) {
            this.addConnection(comp.id, output.id);
          }
        }
      } else if (comp.type === 'switch') {
        // Switch has two outputs based on firstNOutputSide and restOutputSide
        const firstNSide = comp.params.firstNOutputSide;
        const restSide = comp.params.restOutputSide;
        const outputSides = [firstNSide, restSide];

        outputSides.forEach(side => {
          let outputPos;

          switch (side) {
            case 'up':
              outputPos = {x: comp.position.x, y: comp.position.y - 1};
              break;
            case 'down':
              outputPos = {x: comp.position.x, y: comp.position.y + 1};
              break;
            case 'left':
              outputPos = {x: comp.position.x - 1, y: comp.position.y};
              break;
            case 'right':
              outputPos = {x: comp.position.x + 1, y: comp.position.y};
              break;
          }

          if (outputPos) {
            const output = this.getComponentAt(outputPos.x, outputPos.y);
            if (output && this.canReceiveBalls(output.type)) {
              this.addConnection(comp.id, output.id);
            }
          }
        });
      }
    });

    // Validate connections - check for duplicates and multiple outputs from single-output components
    const connectionCounts = {};
    this.connections.forEach(conn => {
      connectionCounts[conn.from] = (connectionCounts[conn.from] || 0) + 1;
    });

    Object.keys(connectionCounts).forEach(fromId => {
      if (connectionCounts[fromId] > 1) {
        const comp = this.components.find(c => c.id === fromId);
        // Allow multiple connections for components that support multiple outputs
        const multiOutputTypes = ['splitter', 'filter', 'shuffler', 'duplicator', 'switch'];
        if (comp && !multiOutputTypes.includes(comp.type)) {
          console.warn(`WARNING: Component ${fromId} (${comp.type}) has ${connectionCounts[fromId]} outgoing connections but doesn't support multiple outputs!`);
        }
      }
    });

    // Validate that all components with output ports are handled in connection logic
    const handledTypes = ['sack', 'arm', 'conveyor', 'conveyor-turn', 'shuffler', 'splitter', 'duplicator', 'filter', 'merger', 'switch'];
    this.components.forEach(comp => {
      const spec = ComponentRegistry.get(comp.type);
      if (spec && spec.ports && spec.ports.outputs && spec.ports.outputs.length > 0) {
        if (!handledTypes.includes(comp.type)) {
          console.error(`ERROR: Component type "${comp.type}" has output ports but is not handled in updateAutomaticConnections()! Add it to the connection logic.`);
        }
      }
    });
  }

  getAdjacentComponents(comp) {
    const adjacent = [];
    const positions = [
      {x: comp.position.x - 1, y: comp.position.y},
      {x: comp.position.x + 1, y: comp.position.y},
      {x: comp.position.x, y: comp.position.y - 1},
      {x: comp.position.x, y: comp.position.y + 1}
    ];

    positions.forEach(pos => {
      const c = this.getComponentAt(pos.x, pos.y);
      if (c) adjacent.push(c);
    });

    return adjacent;
  }

  getComponentInDirection(comp) {
    let targetPos = null;

    if (comp.type === 'conveyor') {
      const dir = comp.params.direction || 'right';
      switch (dir) {
        case 'right': targetPos = {x: comp.position.x + 1, y: comp.position.y}; break;
        case 'left': targetPos = {x: comp.position.x - 1, y: comp.position.y}; break;
        case 'down': targetPos = {x: comp.position.x, y: comp.position.y + 1}; break;
        case 'up': targetPos = {x: comp.position.x, y: comp.position.y - 1}; break;
      }
    } else if (comp.type === 'conveyor-turn') {
      const turn = comp.params.turn || 'right-to-down';
      const exits = {
        'right-to-down': {x: comp.position.x, y: comp.position.y + 1},
        'right-to-up': {x: comp.position.x, y: comp.position.y - 1},
        'left-to-down': {x: comp.position.x, y: comp.position.y + 1},
        'left-to-up': {x: comp.position.x, y: comp.position.y - 1},
        'down-to-right': {x: comp.position.x + 1, y: comp.position.y},
        'down-to-left': {x: comp.position.x - 1, y: comp.position.y},
        'up-to-right': {x: comp.position.x + 1, y: comp.position.y},
        'up-to-left': {x: comp.position.x - 1, y: comp.position.y}
      };
      targetPos = exits[turn];
    }

    return targetPos ? this.getComponentAt(targetPos.x, targetPos.y) : null;
  }

  addConnection(fromId, toId) {
    // Don't add duplicate connections
    const exists = this.connections.some(c => c.from === fromId && c.to === toId);
    if (exists) {
      return;
    }

    // Don't add bidirectional connections (prevents loops)
    const reverseExists = this.connections.some(c => c.from === toId && c.to === fromId);
    if (reverseExists) {
      console.warn(`Prevented bidirectional connection between ${fromId} and ${toId}`);
      return;
    }

    this.connections.push({from: fromId, to: toId});
  }

  /**
   * Auto-select the next unplaced DSL-defined arm for placement
   */
  autoPlaceNextArm() {
    // Need DGP result with arms defined
    if (!this.dgpResult?.arms) {
      this.setStatus('No arms defined in DGP script', 'error');
      return;
    }

    // Find the first unplaced arm
    for (const varName of Object.keys(this.dgpResult.arms)) {
      if (!this.placedArms.has(varName)) {
        // Select this arm for placement
        this.currentTool = 'place';
        this.selectedComponentType = 'arm';
        this.pendingComponentParams = {
          varName: varName,
          id: this.dgpResult.arms[varName].id
        };
        this.setStatus(`Ready to place arm: ${varName}`, 'info');
        this.render();
        return;
      }
    }

    // All arms placed
    this.selectedComponentType = null;
    this.pendingComponentParams = {};
    this.setStatus('All arms already placed', 'info');
    this.render();
  }

  // === Veil Rendering ===

  drawVeiledTiles() {
    if (this.veiledTiles.size === 0) return;

    const isEditingAlt = this.activeVersionIndex >= 0;

    for (const key of this.veiledTiles) {
      const [x, y] = key.split(',').map(Number);
      const px = x * this.gridSize;
      const py = y * this.gridSize;

      // When editing an alternative, make the veil semi-transparent so designer can see
      const alpha = isEditingAlt ? 0.3 : 0.85;

      // Black overlay
      this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      this.ctx.fillRect(px, py, this.gridSize, this.gridSize);

      // Diagonal stripes
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(px, py, this.gridSize, this.gridSize);
      this.ctx.clip();

      this.ctx.strokeStyle = `rgba(255, 255, 255, ${isEditingAlt ? 0.15 : 0.1})`;
      this.ctx.lineWidth = 1;
      const step = 8;
      for (let i = -this.gridSize; i < this.gridSize * 2; i += step) {
        this.ctx.beginPath();
        this.ctx.moveTo(px + i, py);
        this.ctx.lineTo(px + i + this.gridSize, py + this.gridSize);
        this.ctx.stroke();
      }
      this.ctx.restore();

      // Border
      this.ctx.strokeStyle = isEditingAlt ? 'rgba(76, 175, 80, 0.6)' : 'rgba(255, 255, 255, 0.2)';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(px + 0.5, py + 0.5, this.gridSize - 1, this.gridSize - 1);
    }
  }

  // === DGP Alternatives ===

  setupDgpAlternativesPanel() {
    const saveBtn = document.getElementById('save-version-btn');
    if (saveBtn) saveBtn.onclick = () => this.saveAsNewVersion();
    this.renderVersionList();
  }

  // === Version-based DGP Alternatives ===

  getHiddenComponents() {
    return this.components.filter(c =>
      this.veiledTiles.has(`${c.position.x},${c.position.y}`)
    );
  }

  getHiddenConnections() {
    const hiddenIds = new Set(this.getHiddenComponents().map(c => c.id));
    return this.connections.filter(conn =>
      hiddenIds.has(conn.from) || hiddenIds.has(conn.to)
    );
  }

  getVisibleComponents() {
    return this.components.filter(c =>
      !this.veiledTiles.has(`${c.position.x},${c.position.y}`)
    );
  }

  getVisibleConnections() {
    const hiddenIds = new Set(this.getHiddenComponents().map(c => c.id));
    return this.connections.filter(conn =>
      !hiddenIds.has(conn.from) && !hiddenIds.has(conn.to)
    );
  }

  saveAsNewVersion(label) {
    const hiddenComps = this.getHiddenComponents();
    if (hiddenComps.length === 0) {
      this.setStatus('No components on veiled tiles', 'error');
      return;
    }

    // Recompute distribution for current layout (including this version's hidden components)
    this.computeDistributionMonteCarlo();

    const version = {
      id: `dgp-${Date.now()}`,
      label: label || `Version ${this.dgpVersions.length + 1}`,
      components: JSON.parse(JSON.stringify(hiddenComps)),
      // Connections are NOT stored — they're recomputed automatically from spatial adjacency
      // via updateAutomaticConnections() when a version is loaded.
      correctDistribution: JSON.parse(JSON.stringify(this.computedDistribution))
    };
    this.dgpVersions.push(version);
    this.activeVersionIndex = this.dgpVersions.length - 1;
    this.saveState();
    this.renderVersionList();
    this.setStatus(`Saved: ${version.label}`, 'success');
  }

  switchToVersion(index) {
    if (index < 0 || index >= this.dgpVersions.length) return;

    const visibleComps = this.getVisibleComponents();
    const version = this.dgpVersions[index];
    // Load visible + this version's hidden components; connections are recomputed automatically
    this.components = [...visibleComps, ...JSON.parse(JSON.stringify(version.components))];
    this.activeVersionIndex = index;

    this._updateNextComponentId();
    this.updateAutomaticConnections();

    // Recompute distribution for this version's layout and update the stored version
    this.computeDistributionMonteCarlo();
    this.dgpVersions[index].correctDistribution = JSON.parse(JSON.stringify(this.computedDistribution));

    this.saveState();
    this.render();
    this.renderVersionList();
    this.setStatus(`${version.label}`, 'info');
  }

  forkCurrentVersion() {
    if (this.activeVersionIndex < 0) return;
    const label = `${this.dgpVersions[this.activeVersionIndex].label} (copy)`;
    this.saveAsNewVersion(label);
  }

  deleteVersion(index) {
    if (index < 0 || index >= this.dgpVersions.length) return;
    this.dgpVersions.splice(index, 1);
    if (this.activeVersionIndex >= this.dgpVersions.length) {
      this.activeVersionIndex = this.dgpVersions.length - 1;
    } else if (this.activeVersionIndex > index) {
      this.activeVersionIndex--;
    } else if (this.activeVersionIndex === index) {
      this.activeVersionIndex = -1;
    }
    this.saveState();
    this.renderVersionList();
  }

  updateVersionLabel(index, label) {
    if (index < 0 || index >= this.dgpVersions.length) return;
    this.dgpVersions[index].label = label;
    this.saveState();
  }

  _updateNextComponentId() {
    let maxId = 0;
    this.components.forEach(comp => {
      const idNum = parseInt(comp.id.replace(/\D/g, ''));
      if (!isNaN(idNum) && idNum > maxId) maxId = idNum;
    });
    this.nextComponentId = maxId + 1;
  }

  renderVersionList() {
    const listEl = document.getElementById('version-list');
    if (!listEl) return;

    if (this.dgpVersions.length === 0) {
      listEl.innerHTML = '<p class="help-text">No versions yet. Veil some tiles, then save a version.</p>';
      return;
    }

    let html = '';
    for (let i = 0; i < this.dgpVersions.length; i++) {
      const ver = this.dgpVersions[i];
      const isActive = this.activeVersionIndex === i;
      const compCount = ver.components.length;
      html += `<div class="version-item ${isActive ? 'active' : ''}" onclick="editor.switchToVersion(${i})">
        <div class="version-header">
          <input type="text" class="version-label" value="${ver.label}"
                 onchange="editor.updateVersionLabel(${i}, this.value)" onclick="event.stopPropagation()">
          <div class="version-actions">
            <button class="version-fork" onclick="event.stopPropagation(); editor.switchToVersion(${i}); editor.forkCurrentVersion();" title="Copy">\u2442</button>
            <button class="version-delete" onclick="event.stopPropagation(); editor.deleteVersion(${i})" title="Delete">&times;</button>
          </div>
        </div>
        <span class="version-info">${compCount} komponentti${compCount !== 1 ? 'a' : ''}</span>
      </div>`;
    }
    listEl.innerHTML = html;
  }

  setStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#888';
    setTimeout(() => {
      statusEl.textContent = 'Ready';
      statusEl.style.color = '#888';
    }, 3000);
  }
}

// Initialize editor when page loads
let editor;
window.addEventListener('DOMContentLoaded', () => {
  editor = new LevelEditor();
  window.editor = editor; // For debugging and property panel callbacks

  // Check if level ID is in URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const levelId = urlParams.get('level');
  if (levelId) {
    editor.loadLevelById(levelId);
  }
});

/**
 * Recompute correctDistribution for ALL levels using analytical branching.
 * Call from browser console: recomputeAllDistributions()
 */
function recomputeAllDistributions() {
  const allLevels = LevelRegistry.getAllLevels();
  let updated = 0;
  let errors = 0;

  for (const level of allLevels) {
    const alts = level.dgpAlternatives || [];
    if (alts.length === 0) continue;

    const visibleComps = (level.components || []);
    const visibleConns = (level.connections || []);

    for (const alt of alts) {
      try {
        // Merge visible + hidden components
        const allComps = [...visibleComps, ...(alt.components || [])];

        // Rebuild connections from spatial adjacency (same as editor does)
        // We need a temporary editor-like object to call buildSimulationLevel
        const tmpEditor = {
          components: allComps,
          connections: [...visibleConns, ...(alt.connections || [])],
          dgpResult: level.dgpResult,
          buildSimulationLevel: LevelEditor.prototype.buildSimulationLevel,
          extractOutcomeFromSim: LevelEditor.prototype.extractOutcomeFromSim,
          computeDistributionBranching: LevelEditor.prototype.computeDistributionBranching,
        };

        const { sacks, schedule, prediction } = level.dgpResult;
        let targetComponent = null;
        let observationPoints = null;

        if (prediction.what === 'dist') {
          observationPoints = allComps
            .filter(c => c.type === 'observation')
            .sort((a, b) => a.position.x - b.position.x)
            .map((comp, index) => ({
              id: comp.id, index, label: String.fromCharCode(65 + index)
            }));
        } else {
          const targetLabel = prediction.target;
          targetComponent = allComps.find(c =>
            c.type === 'observation' &&
            (c.params?.label === targetLabel || c.id === targetLabel)
          );
        }

        const simLevel = tmpEditor.buildSimulationLevel(sacks, schedule);
        const targetId = targetComponent ? targetComponent.id : null;
        const dist = tmpEditor.computeDistributionBranching(
          simLevel, prediction, targetId, observationPoints
        );

        const sum = Object.values(dist).reduce((s, v) => s + v, 0);
        if (Math.abs(sum - 1) > 0.01) {
          throw new Error(`Distribution sums to ${sum}, not 1: ${JSON.stringify(dist)}`);
        }

        alt.correctDistribution = dist;
        updated++;
        console.log(`✓ ${level.meta.title} / ${alt.label}: ${JSON.stringify(dist)}`);
      } catch (e) {
        errors++;
        console.error(`✗ ${level.meta.title} / ${alt.label}: ${e.message}`);
      }
    }

    // Also update top-level correctDistribution from first alternative
    if (alts.length > 0 && alts[0].correctDistribution) {
      level.correctDistribution = alts[0].correctDistribution;
    }
  }

  LevelRegistry.saveLevels(allLevels);
  console.log(`Done: ${updated} distributions recomputed, ${errors} errors.`);
}
