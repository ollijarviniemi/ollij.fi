/**
 * Duplicator Component
 *
 * Takes 1 ball input, creates N-1 duplicates (N=2-5 configurable)
 * Outputs all N balls sequentially with brief delay between outputs
 */

const DuplicatorSpec = {
  type: "duplicator",
  name: "Duplicator",
  description: "Duplicates balls: outputs N copies of each input ball",

  // Ports (input/output positions)
  ports: {
    inputs: [
      {id: "input", direction: null, offset: {x: 0, y: 0.5}, required: true}
    ],
    outputs: [
      {id: "output", direction: null, offset: {x: 1, y: 0.5}, required: false}
    ]
  },

  // Parameters
  defaultParams: {
    sides: {
      up: {type: 'none', count: 0},
      right: {type: 'output', count: 2},
      down: {type: 'none', count: 0},
      left: {type: 'input', count: 0}
    },
    plex: false,
    outputDelay: 1000  // ms between ball outputs from same channel
  },

  // Component states
  states: {
    IDLE: 'idle',
    DUPLICATING: 'duplicating',

    // Ball state: moving from input to center
    moving_to_center: {
      getTrajectory(ball, component, startTime) {
        const spec = ComponentRegistry.get('duplicator');
        const inputSide = spec.behavior.getInputSide(component);
        const positions = spec.behavior.getPositions(component, inputSide, 'right');

        return {
          path: createPiecewiseLinearTrajectory([positions.entry, positions.center]),
          duration: 500,
          waypoints: [positions.entry, positions.center]
        };
      },
      visual: {
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      }
    },

    // Ball state: waiting at center to be output
    waiting_to_output: {
      getPosition(ball, component) {
        // Ball waits at duplicator center
        return {
          x: component.position.x + 0.5,
          y: component.position.y + 0.5
        };
      },
      visual: {
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      }
    },

    // Ball state: outputting from center to exit
    outputting: {
      getTrajectory(ball, component, startTime) {
        const spec = ComponentRegistry.get('duplicator');
        const inputSide = spec.behavior.getInputSide(component);
        const outputSide = ball.outputSide;

        if (!outputSide) {
          throw new Error(`Duplicator ${component.id}: ball ${ball.id} has no outputSide set`);
        }

        const positions = spec.behavior.getPositions(component, inputSide, outputSide);

        return {
          path: createPiecewiseLinearTrajectory([positions.center, positions.exit]),
          duration: 500,
          waypoints: [positions.center, positions.exit]
        };
      },
      visual: {
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      }
    }
  },

  // Behavior methods
  behavior: {
    /**
     * Get total number of copies from sides configuration
     */
    getTotalCopies(component) {
      if (!component.params.sides) {
        throw new Error(`Duplicator ${component.id} missing sides configuration`);
      }
      const sides = component.params.sides;
      let total = 0;
      for (const side in sides) {
        if (sides[side].type === 'output') {
          total += sides[side].count;
        }
      }
      if (total === 0) {
        throw new Error(`Duplicator ${component.id} has no output sides configured`);
      }
      return total;
    },

    /**
     * Build output pattern from sides configuration
     */
    getOutputPattern(component) {
      if (!component.params.sides) {
        throw new Error(`Duplicator ${component.id} missing sides configuration`);
      }
      const sides = component.params.sides;
      const pattern = [];

      for (const side in sides) {
        if (sides[side].type === 'output' && sides[side].count > 0) {
          pattern.push({side: side, count: sides[side].count});
        }
      }

      if (pattern.length === 0) {
        throw new Error(`Duplicator ${component.id} has no output channels configured`);
      }
      return pattern;
    },

    /**
     * Determine which output side a copy should go to based on sides configuration
     */
    getOutputSideForCopy(component, copyIndex) {
      const pattern = this.getOutputPattern(component);

      // Find which pattern entry this copy belongs to
      let cumulativeCount = 0;
      for (const entry of pattern) {
        cumulativeCount += entry.count;
        if (copyIndex < cumulativeCount) {
          return entry.side;
        }
      }

      throw new Error(`Duplicator ${component.id}: copyIndex ${copyIndex} exceeds total output count ${cumulativeCount}`);
    },

    /**
     * Get default sides configuration
     */
    getDefaultSides() {
      return {
        up: {type: 'none', count: 0},
        right: {type: 'output', count: 2},
        down: {type: 'none', count: 0},
        left: {type: 'input', count: 0}
      };
    },

    /**
     * Get input side from configuration
     */
    getInputSide(component) {
      if (!component.params.sides) {
        throw new Error(`Duplicator ${component.id} missing sides configuration`);
      }
      const sides = component.params.sides;
      for (const side in sides) {
        if (sides[side].type === 'input') {
          return side;
        }
      }
      throw new Error(`Duplicator ${component.id} has no input side configured`);
    },

    /**
     * Validate duplicator configuration
     */
    isValid(component) {
      if (!component.params.sides) {
        return false; // Invalid if no configuration
      }
      const sides = component.params.sides;
      let inputCount = 0;
      let outputCount = 0;

      for (const side in sides) {
        if (sides[side].type === 'input') inputCount++;
        if (sides[side].type === 'output') outputCount++;
      }

      return inputCount === 1 && outputCount >= 1 && outputCount <= 3;
    },

    /**
     * Get entry and exit positions based on sides
     * inputSide: which side the entry is on (if specified)
     * outputSide: which side the exit is on (if specified)
     */
    getPositions(component, inputSide = null, outputSide = null) {
      const pos = component.position;
      const actualInputSide = inputSide || this.getInputSide(component);
      const actualOutputSide = outputSide || 'right';

      // Map sides to positions
      const sideToPos = {
        'up': {x: pos.x + 0.5, y: pos.y},
        'down': {x: pos.x + 0.5, y: pos.y + 1},
        'left': {x: pos.x, y: pos.y + 0.5},
        'right': {x: pos.x + 1, y: pos.y + 0.5}
      };

      return {
        entry: sideToPos[actualInputSide],
        center: {x: pos.x + 0.5, y: pos.y + 0.5},
        exit: sideToPos[actualOutputSide]
      };
    },

    /**
     * Create N-1 duplicates of the original ball
     * Notify Bayesian tracker for each duplicate
     */
    duplicate(originalBall, component) {
      const N = this.getTotalCopies(component);
      const duplicates = [];

      // Create N-1 duplicates
      for (let i = 1; i < N; i++) {
        const duplicateBall = component.simulation.createBall(
          originalBall.color,
          originalBall.sourceId
        );

        // Set component state immediately to prevent rendering errors
        duplicateBall.componentId = component.id;
        duplicateBall.componentState = 'waiting_to_output';

        // Position duplicated ball at duplicator center (prevents rendering at 0,0)
        duplicateBall.position = {
          x: component.position.x + 0.5,
          y: component.position.y + 0.5
        };

        duplicates.push(duplicateBall);

        // Notify Bayesian tracker
        if (component.simulation.bayesianTracker) {
          component.simulation.bayesianTracker.onBallDuplicated(
            originalBall.id,
            duplicateBall.id
          );
        }
      }

      // Return all balls (original + duplicates)
      return [originalBall, ...duplicates];
    },

    /**
     * Organize balls by output side and prepare for simultaneous multi-channel output
     * Creates a new batch that runs independently of other batches
     */
    outputBalls(balls, component, time, spec) {
      // Group balls by their output side
      const ballsByOutput = {};
      const nextOutputTimeBySide = {};
      const outputIndexBySide = {};

      balls.forEach((ball, index) => {
        const outputSide = spec.behavior.getOutputSideForCopy(component, index);
        if (!ballsByOutput[outputSide]) {
          ballsByOutput[outputSide] = [];
          nextOutputTimeBySide[outputSide] = time; // First ball from each side outputs immediately
          outputIndexBySide[outputSide] = 0;
        }
        ballsByOutput[outputSide].push(ball);
      });

      // Create a new batch - multiple batches can run independently
      const batch = {
        ballsByOutput,
        outputIndexBySide,
        nextOutputTimeBySide
      };

      // Initialize batches array if needed
      if (!component.duplicationBatches) {
        component.duplicationBatches = [];
      }
      component.duplicationBatches.push(batch);
    }
  },

  // State transitions
  transitions: {
    /**
     * Ball arrives at duplicator input
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Observe ball upon entry if no plex glass
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }

      // Get positions (use input side for entry position)
      const inputSide = spec.behavior.getInputSide(component);
      const positions = spec.behavior.getPositions(component, inputSide, 'right'); // dummy outputSide for now

      // Move ball to center (duplication happens when it reaches center)
      const trajectoryData = {
        path: createPiecewiseLinearTrajectory([positions.entry, positions.center]),
        duration: 500, // Fixed duration for entry movement
        waypoints: [positions.entry, positions.center]
      };

      // Set trajectory BEFORE changing state to prevent renderer from seeing ball with no trajectory
      ball.trajectory = trajectoryData.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectoryData.duration;
      ball.trajectoryWaypoints = trajectoryData.waypoints;

      // Now safe to change state
      ball.componentState = 'moving_to_center';
    },

    /**
     * Check if it's time to output next ball from each channel independently
     * Processes all active batches
     */
    checkAndOutput(component, time, spec) {
      if (!component.duplicationBatches || component.duplicationBatches.length === 0) {
        return;
      }

      const inputSide = spec.behavior.getInputSide(component);
      const completedBatchIndices = [];

      // Process each batch independently
      component.duplicationBatches.forEach((batch, batchIndex) => {
        let batchComplete = true;

        // Check each output side independently within this batch
        for (const outputSide in batch.ballsByOutput) {
          const balls = batch.ballsByOutput[outputSide];
          const outputIndex = batch.outputIndexBySide[outputSide];
          const nextOutputTime = batch.nextOutputTimeBySide[outputSide];

          // Check if this channel has more balls to output and is ready
          if (outputIndex < balls.length) {
            batchComplete = false;

            if (time >= nextOutputTime) {
              const ballToOutput = balls[outputIndex];

              // Ensure ball has component ID (critical for trajectory completion)
              ballToOutput.componentId = component.id;
              ballToOutput.outputSide = outputSide;
              ballToOutput.componentState = 'outputting'; // Set state for renderer

              const positions = spec.behavior.getPositions(component, inputSide, outputSide);

              // Set trajectory to output (proper format)
              const trajectoryData = {
                path: createPiecewiseLinearTrajectory([positions.center, positions.exit]),
                duration: 500,
                waypoints: [positions.center, positions.exit]
              };

              ballToOutput.trajectory = trajectoryData.path;
              ballToOutput.trajectoryStartTime = time;
              ballToOutput.trajectoryDuration = trajectoryData.duration;
              ballToOutput.trajectoryWaypoints = trajectoryData.waypoints;

              // Update this channel's state
              batch.outputIndexBySide[outputSide]++;
              if (!component.params.outputDelay) {
                throw new Error(`Duplicator ${component.id} missing outputDelay parameter`);
              }
              batch.nextOutputTimeBySide[outputSide] = time + component.params.outputDelay;
            }
          }
        }

        // Mark batch as complete if all channels are done
        if (batchComplete) {
          completedBatchIndices.push(batchIndex);
        }
      });

      // Remove completed batches (in reverse order to preserve indices)
      for (let i = completedBatchIndices.length - 1; i >= 0; i--) {
        const idx = completedBatchIndices[i];
        component.duplicationBatches.splice(idx, 1);
      }
    },

    /**
     * Ball completes trajectory - either reached center (start duplication) or exiting (transfer)
     */
    onTrajectoryComplete(ball, component, time, spec) {
      // Case 1: Ball just reached center - perform duplication and start output
      if (ball.componentState === 'moving_to_center') {
        // Reset state - ball is now waiting at center to be output
        ball.componentState = 'waiting_to_output';
        ball.trajectory = null;

        // NOW perform duplication
        const allBalls = spec.behavior.duplicate(ball, component);

        // Start output process (balls will leave center after delay)
        spec.behavior.outputBalls(allBalls, component, time, spec);
        return;
      }

      // Case 2: Ball exiting duplicator - transfer to next component
      if (!ball.outputSide) {
        return;
      }

      const outputSide = ball.outputSide;

      // Clean up BEFORE transfer to mark as processed
      delete ball.outputSide;
      // Note: Don't clear trajectory here - prevents rendering errors between
      // completion and transfer. Will be replaced by next component's onArrival.

      // Find connection in the specified absolute direction
      const simulation = component.simulation;
      if (!simulation) {
        console.error(`Duplicator ${component.id}: no simulation reference`);
        return;
      }

      const allConnections = simulation.level.connections.filter(c => c.from === component.id);

      // Find connection where target is in the specified direction
      const connection = allConnections.find(conn => {
        const target = simulation.componentsById.get(conn.to);
        if (!target) {
          return false;
        }

        // Match based on absolute direction
        let matches = false;
        switch (outputSide) {
          case 'up':
            matches = target.position.y < component.position.y;
            break;
          case 'down':
            matches = target.position.y > component.position.y;
            break;
          case 'left':
            matches = target.position.x < component.position.x;
            break;
          case 'right':
            matches = target.position.x > component.position.x;
            break;
        }
        return matches;
      });

      if (!connection) {
        console.warn(`Duplicator ${component.id}: No connection found in direction ${outputSide}`);
        return;
      }

      const nextComponent = simulation.componentsById.get(connection.to);
      if (!nextComponent) {
        console.error(`Duplicator ${component.id}: Next component ${connection.to} not found`);
        return;
      }

      // Compute input direction
      const dx = nextComponent.position.x - component.position.x;
      const dy = nextComponent.position.y - component.position.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        ball.inputDirection = dx > 0 ? 'left' : 'right';
      } else {
        ball.inputDirection = dy > 0 ? 'up' : 'down';
      }

      // Transfer to next component
      const nextSpec = ComponentRegistry.get(nextComponent.type);
      if (nextSpec.transitions.onArrival) {
        nextSpec.transitions.onArrival(ball, nextComponent, simulation.time, nextSpec);
      }
    }
  },

  // Visual rendering
  visual: {
    render(ctx, component) {
      const pos = component.position;
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }
      const px = pos.x * gridSize;
      const py = pos.y * gridSize;

      // Get spec for validation
      const spec = ComponentRegistry.get(component.type);
      const isValid = spec.behavior.isValid(component);

      // Get sides configuration (use default for rendering if missing - validation handled elsewhere)
      const sides = component.params.sides || spec.behavior.getDefaultSides();

      // Color scheme - blue for duplicator
      const duplicatorColor = window.ComponentColors?.COLORS?.duplicator || '#42A5F5';

      ctx.save();
      ctx.translate(px, py);

      // Belt dimensions
      const beltWidth = gridSize * 0.375;
      const beltInset = gridSize * 0.3125;
      const center = gridSize * 0.5;
      const centerRadius = gridSize * 0.15; // Ball-sized center circle

      ctx.fillStyle = isValid ? duplicatorColor : "#8B4545";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Helper to draw belt arm from edge toward center (stopping before center circle)
      const drawBeltArm = (side) => {
        const armEnd = center - centerRadius; // Stop before center circle
        switch (side) {
          case 'up':
            ctx.fillRect(beltInset, 0, beltWidth, armEnd);
            break;
          case 'down':
            ctx.fillRect(beltInset, center + centerRadius, beltWidth, armEnd);
            break;
          case 'left':
            ctx.fillRect(0, beltInset, armEnd, beltWidth);
            break;
          case 'right':
            ctx.fillRect(center + centerRadius, beltInset, armEnd, beltWidth);
            break;
        }
      };

      const drawBeltArmBorder = (side) => {
        const armEnd = center - centerRadius;
        switch (side) {
          case 'up':
            ctx.rect(beltInset, 0, beltWidth, armEnd);
            break;
          case 'down':
            ctx.rect(beltInset, center + centerRadius, beltWidth, armEnd);
            break;
          case 'left':
            ctx.rect(0, beltInset, armEnd, beltWidth);
            break;
          case 'right':
            ctx.rect(center + centerRadius, beltInset, armEnd, beltWidth);
            break;
        }
      };

      // Draw belt arms for configured sides
      for (const side in sides) {
        if (sides[side].type !== 'none') {
          drawBeltArm(side);
        }
      }

      // Draw center circle (where ball sits during duplication)
      ctx.beginPath();
      ctx.arc(center, center, centerRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw borders for arms
      ctx.beginPath();
      for (const side in sides) {
        if (sides[side].type !== 'none') {
          drawBeltArmBorder(side);
        }
      }
      ctx.stroke();

      // Draw center circle border
      ctx.beginPath();
      ctx.arc(center, center, centerRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw arrow (for input) or ×N label (for output) on each arm
      ctx.fillStyle = "#000";
      const armMid = (center - centerRadius) / 2;

      const drawArmMarker = (side, sideConfig) => {
        // Position in middle of arm
        let ax, ay;

        switch (side) {
          case 'up':
            ax = center;
            ay = armMid;
            break;
          case 'down':
            ax = center;
            ay = gridSize - armMid;
            break;
          case 'left':
            ax = armMid;
            ay = center;
            break;
          case 'right':
            ax = gridSize - armMid;
            ay = center;
            break;
        }

        if (sideConfig.type === 'input') {
          // Draw arrow pointing toward center using shared equilateral triangle
          const drawArrow = window.ComponentColors?.drawArrow;
          const angles = window.ComponentColors?.DIRECTION_ANGLES;
          if (drawArrow && angles) {
            // Map input side to arrow direction (pointing toward center)
            const arrowDirections = {
              'up': 'down',
              'down': 'up',
              'left': 'right',
              'right': 'left'
            };
            drawArrow(ctx, ax, ay, angles[arrowDirections[side]], gridSize * 0.1);
          }
        } else if (sideConfig.type === 'output' && sideConfig.count > 0) {
          // Draw ×N label
          ctx.font = `bold ${Math.floor(gridSize * 0.16)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`×${sideConfig.count}`, ax, ay);
        }
      };

      // Draw markers for all configured sides
      for (const side in sides) {
        if (sides[side].type !== 'none') {
          drawArmMarker(side, sides[side]);
        }
      }

      // Draw total count in center circle
      if (isValid) {
        const totalCopies = spec.behavior.getTotalCopies(component);
        ctx.fillStyle = "#000";
        ctx.font = `bold ${Math.floor(gridSize * 0.18)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`×${totalCopies}`, center, center);
      }

      // Draw plex glass overlay if enabled
      if (component.params.plex) {
        ctx.fillStyle = 'rgba(200, 220, 255, 0.3)';
        ctx.fillRect(0, 0, gridSize, gridSize);
      }

      ctx.restore();
    }
  },

  // Level editor metadata
  editor: {
    icon: "×",
    category: "Processing"
    // defaultParams inherited from component spec (single source of truth)
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(DuplicatorSpec);
}
