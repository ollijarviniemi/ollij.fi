/**
 * Merger Component
 *
 * Merges two or three input conveyors into one output
 * Works like a Y-junction belt - balls pass through smoothly
 */

const MergerSpec = {
  type: "merger",
  name: "Merger",
  description: "Merges two or three input conveyors into one output",

  // Ports (input/output positions)
  ports: {
    inputs: [
      {id: "input1", direction: null, offset: {x: 0.5, y: 0}, required: true},
      {id: "input2", direction: null, offset: {x: 0.5, y: 1}, required: true}
    ],
    outputs: [
      {id: "output", direction: null, offset: {x: 1, y: 0.5}, required: false}
    ]
  },

  // Parameters
  defaultParams: {
    direction: 'right',  // Output direction
    input1Side: 'up',    // First input side
    input2Side: 'down',  // Second input side (supports adjacent or opposite)
    input3Side: null,    // Third input side (optional, for 3-input mergers)
    plex: false,
    speed: 1.0           // Speed multiplier for ball traversal
  },

  // Component states
  states: {
    traveling: {
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
     * Get input and output positions based on configurable input sides
     */
    getPositions(component) {
      const pos = component.position;
      const direction = component.params.direction;
      const input1Side = component.params.input1Side;
      const input2Side = component.params.input2Side;
      const input3Side = component.params.input3Side;

      // Map sides to positions
      const sideToPos = {
        'up': {x: pos.x + 0.5, y: pos.y},
        'down': {x: pos.x + 0.5, y: pos.y + 1},
        'left': {x: pos.x, y: pos.y + 0.5},
        'right': {x: pos.x + 1, y: pos.y + 0.5}
      };

      // Map direction to output position
      const dirToOutput = {
        'right': {x: pos.x + 1, y: pos.y + 0.5},
        'down': {x: pos.x + 0.5, y: pos.y + 1},
        'left': {x: pos.x, y: pos.y + 0.5},
        'up': {x: pos.x + 0.5, y: pos.y}
      };

      const result = {
        input1: sideToPos[input1Side],
        input2: sideToPos[input2Side],
        center: {x: pos.x + 0.5, y: pos.y + 0.5},
        exit: dirToOutput[direction]
      };

      // Add input3 if present
      if (input3Side) {
        result.input3 = sideToPos[input3Side];
      }

      return result;
    }
  },

  // State transitions
  transitions: {
    /**
     * Ball arrives at merger input
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Observe ball upon entry if no plex glass
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }

      // Validate the ball is coming from a valid input direction
      const input1Side = component.params.input1Side;
      const input2Side = component.params.input2Side;
      const input3Side = component.params.input3Side;
      const inputSide = ball.inputDirection;

      const validInputs = [input1Side, input2Side];
      if (input3Side) validInputs.push(input3Side);

      if (!validInputs.includes(inputSide)) {
        const inputsList = validInputs.join(', ');
        throw new Error(
          `Ball ${ball.id} entering merger ${component.id} from ${inputSide}, ` +
          `but merger inputs are ${inputsList}`
        );
      }

      // Create trajectory that follows the belt shape (curved for 90° turns, straight for opposite sides)
      const speed = component.params.speed;
      const outputSide = component.params.direction;

      const { trajectory, length } = createFilterMergerTrajectory(
        component.position,
        inputSide,
        outputSide
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

    },

    /**
     * Ball completes trajectory - transfer to next component
     */
    onTrajectoryComplete(ball, component) {

      // Clear trajectory before transfer to prevent repeated completion if transfer fails
      ball.trajectory = null;

      // Transfer to next component
      if (typeof window !== 'undefined' && window.transferBallHelper) {
        window.transferBallHelper(component, ball, component.simulation);
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

      const input1Side = component.params.input1Side;
      const input2Side = component.params.input2Side;
      const input3Side = component.params.input3Side;
      const outputSide = component.params.direction;

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

      // Collect all path geometries
      const paths = [
        createPathGeometries(input1Side, outputSide),
        createPathGeometries(input2Side, outputSide)
      ];
      if (input3Side) {
        paths.push(createPathGeometries(input3Side, outputSide));
      }

      // First pass: stroke all paths
      ctx.strokeStyle = "#000";
      ctx.lineWidth = lineWidth;
      paths.forEach(path => {
        if (path) {
          ctx.beginPath();
          path.stroke(ctx);
          ctx.stroke();
        }
      });

      // Second pass: fill all paths (inset to preserve outer strokes, covers internal strokes)
      ctx.fillStyle = conveyorColor;
      paths.forEach(path => {
        if (path) {
          ctx.beginPath();
          path.fill(ctx);
          ctx.fill();
        }
      });

      // Draw direction arrow pointing towards output (positioned closer to exit)
      const drawArrow = window.ComponentColors?.drawArrow;
      const angles = window.ComponentColors?.DIRECTION_ANGLES;
      if (drawArrow && angles) {
        // Position arrow 75% of the way towards output
        const arrowPositions = {
          'right': { x: gridSize * 0.75, y: center },
          'down': { x: center, y: gridSize * 0.75 },
          'left': { x: gridSize * 0.25, y: center },
          'up': { x: center, y: gridSize * 0.25 }
        };
        const arrowPos = arrowPositions[outputSide];
        drawArrow(ctx, arrowPos.x, arrowPos.y, angles[outputSide], gridSize * 0.15);
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
    icon: "⊳",
    category: "Processing",
    defaultParams: {
      direction: 'right',
      input1Side: 'up',
      input2Side: 'down',
      input3Side: null,
      plex: false,
      speed: 1.0
    }
  },

  // Rotation configurations (16 total: 4 opposite + 8 adjacent + 4 three-input)
  rotationConfigs: [
    // Opposite inputs (4 rotations of up+down->right)
    {input1Side: 'up', input2Side: 'down', direction: 'right'},      // 0
    {input1Side: 'right', input2Side: 'left', direction: 'down'},    // 1
    {input1Side: 'down', input2Side: 'up', direction: 'left'},       // 2
    {input1Side: 'left', input2Side: 'right', direction: 'up'},      // 3

    // Adjacent inputs (2-input)
    {input1Side: 'up', input2Side: 'left', direction: 'right'},      // 4
    {input1Side: 'up', input2Side: 'left', direction: 'down'},       // 5
    {input1Side: 'right', input2Side: 'up', direction: 'down'},      // 6
    {input1Side: 'right', input2Side: 'up', direction: 'left'},      // 7
    {input1Side: 'down', input2Side: 'right', direction: 'left'},    // 8
    {input1Side: 'down', input2Side: 'right', direction: 'up'},      // 9
    {input1Side: 'left', input2Side: 'down', direction: 'up'},       // 10
    {input1Side: 'left', input2Side: 'down', direction: 'right'},    // 11

    // Three inputs (U-shaped)
    {input1Side: 'up', input2Side: 'left', input3Side: 'down', direction: 'right'},   // 12
    {input1Side: 'right', input2Side: 'up', input3Side: 'left', direction: 'down'},   // 13
    {input1Side: 'down', input2Side: 'right', input3Side: 'up', direction: 'left'},   // 14
    {input1Side: 'left', input2Side: 'down', input3Side: 'right', direction: 'up'}    // 15
  ],

  // Get next rotation configuration
  getNextRotation(currentParams) {
    // Normalize input3Side to null if undefined for consistent comparison
    const normalizedCurrent = currentParams.input3Side === undefined ? null : currentParams.input3Side;

    // Find current configuration index
    let currentIndex = this.rotationConfigs.findIndex(config => {
      const normalizedConfig = config.input3Side === undefined ? null : config.input3Side;
      return config.input1Side === currentParams.input1Side &&
             config.input2Side === currentParams.input2Side &&
             normalizedConfig === normalizedCurrent &&
             config.direction === currentParams.direction;
    });

    // If not found, start at 0
    if (currentIndex === -1) {
      console.log('Merger rotation: current config not found, starting at 0. Current params:', currentParams);
      currentIndex = 0;
    }

    // Get next configuration (cycle back to 0 after last)
    const nextIndex = (currentIndex + 1) % this.rotationConfigs.length;
    console.log(`Merger rotation: ${currentIndex} -> ${nextIndex}`, this.rotationConfigs[nextIndex]);
    return {...this.rotationConfigs[nextIndex]};  // Return copy to avoid mutation
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(MergerSpec);
}
