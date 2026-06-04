/**
 * Filter Component
 *
 * Routes balls by color to different outputs (pass-through, no buffering)
 * - Matching color → match output
 * - Non-matching color → non-match output
 */

const FilterSpec = {
  type: "filter",
  name: "Filter",
  description: "Routes balls by color to different outputs",

  // Ports (input/output positions)
  ports: {
    inputs: [
      {id: "input", direction: null, offset: {x: 0.5, y: 0}, required: true}
    ],
    outputs: [
      {id: "match", direction: null, offset: {x: 0, y: 0.5}, required: false},
      {id: "nonmatch", direction: null, offset: {x: 1, y: 0.5}, required: false}
    ]
  },

  // Parameters
  defaultParams: {
    targetColor: 'red',  // Color to filter for
    inputSide: 'up',     // Input side
    matchOutputSide: 'left',    // Output side for matching color balls
    nonMatchOutputSide: 'right', // Output side for non-matching color balls
    plex: false,
    speed: 1.0
  },

  // Component states
  states: {
    traveling: {
      /**
       * Recreate trajectory for ball traveling through filter
       * Uses ball.filterOutputSide to determine which exit path
       */
      getTrajectory(ball, component, startTime) {
        const inputSide = component.params.inputSide;
        const exitSide = ball.filterOutputSide;

        if (!exitSide) {
          throw new Error(`Filter ${component.id}: ball ${ball.id} has no filterOutputSide set`);
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
      const matchSide = component.params.matchOutputSide;
      const nonMatchSide = component.params.nonMatchOutputSide;

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
        matchExit: sideToPos[matchSide],
        nonMatchExit: sideToPos[nonMatchSide]
      };
    }
  },

  // State transitions
  transitions: {
    /**
     * Ball arrives at filter input
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Validate required parameters
      if (!component.params.inputSide || !component.params.matchOutputSide || !component.params.nonMatchOutputSide) {
        throw new Error(
          `Filter ${component.id} missing required parameters! ` +
          `inputSide=${component.params.inputSide}, ` +
          `matchOutputSide=${component.params.matchOutputSide}, ` +
          `nonMatchOutputSide=${component.params.nonMatchOutputSide}`
        );
      }

      const positions = spec.behavior.getPositions(component);

      // Determine which output based on ball color
      const matches = ball.color === component.params.targetColor;
      const exitPos = matches ? positions.matchExit : positions.nonMatchExit;
      const exitSide = matches ? component.params.matchOutputSide : component.params.nonMatchOutputSide;

      // Update Bayesian tracker based on filter result
      if (component.simulation && component.simulation.bayesianTracker) {
        if (!component.params.plex) {
          // No plex glass - we can see the ball's actual color directly
          component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
        } else {
          // Plex glass - we learn from the filter's behavior
          if (matches) {
            // Ball went through match output - we know its exact color (the target color)
            component.simulation.bayesianTracker.onObservation(ball.id, component.params.targetColor);
          } else {
            // Ball went through non-match output - we know it's NOT the target color
            component.simulation.bayesianTracker.onFilterExclusion(ball.id, component.params.targetColor);
          }
        }
      }

      // Create trajectory that follows the belt shape (curved for 90° turns, straight for opposite sides)
      const speed = component.params.speed;
      const inputSide = component.params.inputSide;

      const { trajectory, length } = createFilterMergerTrajectory(
        component.position,
        inputSide,
        exitSide
      );

      const duration = (length / speed) * 1000;  // Convert to milliseconds

      const trajectoryData = {
        path: trajectory,
        duration: duration
      };

      // Set trajectory BEFORE changing state to prevent renderer from seeing ball with no trajectory
      ball.trajectory = trajectoryData.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectoryData.duration;

      // Now safe to change state
      ball.componentState = "traveling";

      // Store which output for transfer logic ON THE BALL (not component, to avoid overwrites)
      ball.filterOutputSide = exitSide;

    },

    /**
     * Ball completes trajectory - transfer to next component
     */
    onTrajectoryComplete(ball, component) {
      // Check if already processed (idempotent - handle multiple calls)
      if (!ball.filterOutputSide) {
        return;
      }

      const outputSide = ball.filterOutputSide;

      // Clean up BEFORE transfer to mark as processed
      delete ball.filterOutputSide;
      // Note: Don't clear trajectory here - prevents rendering errors between
      // completion and transfer. Will be replaced by next component's onArrival.


      // Find connection in the specified absolute direction
      const simulation = component.simulation;
      if (!simulation) {
        console.error(`Filter ${component.id}: no simulation reference`);
        return;
      }

      const allConnections = simulation.level.connections.filter(c => c.from === component.id);

      // Find connection where target is in the specified direction
      const connection = allConnections.find(conn => {
        const target = simulation.componentsById.get(conn.to);
        if (!target) return false;

        // Match based on absolute direction
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
        console.warn(`Filter ${component.id}: No connection found in direction ${outputSide}`);
        return;
      }

      const nextComponent = simulation.componentsById.get(connection.to);
      if (!nextComponent) {
        console.error(`Filter ${component.id}: Next component ${connection.to} not found`);
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
      const matchSide = component.params.matchOutputSide;
      const nonMatchSide = component.params.nonMatchOutputSide;
      const targetColor = component.params.targetColor;

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
      const getHex = window.BallColors?.getHex || (c => c);

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
      // Fill is inset by half line width so outer stroke remains fully visible
      const createPathGeometries = (fromSide, toSide) => {
        if (areOpposite(fromSide, toSide)) {
          // Straight belt across center
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
              // Inset by halfLine on the outer (long) edges only
              if (isHorizontal) {
                ctx.rect(0, center - halfBelt + halfLine, gridSize, beltWidth - lineWidth);
              } else {
                ctx.rect(center - halfBelt + halfLine, 0, beltWidth - lineWidth, gridSize);
              }
            }
          };
        } else {
          // Curved 90° arc
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
              // Inset outer radius by halfLine so outer stroke stays visible
              ctx.arc(config.cx, config.cy, outerRadius - halfLine, config.entryAngle, config.exitAngle, anticlockwise);
              ctx.arc(config.cx, config.cy, innerRadius + halfLine, config.exitAngle, config.entryAngle, !anticlockwise);
              ctx.closePath();
            }
          };
        }
      };

      // Create path geometries for both outputs
      const matchPath = createPathGeometries(inputSide, matchSide);
      const nonMatchPath = createPathGeometries(inputSide, nonMatchSide);

      // First pass: stroke both paths
      ctx.strokeStyle = "#000";
      ctx.lineWidth = lineWidth;
      if (nonMatchPath) {
        ctx.beginPath();
        nonMatchPath.stroke(ctx);
        ctx.stroke();
      }
      if (matchPath) {
        ctx.beginPath();
        matchPath.stroke(ctx);
        ctx.stroke();
      }

      // Second pass: fill both paths (inset to preserve outer strokes, covers internal strokes)
      if (nonMatchPath) {
        ctx.fillStyle = conveyorColor;
        ctx.beginPath();
        nonMatchPath.fill(ctx);
        ctx.fill();
      }
      if (matchPath) {
        ctx.fillStyle = getHex(targetColor);
        ctx.beginPath();
        matchPath.fill(ctx);
        ctx.fill();
      }

      // Draw colorblind marker on the match (colored) path, before the arrow
      if (window.BallColors?.colorblindMode && matchPath) {
        let mx, my;
        if (areOpposite(inputSide, matchSide)) {
          // Straight path: 50% from entry to exit (center of cell)
          const straight = {
            'right': { x: center, y: center },
            'down':  { x: center, y: center },
            'left':  { x: center, y: center },
            'up':    { x: center, y: center }
          };
          const sp = straight[matchSide] || { x: center, y: center };
          mx = sp.x; my = sp.y;
        } else {
          // Curved path: position at 40% along the arc
          const config = getCornerConfig(inputSide, matchSide);
          if (config) {
            let arcSpan = config.exitAngle - config.entryAngle;
            while (arcSpan > Math.PI) arcSpan -= 2 * Math.PI;
            while (arcSpan < -Math.PI) arcSpan += 2 * Math.PI;
            const markerAngle = config.entryAngle + arcSpan * 0.5;
            mx = config.cx + center * Math.cos(markerAngle);
            my = config.cy + center * Math.sin(markerAngle);
          } else {
            mx = center; my = center;
          }
        }
        const markerRadius = halfBelt * 0.5;
        window.BallColors.drawMarker(ctx, mx, my, markerRadius, targetColor);
      }

      // Draw direction arrows for both outputs (positioned closer to exits)
      const drawArrow = window.ComponentColors?.drawArrow;
      const angles = window.ComponentColors?.DIRECTION_ANGLES;
      if (drawArrow && angles) {
        // Helper to get arrow position and angle for a path (positioned 75% towards exit)
        const getArrowParams = (fromSide, toSide) => {
          if (areOpposite(fromSide, toSide)) {
            // Straight path: arrow 75% towards exit, pointing in output direction
            const exitPositions = {
              'right': { x: gridSize * 0.75, y: center },
              'down': { x: center, y: gridSize * 0.75 },
              'left': { x: gridSize * 0.25, y: center },
              'up': { x: center, y: gridSize * 0.25 }
            };
            return { ...exitPositions[toSide], angle: angles[toSide] };
          } else {
            // Curved path: compute ball's actual entry/exit angles from corner
            const config = getCornerConfig(fromSide, toSide);
            if (!config) return null;

            // Get radial angle from corner to center of each edge
            const edgeCenters = {
              'up': { x: center, y: 0 },
              'down': { x: center, y: gridSize },
              'left': { x: 0, y: center },
              'right': { x: gridSize, y: center }
            };

            const entryEdge = edgeCenters[fromSide];
            const exitEdge = edgeCenters[toSide];

            // Ball's entry and exit angles (from corner to edge intersection)
            const ballEntryAngle = Math.atan2(entryEdge.y - config.cy, entryEdge.x - config.cx);
            const ballExitAngle = Math.atan2(exitEdge.y - config.cy, exitEdge.x - config.cx);

            // Compute angular travel from entry to exit
            let journeyDiff = ballExitAngle - ballEntryAngle;
            while (journeyDiff > Math.PI) journeyDiff -= 2 * Math.PI;
            while (journeyDiff < -Math.PI) journeyDiff += 2 * Math.PI;

            // Position at 75% along the arc (closer to exit)
            const arrowAngle = ballEntryAngle + journeyDiff * 0.75;

            // Travel direction is tangent to arc in direction of motion
            const travelAngle = arrowAngle + (journeyDiff > 0 ? Math.PI/2 : -Math.PI/2);

            return {
              x: config.cx + center * Math.cos(arrowAngle),
              y: config.cy + center * Math.sin(arrowAngle),
              angle: travelAngle
            };
          }
        };

        // Draw arrow for match path
        const matchArrow = getArrowParams(inputSide, matchSide);
        if (matchArrow) {
          drawArrow(ctx, matchArrow.x, matchArrow.y, matchArrow.angle, gridSize * 0.12);
        }

        // Draw arrow for non-match path
        const nonMatchArrow = getArrowParams(inputSide, nonMatchSide);
        if (nonMatchArrow) {
          drawArrow(ctx, nonMatchArrow.x, nonMatchArrow.y, nonMatchArrow.angle, gridSize * 0.12);
        }
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
    icon: "⊲",
    category: "Processing",
    defaultParams: {
      targetColor: 'red',
      inputSide: 'up',
      matchOutputSide: 'left',
      nonMatchOutputSide: 'right',
      plex: false,
      speed: 1.0
    }
  },

  // Rotation configurations (24 total)
  // Organized by: (1) input side, (2) output pattern, (3) which output gets colored balls
  rotationConfigs: [
    // === INPUT: UP (6 configs) ===
    // Opposite outputs (left+right)
    {inputSide: 'up', matchOutputSide: 'left', nonMatchOutputSide: 'right'},      // 0
    {inputSide: 'up', matchOutputSide: 'right', nonMatchOutputSide: 'left'},      // 1
    // Adjacent outputs (left+down)
    {inputSide: 'up', matchOutputSide: 'left', nonMatchOutputSide: 'down'},       // 2
    {inputSide: 'up', matchOutputSide: 'down', nonMatchOutputSide: 'left'},       // 3
    // Adjacent outputs (right+down)
    {inputSide: 'up', matchOutputSide: 'right', nonMatchOutputSide: 'down'},      // 4
    {inputSide: 'up', matchOutputSide: 'down', nonMatchOutputSide: 'right'},      // 5

    // === INPUT: RIGHT (6 configs) ===
    // Opposite outputs (up+down)
    {inputSide: 'right', matchOutputSide: 'up', nonMatchOutputSide: 'down'},      // 6
    {inputSide: 'right', matchOutputSide: 'down', nonMatchOutputSide: 'up'},      // 7
    // Adjacent outputs (up+left)
    {inputSide: 'right', matchOutputSide: 'up', nonMatchOutputSide: 'left'},      // 8
    {inputSide: 'right', matchOutputSide: 'left', nonMatchOutputSide: 'up'},      // 9
    // Adjacent outputs (down+left)
    {inputSide: 'right', matchOutputSide: 'down', nonMatchOutputSide: 'left'},    // 10
    {inputSide: 'right', matchOutputSide: 'left', nonMatchOutputSide: 'down'},    // 11

    // === INPUT: DOWN (6 configs) ===
    // Opposite outputs (left+right)
    {inputSide: 'down', matchOutputSide: 'left', nonMatchOutputSide: 'right'},    // 12
    {inputSide: 'down', matchOutputSide: 'right', nonMatchOutputSide: 'left'},    // 13
    // Adjacent outputs (left+up)
    {inputSide: 'down', matchOutputSide: 'left', nonMatchOutputSide: 'up'},       // 14
    {inputSide: 'down', matchOutputSide: 'up', nonMatchOutputSide: 'left'},       // 15
    // Adjacent outputs (right+up)
    {inputSide: 'down', matchOutputSide: 'right', nonMatchOutputSide: 'up'},      // 16
    {inputSide: 'down', matchOutputSide: 'up', nonMatchOutputSide: 'right'},      // 17

    // === INPUT: LEFT (6 configs) ===
    // Opposite outputs (up+down)
    {inputSide: 'left', matchOutputSide: 'up', nonMatchOutputSide: 'down'},       // 18
    {inputSide: 'left', matchOutputSide: 'down', nonMatchOutputSide: 'up'},       // 19
    // Adjacent outputs (up+right)
    {inputSide: 'left', matchOutputSide: 'up', nonMatchOutputSide: 'right'},      // 20
    {inputSide: 'left', matchOutputSide: 'right', nonMatchOutputSide: 'up'},      // 21
    // Adjacent outputs (down+right)
    {inputSide: 'left', matchOutputSide: 'down', nonMatchOutputSide: 'right'},    // 22
    {inputSide: 'left', matchOutputSide: 'right', nonMatchOutputSide: 'down'}     // 23
  ],

  // Get next rotation configuration
  getNextRotation(currentParams) {
    // Find current configuration index
    let currentIndex = this.rotationConfigs.findIndex(config =>
      config.inputSide === currentParams.inputSide &&
      config.matchOutputSide === currentParams.matchOutputSide &&
      config.nonMatchOutputSide === currentParams.nonMatchOutputSide
    );

    // If not found, start at 0
    if (currentIndex === -1) currentIndex = 0;

    // Get next configuration (cycle back to 0 after 23)
    const nextIndex = (currentIndex + 1) % this.rotationConfigs.length;
    return this.rotationConfigs[nextIndex];
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(FilterSpec);
}
