/**
 * Conveyor Component - Ball Transport
 *
 * Transports balls along a straight path
 */

const ConveyorSpec = {
  type: "conveyor",
  displayName: "Conveyor Belt",

  // Observable by default (no plex glass)
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
       * Get trajectory for ball traveling along conveyor
       */
      getTrajectory(ball, component, startTime) {
        const direction = component.params.direction;

        // Entry and exit positions based on direction
        const entry = this.getEntryPosition(component, direction);
        const exit = this.getExitPosition(component, direction);

        // Duration based on distance and speed
        const speed = component.params.speed || 1.0;  // tiles/sec
        const duration = computeTrajectoryDuration([entry, exit], speed);

        return {
          path: createPiecewiseLinearTrajectory([entry, exit]),
          duration: duration,
          waypoints: [entry, exit]
        };
      },

      getEntryPosition(component, direction) {
        const pos = component.position;
        switch (direction) {
          case "right": return {x: pos.x, y: pos.y + 0.5};
          case "left": return {x: pos.x + 1, y: pos.y + 0.5};
          case "down": return {x: pos.x + 0.5, y: pos.y};
          case "up": return {x: pos.x + 0.5, y: pos.y + 1};
          default: return {x: pos.x, y: pos.y + 0.5};
        }
      },

      getExitPosition(component, direction) {
        const pos = component.position;
        switch (direction) {
          case "right": return {x: pos.x + 1, y: pos.y + 0.5};
          case "left": return {x: pos.x, y: pos.y + 0.5};
          case "down": return {x: pos.x + 0.5, y: pos.y + 1};
          case "up": return {x: pos.x + 0.5, y: pos.y};
          default: return {x: pos.x + 1, y: pos.y + 0.5};
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
     * Ball arrives at conveyor - start traveling
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Set trajectory BEFORE changing state to prevent renderer from seeing ball with no trajectory
      const trajectory = spec.states.traveling.getTrajectory(ball, component, time);
      ball.trajectory = trajectory.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectory.duration;
      ball.trajectoryWaypoints = trajectory.waypoints;

      // Now safe to change state
      ball.componentState = "traveling";

      // Observe ball upon entry if conveyor is observable (no plex glass)
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }
    }
  },

  // For Bayesian inference
  inference: {
    /**
     * Conveyor is identity function
     */
    getPossibleInputs(output, params) {
      return [{inputs: output, probability: 1.0}];
    }
  },

  // Visual rendering
  visual: {
    imagePath: "../images/straight_horizontal_{direction}.png",
    size: {width: 64, height: 64},

    render(ctx, component) {
      const pos = component.position;
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }
      const px = pos.x * gridSize;
      const py = pos.y * gridSize;
      const direction = component.params.direction || "right";

      const conveyorColor = window.ComponentColors?.COLORS?.conveyor || '#707070';
      ctx.fillStyle = conveyorColor;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw belt based on direction
      if (direction === "right" || direction === "left") {
        // Horizontal belt
        ctx.fillRect(px, py + gridSize * 0.3125, gridSize, gridSize * 0.375);
        ctx.strokeRect(px, py + gridSize * 0.3125, gridSize, gridSize * 0.375);
      } else {
        // Vertical belt
        ctx.fillRect(px + gridSize * 0.3125, py, gridSize * 0.375, gridSize);
        ctx.strokeRect(px + gridSize * 0.3125, py, gridSize * 0.375, gridSize);
      }

      // Draw direction arrow in center
      const drawArrow = window.ComponentColors?.drawArrow;
      const angles = window.ComponentColors?.DIRECTION_ANGLES;
      if (drawArrow && angles) {
        drawArrow(ctx, px + gridSize * 0.5, py + gridSize * 0.5, angles[direction], gridSize * 0.15);
      }
    }
  },

  // Level editor metadata
  editor: {
    icon: "→",
    category: "Transport",
    defaultParams: {
      direction: "right",
      speed: 1.0,
      plex: false
    }
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(ConveyorSpec);
}
