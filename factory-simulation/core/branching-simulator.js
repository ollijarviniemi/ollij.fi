/**
 * Branching Simulator
 *
 * Runs the factory simulation and builds a DAG of all possible world states.
 * At each random decision point (sack draw, splitter choice), creates branches
 * for each possible outcome weighted by probability.
 */

/**
 * Get ball position at a given time, evaluating trajectory if present
 * @param {Object} ball - Ball object with trajectory or position
 * @param {number} time - Simulation time
 * @param {string} context - Context string for error messages
 * @returns {{x: number, y: number}} Position
 */
function getBallPositionAtTime(ball, time, context) {
  if (ball.trajectory) {
    const effectiveTime = Math.max(ball.trajectoryStartTime,
      Math.min(time, ball.trajectoryStartTime + ball.trajectoryDuration));
    const elapsed = effectiveTime - ball.trajectoryStartTime;
    const progress = ball.trajectoryDuration > 0
      ? Math.min(1, elapsed / ball.trajectoryDuration)
      : 0;
    const pos = ball.trajectory(progress);
    return { x: pos.x, y: pos.y };
  } else if (ball.position) {
    return { x: ball.position.x, y: ball.position.y };
  }
  return { x: 0, y: 0 };
}

/**
 * Capture a snapshot of the simulation state
 */
function captureSnapshot(simulation, time) {
  const balls = [];

  for (const ball of simulation.balls) {
    const pos = getBallPositionAtTime(ball, time, 'captureSnapshot');

    balls.push({
      id: ball.id,
      color: ball.color,
      x: pos.x,
      y: pos.y,
      componentId: ball.componentId,
      componentState: ball.componentState,
      sourceId: ball.sourceId
    });
  }

  // Capture sack contents for hashing
  const sackContents = {};
  for (const comp of simulation.components) {
    if (comp.type === 'sack' && comp.params.contents) {
      sackContents[comp.id] = { ...comp.params.contents };
    }
  }

  return {
    time: Math.round(time),
    balls,
    sackContents,
    componentStates: {},
    running: simulation.running,
    ballsProduced: simulation.ballsProduced
  };
}

/**
 * Serialize simulation state for cloning
 */
function serializeSimState(simulation) {
  const time = simulation.time;

  return {
    time: time,
    ballsProduced: simulation.ballsProduced,
    nextBallId: simulation.nextBallId,
    scheduleIndex: simulation.scheduleIndex,
    running: simulation.running,
    rngState: simulation.rng.state,
    // Button state
    dynamicSchedule: simulation.dynamicSchedule ? [...simulation.dynamicSchedule] : [],
    balls: simulation.balls.map(ball => {
      const currentPos = getBallPositionAtTime(ball, time, 'serializeSimState');

      return {
        id: ball.id,
        color: ball.color,
        position: currentPos,
        componentId: ball.componentId,
        componentState: ball.componentState,
        sourceId: ball.sourceId,
        trajectoryStartTime: ball.trajectoryStartTime,
        trajectoryDuration: ball.trajectoryDuration,
        inputDirection: ball.inputDirection,
        outputSide: ball.outputSide,
        colorVisible: ball.colorVisible,
        // Splitter bouncing state
        bounceState: ball.bounceState ? { ...ball.bounceState } : null,
        bounceEnterTime: ball.bounceEnterTime,
        // Observation arrival index
        arrivalIndex: ball.arrivalIndex,
        // Filter output side (which exit the ball is taking)
        filterOutputSide: ball.filterOutputSide,
        // Switch output side (which exit the ball is taking)
        switchOutputSide: ball.switchOutputSide
      };
    }),
    componentStates: serializeComponentStates(simulation.components)
  };
}

function serializeComponentStates(components) {
  const states = {};
  for (const comp of components) {
    states[comp.id] = {
      // Splitter uses pendingBalls array [{ball, exitTime}, ...]
      pendingBalls: comp.pendingBalls ? comp.pendingBalls.map(p => ({
        ballId: p.ball?.id || null,
        exitTime: p.exitTime
      })) : null,
      shufflerState: comp.shufflerState ? {
        waitingBalls: comp.shufflerState.waitingBalls ? [...comp.shufflerState.waitingBalls.map(b => b.id)] : [],
        releaseTime: comp.shufflerState.releaseTime,
        shuffled: comp.shufflerState.shuffled
      } : null,
      ballQueue: comp.ballQueue ? [...comp.ballQueue.map(b => b.id)] : null,
      needsTransfer: comp.needsTransfer,
      outputSide: comp.outputSide,
      // Arm animation state
      armAnimationStart: comp.armAnimationStart,
      armAnimationDuration: comp.armAnimationDuration,
      // Observation component state
      observedBalls: comp.observedBalls ? comp.observedBalls.map(b => b.id) : null,
      observations: comp.observations ? [...comp.observations] : null,
      // Duplicator batches - each batch has balls by output side
      duplicationBatches: comp.duplicationBatches ? comp.duplicationBatches.map(batch => ({
        ballsByOutput: Object.fromEntries(
          Object.entries(batch.ballsByOutput).map(([side, balls]) => [side, balls.map(b => b.id)])
        ),
        outputIndexBySide: { ...batch.outputIndexBySide },
        nextOutputTimeBySide: { ...batch.nextOutputTimeBySide }
      })) : null,
      // Switch component state
      ballCount: comp.ballCount,
      committedBallCount: comp.committedBallCount,
      pendingMidpoints: comp.pendingMidpoints ? [...comp.pendingMidpoints] : null
    };
  }
  return states;
}

/**
 * Recreate a ball's trajectory function based on its current state
 * Components define trajectory functions in their state specs, but we can't serialize functions
 * So we recreate them using the component's getTrajectory method
 */
function recreateTrajectory(ball, components, savedStartTime, savedDuration) {
  // States that don't use trajectory functions (they use getPosition instead)
  const NO_TRAJECTORY_STATES = ['bouncing'];

  if (NO_TRAJECTORY_STATES.includes(ball.componentState)) {
    ball.trajectory = null;
    ball.trajectoryStartTime = savedStartTime;
    ball.trajectoryDuration = savedDuration;
    return;
  }

  // Find the component this ball is in
  const component = components.find(c => c.id === ball.componentId);
  if (!component) {
    throw new Error(`[recreateTrajectory] Ball ${ball.id} references non-existent component '${ball.componentId}'`);
  }

  // Get component spec
  const spec = ComponentRegistry.get(component.type);
  if (!spec) {
    throw new Error(`[recreateTrajectory] Component '${component.id}' has unknown type '${component.type}'`);
  }
  if (!spec.states) {
    throw new Error(`[recreateTrajectory] Component type '${component.type}' has no states defined`);
  }

  // Get the state
  const state = spec.states[ball.componentState];
  if (!state) {
    throw new Error(`[recreateTrajectory] Ball ${ball.id} is in unknown state '${ball.componentState}' for component type '${component.type}'`);
  }

  // Some states legitimately don't have getTrajectory (they use getPosition instead)
  if (!state.getTrajectory) {
    ball.trajectory = null;
    ball.trajectoryStartTime = savedStartTime;
    ball.trajectoryDuration = savedDuration;
    return;
  }

  // Recreate trajectory using the component's state machine
  const trajectoryInfo = state.getTrajectory(ball, component, savedStartTime);
  ball.trajectory = trajectoryInfo.path;
  ball.trajectoryStartTime = savedStartTime;
  ball.trajectoryDuration = trajectoryInfo.duration;
  ball.trajectoryWaypoints = trajectoryInfo.waypoints;
}

/**
 * Restore simulation state from serialized form
 */
function restoreSimState(simulation, saved) {
  simulation.time = saved.time;
  simulation.ballsProduced = saved.ballsProduced;
  simulation.nextBallId = saved.nextBallId;
  simulation.scheduleIndex = saved.scheduleIndex;
  simulation.running = saved.running;
  simulation.rng.state = saved.rngState;

  // Restore button state
  simulation.dynamicSchedule = saved.dynamicSchedule ? [...saved.dynamicSchedule] : [];

  // Restore balls
  simulation.balls = saved.balls.map(bs => {
    const ball = new Ball(bs.id, bs.color);
    ball.position = bs.position;
    ball.componentId = bs.componentId;
    ball.componentState = bs.componentState;
    ball.sourceId = bs.sourceId;
    ball.inputDirection = bs.inputDirection;
    ball.outputSide = bs.outputSide;
    ball.colorVisible = bs.colorVisible;
    // Splitter bouncing state
    ball.bounceState = bs.bounceState ? { ...bs.bounceState } : null;
    ball.bounceEnterTime = bs.bounceEnterTime;
    // Observation arrival index
    ball.arrivalIndex = bs.arrivalIndex;
    // Filter output side
    ball.filterOutputSide = bs.filterOutputSide;
    // Switch output side
    ball.switchOutputSide = bs.switchOutputSide;

    // Recreate trajectory based on component state
    // (we can't serialize trajectory functions, so we regenerate them)
    recreateTrajectory(ball, simulation.components, bs.trajectoryStartTime, bs.trajectoryDuration);

    return ball;
  });

  // Create ball lookup
  const ballById = new Map();
  simulation.balls.forEach(b => ballById.set(b.id, b));

  // Restore component states
  for (const comp of simulation.components) {
    const state = saved.componentStates[comp.id];
    if (state) {
      // Restore splitter pendingBalls array
      if (state.pendingBalls) {
        comp.pendingBalls = state.pendingBalls.map(p => ({
          ball: ballById.get(p.ballId),
          exitTime: p.exitTime
        })).filter(p => p.ball);  // Filter out any balls that weren't found
      } else {
        comp.pendingBalls = null;
      }

      if (state.shufflerState) {
        comp.shufflerState = {
          ...state.shufflerState,
          // Restore ball references from IDs
          waitingBalls: (state.shufflerState.waitingBalls || [])
            .map(id => ballById.get(id))
            .filter(b => b)
        };
      }

      comp.needsTransfer = state.needsTransfer;
      comp.outputSide = state.outputSide;
      comp.ballsToTransfer = [];  // Clear queued transfers from previous branch

      if (state.ballQueue) {
        comp.ballQueue = state.ballQueue.map(id => ballById.get(id)).filter(b => b);
      }

      // Restore arm animation state
      comp.armAnimationStart = state.armAnimationStart;
      comp.armAnimationDuration = state.armAnimationDuration;

      // Restore observation component state
      if (state.observedBalls) {
        comp.observedBalls = state.observedBalls.map(id => ballById.get(id)).filter(b => b);
      }
      if (state.observations) {
        comp.observations = [...state.observations];
      }

      // Restore duplicator batches
      if (state.duplicationBatches) {
        comp.duplicationBatches = state.duplicationBatches.map(batch => ({
          ballsByOutput: Object.fromEntries(
            Object.entries(batch.ballsByOutput).map(([side, ballIds]) => [
              side,
              ballIds.map(id => ballById.get(id)).filter(b => b)
            ])
          ),
          outputIndexBySide: { ...batch.outputIndexBySide },
          nextOutputTimeBySide: { ...batch.nextOutputTimeBySide }
        }));
      } else {
        comp.duplicationBatches = null;
      }

      // Restore switch component state
      comp.ballCount = state.ballCount;
      comp.committedBallCount = state.committedBallCount;
      comp.pendingMidpoints = state.pendingMidpoints ? [...state.pendingMidpoints] : null;
    }
  }
}

/**
 * Decision-tracking RNG wrapper
 * Records decisions so we can enumerate alternatives
 */
class BranchingRNG {
  constructor(realRng) {
    this.realRng = realRng;
    // QUEUE of decisions seen during the current tick. Multiple balls can each
    // call choice()/weightedChoice() within one sim.tick() (e.g. when a
    // duplicator floods a splitter with simultaneous balls). If we only kept
    // the last decision, earlier balls would silently be pinned to array[0]
    // and their branches would be lost.
    this.pendingDecisions = [];
    // QUEUE of forced outcomes — one per decision, consumed in order. When
    // the outer loop replays a tick with forced outcomes, each call to
    // choice/weightedChoice consumes the next forced value.
    this.forcedOutcomes = [];
  }

  get state() { return this.realRng.state; }
  set state(v) { this.realRng.state = v; }

  next() { return this.realRng.next(); }
  nextInt(min, max) { return this.realRng.nextInt(min, max); }
  shuffle(array) { return this.realRng.shuffle(array); }

  /** Consume one forced outcome. Asserts it is valid — silent mismatches
   *  are exactly the class of bug we are guarding against. */
  _tryForcedOutcome(validSet) {
    if (this.forcedOutcomes.length === 0) return null;
    const next = this.forcedOutcomes.shift();
    if (!validSet.includes(next)) {
      throw new Error(
        `BranchingRNG: forced outcome ${JSON.stringify(next)} not valid for ` +
        `choice over ${JSON.stringify(validSet)}. This means the replayed ` +
        `tick's choice sequence diverged from the original — simulation is ` +
        `non-deterministic under replay, or forcedOutcomes queue is stale.`);
    }
    return next;
  }

  /**
   * Weighted choice with decision tracking
   */
  weightedChoice(items, weights) {
    if (items.length <= 1) return items[0];
    const forced = this._tryForcedOutcome(items);
    if (forced !== null) return forced;

    const total = weights.reduce((a, b) => a + b, 0);
    const outcomes = items.map((item, i) => ({
      value: item, probability: weights[i] / total
    }));
    this.pendingDecisions.push({ type: 'weightedChoice', outcomes });
    return items[0];
  }

  /**
   * Uniform choice with decision tracking
   */
  choice(array) {
    if (array.length <= 1) return array[0];
    const forced = this._tryForcedOutcome(array);
    if (forced !== null) return forced;

    const prob = 1.0 / array.length;
    const outcomes = array.map(item => ({ value: item, probability: prob }));
    this.pendingDecisions.push({ type: 'choice', outcomes });
    return array[0];
  }

  hasPendingDecision() {
    return this.pendingDecisions.length > 0;
  }

  /** Consume all pending decisions as a single array. */
  consumeAllPendingDecisions() {
    const d = this.pendingDecisions;
    this.pendingDecisions = [];
    return d;
  }

  /**
   * Wrap a Simulation's RNG so that ball-color decisions and other random
   * choices flow through the BranchingRNG. Also clears the simulation's
   * pre-computed ball colors — otherwise sack draws use the cached colors
   * (computed with a separate non-branching RNG) and never reach
   * weightedChoice, so no decisions get recorded and branching collapses.
   */
  static installOn(simulation) {
    const wrapper = new BranchingRNG(simulation.rng);
    simulation.rng = wrapper;
    simulation._ballColors = null;
    return wrapper;
  }
}

/**
 * Check if simulation has any active balls (not observed/consumed)
 */
function hasActiveBalls(simulation) {
  return simulation.balls.some(ball =>
    ball.componentState !== 'observed' && ball.componentState !== 'consumed'
  );
}

/**
 * BranchingSimulator - builds the world DAG
 */
class BranchingSimulator {
  constructor(level, config = {}) {
    this.level = level;
    this.config = {
      baseFrameInterval: config.frameInterval || 200,
      maxNodes: config.maxNodes || 2000,
      maxTimeSteps: config.maxTimeSteps || 100,
      maxBranchDepth: config.maxBranchDepth || 100,
      ...config
    };

    this.dag = new WorldDAG();
    this.nodesCreated = 0;
  }

  /**
   * Build the complete DAG
   */
  build(simulation) {
    console.log('[BranchingSimulator] Building DAG...');

    // Wrap RNG for decision tracking (also clears _ballColors so sack draws
    // route through the BranchingRNG instead of pre-computed colors).
    const branchingRng = BranchingRNG.installOn(simulation);

    // Create root node
    const initialSnapshot = captureSnapshot(simulation, 0);
    const rootNode = this.dag.createRoot(initialSnapshot);
    this.nodesCreated++;

    // Build tree recursively using a work queue
    const workQueue = [{
      node: rootNode,
      simState: serializeSimState(simulation),
      depth: 0
    }];

    while (workQueue.length > 0 && this.nodesCreated < this.config.maxNodes) {
      const work = workQueue.shift();
      const children = this.computeChildrenForNode(work.node, work.simState, simulation, branchingRng, work.depth);

      for (const child of children) {
        workQueue.push(child);
      }
    }

    console.log('[BranchingSimulator] Built DAG with', this.nodesCreated, 'nodes');
    return this.dag;
  }

  /**
   * Compute children for a single node
   */
  computeChildrenForNode(parentNode, simState, simulation, branchingRng, depth) {
    if (depth >= this.config.maxBranchDepth) {
      return [];
    }

    // Restore simulation state
    restoreSimState(simulation, simState);

    // Check if simulation is truly complete (no active balls and not producing more)
    if (!simulation.running && !hasActiveBalls(simulation)) {
      return [];
    }

    // Advance simulation by probability-weighted frame interval
    // Lower-probability branches advance less time per frame for temporal sync
    const frameInterval = this.config.baseFrameInterval * parentNode.probability;
    const targetTime = simulation.time + frameInterval;
    let decisionMade = false;

    while (simulation.time < targetTime && simulation.running && !decisionMade) {
      simulation.tick(20);

      // Check if a decision was made
      if (branchingRng.hasPendingDecision()) {
        decisionMade = true;
      }
    }

    const childWork = [];

    if (decisionMade) {
      // Branch for each possible outcome
      const decision = branchingRng.consumePendingDecision();

      for (const outcome of decision.outcomes) {
        if (this.nodesCreated >= this.config.maxNodes) break;

        // Restore state to just before decision
        restoreSimState(simulation, simState);

        // Force this specific outcome
        branchingRng.forcedOutcome = outcome.value;

        // Re-run simulation with forced outcome (same frameInterval as parent)
        const retargetTime = simulation.time + frameInterval;
        while (simulation.time < retargetTime && simulation.running) {
          simulation.tick(20);
          // If another random decision occurs within this tick, consume it without branching.
          // This prevents exponential blowup when multiple decisions happen per frame.
          branchingRng.consumePendingDecision();
        }

        // Capture snapshot
        const snapshot = captureSnapshot(simulation, simulation.time);
        const description = String(outcome.value);

        // Create child node
        const childNode = this.dag.createOrMergeChild(
          parentNode,
          snapshot,
          outcome.probability,
          description
        );

        if (childNode.timeStep === parentNode.timeStep + 1) {
          // New node (not merged)
          this.nodesCreated++;
          childWork.push({
            node: childNode,
            simState: serializeSimState(simulation),
            depth: depth + 1
          });
        }
      }
    } else {
      // No decision - single child (only if simulation still active)
      if (simulation.running || hasActiveBalls(simulation)) {
        const snapshot = captureSnapshot(simulation, simulation.time);
        const childNode = this.dag.createOrMergeChild(
          parentNode,
          snapshot,
          1.0,
          'advance'
        );

        if (childNode.timeStep === parentNode.timeStep + 1) {
          this.nodesCreated++;
          childWork.push({
            node: childNode,
            simState: serializeSimState(simulation),
            depth: depth + 1
          });
        }
      }
    }

    return childWork;
  }

  getDAG() {
    return this.dag;
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.BranchingSimulator = BranchingSimulator;
  window.BranchingRNG = BranchingRNG;
  window.getBallPositionAtTime = getBallPositionAtTime;
  window.captureSnapshot = captureSnapshot;
  window.serializeSimState = serializeSimState;
  window.restoreSimState = restoreSimState;
  window.hasActiveBalls = hasActiveBalls;
}
