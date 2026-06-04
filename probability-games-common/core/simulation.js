/**
 * Simulation Engine
 *
 * Tick-based simulation of ball flow through factory
 */

class Simulation {
  constructor(level, config) {
    this.level = level;
    this.config = config || {};

    // Apply defaults
    this.config.ballProductionInterval = this.config.ballProductionInterval ?? 5000;
    this.config.ballSpeed = this.config.ballSpeed ?? 1.0;
    this.config.ballsToSpawn = this.config.ballsToSpawn ?? 20;
    // Seed priority: explicit config.seed (for Monte Carlo) > SeedManager > error
    if (this.config.seed === undefined) {
      if (typeof SeedManager !== 'undefined') {
        this.config.seed = SeedManager.getSeed();
      } else {
        throw new Error('No seed available: SeedManager not loaded and no seed in config');
      }
    }

    // Time
    this.time = 0;
    this.nextBallProductionTime = this.config.ballProductionInterval;
    this.ballsProduced = 0;

    // Running state
    this.running = true;

    // Components
    this.components = this.initializeComponents(level);
    this.componentsById = new Map();
    this.components.forEach(c => this.componentsById.set(c.id, c));

    // Balls
    this.balls = [];
    this.nextBallId = 0;

    // RNG
    this.rng = new RNG(this.config.seed);

    // Pre-computed ball colors for deterministic replay
    // (separated from main RNG so splitter/shuffler RNG calls don't affect ball colors)
    this._ballColors = null; // Computed after components are initialized

    // Find arms for ball production
    this.arms = this.components.filter(c => c.type === "arm");

    // Sampling schedule (if specified)
    this.samplingSchedule = level.samplingSchedule || null;
    // Sort schedule by time to ensure correct processing order
    if (this.samplingSchedule) {
      this.samplingSchedule.sort((a, b) => a.time - b.time);
    }
    this.scheduleIndex = 0;

    // Initialize multi-arm support
    this.initializeMultiArmSupport();

    // Initialize buttons (overlay components)
    this.initializeButtons();

    // Dynamic schedule for button-triggered arm draws
    this.dynamicSchedule = [];

    // Bayesian inference tracker
    this.bayesianTracker = this.initializeBayesianTracker(level);

    // Pre-compute ball colors for deterministic replay
    this._ballColors = this._precomputeBallColors();

    // Callbacks
    this.onObservation = null;
  }

  /**
   * Pre-compute all ball colors using a separate RNG stream.
   * This ensures ball colors are deterministic regardless of splitter/shuffler
   * RNG interleaving, which depends on frame timing.
   */
  _precomputeBallColors() {
    if (!this.samplingSchedule) return [];
    const rng = new RNG(this.config.seed);
    const sackSpec = ComponentRegistry.get("sack");
    if (!sackSpec) return [];
    const colors = [];
    for (const entry of this.samplingSchedule) {
      const armId = entry.sackId || entry.armId;
      const inputConn = this.level.connections.find(c => c.to === armId);
      if (inputConn) {
        const sack = this.componentsById.get(inputConn.from);
        if (sack && sack.type === 'sack') {
          colors.push(sackSpec.behavior.draw(rng, sack.params));
          continue;
        }
      }
      // Fallback: armId might be a sack directly
      const directSack = this.componentsById.get(armId);
      if (directSack && directSack.type === 'sack') {
        colors.push(sackSpec.behavior.draw(rng, directSack.params));
      } else {
        colors.push(null); // Unknown — will fall back to main RNG
      }
    }
    return colors;
  }

  /**
   * Initialize components from level definition
   */
  initializeComponents(level) {
    return level.components.map(compDef => {
      const component = {
        id: compDef.id,
        type: compDef.type,
        position: {...compDef.position},
        params: {...compDef.params},
        bufferState: null,
        duplicationBatches: null,
        observedBalls: [],
        observations: [],
        onObservation: null,
        simulation: this  // Reference to simulation for Bayesian tracker access
      };

      // Store references to be resolved after all components created
      if (compDef.params.assignedSackId) {
        component.assignedSackRef = compDef.params.assignedSackId;
      }
      if (compDef.params.outputConveyorId) {
        component.outputConveyorRef = compDef.params.outputConveyorId;
      }

      return component;
    });
  }

  /**
   * Resolve component ID references to actual component objects
   */
  resolveReferences() {
    for (const component of this.components) {
      // Resolve assignedSackRef
      if (component.assignedSackRef) {
        component.params.assignedSack = this.componentsById.get(component.assignedSackRef);
        if (!component.params.assignedSack) {
          console.warn(`Component ${component.id}: Could not resolve assignedSackRef "${component.assignedSackRef}"`);
        }
      }

      // Resolve outputConveyorRef
      if (component.outputConveyorRef) {
        component.params.outputConveyor = this.componentsById.get(component.outputConveyorRef);
        if (!component.params.outputConveyor) {
          console.warn(`Component ${component.id}: Could not resolve outputConveyorRef "${component.outputConveyorRef}"`);
        }
      }
    }
  }

  /**
   * Initialize multi-arm support: set up sack→arms connections
   */
  initializeMultiArmSupport() {
    // Find all arm components and register them with their input sacks
    const arms = this.components.filter(c => c.type === 'arm');

    for (const arm of arms) {
      // Find input connection (sack → arm)
      const inputConnection = this.level.connections.find(c => c.to === arm.id);
      if (inputConnection) {
        const sack = this.componentsById.get(inputConnection.from);
        if (sack && sack.type === 'sack') {
          // Initialize sack state for multi-arm support
          if (!sack.connectedArms) {
            sack.connectedArms = [];
            sack.ballQueue = [];
            sack.lastArmIndex = -1;
          }
          sack.connectedArms.push(arm);
        }
      }
    }
  }

  /**
   * Initialize buttons: link to host components and target arms
   */
  initializeButtons() {
    this.buttons = this.components.filter(c => c.type === 'button');

    for (const button of this.buttons) {
      // Find host component (conveyor or conveyor-turn at same position)
      const hostComponent = this.components.find(c =>
        (c.type === 'conveyor' || c.type === 'conveyor-turn') &&
        c.position.x === button.position.x &&
        c.position.y === button.position.y
      );

      if (hostComponent) {
        button.hostComponent = hostComponent;
      } else {
        console.warn(`Button ${button.id} has no host conveyor/conveyor-turn at position (${button.position.x}, ${button.position.y})`);
        const conveyors = this.components.filter(c => c.type === 'conveyor' || c.type === 'conveyor-turn');
        console.warn(`Available conveyors/turns:`, conveyors.map(c => ({id: c.id, type: c.type, pos: c.position})));
      }

      // Find adjacent arm
      const buttonSpec = ComponentRegistry.get('button');
      if (buttonSpec) {
        button.targetArm = buttonSpec.findAdjacentArm(button, this);
        if (button.targetArm) {
        } else {
          console.warn(`Button ${button.id} has no adjacent arm`);
        }
      }
    }
  }

  /**
   * Initialize Bayesian tracker for hypothesis updating
   */
  initializeBayesianTracker(level) {
    // Check if we have a hypothesis space
    if (!level.hypothesisSpace) {
      return null;
    }

    // Find all sacks on the board (these are the positions we're uncertain about)
    const sacks = this.components.filter(c => c.type === 'sack');
    if (sacks.length === 0) {
      return null;
    }

    // Require permutation-based format with pre-generated hypotheses
    if (level.hypothesisSpace.type !== 'permutation' || !level.hypothesisSpace.hypotheses) {
      console.error('Invalid hypothesis space format. Expected type="permutation" with pre-generated hypotheses.');
      return null;
    }

    if (level.hypothesisSpace.hypotheses.length === 0) {
      console.error('Empty hypothesis space - no hypotheses generated by level editor');
      return null;
    }

    // Convert from level editor format to BayesianTracker format
    const colors = new Set();
    const hypotheses = level.hypothesisSpace.hypotheses.map(h => {
      const sackAssignments = new Map();

      // Convert componentAssignments (plain object) to sackAssignments (Map)
      if (h.componentAssignments) {
        Object.entries(h.componentAssignments).forEach(([sackId, distribution]) => {
          sackAssignments.set(sackId, distribution);

          // Extract colors
          Object.keys(distribution).forEach(color => colors.add(color));
        });
      }

      return {
        id: h.id,
        sackAssignments: sackAssignments
      };
    });

    // Create tracker
    if (typeof BayesianTracker === 'undefined') {
      console.error('BayesianTracker class not loaded!');
      return null;
    }

    return new BayesianTracker(hypotheses, Array.from(colors));
  }

  /**
   * Generate all hypotheses (ordered selections of distributions for sack positions)
   */
  generateHypotheses(sacks, distributions) {
    const hypotheses = [];
    let nextId = 0;

    // Generate all ordered selections (permutations with repetition allowed)
    const generate = (sackIndex, currentAssignment) => {
      if (sackIndex === sacks.length) {
        // Complete hypothesis
        const sackAssignments = new Map();
        sacks.forEach((sack, i) => {
          sackAssignments.set(sack.id, currentAssignment[i]);
        });

        hypotheses.push({
          id: `h${nextId++}`,
          sackAssignments: sackAssignments
        });
        return;
      }

      // Try each distribution for this sack position
      for (const dist of distributions) {
        generate(sackIndex + 1, [...currentAssignment, dist]);
      }
    };

    generate(0, []);
    return hypotheses;
  }

  /**
   * Main simulation tick
   */
  /**
   * Earliest simulated time at which the next *random* decision might fire.
   * Returns Infinity if no decision is expected (deterministic flow from here).
   *
   * Decision sources in this codebase:
   *   (a) Sack draws — occur at samplingSchedule/dynamicSchedule times, and
   *       only count as "random" if the sack has >1 color.
   *   (b) Splitters — fire when time >= pending.exitTime for a ball in the
   *       splitter, and only count as random if the splitter has >1 output.
   *
   * Used by branching simulators to skip per-frame state serialization
   * unless a decision is imminent.
   */
  nextDecisionTime() {
    let earliest = Infinity;
    const TIME_UNIT = 2000;

    // (a) Upcoming scheduled sack draws with multi-color sacks
    if (this.samplingSchedule) {
      for (let i = this.scheduleIndex; i < this.samplingSchedule.length; i++) {
        const entry = this.samplingSchedule[i];
        const armId = entry.sackId || entry.armId;
        const sackTime = entry.time * TIME_UNIT;
        if (sackTime >= earliest) break;  // schedule is sorted
        // Find the sack this arm draws from
        const armComp = this.componentsById.get(armId);
        let sack = null;
        if (armComp && armComp.type === 'sack') {
          sack = armComp;
        } else if (armComp && armComp.type === 'arm') {
          const conn = this.level.connections.find(c => c.to === armId);
          if (conn) sack = this.componentsById.get(conn.from);
        }
        if (sack && sack.params && sack.params.contents) {
          const colorsWithMass = Object.values(sack.params.contents).filter(w => w > 0);
          if (colorsWithMass.length > 1) {
            earliest = Math.min(earliest, sackTime);
            break;  // any later entries will be >= this time
          }
        }
      }
    }

    // Dynamic schedule from buttons (treat same as sampling schedule)
    if (this.dynamicSchedule) {
      for (const entry of this.dynamicSchedule) {
        if (entry.time >= earliest) continue;
        const armId = entry.sackId || entry.armId;
        const armComp = this.componentsById.get(armId);
        let sack = null;
        if (armComp && armComp.type === 'sack') {
          sack = armComp;
        } else if (armComp && armComp.type === 'arm') {
          const conn = this.level.connections.find(c => c.to === armId);
          if (conn) sack = this.componentsById.get(conn.from);
        }
        if (sack && sack.params && sack.params.contents) {
          const colorsWithMass = Object.values(sack.params.contents).filter(w => w > 0);
          if (colorsWithMass.length > 1) {
            earliest = Math.min(earliest, entry.time);
          }
        }
      }
    }

    // (b) Splitters (and shufflers/duplicators) with pending balls
    for (const comp of this.components) {
      if (comp.type === 'splitter') {
        // Multi-output check
        const outputs = comp.params?.sides
          ? Object.values(comp.params.sides).filter(s => s.type === 'output').length
          : 0;
        if (outputs < 2) continue;
        if (!comp.pendingBalls) continue;
        for (const pending of comp.pendingBalls) {
          if (pending.exitTime < earliest) earliest = pending.exitTime;
        }
      }
      // Shufflers aren't used in the Mallit branching path (they fire on
      // shuffle() which doesn't go through a Decision-style RNG call).
    }

    return earliest;
  }

  tick(deltaTime) {
    const lastTime = this.time;
    this.time += deltaTime;

    // 1. Ball production - using sampling schedule
    if (!this.samplingSchedule) {
      throw new Error('Sampling schedule is required but not specified in level');
    }

    while (this.scheduleIndex < this.samplingSchedule.length) {
      const scheduleEntry = this.samplingSchedule[this.scheduleIndex];
      const TIME_UNIT = 2000; // Each time unit = 2.5 seconds (one full arm cycle)
      const scheduledTime = scheduleEntry.time * TIME_UNIT;

      if (this.time >= scheduledTime) {
        // Support both old format (armId) and new format (sackId)
        const armId = scheduleEntry.sackId || scheduleEntry.armId;
        this.produceBallFromArm(armId);
        this.scheduleIndex++;
      } else {
        break; // Wait for next scheduled time
      }
    }

    // 1b. Check buttons for ball center crossings
    this.checkButtonTriggers(lastTime, this.time);

    // 1c. Process dynamic schedule (button-triggered arm draws)
    this.processDynamicSchedule();

    // 2. Check shufflers for outputting balls
    this.components.forEach(comp => {
      if (comp.type === 'shuffler') {
        const shufflerSpec = ComponentRegistry.get("shuffler");
        if (shufflerSpec.checkAndOutput) {
          shufflerSpec.checkAndOutput(comp, this.time, shufflerSpec);
        }
      }
    });

    // 2b. Check splitters for outputting balls
    this.components.forEach(comp => {
      if (comp.type === 'splitter') {
        const splitterSpec = ComponentRegistry.get("splitter");
        if (splitterSpec.checkAndOutput) {
          splitterSpec.checkAndOutput(comp, this.time, splitterSpec);
        }
      }
    });

    // 2c. Check duplicators for outputting balls
    this.components.forEach(comp => {
      if (comp.type === 'duplicator') {
        const duplicatorSpec = ComponentRegistry.get("duplicator");
        if (duplicatorSpec.transitions.checkAndOutput) {
          duplicatorSpec.transitions.checkAndOutput(comp, this.time, duplicatorSpec);
        }
      }
    });

    // 2d. Check filters for outputting balls
    this.components.forEach(comp => {
      if (comp.type === 'filter') {
        const filterSpec = ComponentRegistry.get("filter");
        if (filterSpec.transitions.checkAndOutput) {
          filterSpec.transitions.checkAndOutput(comp, this.time, filterSpec);
        }
      }
    });

    // 3. Check components for transfers
    this.components.forEach(comp => {
      // Support queued transfers (multiple balls exiting same component in one tick)
      if (comp.ballsToTransfer && comp.ballsToTransfer.length > 0) {
        for (const ball of comp.ballsToTransfer) {
          this.transferBall(ball, comp);
        }
        comp.ballsToTransfer = [];
      }
      if (comp.needsTransfer && comp.ballToTransfer) {
        this.transferBall(comp.ballToTransfer, comp);
        comp.needsTransfer = false;
        comp.ballToTransfer = null;
      }
    });

    // 4. Check trajectory completions
    const completedBalls = this.balls.filter(ball =>
      ball.isTrajectoryComplete(this.time)
    );

    // CRITICAL: Sort by trajectory end time to process in correct order
    // This ensures shuffled balls are observed in shuffled order, not creation order
    completedBalls.sort((a, b) => {
      const aEndTime = a.trajectoryStartTime + a.trajectoryDuration;
      const bEndTime = b.trajectoryStartTime + b.trajectoryDuration;
      if (aEndTime !== bEndTime) {
        return aEndTime - bEndTime;
      }
      // If end times are equal, use outputIndex as tiebreaker (set by shuffler)
      if (a.outputIndex !== undefined && b.outputIndex !== undefined) {
        return a.outputIndex - b.outputIndex;
      }
      // Final fallback: ball ID for determinism
      return a.id.localeCompare(b.id);
    });

    completedBalls.forEach(ball => {
      this.handleTrajectoryComplete(ball);
    });

    // 5. Check if simulation is complete
    if (this.running) {
      const allBallsSpawned = this.ballsProduced >= this.config.ballsToSpawn;

      // Check if all balls have been collected (reached observation point, consumed by Black Pit, or faded away)
      // Note: Need to check balls exist and all are observed or consumed
      const allBallsCollected = this.balls.length > 0 && this.balls.every(ball =>
        ball.componentState === 'observed' || ball.componentState === 'consumed'
      );

      if (allBallsSpawned && allBallsCollected) {
        this.running = false;
      }
    }
  }

  /**
   * Check if any balls have crossed button centers
   */
  checkButtonTriggers(lastTime, currentTime) {
    if (!this.buttons || this.buttons.length === 0) return;

    const buttonSpec = ComponentRegistry.get('button');
    if (!buttonSpec) {
      console.warn('[Button] ButtonSpec not found in registry');
      return;
    }

    for (const button of this.buttons) {
      if (!button.hostComponent || !button.targetArm) {
        console.warn(`[Button] Button ${button.id} missing hostComponent or targetArm`, {
          hostComponent: button.hostComponent,
          targetArm: button.targetArm
        });
        continue;
      }

      for (const ball of this.balls) {
        // Skip balls not on the host conveyor
        if (ball.componentId !== button.hostComponent.id) continue;

        // Check if ball crossed center
        // Note: The progress check (lastProgress < 0.5 && currentProgress >= 0.5) naturally
        // only fires once per trajectory. When a ball loops back, it gets a fresh trajectory
        // with new start time, so it will trigger again - which is the desired behavior.
        const crossed = buttonSpec.checkBallCrossedCenter(ball, button, lastTime, currentTime);
        if (crossed) {
          // Trigger the arm
          buttonSpec.triggerArm(button, this, currentTime);
        }
      }
    }
  }

  /**
   * Process dynamic schedule (button-triggered arm draws)
   */
  processDynamicSchedule() {
    if (!this.dynamicSchedule || this.dynamicSchedule.length === 0) return;

    // Process all entries whose time has passed
    while (this.dynamicSchedule.length > 0 && this.dynamicSchedule[0].time <= this.time) {
      const entry = this.dynamicSchedule.shift();
      this.produceBallFromArm(entry.armId);
    }
  }

  /**
   * Produce ball from a specific arm (new schedule system)
   */
  produceBallFromArm(armId) {

    // Find arm by ID
    const arm = this.componentsById.get(armId);

    if (!arm || arm.type !== 'arm') {
      throw new Error(`Invalid arm ID in sampling schedule: ${armId}. Available arms: ${this.components.filter(c => c.type === 'arm').map(c => c.id).join(', ')}`);
    }

    // Find sack connected to this arm
    const inputConnection = this.level.connections.find(c => c.to === armId);
    if (!inputConnection) {
      throw new Error(`Arm ${armId} has no input connection to a sack`);
    }

    const sack = this.componentsById.get(inputConnection.from);
    if (!sack || sack.type !== 'sack') {
      throw new Error(`Arm ${armId} input is not connected to a sack (got ${sack ? sack.type : 'undefined'})`);
    }

    const sackSpec = ComponentRegistry.get("sack");

    // Use pre-computed color for deterministic replay, fall back to main RNG
    const color = (this._ballColors && this._ballColors[this.ballsProduced] != null)
      ? this._ballColors[this.ballsProduced]
      : sackSpec.behavior.draw(this.rng, sack.params);

    // Create ball
    const ball = new Ball(`ball_${this.nextBallId++}`, color);
    ball.sourceId = sack.id;
    this.balls.push(ball);
    this.ballsProduced++;

    // Notify Bayesian tracker of ball spawn
    if (this.bayesianTracker) {
      // Convert sack.id to string to match componentAssignments keys
      this.bayesianTracker.onBallSpawned(ball.id, String(sack.id));
    }

    // Always assign ball to arm - the arm animation will reset
    // Any in-progress ball will complete its trajectory independently
    this.assignBallToArm(ball, arm, this.time);
  }

  /**
   * Produce ball from sack (old system for backward compatibility)
   * @deprecated Use produceBallFromArm instead
   */
  produceBallFromSack(sackId) {
    // Find sack by ID
    const sack = this.componentsById.get(sackId);
    if (!sack || sack.type !== 'sack') {
      throw new Error(`Invalid sack ID in sampling schedule: ${sackId}`);
    }

    const sackSpec = ComponentRegistry.get("sack");

    // Use pre-computed color for deterministic replay, fall back to main RNG
    const color = (this._ballColors && this._ballColors[this.ballsProduced] != null)
      ? this._ballColors[this.ballsProduced]
      : sackSpec.behavior.draw(this.rng, sack.params);

    // Create ball
    const ball = new Ball(`ball_${this.nextBallId++}`, color);
    ball.sourceId = sack.id;
    this.balls.push(ball);
    this.ballsProduced++;

    // Notify Bayesian tracker of ball spawn
    if (this.bayesianTracker) {
      // Convert sack.id to string to match componentAssignments keys
      this.bayesianTracker.onBallSpawned(ball.id, String(sack.id));
    }

    // Multi-arm support: prefer ready arm, but use any arm if all busy
    let arm = this.findReadyArm(sack);

    if (!arm && sack.connectedArms && sack.connectedArms.length > 0) {
      // All arms busy - just use the first one, animation will reset
      arm = sack.connectedArms[0];
    }

    if (arm) {
      this.assignBallToArm(ball, arm, this.time);
    }
  }

  /**
   * Find a ready arm for the given sack (multi-arm support)
   */
  findReadyArm(sack) {
    if (!sack.connectedArms || sack.connectedArms.length === 0) {
      return null;
    }

    // Filter to available arms (not currently busy)
    const available = sack.connectedArms.filter(arm => !this.isArmBusy(arm));

    if (available.length === 0) {
      return null;
    }

    // Round-robin selection for fairness
    if (sack.lastArmIndex === undefined) {
      sack.lastArmIndex = -1;
    }
    sack.lastArmIndex = (sack.lastArmIndex + 1) % available.length;
    return available[sack.lastArmIndex];
  }

  /**
   * Check if an arm is currently busy (holding or transferring a ball)
   */
  isArmBusy(arm) {
    // Check if arm has a ball waiting to transfer
    if (arm.ballToTransfer) {
      return true;
    }

    // Check if any ball is currently in this arm's "traveling" state
    for (const ball of this.balls) {
      if (ball.componentId === arm.id && ball.componentState === 'traveling') {
        return true;
      }
    }

    return false;
  }

  /**
   * Assign a ball to an arm (trigger pickup sequence)
   */
  assignBallToArm(ball, arm, time) {
    const armSpec = ComponentRegistry.get("arm");
    armSpec.transitions.onPickup(ball, arm, time, armSpec);
  }

  /**
   * Produce new ball via arm (DEPRECATED - use sampling schedule instead)
   */
  produceBall() {
    throw new Error('produceBall() called but sampling schedule should be used instead');
  }

  /**
   * Create a new ball mid-simulation (used by duplicator)
   * Does NOT call onBallSpawned - caller should use onBallDuplicated instead
   *
   * @param {string} color - Ball color
   * @param {string} sourceId - Original source sack ID
   * @returns {Ball} - The created ball
   */
  createBall(color, sourceId) {
    const ball = new Ball(`ball_${this.nextBallId++}`, color);
    ball.sourceId = sourceId;
    this.balls.push(ball);
    return ball;
  }

  /**
   * Handle trajectory completion
   */
  handleTrajectoryComplete(ball) {
    const component = this.componentsById.get(ball.componentId);
    if (!component) {
      throw new Error(`Component ${ball.componentId} not found for ball ${ball.id}. This indicates ball ID corruption, component deletion during simulation, or reference counting bugs.`);
    }

    const spec = ComponentRegistry.get(component.type);

    if (spec.transitions.onTrajectoryComplete) {
      // Let component handle its own trajectory completion
      spec.transitions.onTrajectoryComplete(ball, component, this.time, spec);
    } else {
      // Default: transfer to next component
      this.transferBall(ball, component);
    }
  }

  /**
   * Transfer ball to next component
   */
  transferBall(ball, fromComponent) {
    // For components with multiple outputs, find the correct connection
    let connection;

    // Shufflers, splitters, and duplicators use ball.outputSide (cardinal directions)
    if ((fromComponent.type === 'shuffler' || fromComponent.type === 'splitter' || fromComponent.type === 'duplicator') && ball.outputSide) {
      const allConnections = this.level.connections.filter(c => c.from === fromComponent.id);
      const outputSide = ball.outputSide;


      // Find connection based on cardinal direction
      connection = allConnections.find(conn => {
        const target = this.componentsById.get(conn.to);
        if (!target) return false;

        let matches = false;
        switch (outputSide) {
          case 'up':
            matches = target.position.y < fromComponent.position.y;
            break;
          case 'down':
            matches = target.position.y > fromComponent.position.y;
            break;
          case 'left':
            matches = target.position.x < fromComponent.position.x;
            break;
          case 'right':
            matches = target.position.x > fromComponent.position.x;
            break;
        }

        return matches;
      });


      // Clear the ball's output side
      delete ball.outputSide;
    }
    // Filters use fromComponent.outputSide (relative: left/right)
    else if (fromComponent.type === 'filter' && fromComponent.outputSide) {
      // Find the connection for the specific output side
      const allConnections = this.level.connections.filter(c => c.from === fromComponent.id);

      // Determine which connection based on outputSide and direction
      const direction = fromComponent.params.direction || 'down';
      const outputSide = fromComponent.outputSide;


      connection = allConnections.find(conn => {
        const target = this.componentsById.get(conn.to);
        if (!target) return false;


        // Direction-aware output matching
        let matches = false;
        switch (direction) {
          case 'right':
            // Left output = up, Right output = down
            matches = outputSide === 'left'
              ? target.position.y < fromComponent.position.y
              : target.position.y > fromComponent.position.y;
            break;
          case 'down':
            // Left output = left, Right output = right
            matches = outputSide === 'left'
              ? target.position.x < fromComponent.position.x
              : target.position.x > fromComponent.position.x;
            break;
          case 'left':
            // Left output = down, Right output = up
            matches = outputSide === 'left'
              ? target.position.y > fromComponent.position.y
              : target.position.y < fromComponent.position.y;
            break;
          case 'up':
            // Left output = right, Right output = left
            matches = outputSide === 'left'
              ? target.position.x > fromComponent.position.x
              : target.position.x < fromComponent.position.x;
            break;
        }

        return matches;
      });


      // Clear the output side flag
      fromComponent.outputSide = null;
    } else {
      // Normal single output
      const allFromConnections = this.level.connections.filter(c => c.from === fromComponent.id);

      if (allFromConnections.length > 1) {
        console.error(`ERROR: Component ${fromComponent.id} (${fromComponent.type}) has ${allFromConnections.length} outgoing connections!`, allFromConnections);
        console.error('Component position:', fromComponent.position);
        console.error('All connections:', this.level.connections);
      }

      connection = allFromConnections[0];
    }

    if (!connection) {
      throw new Error(`No connection from ${fromComponent.id} for ball ${ball.id}. This indicates missing connections in level definition or connection corruption.`);
    }

    const nextComponent = this.componentsById.get(connection.to);
    if (!nextComponent) {
      throw new Error(`Next component ${connection.to} not found for connection from ${fromComponent.id}. This indicates invalid level configuration with broken references.`);
    }

    // Detect potential cycles
    if (ball.lastTenComponents) {
      ball.lastTenComponents.push(nextComponent.id);
      if (ball.lastTenComponents.length > 10) {
        ball.lastTenComponents.shift();
      }

      // Check if we're in a tight loop
      const uniqueComponents = new Set(ball.lastTenComponents);
      if (uniqueComponents.size <= 3 && ball.lastTenComponents.length === 10) {
        console.error(`WARNING: Ball ${ball.id} appears to be in a loop! Last 10 components:`, ball.lastTenComponents);
        console.error('Current connection:', connection);
        console.error('From component:', fromComponent.id, fromComponent.position);
        console.error('To component:', nextComponent.id, nextComponent.position);
      }
    } else {
      ball.lastTenComponents = [nextComponent.id];
    }

    const nextSpec = ComponentRegistry.get(nextComponent.type);

    // Compute input direction
    ball.inputDirection = computeInputDirection(fromComponent, nextComponent);

    // Transfer ownership
    if (nextSpec.transitions.onArrival) {
      nextSpec.transitions.onArrival(ball, nextComponent, this.time, nextSpec);
    }

  }

  /**
   * Get component by ID
   */
  getComponent(id) {
    return this.componentsById.get(id);
  }

  /**
   * Get all balls
   */
  getBalls() {
    return this.balls;
  }

  /**
   * Get current time
   */
  getTime() {
    return this.time;
  }

  /**
   * Get number of balls spawned so far
   */
  get spawnedBalls() {
    return this.ballsProduced;
  }

  /**
   * Reset simulation
   */
  reset() {
    this.time = 0;
    this.nextBallProductionTime = this.config.ballProductionInterval;
    this.ballsProduced = 0;
    this.scheduleIndex = 0;  // Reset schedule position
    this.running = true;
    this.balls = [];
    this.nextBallId = 0;
    this.rng = new RNG(this.config.seed);
    this._ballColors = this._precomputeBallColors();

    // Reset component states
    this.components.forEach(comp => {
      comp.bufferState = null;
      comp.duplicationBatches = null;
      comp.observedBalls = [];
      comp.observations = [];
      comp.ballCount = undefined;  // Reset switch component's ball counter
      comp.committedBallCount = undefined;  // Reset switch visual counter
      comp.pendingMidpoints = null;  // Reset switch pending midpoints
      comp.pendingBalls = null;    // Reset splitter's pending balls
    });

    // Reset Bayesian tracker to uniform prior
    if (this.bayesianTracker) {
      this.bayesianTracker.reset();
    }
  }
}

/**
 * Helper method for components to transfer balls
 */
if (typeof window !== 'undefined') {
  window.transferBallHelper = function(component, ball, simulation) {
    simulation.transferBall(ball, component);
  };
}
