/**
 * Shuffler Component - Ball Shuffler
 *
 * Takes 2-3 balls as input from different sides, shuffles them, outputs with delay
 */

const ShufflerSpec = {
  type: "shuffler",
  displayName: "Shuffler",

  isObservable: true,

  // Default parameters
  defaultParams: {
    sides: {
      up: {type: 'input', count: 0},
      right: {type: 'none', count: 0},
      down: {type: 'output', count: 2},
      left: {type: 'input', count: 0}
    },
    minBufferSize: 2,         // Threshold to trigger shuffle
    outputDelay: 800,         // ms between ball outputs
    idleTimeout: 4000,        // ms before inactive shuffler freezes balls
    plex: false
  },

  ports: {
    // Inputs are dynamic based on sides configuration
    inputs: [],
    outputs: [
      {id: "output", direction: null, offset: {x: 0.5, y: 0.5}, required: true}
    ]
  },

  states: {
    entering: {
      /**
       * Ball entering shuffler
       */
      getTrajectory(ball, component, startTime) {
        // Entry position based on which input this ball came from
        const entry = this.getEntryPosition(component, ball);
        const center = {x: component.position.x + 0.5, y: component.position.y + 0.5};

        return {
          path: applyEasing(
            createPiecewiseLinearTrajectory([entry, center]),
            easeInCubic
          ),
          duration: 500,
          waypoints: [entry, center]
        };
      },

      getEntryPosition(component, ball) {
        const pos = component.position;
        // Determine entry based on which side this input came from
        switch (ball.inputDirection) {
          case 'up':
            return {x: pos.x + 0.5, y: pos.y};
          case 'down':
            return {x: pos.x + 0.5, y: pos.y + 1};
          case 'left':
            return {x: pos.x, y: pos.y + 0.5};
          case 'right':
            return {x: pos.x + 1, y: pos.y + 0.5};
          default:
            return {x: pos.x + 0.5, y: pos.y + 0.5};
        }
      },

      visual: {
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      }
    },

    fading: {
      /**
       * Ball fading away due to idle timeout - continues physics with decaying velocity
       */
      getPosition(ball, component, currentTime) {
        const center = {x: component.position.x + 0.5, y: component.position.y + 0.5};

        // Initialize ball physics if not already done
        if (!ball.bounceState) {
          ball.bounceState = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            lastUpdateTime: currentTime
          };
        }

        // Calculate fade progress for velocity decay
        const fadeProgress = ball.fadeStartTime && ball.fadeDuration
          ? Math.min(1, (currentTime - ball.fadeStartTime) / ball.fadeDuration)
          : 0;

        // Physics simulation with velocity decay
        const state = ball.bounceState;
        const deltaTime = currentTime - state.lastUpdateTime;
        state.lastUpdateTime = currentTime;

        // Decay velocity based on fade progress (exponential decay)
        const velocityMultiplier = Math.pow(1 - fadeProgress, 2); // Quadratic decay

        // Update position
        state.x += state.vx * deltaTime * velocityMultiplier;
        state.y += state.vy * deltaTime * velocityMultiplier;

        // Bounding box: -0.35 to +0.35 in both directions
        const boxSize = 0.35;

        // Bounce off walls with reduced energy
        if (state.x < -boxSize) {
          state.x = -boxSize;
          state.vx = Math.abs(state.vx) * 0.5; // Lose energy on bounce
        } else if (state.x > boxSize) {
          state.x = boxSize;
          state.vx = -Math.abs(state.vx) * 0.5;
        }

        if (state.y < -boxSize) {
          state.y = -boxSize;
          state.vy = Math.abs(state.vy) * 0.5;
        } else if (state.y > boxSize) {
          state.y = boxSize;
          state.vy = -Math.abs(state.vy) * 0.5;
        }

        return {
          x: center.x + state.x,
          y: center.y + state.y
        };
      },

      visual: {
        opacity: (progress, ball, currentTime) => {
          // Fade out over fadeDuration
          if (!ball || !ball.fadeStartTime || !ball.fadeDuration) return 1.0;
          const elapsed = currentTime - ball.fadeStartTime;
          return Math.max(0, 1.0 - (elapsed / ball.fadeDuration));
        },
        scale: 0.8, // Keep constant size (same as buffered state)
        rotation: (progress, ball, currentTime) => {
          if (!ball || !ball.bounceState) return 0;
          const speed = Math.sqrt(ball.bounceState.vx ** 2 + ball.bounceState.vy ** 2);
          const elapsed = currentTime - (ball.fadeStartTime || 0);
          return (elapsed * speed * 50) % 360; // Slower rotation
        }
      }
    },

    buffered: {
      /**
       * Ball waiting in buffer, bouncing around
       */
      getPosition(ball, component, currentTime) {
        const center = {x: component.position.x + 0.5, y: component.position.y + 0.5};

        // Initialize ball physics if not already done
        if (!ball.bounceState) {
          // Start with random angle
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.005 + Math.random() * 0.005; // Random speed between 0.005 and 0.01
          ball.bounceState = {
            x: (Math.random() - 0.5) * 0.4,
            y: (Math.random() - 0.5) * 0.4,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            lastUpdateTime: currentTime
          };
        }

        // Physics simulation - update position based on velocity
        const state = ball.bounceState;
        const deltaTime = currentTime - state.lastUpdateTime;
        state.lastUpdateTime = currentTime;

        // Update position
        state.x += state.vx * deltaTime;
        state.y += state.vy * deltaTime;

        // Bounding box: -0.35 to +0.35 in both directions
        const boxSize = 0.35;

        // Bounce off walls with random angle perturbation
        if (state.x < -boxSize) {
          state.x = -boxSize;
          state.vx = Math.abs(state.vx);
          // Add random perturbation to angle
          const angleNoise = (Math.random() - 0.5) * 0.4;
          const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2);
          const angle = Math.atan2(state.vy, state.vx) + angleNoise;
          state.vx = Math.cos(angle) * speed;
          state.vy = Math.sin(angle) * speed;
        } else if (state.x > boxSize) {
          state.x = boxSize;
          state.vx = -Math.abs(state.vx);
          // Add random perturbation to angle
          const angleNoise = (Math.random() - 0.5) * 0.4;
          const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2);
          const angle = Math.atan2(state.vy, state.vx) + angleNoise;
          state.vx = Math.cos(angle) * speed;
          state.vy = Math.sin(angle) * speed;
        }

        if (state.y < -boxSize) {
          state.y = -boxSize;
          state.vy = Math.abs(state.vy);
          // Add random perturbation to angle
          const angleNoise = (Math.random() - 0.5) * 0.4;
          const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2);
          const angle = Math.atan2(state.vy, state.vx) + angleNoise;
          state.vx = Math.cos(angle) * speed;
          state.vy = Math.sin(angle) * speed;
        } else if (state.y > boxSize) {
          state.y = boxSize;
          state.vy = -Math.abs(state.vy);
          // Add random perturbation to angle
          const angleNoise = (Math.random() - 0.5) * 0.4;
          const speed = Math.sqrt(state.vx ** 2 + state.vy ** 2);
          const angle = Math.atan2(state.vy, state.vx) + angleNoise;
          state.vx = Math.cos(angle) * speed;
          state.vy = Math.sin(angle) * speed;
        }

        return {
          x: center.x + state.x,
          y: center.y + state.y
        };
      },

      visual: {
        opacity: 1.0,
        scale: 0.8,
        rotation: (progress, ball, currentTime) => {
          // Rotation based on velocity (faster balls spin faster)
          if (!ball || !ball.bounceState) return 0;
          const speed = Math.sqrt(ball.bounceState.vx ** 2 + ball.bounceState.vy ** 2);
          const elapsed = currentTime - (ball.bufferEnterTime || 0);
          return (elapsed * speed * 100) % 360;
        }
      }
    },

    exiting: {
      /**
       * Ball exiting shuffler
       */
      getTrajectory(ball, component, startTime) {
        const center = {x: component.position.x + 0.5, y: component.position.y + 0.5};
        const pos = component.position;

        // Determine exit based on ball's assigned output side (from pattern)
        const outputSide = ball.outputSide || component.params.outputSide || 'down';
        let exit;
        switch (outputSide) {
          case 'up':
            exit = {x: pos.x + 0.5, y: pos.y};
            break;
          case 'down':
            exit = {x: pos.x + 0.5, y: pos.y + 1};
            break;
          case 'left':
            exit = {x: pos.x, y: pos.y + 0.5};
            break;
          case 'right':
            exit = {x: pos.x + 1, y: pos.y + 0.5};
            break;
        }

        return {
          path: applyEasing(
            createPiecewiseLinearTrajectory([center, exit]),
            easeOutCubic
          ),
          duration: 500,
          waypoints: [center, exit]
        };
      },

      /**
       * Get position when trajectory is complete (ball waiting at exit point for transfer)
       */
      getPosition(ball, component, currentTime) {
        // Ball should be at its static position (the exit point)
        // This is used after trajectory completes but before transfer
        return ball.position;
      },

      visual: {
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      }
    }
  },

  transitions: {
    /**
     * Ball arrives at shuffler
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Observe ball upon entry if shuffler is observable (no plex glass)
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }

      // Track which input this came from
      ball.inputIndex = component.bufferState?.ballsReceived || 0;

      // Set trajectory BEFORE changing state to prevent renderer from seeing ball with no trajectory
      const trajectory = spec.states.entering.getTrajectory(ball, component, time);
      ball.trajectory = trajectory.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectory.duration;
      ball.trajectoryWaypoints = trajectory.waypoints;

      // Now safe to change state
      ball.componentState = "entering";
    },

    /**
     * Trajectory complete
     */
    onTrajectoryComplete(ball, component, time, spec) {
      if (ball.componentState === "entering") {
        // Ball entered, add to buffer
        if (!component.bufferState) {
          component.bufferState = {
            balls: [],              // All balls currently in buffer (includes retained)
            ballsReceived: 0,       // Total balls received (across all cycles)
            nextOutputTime: null,
            outputQueue: [],        // Balls queued for output (after shuffle)
            cycleNumber: 0,         // Which shuffle cycle we're on
            lastActivityTime: time, // Last time a ball arrived or was output
            frozen: false           // Whether balls are frozen due to timeout
          };
        }

        // If shuffler was frozen (balls were fading), unfreeze it and revive fading balls
        if (component.bufferState.frozen) {
          console.log(`Shuffler ${component.id}: Unfreezing - new ball arrived while ${component.bufferState.balls.length} balls were fading`);
          component.bufferState.frozen = false;

          // Revive any balls that were fading
          for (const fadingBall of component.bufferState.balls) {
            if (fadingBall.componentState === "fading") {
              fadingBall.componentState = "buffered";
              delete fadingBall.fadeStartTime;
              delete fadingBall.fadeDuration;
            }
          }
        }

        ball.componentState = "buffered";
        ball.bufferEnterTime = time;
        ball.bufferIndex = component.bufferState.balls.length;
        ball.trajectory = null;

        component.bufferState.balls.push(ball);
        component.bufferState.ballsReceived++;
        component.bufferState.lastActivityTime = time; // Update activity time

        // Check if we have reached minimum buffer size
        if (!component.params.minBufferSize) {
          throw new Error(`Shuffler ${component.id} missing minBufferSize parameter`);
        }
        const minBufferSize = component.params.minBufferSize;
        const isOutputting = component.bufferState.outputQueue && component.bufferState.outputQueue.length > 0;
        const isWaitingToShuffle = component.bufferState.shuffleScheduledTime !== undefined;
        if (component.bufferState.balls.length >= minBufferSize && !isOutputting && !isWaitingToShuffle) {
          // Add 1000ms delay to let shuffling animation continue before output
          component.bufferState.shuffleScheduledTime = time + 1000;
        }
      } else if (ball.componentState === "exiting") {
        // Ball exited, transfer to next component
        // Note: Don't clear trajectory here - prevents rendering errors between
        // completion and transfer. Position will be at end of trajectory.
        component.needsTransfer = true;
        component.ballToTransfer = ball;
      }
    }
  },

  // Shuffler behavior
  behavior: {
    /**
     * Get array of input side names
     */
    getInputSides(component) {
      if (!component.params.sides) {
        throw new Error(`Shuffler ${component.id} missing sides configuration`);
      }

      const inputs = [];
      for (const side in component.params.sides) {
        if (component.params.sides[side].type === 'input') {
          inputs.push(side);
        }
      }
      return inputs;
    },

    /**
     * Get array of output sides with their counts: [{side: 'down', count: 2}, ...]
     */
    getOutputSides(component) {
      if (!component.params.sides) {
        throw new Error(`Shuffler ${component.id} missing sides configuration`);
      }

      const outputs = [];
      for (const side in component.params.sides) {
        if (component.params.sides[side].type === 'output' && component.params.sides[side].count > 0) {
          outputs.push({
            side: side,
            count: component.params.sides[side].count
          });
        }
      }
      return outputs;
    },

    /**
     * Build output pattern from sides configuration
     * Retained ball count is calculated as: minBufferSize - totalOutputCount
     * Returns array: [{side: 'down', count: 2}, {retain: true, count: 1}, ...]
     */
    getOutputPattern(component) {
      if (!component.params.sides) {
        throw new Error(`Shuffler ${component.id} missing sides configuration`);
      }

      const pattern = [];
      let totalOutputCount = 0;

      // Add output sides
      const outputSides = this.getOutputSides(component);
      for (const output of outputSides) {
        pattern.push({
          side: output.side,
          count: output.count,
          retain: false
        });
        totalOutputCount += output.count;
      }

      // Calculate retained balls: minBufferSize - totalOutputCount
      const minBufferSize = component.params.minBufferSize || 2;
      const retainCount = Math.max(0, minBufferSize - totalOutputCount);

      if (retainCount > 0) {
        pattern.push({
          retain: true,
          count: retainCount
        });
      }

      return pattern;
    },

    /**
     * Get total output count (excluding retained balls)
     */
    getTotalOutputCount(component) {
      const outputSides = this.getOutputSides(component);
      return outputSides.reduce((sum, output) => sum + output.count, 0);
    },

    /**
     * Validate shuffler configuration
     */
    isValid(component) {
      if (!component.params.sides) {
        return false;
      }

      const inputSides = this.getInputSides(component);
      const outputSides = this.getOutputSides(component);

      // Must have at least 1 input OR 1 output
      if (inputSides.length === 0 && outputSides.length === 0) {
        return false;
      }

      // Note: Retained balls are automatically calculated as minBufferSize - totalOutputCount
      // No explicit validation needed - any positive or zero retain count is valid

      return true;
    },

    /**
     * Get default sides configuration (for rendering fallback)
     */
    getDefaultSides() {
      return {
        up: {type: 'input', count: 0},
        right: {type: 'none', count: 0},
        down: {type: 'output', count: 2},
        left: {type: 'input', count: 0}
      };
    },

    /**
     * Migrate old parameter format to new format
     * Old format: numInputs, input1Side, input2Side, input3Side, outputPattern, outputSide
     * New format: sides, minBufferSize, outputDelay, idleTimeout, plex
     * Note: retainCount is now calculated automatically as minBufferSize - totalOutputCount
     */
    migrateParams(params) {
      // If already in new format (has sides), return as-is
      if (params.sides) {
        return params;
      }


      // Initialize new sides structure
      const sides = {
        up: {type: 'none', count: 0},
        right: {type: 'none', count: 0},
        down: {type: 'none', count: 0},
        left: {type: 'none', count: 0}
      };

      // Migrate input sides
      if (params.input1Side) {
        sides[params.input1Side] = {type: 'input', count: 0};
      }
      if (params.input2Side) {
        sides[params.input2Side] = {type: 'input', count: 0};
      }
      if (params.input3Side && params.numInputs === 3) {
        sides[params.input3Side] = {type: 'input', count: 0};
      }

      // Migrate output sides from outputPattern
      let retainCountFromOldFormat = 0;
      let totalOutputCount = 0;

      if (params.outputPattern) {
        for (const entry of params.outputPattern) {
          if (entry.retain) {
            retainCountFromOldFormat = entry.count;
          } else if (entry.side) {
            sides[entry.side] = {type: 'output', count: entry.count};
            totalOutputCount += entry.count;
          }
        }
      } else if (params.outputSide) {
        // Fallback: use outputSide with default count
        sides[params.outputSide] = {type: 'output', count: 2};
        totalOutputCount = 2;
      }

      // Calculate minBufferSize to preserve behavior: minBufferSize = retainCount + totalOutputCount
      // If minBufferSize was explicitly set, respect that instead
      const calculatedMinBufferSize = retainCountFromOldFormat + totalOutputCount;
      const minBufferSize = params.minBufferSize || calculatedMinBufferSize || params.numInputs || 2;

      // Build new params (retainCount is now calculated automatically, not stored)
      const newParams = {
        sides: sides,
        minBufferSize: minBufferSize,
        outputDelay: params.outputDelay || 800,
        idleTimeout: params.idleTimeout || 4000,
        plex: params.plex || false
      };

      return newParams;
    },

    /**
     * Shuffle balls in buffer
     */
    shuffle(balls, time, component) {
      if (balls.length < 2) {
        throw new Error(`Shuffler ${component.id} attempting to shuffle ${balls.length} ball(s). Shuffling requires at least 2 balls. This indicates incorrect minBufferSize configuration or logic error.`);
      }

      // Notify Bayesian tracker BEFORE shuffling using native N-way shuffle
      if (component.simulation && component.simulation.bayesianTracker) {
        const tracker = component.simulation.bayesianTracker;
        const ballIds = balls.map(ball => ball.id);
        tracker.onShuffleMultiple(ballIds);
      }

      // Get RNG from simulation (seeded for deterministic replay)
      const rng = component.simulation?.rng;
      if (!rng) {
        throw new Error('Shuffler requires simulation.rng for deterministic shuffling');
      }

      // Use RNG's built-in shuffle method
      // This is the ACTUAL shuffle that determines ball order
      // The visual bouncing animation is independent and doesn't reveal this order
      rng.shuffle(balls);
    },

    /**
     * Shuffle balls and prepare output queue based on pattern
     */
    shuffleAndPrepareOutput(balls, time, component, spec) {
      // First, shuffle all balls (includes Bayesian tracker notification)
      spec.behavior.shuffle(balls, time, component);

      // Get output pattern from sides configuration
      const outputPattern = spec.behavior.getOutputPattern(component);

      // Prepare output queue based on pattern
      const outputQueue = [];
      let ballIndex = 0;
      let outputIndexCounter = 0;

      for (const entry of outputPattern) {
        const count = Math.min(entry.count, balls.length - ballIndex);

        if (entry.retain) {
          // These balls stay in buffer - skip them in output queue
          // Mark them as retained for next cycle
          for (let i = 0; i < count; i++) {
            if (ballIndex < balls.length) {
              balls[ballIndex].retained = true;
              ballIndex++;
            }
          }
        } else {
          // These balls go to output queue
          for (let i = 0; i < count; i++) {
            if (ballIndex < balls.length) {
              const ball = balls[ballIndex];
              ball.retained = false;
              ball.outputSide = entry.side;
              // CRITICAL: Set outputIndex to preserve shuffled order
              ball.outputIndex = outputIndexCounter++;
              outputQueue.push(ball);
              ballIndex++;
            }
          }
        }
      }

      component.bufferState.outputQueue = outputQueue;

    }
  },

  // Check for ball output (called by simulation)
  checkAndOutput(component, time, spec) {
    if (!component.bufferState) {
      return;
    }

    // Check if it's time to execute scheduled shuffle
    if (component.bufferState.shuffleScheduledTime !== undefined &&
        time >= component.bufferState.shuffleScheduledTime) {
      // Execute the shuffle now
      spec.behavior.shuffleAndPrepareOutput(component.bufferState.balls, time, component, spec);

      // Initialize per-side timing (all sides start immediately)
      component.bufferState.nextOutputTimes = {};
      component.bufferState.cycleNumber++;

      // Clear the scheduled time
      delete component.bufferState.shuffleScheduledTime;
    }

    // Check for idle timeout
    if (!component.params.idleTimeout) {
      throw new Error(`Shuffler ${component.id} missing idleTimeout parameter`);
    }
    const idleTimeout = component.params.idleTimeout;
    const timeSinceActivity = time - component.bufferState.lastActivityTime;

    // If idle timeout exceeded and not already frozen, start fading all balls
    if (timeSinceActivity >= idleTimeout && !component.bufferState.frozen && component.bufferState.balls.length > 0) {
      console.log(`Shuffler ${component.id}: Starting fade - ${component.bufferState.balls.length} balls, timeSinceActivity=${timeSinceActivity}, idleTimeout=${idleTimeout}`);
      component.bufferState.frozen = true;

      // Start fading all balls (keep them in balls array for rendering)
      for (const ball of component.bufferState.balls) {
        // Stop ball movement and set to fading state
        ball.trajectory = null;
        ball.componentState = "fading";
        ball.position = spec.states.buffered.getPosition(ball, component, time);
        // Keep bounceState for decaying physics (don't delete it!)

        // Start fade out
        ball.fadeStartTime = time;
        ball.fadeDuration = 1500; // 2 second fade

      }

      // Clear output state but keep balls for fading
      component.bufferState.outputQueue = [];
      component.bufferState.nextOutputTimes = {};

      return;
    }

    // Check for completely faded balls and mark as consumed
    if (component.bufferState.frozen && component.bufferState.balls.length > 0) {
      for (const ball of component.bufferState.balls) {
        if (ball.componentState === "fading") {
          const fadeComplete = (time - ball.fadeStartTime) >= ball.fadeDuration;
          if (fadeComplete) {
            // Mark as consumed so renderer skips it
            ball.componentState = "consumed";
            ball.componentId = null; // Detach from component

            // Notify Bayesian tracker (ball is being removed from tracking)
            if (component.simulation && component.simulation.bayesianTracker) {
              component.simulation.bayesianTracker.onBallCollected(ball.id);
            }
          }
        }
      }

      // Clean up consumed balls from buffer
      component.bufferState.balls = component.bufferState.balls.filter(ball =>
        ball.componentState !== "consumed"
      );
    }

    // Normal output processing with per-channel timing
    if (!component.bufferState.outputQueue || component.bufferState.outputQueue.length === 0) {
      return;
    }

    // Initialize per-side output timing if needed
    if (!component.bufferState.nextOutputTimes) {
      component.bufferState.nextOutputTimes = {};
    }

    if (!component.params.outputDelay) {
      throw new Error(`Shuffler ${component.id} missing outputDelay parameter`);
    }
    const outputDelay = component.params.outputDelay;

    // Try to output balls from each side independently
    const outputQueue = component.bufferState.outputQueue;
    const ballsToOutput = [];

    // Group remaining balls by output side
    const ballsBySide = {};
    for (const ball of outputQueue) {
      if (!ballsBySide[ball.outputSide]) {
        ballsBySide[ball.outputSide] = [];
      }
      ballsBySide[ball.outputSide].push(ball);
    }

    // For each side, check if we can output a ball
    for (const side in ballsBySide) {
      const nextTime = component.bufferState.nextOutputTimes[side] || 0;
      if (time >= nextTime && ballsBySide[side].length > 0) {
        const ball = ballsBySide[side][0]; // Take first ball for this side
        ballsToOutput.push(ball);
        // Schedule next output for this side
        component.bufferState.nextOutputTimes[side] = time + outputDelay;
      }
    }

    // Output all ready balls
    for (const ball of ballsToOutput) {
      // Remove from queue
      const queueIndex = outputQueue.indexOf(ball);
      if (queueIndex !== -1) {
        outputQueue.splice(queueIndex, 1);
      }

      // Set trajectory BEFORE changing state to prevent renderer from seeing ball with no trajectory
      const trajectory = spec.states.exiting.getTrajectory(ball, component, time);
      ball.trajectory = trajectory.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectory.duration;
      ball.trajectoryWaypoints = trajectory.waypoints;

      // Now safe to change state
      ball.componentState = "exiting";

      // Clean up bounce physics state
      delete ball.bounceState;

      // Remove ball from main buffer
      const ballIndex = component.bufferState.balls.indexOf(ball);
      if (ballIndex !== -1) {
        component.bufferState.balls.splice(ballIndex, 1);
      }

      // Update activity time
      component.bufferState.lastActivityTime = time;

    }

    // If output queue is empty, check if we should schedule another cycle
    if (outputQueue.length === 0) {
      const minBufferSize = component.params.minBufferSize;
      const isWaitingToShuffle = component.bufferState.shuffleScheduledTime !== undefined;

      // If we still have enough balls and not already waiting to shuffle, schedule another cycle
      // This ensures the shuffler keeps outputting as long as it's at or above capacity
      if (component.bufferState.balls.length >= minBufferSize && !isWaitingToShuffle) {
        component.bufferState.shuffleScheduledTime = time + 1000;
      }
    }
  },

  // For Bayesian inference
  inference: {
    /**
     * Shuffler shuffles, so all permutations are possible
     */
    getPossibleInputs(outputs, params) {
      const numInputs = params.numInputs || 2;

      if (outputs.length !== numInputs) {
        return [{inputs: outputs, probability: 1.0}];
      }

      // Generate all permutations
      const permutations = [];
      const permute = (arr, m = []) => {
        if (arr.length === 0) {
          permutations.push(m);
        } else {
          for (let i = 0; i < arr.length; i++) {
            const curr = arr.slice();
            const next = curr.splice(i, 1);
            permute(curr.slice(), m.concat(next));
          }
        }
      };
      permute(outputs);

      // Each permutation is equally likely
      const probability = 1.0 / permutations.length;
      return permutations.map(perm => ({inputs: perm, probability}));
    }
  },

  // Visual rendering
  visual: {
    imagePath: "../images/shuffler.png",
    size: {width: 64, height: 64},

    render(ctx, component) {
      const pos = component.position;

      // Get gridSize from canvas (throw error if not available)
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }

      const px = pos.x * gridSize;
      const py = pos.y * gridSize;

      // Get sides configuration (use default for rendering if missing - validation handled elsewhere)
      const sides = component.params.sides || ShufflerSpec.behavior.getDefaultSides();

      // Calculate retained ball count: minBufferSize - totalOutputCount
      let totalOutputCount = 0;
      for (const side in sides) {
        if (sides[side].type === 'output') {
          totalOutputCount += sides[side].count || 0;
        }
      }
      const minBufferSize = component.params.minBufferSize || 2;
      const retainCount = Math.max(0, minBufferSize - totalOutputCount);

      // Check if configuration is valid (for coloring)
      const isValid = component.params.sides ? ShufflerSpec.behavior.isValid(component) : false;

      // Draw shuffler box - use orange for valid shuffler
      const shufflerColor = window.ComponentColors?.COLORS?.shuffler || '#FF9800';
      ctx.fillStyle = isValid ? shufflerColor : "#8B4545"; // Red tint if invalid
      ctx.strokeStyle = "#000";
      ctx.lineWidth = gridSize * 0.0625; // 4/64
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const boxInset = gridSize * 0.125; // 8/64
      const boxSize = gridSize * 0.75; // 48/64

      // Fill the box (border drawn later, after trapezoids)
      ctx.fillRect(px + boxInset, py + boxInset, boxSize, boxSize);

      // Draw channel trapezoids using transformations
      // Trapezoid: wide base at cell edge, narrow top at box edge
      const beltWidth = gridSize * 0.375;
      const trapezoidBase = beltWidth;
      const trapezoidTop = beltWidth * 0.5;

      const drawChannelTrapezoid = (side, type) => {
        if (type === 'none') return;

        // Colors: yellow for input, red for output
        ctx.fillStyle = type === 'input' ? '#FFD700' : '#CC4444';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;

        ctx.save();
        // Move to center of cell
        ctx.translate(px + gridSize * 0.5, py + gridSize * 0.5);

        // Rotate based on side (0° = up)
        const rotations = {
          'up': 0,
          'right': Math.PI / 2,
          'down': Math.PI,
          'left': -Math.PI / 2
        };
        ctx.rotate(rotations[side]);

        // Draw trapezoid pointing outward from center
        // Base (wide) at cell edge, top (narrow) at box edge
        const halfBase = trapezoidBase / 2;
        const halfTop = trapezoidTop / 2;
        const distToEdge = gridSize / 2;           // Center to cell edge
        const distToBox = gridSize / 2 - boxInset; // Center to box edge

        ctx.beginPath();
        ctx.moveTo(-halfBase, -distToEdge);  // Top-left (at cell edge)
        ctx.lineTo(halfBase, -distToEdge);   // Top-right (at cell edge)
        ctx.lineTo(halfTop, -distToBox);     // Bottom-right (at box edge)
        ctx.lineTo(-halfTop, -distToBox);    // Bottom-left (at box edge)
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      };

      // Draw trapezoids for each configured side
      for (const side in sides) {
        drawChannelTrapezoid(side, sides[side].type);
      }

      // Draw box border, skipping sides that have channels
      ctx.strokeStyle = '#000';
      ctx.lineWidth = gridSize * 0.0625;
      ctx.lineCap = 'round';

      const boxLeft = px + boxInset;
      const boxRight = px + boxInset + boxSize;
      const boxTop = py + boxInset;
      const boxBottom = py + boxInset + boxSize;
      const halfTrapBase = trapezoidTop / 2; // Narrow end of trapezoid at box edge
      const centerX = px + gridSize * 0.5;
      const centerY = py + gridSize * 0.5;

      // Draw each side of box, splitting around channel if present
      const drawBoxSide = (side) => {
        const hasChannel = sides[side]?.type !== 'none';

        ctx.beginPath();
        switch (side) {
          case 'up':
            if (hasChannel) {
              ctx.moveTo(boxLeft, boxTop);
              ctx.lineTo(centerX - halfTrapBase, boxTop);
              ctx.moveTo(centerX + halfTrapBase, boxTop);
              ctx.lineTo(boxRight, boxTop);
            } else {
              ctx.moveTo(boxLeft, boxTop);
              ctx.lineTo(boxRight, boxTop);
            }
            break;
          case 'down':
            if (hasChannel) {
              ctx.moveTo(boxLeft, boxBottom);
              ctx.lineTo(centerX - halfTrapBase, boxBottom);
              ctx.moveTo(centerX + halfTrapBase, boxBottom);
              ctx.lineTo(boxRight, boxBottom);
            } else {
              ctx.moveTo(boxLeft, boxBottom);
              ctx.lineTo(boxRight, boxBottom);
            }
            break;
          case 'left':
            if (hasChannel) {
              ctx.moveTo(boxLeft, boxTop);
              ctx.lineTo(boxLeft, centerY - halfTrapBase);
              ctx.moveTo(boxLeft, centerY + halfTrapBase);
              ctx.lineTo(boxLeft, boxBottom);
            } else {
              ctx.moveTo(boxLeft, boxTop);
              ctx.lineTo(boxLeft, boxBottom);
            }
            break;
          case 'right':
            if (hasChannel) {
              ctx.moveTo(boxRight, boxTop);
              ctx.lineTo(boxRight, centerY - halfTrapBase);
              ctx.moveTo(boxRight, centerY + halfTrapBase);
              ctx.lineTo(boxRight, boxBottom);
            } else {
              ctx.moveTo(boxRight, boxTop);
              ctx.lineTo(boxRight, boxBottom);
            }
            break;
        }
        ctx.stroke();
      };

      drawBoxSide('up');
      drawBoxSide('down');
      drawBoxSide('left');
      drawBoxSide('right');

      // Draw output counts on each output side (closer to center)
      if (isValid) {
        ctx.fillStyle = "#000";
        ctx.font = `bold ${gridSize * 0.18}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (const side in sides) {
          if (sides[side].type === 'output' && sides[side].count > 0) {
            let textX, textY;
            switch (side) {
              case 'up':
                textX = px + gridSize * 0.5;
                textY = py + gridSize * 0.22;
                break;
              case 'down':
                textX = px + gridSize * 0.5;
                textY = py + gridSize * 0.78;
                break;
              case 'left':
                textX = px + gridSize * 0.27;
                textY = py + gridSize * 0.5;
                break;
              case 'right':
                textX = px + gridSize * 0.75;
                textY = py + gridSize * 0.5;
                break;
            }
            if (textX !== undefined) {
              ctx.fillText(`×${sides[side].count}`, textX, textY);
            }
          }
        }
      }

      // Draw capacity (minBufferSize) in center
      const capacity = component.params.minBufferSize;
      if (capacity !== undefined && isValid) {
        ctx.fillStyle = "#000";
        ctx.font = `bold ${gridSize * 0.3}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${capacity}`, px + gridSize * 0.5, py + gridSize * 0.5);
      }

    }
  },

  // Level editor metadata
  editor: {
    icon: "🔀",
    category: "Processing"
    // defaultParams inherited from component spec (single source of truth)
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(ShufflerSpec);
}
