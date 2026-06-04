/**
 * Collection Point Component - Terminal Sink
 *
 * Collects balls and records observations for Bayesian inference
 * Accepts inputs from any direction based on spatial positioning
 */

const ObservationSpec = {
  type: "observation",
  displayName: "Collection Point",

  // Explicitly observable - this is the observation component!
  isObservable: true,

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
       * Ball arriving at observation point
       * Entry position determined by ball's inputDirection
       */
      getTrajectory(ball, component, startTime) {
        const pos = component.position;

        // Determine entry position based on input direction
        // inputDirection indicates which side the ball is entering FROM
        let entry;
        if (ball.inputDirection === 'right') {
          entry = {x: pos.x + 1, y: pos.y + 0.5}; // From right
        } else if (ball.inputDirection === 'left') {
          entry = {x: pos.x, y: pos.y + 0.5}; // From left
        } else if (ball.inputDirection === 'down') {
          entry = {x: pos.x + 0.5, y: pos.y + 1}; // From bottom
        } else if (ball.inputDirection === 'up') {
          entry = {x: pos.x + 0.5, y: pos.y}; // From top
        } else {
          throw new Error(`Collection point: ball ${ball.id} has no inputDirection set (got: ${ball.inputDirection})`);
        }

        // Calculate grid position (5×5 grid layout)
        const gridCols = component.params.gridCols || 5;
        const gridRows = component.params.gridRows || 5;
        const row = Math.floor(ball.arrivalIndex / gridCols);
        const col = ball.arrivalIndex % gridCols;

        // Spacing to fit 5 balls across width ~0.8
        const cellWidth = 0.8 / gridCols;
        const cellHeight = 0.8 / gridRows;

        const finalPos = {
          x: pos.x + 0.1 + col * cellWidth + cellWidth / 2,
          y: pos.y + 0.1 + row * cellHeight + cellHeight / 2
        };

        return {
          path: applyEasing(
            createPiecewiseLinearTrajectory([entry, finalPos]),
            easeOutCubic
          ),
          duration: 500,
          waypoints: [entry, finalPos]
        };
      },

      visual: {
        opacity: 1.0,
        scale: 0.375,  // Makes ball diameter ~0.15 * gridSize for 5×5 grid
        rotation: 0
      }
    },

    observed: {
      /**
       * Ball at rest at observation point (5×5 grid layout)
       */
      getPosition(ball, component) {
        const pos = component.position;
        const gridCols = component.params.gridCols || 5;
        const gridRows = component.params.gridRows || 5;
        const row = Math.floor(ball.arrivalIndex / gridCols);
        const col = ball.arrivalIndex % gridCols;

        const cellWidth = 0.8 / gridCols;
        const cellHeight = 0.8 / gridRows;

        return {
          x: pos.x + 0.1 + col * cellWidth + cellWidth / 2,
          y: pos.y + 0.1 + row * cellHeight + cellHeight / 2
        };
      },

      visual: {
        opacity: 1.0,
        scale: 0.375,  // Makes ball diameter ~0.15 * gridSize for 5×5 grid
        rotation: 0
      }
    }
  },

  transitions: {
    /**
     * Ball arrives at observation point
     */
    onArrival(ball, component, time, spec) {
      ball.componentId = component.id;

      // Initialize observed balls array
      if (!component.observedBalls) {
        component.observedBalls = [];
      }

      const gridCols = component.params.gridCols || 5;
      const gridRows = component.params.gridRows || 5;
      const maxBalls = gridCols * gridRows;

      // Check for overflow
      if (component.observedBalls.length >= maxBalls) {
        console.warn(
          `Observation point ${component.id} has reached capacity (${maxBalls} balls). ` +
          `Additional balls will stack behind existing balls.`
        );
      }

      ball.arrivalIndex = component.observedBalls.length;
      component.observedBalls.push(ball);

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
     * Trajectory complete - ball is now observed
     */
    onTrajectoryComplete(ball, component, time, spec) {
      if (ball.componentState === "arriving") {
        ball.componentState = "observed";
        ball.position = spec.states.observed.getPosition(ball, component);
        ball.trajectory = null;

        // Record observation
        if (!component.observations) {
          component.observations = [];
        }

        // Check if observation point has plex glass
        const colorVisible = ball.colorVisible && !component.params.plex;

        component.observations.push({
          ballId: ball.id,
          color: ball.color,
          colorVisible: colorVisible,
          sourceId: ball.sourceId,
          time: time,
          index: ball.arrivalIndex
        });

        // Notify Bayesian tracker of observation BEFORE collecting
        if (component.simulation && component.simulation.bayesianTracker) {
          // Record observation (updates posteriors)
          // Only pass color if it's visible (not obscured by plex glass)
          const observedColor = colorVisible ? ball.color : null;
          component.simulation.bayesianTracker.onObservation(ball.id, observedColor);

          // Then mark ball as collected (marginalizes it out)
          component.simulation.bayesianTracker.onBallCollected(ball.id);
        }

        // Trigger observation callback
        if (component.onObservation) {
          component.onObservation({
            ball: ball,
            observation: component.observations[component.observations.length - 1]
          });
        }
      }
    }
  },

  // Visual rendering
  visual: {
    imagePath: "../images/collection_point.png",
    size: {width: 64, height: 64},

    render(ctx, component) {
      const pos = component.position;
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }
      const px = pos.x * gridSize;
      const py = pos.y * gridSize;

      // Fallback rendering
      ctx.strokeStyle = "#000";
      ctx.fillStyle = "#FFF";
      ctx.lineWidth = gridSize * 0.0625; // 4/64
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw box
      ctx.fillRect(px + gridSize * 0.125, py + gridSize * 0.125, gridSize * 0.75, gridSize * 0.75);
      ctx.strokeRect(px + gridSize * 0.125, py + gridSize * 0.125, gridSize * 0.75, gridSize * 0.75);
    }
  },

  // Level editor metadata
  editor: {
    icon: "🗑️",
    category: "Sink",
    defaultParams: {}
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(ObservationSpec);
}
