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
        const maxBalls = gridCols * gridRows;

        // Wrap position into box for overflow balls
        const wrappedIndex = ball.arrivalIndex % maxBalls;
        const row = Math.floor(wrappedIndex / gridCols);
        const col = wrappedIndex % gridCols;

        // Spacing to fit 5 balls across width ~0.8
        const cellWidth = 0.8 / gridCols;
        const cellHeight = 0.8 / gridRows;

        // For overflow balls, target the center of the box instead of a grid slot
        const isOverflow = ball.arrivalIndex >= maxBalls;
        const finalPos = isOverflow
          ? { x: pos.x + 0.5, y: pos.y + 0.5 }
          : {
              x: pos.x + 0.1 + col * cellWidth + cellWidth / 2,
              y: pos.y + 0.1 + row * cellHeight + cellHeight / 2
            };

        // Mark overflow balls so renderer can fade them
        if (isOverflow) {
          ball.overflowBall = true;
        }

        return {
          path: applyEasing(
            createPiecewiseLinearTrajectory([entry, finalPos]),
            easeOutCubic
          ),
          duration: isOverflow ? 300 : 500,
          waypoints: [entry, finalPos]
        };
      },

      visual: {
        opacity: (progress, ball) => {
          if (ball && ball.overflowBall) {
            // Fade out as ball approaches center
            return 1.0 - progress;
          }
          return 1.0;
        },
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

        // Overflow balls are invisible once observed
        if (ball.overflowBall) {
          return { x: component.position.x + 0.5, y: component.position.y + 0.5 };
        }

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
        opacity: (progress, ball) => (ball && ball.overflowBall) ? 0 : 1.0,
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

      // Box dimensions
      const boxX = px + gridSize * 0.125;
      const boxY = py + gridSize * 0.125;
      const boxSize = gridSize * 0.75;

      // Check if this observation point has an index (for "dist" mode)
      const obsIndex = component.params.observationIndex;
      const hasObsIndex = obsIndex !== undefined && obsIndex !== null;

      // Determine fill color - use observation color if indexed, otherwise white
      let fillColor = '#FFF';
      if (hasObsIndex && window.ObservationColors) {
        fillColor = window.ObservationColors.getColor(obsIndex);
      }

      // Draw box with fill color
      ctx.strokeStyle = "#000";
      ctx.fillStyle = fillColor;
      ctx.lineWidth = gridSize * 0.0625; // 4/64
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.fillRect(boxX, boxY, boxSize, boxSize);
      ctx.strokeRect(boxX, boxY, boxSize, boxSize);

      // Draw label (A, B, C...) if indexed (dist mode)
      if (hasObsIndex && window.ObservationColors) {
        const label = window.ObservationColors.getLabel(obsIndex);
        const centerX = px + gridSize * 0.5;
        const centerY = py + gridSize * 0.5;
        const ballCount = component.observedBalls?.length || 0;

        ctx.save();
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (ballCount > 25) {
          const displayText = ballCount >= 1000 ? '999+' : String(ballCount);
          const fontSize = ballCount >= 1000 ? gridSize * 0.28 : ballCount >= 100 ? gridSize * 0.35 : gridSize * 0.45;
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.fillText(displayText, centerX, centerY);
        } else {
          ctx.font = `bold ${gridSize * 0.45}px sans-serif`;
          ctx.fillText(label, centerX, centerY);
        }
        ctx.restore();
      }
      // Draw golden star if this is the prediction target (reaches mode)
      else if (component.params.isPredictionTarget) {
        const centerX = px + gridSize * 0.5;
        const centerY = py + gridSize * 0.5;
        const radius = gridSize * 0.3;

        // Check if we need to show ball count (>25 balls)
        const ballCount = component.observedBalls?.length || 0;
        const showCount = ballCount > 25;

        ctx.save();
        // Reduce opacity if showing count
        ctx.globalAlpha = showCount ? 0.25 : 1.0;
        ctx.fillStyle = '#FFD700'; // Gold
        ctx.strokeStyle = '#DAA520'; // Darker gold outline
        ctx.lineWidth = 1.5;

        // Inner radius ratio for regular 5-pointed star: sin(18°)/sin(54°) ≈ 0.382
        const innerRadius = radius * 0.382;

        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          // 10 points, 36° apart, starting from top
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          // Alternate between outer (tips) and inner (valleys)
          const r = (i % 2 === 0) ? radius : innerRadius;
          const x = centerX + r * Math.cos(angle);
          const y = centerY + r * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Show ball count if >25 balls
        if (showCount) {
          ctx.save();
          ctx.fillStyle = '#000';
          const displayText = ballCount >= 1000 ? '999+' : String(ballCount);
          const fontSize = ballCount >= 1000 ? gridSize * 0.28 : ballCount >= 100 ? gridSize * 0.35 : gridSize * 0.45;
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(displayText, centerX, centerY);
          ctx.restore();
        }
      }

      // For non-target observation points, also show count if >25 balls
      const ballCount = component.observedBalls?.length || 0;
      if (ballCount > 25 && !hasObsIndex && !component.params.isPredictionTarget) {
        const centerX = px + gridSize * 0.5;
        const centerY = py + gridSize * 0.5;
        ctx.save();
        ctx.fillStyle = '#000';
        const displayText = ballCount >= 1000 ? '999+' : String(ballCount);
        const fontSize = ballCount >= 1000 ? gridSize * 0.28 : ballCount >= 100 ? gridSize * 0.35 : gridSize * 0.45;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, centerX, centerY);
        ctx.restore();
      }
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
