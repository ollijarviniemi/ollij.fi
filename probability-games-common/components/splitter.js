/**
 * Splitter Component - Random Output
 *
 * Takes a single ball as input, bounces it briefly, then outputs to a
 * uniformly random output channel. Auto-detects input/output channels
 * from adjacent conveyor belts.
 */

const SplitterSpec = {
  type: "splitter",
  displayName: "Splitter",

  isObservable: true,

  // Default parameters - channels auto-detected from neighbors
  defaultParams: {
    sides: {
      up: {type: 'none'},
      right: {type: 'none'},
      down: {type: 'none'},
      left: {type: 'none'}
    },
    bounceDuration: 600,  // ms to bounce before outputting
    plex: false
  },

  ports: {
    inputs: [],
    outputs: [
      {id: "output", direction: null, offset: {x: 0.5, y: 0.5}, required: true}
    ]
  },

  states: {
    entering: {
      /**
       * Ball entering splitter
       */
      getTrajectory(ball, component, startTime) {
        const entry = this.getEntryPosition(component, ball);
        const center = {x: component.position.x + 0.5, y: component.position.y + 0.5};

        return {
          path: applyEasing(
            createPiecewiseLinearTrajectory([entry, center]),
            easeInCubic
          ),
          duration: 200,
          waypoints: [entry, center]
        };
      },

      getEntryPosition(component, ball) {
        const pos = component.position;
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

    bouncing: {
      /**
       * Ball bouncing around inside splitter
       */
      getPosition(ball, component, currentTime) {
        const center = {x: component.position.x + 0.5, y: component.position.y + 0.5};

        // Initialize ball physics if not already done
        if (!ball.bounceState) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.02;
          ball.bounceState = {
            x: 0,
            y: 0,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            lastUpdateTime: currentTime
          };
        }

        // Physics simulation
        const state = ball.bounceState;
        const deltaTime = currentTime - state.lastUpdateTime;
        state.lastUpdateTime = currentTime;

        // Update position
        state.x += state.vx * deltaTime;
        state.y += state.vy * deltaTime;

        // Bounding box
        const boxSize = 0.35;

        // Bounce off walls
        if (state.x < -boxSize) {
          state.x = -boxSize;
          state.vx = Math.abs(state.vx);
        } else if (state.x > boxSize) {
          state.x = boxSize;
          state.vx = -Math.abs(state.vx);
        }

        if (state.y < -boxSize) {
          state.y = -boxSize;
          state.vy = Math.abs(state.vy);
        } else if (state.y > boxSize) {
          state.y = boxSize;
          state.vy = -Math.abs(state.vy);
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
          if (!ball || !ball.bounceState) return 0;
          const speed = Math.sqrt(ball.bounceState.vx ** 2 + ball.bounceState.vy ** 2);
          const elapsed = currentTime - (ball.bounceEnterTime || 0);
          return (elapsed * speed * 100) % 360;
        }
      }
    },

    exiting: {
      /**
       * Ball exiting splitter
       */
      getTrajectory(ball, component, startTime) {
        const center = {x: component.position.x + 0.5, y: component.position.y + 0.5};
        const pos = component.position;

        const outputSide = ball.outputSide || 'down';
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
          duration: 200,
          waypoints: [center, exit]
        };
      },

      getPosition(ball, component, currentTime) {
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
     * Ball arrives at splitter
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Observe ball upon entry if not plexed
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }

      // Set trajectory BEFORE changing state
      const trajectory = spec.states.entering.getTrajectory(ball, component, time);
      ball.trajectory = trajectory.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectory.duration;
      ball.trajectoryWaypoints = trajectory.waypoints;

      ball.componentState = "entering";
    },

    /**
     * Trajectory complete
     */
    onTrajectoryComplete(ball, component, time, spec) {
      if (ball.componentState === "entering") {
        // Switch to bouncing state
        ball.componentState = "bouncing";
        ball.bounceEnterTime = time;
        ball.trajectory = null;

        // Schedule exit - use array to handle multiple balls
        const bounceDuration = component.params.bounceDuration || 600;
        if (!component.pendingBalls) {
          component.pendingBalls = [];
        }
        component.pendingBalls.push({
          ball: ball,
          exitTime: time + bounceDuration
        });

      } else if (ball.componentState === "exiting") {
        // Queue for transfer (supports multiple balls exiting same tick)
        if (!component.ballsToTransfer) component.ballsToTransfer = [];
        component.ballsToTransfer.push(ball);
      }
    }
  },

  behavior: {
    /**
     * Get array of output sides
     */
    getOutputSides(component) {
      const sides = component.params.sides || {};
      const outputs = [];
      for (const side in sides) {
        if (sides[side].type === 'output') {
          outputs.push(side);
        }
      }
      return outputs;
    },

    /**
     * Get array of input sides
     */
    getInputSides(component) {
      const sides = component.params.sides || {};
      const inputs = [];
      for (const side in sides) {
        if (sides[side].type === 'input') {
          inputs.push(side);
        }
      }
      return inputs;
    },

    /**
     * Choose random output side
     */
    chooseRandomOutput(component) {
      const outputs = this.getOutputSides(component);
      if (outputs.length === 0) {
        throw new Error('Splitter has no output channels configured');
      }
      if (outputs.length === 1) {
        return outputs[0];
      }

      const rng = component.simulation?.rng;
      if (!rng) {
        throw new Error('Splitter requires simulation RNG but component.simulation.rng is not available');
      }
      return rng.choice(outputs);
    },

    /**
     * Auto-detect channels from adjacent components
     * Handles: conveyors, conveyor-turns, mergers
     * Called by editor when component is placed or neighbors change
     */
    autoDetectChannels(component, getNeighbor) {
      const sides = {
        up: {type: 'none'},
        right: {type: 'none'},
        down: {type: 'none'},
        left: {type: 'none'}
      };

      const opposites = {up: 'down', down: 'up', left: 'right', right: 'left'};

      // Conveyor-turn: map turn param to entry/exit sides
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

      for (const side of ['up', 'down', 'left', 'right']) {
        const neighbor = getNeighbor(component.position, side);
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
            if (turnSides.exit === oppositeSide) {
              sides[side] = {type: 'input'};
            }
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
        }
      }

      return sides;
    }
  },

  // Check and output (called by simulation)
  checkAndOutput(component, time, spec) {
    if (!component.pendingBalls || component.pendingBalls.length === 0) return;

    // Process all balls that are ready to exit
    const remaining = [];
    for (const pending of component.pendingBalls) {
      if (time >= pending.exitTime) {
        const ball = pending.ball;

        // Choose random output
        ball.outputSide = spec.behavior.chooseRandomOutput(component);

        // Set exit trajectory
        const trajectory = spec.states.exiting.getTrajectory(ball, component, time);
        ball.trajectory = trajectory.path;
        ball.trajectoryStartTime = time;
        ball.trajectoryDuration = trajectory.duration;
        ball.trajectoryWaypoints = trajectory.waypoints;

        ball.componentState = "exiting";
        delete ball.bounceState;
      } else {
        // Not ready yet, keep in queue
        remaining.push(pending);
      }
    }
    component.pendingBalls = remaining;
  },

  // For Bayesian inference
  inference: {
    /**
     * Splitter outputs uniformly at random
     */
    getPossibleOutputs(inputs, params) {
      const sides = params.sides || {};
      const outputs = [];
      for (const side in sides) {
        if (sides[side].type === 'output') {
          outputs.push(side);
        }
      }

      if (outputs.length === 0) return [{output: 'down', probability: 1.0}];

      const prob = 1.0 / outputs.length;
      return outputs.map(side => ({output: side, probability: prob}));
    }
  },

  // Visual rendering - same as shuffler
  visual: {
    size: {width: 64, height: 64},

    render(ctx, component) {
      const pos = component.position;
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }

      const px = pos.x * gridSize;
      const py = pos.y * gridSize;

      // Get sides configuration
      const sides = component.params.sides || SplitterSpec.defaultParams.sides;

      // Count outputs for validity check
      let outputCount = 0;
      let inputCount = 0;
      for (const side in sides) {
        if (sides[side].type === 'output') outputCount++;
        if (sides[side].type === 'input') inputCount++;
      }
      const isValid = outputCount >= 1;

      // Draw splitter box - use shuffler color (orange)
      const splitterColor = window.ComponentColors?.COLORS?.shuffler || '#FF9800';
      ctx.fillStyle = isValid ? splitterColor : "#8B4545";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = gridSize * 0.0625;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const boxInset = gridSize * 0.125;
      const boxSize = gridSize * 0.75;

      // Fill the box
      ctx.fillRect(px + boxInset, py + boxInset, boxSize, boxSize);

      // Draw channel trapezoids
      const beltWidth = gridSize * 0.375;
      const trapezoidBase = beltWidth;
      const trapezoidTop = beltWidth * 0.5;

      const drawChannelTrapezoid = (side, type) => {
        if (type === 'none') return;

        ctx.fillStyle = type === 'input' ? '#FFD700' : '#CC4444';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;

        ctx.save();
        ctx.translate(px + gridSize * 0.5, py + gridSize * 0.5);

        const rotations = {
          'up': 0,
          'right': Math.PI / 2,
          'down': Math.PI,
          'left': -Math.PI / 2
        };
        ctx.rotate(rotations[side]);

        const halfBase = trapezoidBase / 2;
        const halfTop = trapezoidTop / 2;
        const distToEdge = gridSize / 2;
        const distToBox = gridSize / 2 - boxInset;

        ctx.beginPath();
        ctx.moveTo(-halfBase, -distToEdge);
        ctx.lineTo(halfBase, -distToEdge);
        ctx.lineTo(halfTop, -distToBox);
        ctx.lineTo(-halfTop, -distToBox);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      };

      for (const side in sides) {
        drawChannelTrapezoid(side, sides[side].type);
      }

      // Draw box border, skipping sides with channels
      ctx.strokeStyle = '#000';
      ctx.lineWidth = gridSize * 0.0625;
      ctx.lineCap = 'round';

      const boxLeft = px + boxInset;
      const boxRight = px + boxInset + boxSize;
      const boxTop = py + boxInset;
      const boxBottom = py + boxInset + boxSize;
      const halfTrapBase = trapezoidTop / 2;
      const centerX = px + gridSize * 0.5;
      const centerY = py + gridSize * 0.5;

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

      // Draw probability indicator in center (e.g., "1/2" for 2 outputs)
      if (isValid && outputCount >= 2) {
        ctx.fillStyle = "#000";
        ctx.font = `bold ${gridSize * 0.25}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`1/${outputCount}`, px + gridSize * 0.5, py + gridSize * 0.5);
      }
    }
  },

  // Level editor metadata
  editor: {
    icon: "⑂",
    category: "Processing",
    hotkey: "t"  // Same as old splitter
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(SplitterSpec);
}
