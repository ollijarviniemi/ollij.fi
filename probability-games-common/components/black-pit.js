/**
 * Black Pit Component - Ball Sink
 *
 * Consumes balls - they move toward center, shrink, and fade away
 * Accepts inputs from any direction based on spatial positioning
 */

const BlackPitSpec = {
  type: "black-pit",
  displayName: "Black Pit",

  ports: {
    inputs: [
      {id: "input_left", direction: null, offset: {x: 0, y: 0.5}, required: false},
      {id: "input_right", direction: null, offset: {x: 1, y: 0.5}, required: false},
      {id: "input_top", direction: null, offset: {x: 0.5, y: 0}, required: false},
      {id: "input_bottom", direction: null, offset: {x: 0.5, y: 1}, required: false}
    ],
    outputs: []
  },

  states: {
    arriving: {
      /**
       * Ball arriving at black pit - moves to center while fading
       */
      getTrajectory(ball, component, startTime) {
        const pos = component.position;

        // Determine entry position based on input direction
        let entry;
        if (ball.inputDirection === 'right') {
          entry = {x: pos.x + 1, y: pos.y + 0.5};
        } else if (ball.inputDirection === 'left') {
          entry = {x: pos.x, y: pos.y + 0.5};
        } else if (ball.inputDirection === 'down') {
          entry = {x: pos.x + 0.5, y: pos.y + 1};
        } else if (ball.inputDirection === 'up') {
          entry = {x: pos.x + 0.5, y: pos.y};
        } else {
          throw new Error(`Black pit: ball ${ball.id} has no inputDirection set (got: ${ball.inputDirection})`);
        }

        const center = {x: pos.x + 0.5, y: pos.y + 0.5};

        return {
          path: createPiecewiseLinearTrajectory([entry, center]),  // Linear movement
          duration: 900,
          waypoints: [entry, center]
        };
      },

      visual: {
        opacity: (progress) => 1.0 - progress,  // Fade out linearly
        scale: (progress) => 1.0 - progress * 0.5,  // Shrink to 50% size
        rotation: 0
      }
    },

    consumed: {
      /**
       * Ball has been consumed - completely invisible
       */
      getPosition(ball, component) {
        return {
          x: component.position.x + 0.5,
          y: component.position.y + 0.5
        };
      },

      visual: {
        opacity: 0,
        scale: 0,
        rotation: 0
      }
    }
  },

  transitions: {
    /**
     * Ball arrives at black pit
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Set trajectory BEFORE changing state to prevent renderer from seeing ball with no trajectory
      const trajectory = spec.states.arriving.getTrajectory(ball, component, time);
      ball.trajectory = trajectory.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectory.duration;
      ball.trajectoryWaypoints = trajectory.waypoints;

      // Now safe to change state
      ball.componentState = "arriving";
    },

    /**
     * Trajectory complete - ball is consumed
     */
    onTrajectoryComplete(ball, component, time, spec) {
      if (ball.componentState === "arriving") {
        ball.componentState = "consumed";
        ball.position = spec.states.consumed.getPosition(ball, component);
        ball.trajectory = null;

        // Notify Bayesian tracker that ball is collected (consumed)
        // No more information will be gained about it
        if (component.simulation && component.simulation.bayesianTracker) {
          component.simulation.bayesianTracker.onBallCollected(ball.id);
        }
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
      const centerX = px + gridSize * 0.5;
      const centerY = py + gridSize * 0.5;

      // Draw black pit/hole with gradient for depth effect
      const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, gridSize * 0.35
      );
      gradient.addColorStop(0, "#222");
      gradient.addColorStop(0.7, "#000");
      gradient.addColorStop(1, "#000");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, gridSize * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Draw border to emphasize the pit
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  },

  // Level editor metadata
  editor: {
    icon: "⚫",
    category: "Sink",
    defaultParams: {}
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(BlackPitSpec);
}
