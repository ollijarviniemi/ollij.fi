/**
 * Switch Component
 *
 * Routes balls by count: first N balls go to one output, rest go to another
 * - First N balls → firstN output
 * - Remaining balls → rest output
 */

const SwitchSpec = {
  type: "switch",
  name: "Switch",
  description: "Routes first N balls to one output, rest to another",

  // Ports (input/output positions)
  ports: {
    inputs: [
      {id: "input", direction: null, offset: {x: 0.5, y: 0}, required: true}
    ],
    outputs: [
      {id: "firstN", direction: null, offset: {x: 0, y: 0.5}, required: false},
      {id: "rest", direction: null, offset: {x: 1, y: 0.5}, required: false}
    ]
  },

  // Parameters
  defaultParams: {
    n: 1,                    // Number of balls to first output
    inputSide: 'up',         // Input side
    firstNOutputSide: 'left',  // Output side for first N balls
    restOutputSide: 'right',   // Output side for remaining balls
    plex: false,
    speed: 1.0
  },

  // Component states
  states: {
    traveling: {
      /**
       * Recreate trajectory for ball traveling through switch
       * Uses ball.switchOutputSide to determine which exit path
       */
      getTrajectory(ball, component, startTime) {
        const inputSide = component.params.inputSide;
        const exitSide = ball.switchOutputSide;

        if (!exitSide) {
          throw new Error(`Switch ${component.id}: ball ${ball.id} has no switchOutputSide set`);
        }

        const { trajectory, length } = createFilterMergerTrajectory(
          component.position,
          inputSide,
          exitSide
        );

        const speed = component.params.speed || 1.0;
        const duration = (length / speed) * 1000;

        return {
          path: trajectory,
          duration: duration,
          waypoints: []
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
     * Get input and output positions
     */
    getPositions(component) {
      const pos = component.position;
      const inputSide = component.params.inputSide;
      const firstNSide = component.params.firstNOutputSide;
      const restSide = component.params.restOutputSide;

      // Map sides to positions
      const sideToPos = {
        'up': {x: pos.x + 0.5, y: pos.y},
        'down': {x: pos.x + 0.5, y: pos.y + 1},
        'left': {x: pos.x, y: pos.y + 0.5},
        'right': {x: pos.x + 1, y: pos.y + 0.5}
      };

      return {
        entry: sideToPos[inputSide],
        center: {x: pos.x + 0.5, y: pos.y + 0.5},
        firstNExit: sideToPos[firstNSide],
        restExit: sideToPos[restSide]
      };
    }
  },

  // State transitions
  transitions: {
    /**
     * Ball arrives at switch input
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Validate required parameters
      if (!component.params.inputSide || !component.params.firstNOutputSide || !component.params.restOutputSide) {
        throw new Error(
          `Switch ${component.id} missing required parameters! ` +
          `inputSide=${component.params.inputSide}, ` +
          `firstNOutputSide=${component.params.firstNOutputSide}, ` +
          `restOutputSide=${component.params.restOutputSide}`
        );
      }

      // Initialize ball count if not present
      if (component.ballCount === undefined) {
        component.ballCount = 0;
      }

      // Increment ball count (used for routing decisions)
      component.ballCount++;

      const positions = spec.behavior.getPositions(component);

      // Determine which output based on ball count
      const n = component.params.n || 1;
      const goesToFirstN = component.ballCount <= n;
      const exitPos = goesToFirstN ? positions.firstNExit : positions.restExit;
      const exitSide = goesToFirstN ? component.params.firstNOutputSide : component.params.restOutputSide;

      // Update Bayesian tracker - switch doesn't reveal color info
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }

      // Create trajectory that follows the belt shape
      const speed = component.params.speed;
      const inputSide = component.params.inputSide;

      const { trajectory, length } = createFilterMergerTrajectory(
        component.position,
        inputSide,
        exitSide
      );

      const duration = (length / speed) * 1000;

      const trajectoryData = {
        path: trajectory,
        duration: duration
      };

      // Set trajectory BEFORE changing state
      ball.trajectory = trajectoryData.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectoryData.duration;

      // Now safe to change state
      ball.componentState = "traveling";

      // Store which output for transfer logic ON THE BALL
      ball.switchOutputSide = exitSide;

      // Track ball's midpoint time for delayed visual switch
      // Visual only switches after ball passes center
      if (!component.pendingMidpoints) {
        component.pendingMidpoints = [];
      }
      component.pendingMidpoints.push({
        ballId: ball.id,
        midpointTime: time + (duration / 2)
      });
    },

    /**
     * Ball completes trajectory - transfer to next component
     */
    onTrajectoryComplete(ball, component) {
      // Check if already processed (idempotent)
      if (!ball.switchOutputSide) {
        return;
      }

      // Clean up pending midpoint tracking and increment committed count
      if (component.pendingMidpoints) {
        const idx = component.pendingMidpoints.findIndex(p => p.ballId === ball.id);
        if (idx !== -1) {
          component.pendingMidpoints.splice(idx, 1);
        }
      }
      component.committedBallCount = (component.committedBallCount || 0) + 1;

      const outputSide = ball.switchOutputSide;

      // Clean up BEFORE transfer
      delete ball.switchOutputSide;

      // Find connection in the specified absolute direction
      const simulation = component.simulation;
      if (!simulation) {
        console.error(`Switch ${component.id}: no simulation reference`);
        return;
      }

      const allConnections = simulation.level.connections.filter(c => c.from === component.id);

      // Find connection where target is in the specified direction
      const connection = allConnections.find(conn => {
        const target = simulation.componentsById.get(conn.to);
        if (!target) return false;

        switch (outputSide) {
          case 'up':
            return target.position.y < component.position.y;
          case 'down':
            return target.position.y > component.position.y;
          case 'left':
            return target.position.x < component.position.x;
          case 'right':
            return target.position.x > component.position.x;
          default:
            return false;
        }
      });

      if (!connection) {
        console.warn(`Switch ${component.id}: No connection found in direction ${outputSide}`);
        return;
      }

      const nextComponent = simulation.componentsById.get(connection.to);
      if (!nextComponent) {
        console.error(`Switch ${component.id}: Next component ${connection.to} not found`);
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

      const inputSide = component.params.inputSide;
      const firstNSide = component.params.firstNOutputSide;
      const restSide = component.params.restOutputSide;
      const n = component.params.n || 1;

      // Determine which branch is active based on visual ball count
      // Visual count = committed balls + pending balls that have passed midpoint
      let visualBallCount = component.committedBallCount || 0;

      // Check pending balls that have passed their midpoint
      if (component.pendingMidpoints && component.simulation) {
        const currentTime = component.simulation.time;
        for (const pending of component.pendingMidpoints) {
          if (currentTime >= pending.midpointTime) {
            visualBallCount++;
          }
        }
      }

      const firstNActive = visualBallCount < n;  // First N branch is active while count < n

      ctx.save();
      ctx.translate(px, py);

      // Belt dimensions
      const beltWidth = gridSize * 0.375;
      const halfBelt = beltWidth / 2;
      const center = gridSize * 0.5;

      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const conveyorColor = window.ComponentColors?.COLORS?.conveyor || '#707070';
      const inactiveColor = '#A0A0A0';  // Grayed out color for inactive branch

      // Check if two sides are opposite
      const areOpposite = (s1, s2) => {
        return (s1 === 'up' && s2 === 'down') || (s1 === 'down' && s2 === 'up') ||
               (s1 === 'left' && s2 === 'right') || (s1 === 'right' && s2 === 'left');
      };

      // Get corner config for curved path between two adjacent sides
      const getCornerConfig = (from, to) => {
        const configs = {
          'up-left':    { cx: 0, cy: 0, entryAngle: Math.PI/2, exitAngle: 0 },
          'up-right':   { cx: gridSize, cy: 0, entryAngle: Math.PI/2, exitAngle: Math.PI },
          'down-left':  { cx: 0, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: 0 },
          'down-right': { cx: gridSize, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: Math.PI },
          'left-up':    { cx: 0, cy: 0, entryAngle: 0, exitAngle: Math.PI/2 },
          'left-down':  { cx: 0, cy: gridSize, entryAngle: 0, exitAngle: -Math.PI/2 },
          'right-up':   { cx: gridSize, cy: 0, entryAngle: Math.PI, exitAngle: Math.PI/2 },
          'right-down': { cx: gridSize, cy: gridSize, entryAngle: Math.PI, exitAngle: -Math.PI/2 }
        };
        return configs[`${from}-${to}`];
      };

      const lineWidth = 4;
      const halfLine = lineWidth / 2;

      // Helper to create stroke and fill path geometries
      const createPathGeometries = (fromSide, toSide) => {
        if (areOpposite(fromSide, toSide)) {
          const isHorizontal = fromSide === 'left' || fromSide === 'right';
          return {
            stroke: (ctx) => {
              if (isHorizontal) {
                ctx.rect(0, center - halfBelt, gridSize, beltWidth);
              } else {
                ctx.rect(center - halfBelt, 0, beltWidth, gridSize);
              }
            },
            fill: (ctx) => {
              if (isHorizontal) {
                ctx.rect(0, center - halfBelt + halfLine, gridSize, beltWidth - lineWidth);
              } else {
                ctx.rect(center - halfBelt + halfLine, 0, beltWidth - lineWidth, gridSize);
              }
            }
          };
        } else {
          const config = getCornerConfig(fromSide, toSide);
          if (!config) return null;

          const innerRadius = center - halfBelt;
          const outerRadius = center + halfBelt;

          let angleDiff = config.exitAngle - config.entryAngle;
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
          const anticlockwise = angleDiff < 0;

          return {
            stroke: (ctx) => {
              ctx.arc(config.cx, config.cy, outerRadius, config.entryAngle, config.exitAngle, anticlockwise);
              ctx.arc(config.cx, config.cy, innerRadius, config.exitAngle, config.entryAngle, !anticlockwise);
              ctx.closePath();
            },
            fill: (ctx) => {
              ctx.arc(config.cx, config.cy, outerRadius - halfLine, config.entryAngle, config.exitAngle, anticlockwise);
              ctx.arc(config.cx, config.cy, innerRadius + halfLine, config.exitAngle, config.entryAngle, !anticlockwise);
              ctx.closePath();
            }
          };
        }
      };

      // Create path geometries for both outputs
      const firstNPath = createPathGeometries(inputSide, firstNSide);
      const restPath = createPathGeometries(inputSide, restSide);

      // First pass: stroke both paths
      ctx.strokeStyle = "#000";
      ctx.lineWidth = lineWidth;
      if (restPath) {
        ctx.beginPath();
        restPath.stroke(ctx);
        ctx.stroke();
      }
      if (firstNPath) {
        ctx.beginPath();
        firstNPath.stroke(ctx);
        ctx.stroke();
      }

      // Second pass: fill both paths with active/inactive colors
      // Rest path (inactive when firstN is active)
      if (restPath) {
        ctx.globalAlpha = firstNActive ? 0.4 : 1.0;
        ctx.fillStyle = conveyorColor;
        ctx.beginPath();
        restPath.fill(ctx);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
      // FirstN path (active when count < n)
      if (firstNPath) {
        ctx.globalAlpha = firstNActive ? 1.0 : 0.4;
        ctx.fillStyle = conveyorColor;
        ctx.beginPath();
        firstNPath.fill(ctx);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }

      // Draw N label on the firstN output belt
      const getLabelPosition = (fromSide, toSide) => {
        if (areOpposite(fromSide, toSide)) {
          // Straight path: position at 75% towards exit
          const positions = {
            'right': { x: gridSize * 0.75, y: center },
            'down': { x: center, y: gridSize * 0.75 },
            'left': { x: gridSize * 0.25, y: center },
            'up': { x: center, y: gridSize * 0.25 }
          };
          return positions[toSide];
        } else {
          // Curved path: position at 75% along arc
          const config = getCornerConfig(fromSide, toSide);
          if (!config) return { x: center, y: center };

          const edgeCenters = {
            'up': { x: center, y: 0 },
            'down': { x: center, y: gridSize },
            'left': { x: 0, y: center },
            'right': { x: gridSize, y: center }
          };

          const entryEdge = edgeCenters[fromSide];
          const exitEdge = edgeCenters[toSide];

          const ballEntryAngle = Math.atan2(entryEdge.y - config.cy, entryEdge.x - config.cx);
          const ballExitAngle = Math.atan2(exitEdge.y - config.cy, exitEdge.x - config.cx);

          let journeyDiff = ballExitAngle - ballEntryAngle;
          while (journeyDiff > Math.PI) journeyDiff -= 2 * Math.PI;
          while (journeyDiff < -Math.PI) journeyDiff += 2 * Math.PI;

          const labelAngle = ballEntryAngle + journeyDiff * 0.75;

          return {
            x: config.cx + center * Math.cos(labelAngle),
            y: config.cy + center * Math.sin(labelAngle)
          };
        }
      };

      // Draw N on the firstN output path
      const labelPos = getLabelPosition(inputSide, firstNSide);
      ctx.fillStyle = "#000";
      ctx.font = `bold ${gridSize * 0.25}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), labelPos.x, labelPos.y);

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
    icon: "⇥",
    category: "Processing",
    hotkey: "w",
    defaultParams: {
      n: 1,
      inputSide: 'up',
      firstNOutputSide: 'left',
      restOutputSide: 'right',
      plex: false,
      speed: 1.0
    }
  },

  // Rotation configurations (24 total, same as filter)
  rotationConfigs: [
    // === INPUT: UP (6 configs) ===
    {inputSide: 'up', firstNOutputSide: 'left', restOutputSide: 'right'},
    {inputSide: 'up', firstNOutputSide: 'right', restOutputSide: 'left'},
    {inputSide: 'up', firstNOutputSide: 'left', restOutputSide: 'down'},
    {inputSide: 'up', firstNOutputSide: 'down', restOutputSide: 'left'},
    {inputSide: 'up', firstNOutputSide: 'right', restOutputSide: 'down'},
    {inputSide: 'up', firstNOutputSide: 'down', restOutputSide: 'right'},

    // === INPUT: RIGHT (6 configs) ===
    {inputSide: 'right', firstNOutputSide: 'up', restOutputSide: 'down'},
    {inputSide: 'right', firstNOutputSide: 'down', restOutputSide: 'up'},
    {inputSide: 'right', firstNOutputSide: 'up', restOutputSide: 'left'},
    {inputSide: 'right', firstNOutputSide: 'left', restOutputSide: 'up'},
    {inputSide: 'right', firstNOutputSide: 'down', restOutputSide: 'left'},
    {inputSide: 'right', firstNOutputSide: 'left', restOutputSide: 'down'},

    // === INPUT: DOWN (6 configs) ===
    {inputSide: 'down', firstNOutputSide: 'left', restOutputSide: 'right'},
    {inputSide: 'down', firstNOutputSide: 'right', restOutputSide: 'left'},
    {inputSide: 'down', firstNOutputSide: 'left', restOutputSide: 'up'},
    {inputSide: 'down', firstNOutputSide: 'up', restOutputSide: 'left'},
    {inputSide: 'down', firstNOutputSide: 'right', restOutputSide: 'up'},
    {inputSide: 'down', firstNOutputSide: 'up', restOutputSide: 'right'},

    // === INPUT: LEFT (6 configs) ===
    {inputSide: 'left', firstNOutputSide: 'up', restOutputSide: 'down'},
    {inputSide: 'left', firstNOutputSide: 'down', restOutputSide: 'up'},
    {inputSide: 'left', firstNOutputSide: 'up', restOutputSide: 'right'},
    {inputSide: 'left', firstNOutputSide: 'right', restOutputSide: 'up'},
    {inputSide: 'left', firstNOutputSide: 'down', restOutputSide: 'right'},
    {inputSide: 'left', firstNOutputSide: 'right', restOutputSide: 'down'}
  ],

  // Get next rotation configuration
  getNextRotation(currentParams) {
    let currentIndex = this.rotationConfigs.findIndex(config =>
      config.inputSide === currentParams.inputSide &&
      config.firstNOutputSide === currentParams.firstNOutputSide &&
      config.restOutputSide === currentParams.restOutputSide
    );

    if (currentIndex === -1) currentIndex = 0;

    const nextIndex = (currentIndex + 1) % this.rotationConfigs.length;
    return this.rotationConfigs[nextIndex];
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(SwitchSpec);
}
