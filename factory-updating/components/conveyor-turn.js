/**
 * Conveyor Turn Component - 90-degree turn
 *
 * Rotates ball path by 90 degrees
 */

const ConveyorTurnSpec = {
  type: "conveyor-turn",
  displayName: "Conveyor Turn",

  isObservable: true,

  ports: {
    inputs: [
      {id: "input", direction: null, offset: {x: 0, y: 0.5}, required: false}
    ],
    outputs: [
      {id: "output", direction: null, offset: {x: 1, y: 0.5}, required: false}
    ]
  },

  states: {
    traveling: {
      /**
       * Get trajectory for ball traveling through turn (curved arc)
       */
      getTrajectory(ball, component, startTime) {
        const turn = component.params.turn || "right-to-down";
        const pos = component.position;
        const speed = component.params.speed || 1.0;

        // Get corner position and arc parameters for this turn type
        const turnConfigs = {
          "right-to-down": { cx: pos.x, cy: pos.y + 1, entryAngle: -Math.PI/2, exitAngle: 0 },
          "right-to-up": { cx: pos.x, cy: pos.y, entryAngle: Math.PI/2, exitAngle: 0 },
          "left-to-down": { cx: pos.x + 1, cy: pos.y + 1, entryAngle: -Math.PI/2, exitAngle: Math.PI },
          "left-to-up": { cx: pos.x + 1, cy: pos.y, entryAngle: Math.PI/2, exitAngle: Math.PI },
          "down-to-right": { cx: pos.x + 1, cy: pos.y, entryAngle: Math.PI, exitAngle: Math.PI/2 },
          "down-to-left": { cx: pos.x, cy: pos.y, entryAngle: 0, exitAngle: Math.PI/2 },
          "up-to-right": { cx: pos.x + 1, cy: pos.y + 1, entryAngle: Math.PI, exitAngle: -Math.PI/2 },
          "up-to-left": { cx: pos.x, cy: pos.y + 1, entryAngle: 0, exitAngle: -Math.PI/2 }
        };

        const config = turnConfigs[turn];
        const radius = 0.5; // Arc radius in grid units

        // Create curved trajectory function
        const curvedPath = (progress) => {
          // Interpolate angle from entry to exit (handling wrap-around)
          let angleDiff = config.exitAngle - config.entryAngle;
          while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
          while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

          const currentAngle = config.entryAngle + angleDiff * progress;
          return {
            x: config.cx + radius * Math.cos(currentAngle),
            y: config.cy + radius * Math.sin(currentAngle)
          };
        };

        // Arc length for 90 degrees = π/2 * radius
        const arcLength = (Math.PI / 2) * radius;
        const duration = (arcLength / speed) * 1000; // Convert to ms

        return {
          path: curvedPath,
          duration: duration,
          waypoints: [curvedPath(0), curvedPath(0.5), curvedPath(1)]
        };
      },

      getEntryPosition(component) {
        const pos = component.position;
        const turn = component.params.turn; // "right-to-down", "right-to-up", etc.

        switch (turn) {
          case "right-to-down": return {x: pos.x, y: pos.y + 0.5};
          case "right-to-up": return {x: pos.x, y: pos.y + 0.5};
          case "left-to-down": return {x: pos.x + 1, y: pos.y + 0.5};
          case "left-to-up": return {x: pos.x + 1, y: pos.y + 0.5};
          case "down-to-right": return {x: pos.x + 0.5, y: pos.y};
          case "down-to-left": return {x: pos.x + 0.5, y: pos.y};
          case "up-to-right": return {x: pos.x + 0.5, y: pos.y + 1};
          case "up-to-left": return {x: pos.x + 0.5, y: pos.y + 1};
          default: return {x: pos.x, y: pos.y + 0.5};
        }
      },

      getExitPosition(component) {
        const pos = component.position;
        const turn = component.params.turn;

        switch (turn) {
          case "right-to-down": return {x: pos.x + 0.5, y: pos.y + 1};
          case "right-to-up": return {x: pos.x + 0.5, y: pos.y};
          case "left-to-down": return {x: pos.x + 0.5, y: pos.y + 1};
          case "left-to-up": return {x: pos.x + 0.5, y: pos.y};
          case "down-to-right": return {x: pos.x + 1, y: pos.y + 0.5};
          case "down-to-left": return {x: pos.x, y: pos.y + 0.5};
          case "up-to-right": return {x: pos.x + 1, y: pos.y + 0.5};
          case "up-to-left": return {x: pos.x, y: pos.y + 0.5};
          default: return {x: pos.x + 1, y: pos.y + 0.5};
        }
      },

      getCornerPosition(component) {
        const pos = component.position;
        const turn = component.params.turn;

        // Corner is where the turn happens
        switch (turn) {
          case "right-to-down": return {x: pos.x + 0.5, y: pos.y + 0.5};
          case "right-to-up": return {x: pos.x + 0.5, y: pos.y + 0.5};
          case "left-to-down": return {x: pos.x + 0.5, y: pos.y + 0.5};
          case "left-to-up": return {x: pos.x + 0.5, y: pos.y + 0.5};
          case "down-to-right": return {x: pos.x + 0.5, y: pos.y + 0.5};
          case "down-to-left": return {x: pos.x + 0.5, y: pos.y + 0.5};
          case "up-to-right": return {x: pos.x + 0.5, y: pos.y + 0.5};
          case "up-to-left": return {x: pos.x + 0.5, y: pos.y + 0.5};
          default: return {x: pos.x + 0.5, y: pos.y + 0.5};
        }
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
     * Ball arrives at turn - start traveling
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Validate ball entry direction matches turn's expected entry side
      const turn = component.params.turn;
      const expectedEntry = this.getExpectedEntryDirection(turn);

      if (ball.inputDirection && ball.inputDirection !== expectedEntry) {
        console.warn(
          `Warning: Ball ${ball.id} entering turn ${component.id} (${turn}) from ${ball.inputDirection}, ` +
          `but turn expects entry from ${expectedEntry}. This may cause visual issues.`
        );
      }

      // Set trajectory BEFORE changing state to prevent renderer from seeing ball with no trajectory
      const trajectory = spec.states.traveling.getTrajectory(ball, component, time);
      ball.trajectory = trajectory.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectory.duration;
      ball.trajectoryWaypoints = trajectory.waypoints;

      // Now safe to change state
      ball.componentState = "traveling";

      // Observe ball upon entry if turn is observable (no plex glass)
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }
    },

    /**
     * Helper: Get expected entry direction for a turn type
     */
    getExpectedEntryDirection(turn) {
      // Turn naming: "X-to-Y" means ball is traveling in X direction, turns to go in Y direction
      // So "right-to-down" = traveling right (enters from left), turns to go down
      const entryMap = {
        'right-to-down': 'left',   // Ball traveling right (from left), turns down
        'right-to-up': 'left',     // Ball traveling right (from left), turns up
        'left-to-down': 'right',   // Ball traveling left (from right), turns down
        'left-to-up': 'right',     // Ball traveling left (from right), turns up
        'down-to-right': 'up',     // Ball traveling down (from up), turns right
        'down-to-left': 'up',      // Ball traveling down (from up), turns left
        'up-to-right': 'down',     // Ball traveling up (from down), turns right
        'up-to-left': 'down'       // Ball traveling up (from down), turns left
      };
      return entryMap[turn] || 'unknown';
    }
  },

  // For Bayesian inference
  inference: {
    /**
     * Turn is identity function
     */
    getPossibleInputs(output) {
      return [{inputs: output, probability: 1.0}];
    }
  },

  // Visual rendering
  visual: {
    imagePath: "../images/turn_{turn}.png",
    size: {width: 64, height: 64},

    render(ctx, component) {
      const pos = component.position;
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }
      const px = pos.x * gridSize;
      const py = pos.y * gridSize;
      const turn = component.params.turn || "right-to-down";

      const conveyorColor = window.ComponentColors?.COLORS?.conveyor || "#707070";

      ctx.save();
      ctx.translate(px, py);

      // Belt dimensions
      const beltWidth = gridSize * 0.375;
      const halfBelt = beltWidth / 2;
      const centerX = gridSize * 0.5;

      // Corner configs with entry/exit angles and travel direction for arrow
      // Travel direction: average of entry and exit directions (in degrees for the arrow)
      const cornerConfigs = {
        "right-to-down": { cx: 0, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: 0, travelDir: Math.PI/4 },
        "right-to-up": { cx: 0, cy: 0, entryAngle: Math.PI/2, exitAngle: 0, travelDir: -Math.PI/4 },
        "left-to-down": { cx: gridSize, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: Math.PI, travelDir: 3*Math.PI/4 },
        "left-to-up": { cx: gridSize, cy: 0, entryAngle: Math.PI/2, exitAngle: Math.PI, travelDir: -3*Math.PI/4 },
        "down-to-right": { cx: gridSize, cy: 0, entryAngle: Math.PI, exitAngle: Math.PI/2, travelDir: Math.PI/4 },
        "down-to-left": { cx: 0, cy: 0, entryAngle: 0, exitAngle: Math.PI/2, travelDir: 3*Math.PI/4 },
        "up-to-right": { cx: gridSize, cy: gridSize, entryAngle: Math.PI, exitAngle: -Math.PI/2, travelDir: -Math.PI/4 },
        "up-to-left": { cx: 0, cy: gridSize, entryAngle: 0, exitAngle: -Math.PI/2, travelDir: -3*Math.PI/4 }
      };

      const config = cornerConfigs[turn];
      const innerRadius = centerX - halfBelt;
      const outerRadius = centerX + halfBelt;

      // Determine arc direction (need short 90° arc, not long 270°)
      let angleDiff = config.exitAngle - config.entryAngle;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
      const anticlockwise = angleDiff < 0;

      // Draw the curved belt as a filled arc band
      ctx.fillStyle = conveyorColor;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      // Outer arc from entry to exit
      ctx.arc(config.cx, config.cy, outerRadius, config.entryAngle, config.exitAngle, anticlockwise);
      // Inner arc from exit back to entry
      ctx.arc(config.cx, config.cy, innerRadius, config.exitAngle, config.entryAngle, !anticlockwise);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Draw directional arrow at midpoint of arc
      const midAngle = config.entryAngle + angleDiff / 2;
      const arrowRadius = centerX;  // Center of belt width
      const arrowX = config.cx + arrowRadius * Math.cos(midAngle);
      const arrowY = config.cy + arrowRadius * Math.sin(midAngle);

      const drawArrow = window.ComponentColors?.drawArrow;
      if (drawArrow) {
        drawArrow(ctx, arrowX, arrowY, config.travelDir, gridSize * 0.15);
      }

      ctx.restore();
    }
  },

  // Level editor metadata
  editor: {
    icon: "↪",
    category: "Transport",
    defaultParams: {
      turn: "right-to-down",
      speed: 1.0,
      plex: false
    }
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(ConveyorTurnSpec);
}
