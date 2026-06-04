/**
 * Mechanical Arm Component
 *
 * Picks balls from sacks and places them on conveyors
 * Rotates in a circular motion to move balls from sack to output
 */

const ArmSpec = {
  type: "arm",
  displayName: "Mechanical Arm",

  isObservable: true,

  // Arm geometry constants (in grid units)
  armLength: 0.6,         // Length of arm from center to grabber
  pivotRadius: 0.22,      // Radius of center pivot circle (for draw count text)
  grabberRadius: 0.1,     // Radius of grabber circle at end
  centerOffset: 0,        // Pivot is centered in tile (0 = cell center)

  ports: {
    inputs: [
      {id: "sack", direction: null, offset: {x: 0, y: 0}, required: true}
    ],
    outputs: [
      {id: "conveyor", direction: null, offset: {x: 1, y: 0.5}, required: true}
    ]
  },

  /**
   * Get the angle (in radians) pointing toward the sack
   */
  getSackAngle(component) {
    const simulation = component.simulation;
    if (!simulation) return Math.PI; // Default: point left

    const inputConnection = simulation.level.connections.find(c => c.to === component.id);
    if (!inputConnection) return Math.PI;

    const sack = simulation.componentsById.get(inputConnection.from);
    if (!sack) return Math.PI;

    // Calculate angle from arm cell center to sack center
    const armCellCenter = {x: component.position.x + 0.5, y: component.position.y + 0.5};
    const sackCenter = {x: sack.position.x + 0.5, y: sack.position.y + 0.5};

    return Math.atan2(sackCenter.y - armCellCenter.y, sackCenter.x - armCellCenter.x);
  },

  /**
   * Get the pivot center position (offset toward sack)
   */
  getPivotCenter(component) {
    const cellCenter = {x: component.position.x + 0.5, y: component.position.y + 0.5};
    const sackAngle = this.getSackAngle(component);

    // Offset toward sack by centerOffset
    return {
      x: cellCenter.x + this.centerOffset * Math.cos(sackAngle),
      y: cellCenter.y + this.centerOffset * Math.sin(sackAngle)
    };
  },

  /**
   * Get current arm angle based on animation state
   * Returns angle in radians
   */
  getCurrentArmAngle(component, time) {
    const baseAngle = this.getSackAngle(component);

    // Check if arm is currently animating (has an active ball or return animation)
    if (component.armAnimationStart !== undefined && component.armAnimationDuration !== undefined) {
      const elapsed = time - component.armAnimationStart;
      const totalDuration = component.armAnimationDuration;

      if (elapsed < 0) {
        return baseAngle;
      } else if (elapsed < totalDuration) {
        // Full rotation (2π) over the animation duration
        // Use constant angular speed (no easing) to stay in sync with ball
        const progress = elapsed / totalDuration;
        return baseAngle + progress * 2 * Math.PI;
      } else {
        // Animation complete, reset
        return baseAngle;
      }
    }

    return baseAngle;
  },

  states: {
    traveling: {
      /**
       * Ball traveling from sack to conveyor in circular arc
       */
      getTrajectory(ball, component, startTime) {
        const simulation = component.simulation;
        if (!simulation) {
          throw new Error(`Arm ${component.id} has no simulation reference`);
        }

        const spec = ComponentRegistry.get('arm');
        const armLength = spec.armLength;

        // Arm pivot center position (offset toward sack)
        const pivotCenter = spec.getPivotCenter(component);
        const centerX = pivotCenter.x;
        const centerY = pivotCenter.y;

        // Get starting angle (pointing at sack)
        const startAngle = spec.getSackAngle(component);
        // End angle is 180° rotation (pointing at output)
        const endAngle = startAngle + Math.PI;

        // Create circular arc trajectory with constant angular speed
        const circularPath = (progress) => {
          // No easing - constant angular speed to stay in sync with arm
          const currentAngle = startAngle + progress * Math.PI;
          return {
            x: centerX + armLength * Math.cos(currentAngle),
            y: centerY + armLength * Math.sin(currentAngle)
          };
        };

        // Duration for the ball movement (half of full arm rotation)
        const ballDuration = 1000;

        return {
          path: circularPath,
          duration: ballDuration,
          waypoints: [circularPath(0), circularPath(0.5), circularPath(1)]
        };
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
     * Ball picked up from sack - start traveling to conveyor
     */
    onPickup(ball, component, time, spec) {
      ball.componentId = component.id;

      // Start arm animation (full 360° rotation)
      // Ball moves during first half (0-180°), arm returns during second half (180-360°)
      const ballDuration = 1000;
      const returnDuration = 1000;
      component.armAnimationStart = time;
      component.armAnimationDuration = ballDuration + returnDuration;

      // Set trajectory BEFORE changing state
      const trajectory = spec.states.traveling.getTrajectory(ball, component, time);
      ball.trajectory = trajectory.path;
      ball.trajectoryStartTime = time;
      ball.trajectoryDuration = trajectory.duration;
      ball.trajectoryWaypoints = trajectory.waypoints;

      // Now safe to change state
      ball.componentState = "traveling";

      // If arm doesn't have plex glass, observe the ball immediately upon pickup
      if (!component.params.plex && component.simulation && component.simulation.bayesianTracker) {
        component.simulation.bayesianTracker.onObservation(ball.id, ball.color);
      }
    },

    /**
     * Trajectory complete - transfer to conveyor
     */
    onTrajectoryComplete(ball, component, time, spec) {
      if (ball.componentState === "traveling") {
        // Travel complete → set position to final waypoint
        if (ball.trajectoryWaypoints && ball.trajectoryWaypoints.length > 0) {
          ball.position = {...ball.trajectoryWaypoints[ball.trajectoryWaypoints.length - 1]};
        }
        ball.trajectory = null;

        // Set input direction for target component
        const simulation = component.simulation;
        const outputConnection = simulation.level.connections.find(c => c.from === component.id);
        if (outputConnection) {
          const target = simulation.componentsById.get(outputConnection.to);
          if (target) {
            ball.inputDirection = computeInputDirection(component, target);
          }
        }

        // Use standard transfer mechanism
        component.simulation.transferBall(ball, component);

        // Check if sack has queued balls (for multi-arm support)
        const inputConnection = simulation.level.connections.find(c => c.to === component.id);
        if (inputConnection) {
          const sack = simulation.componentsById.get(inputConnection.from);
          if (sack && sack.ballQueue && sack.ballQueue.length > 0) {
            // Arm is now ready, pick up queued ball
            const nextBall = sack.ballQueue.shift();
            simulation.assignBallToArm(nextBall, component, time);
          }
        }
      }
    }
  },

  /**
   * Render arm at specified pixel coordinates
   * This is the canonical rendering function - used by both normal render and animated branching view
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} centerX - Pivot center X in pixels
   * @param {number} centerY - Pivot center Y in pixels
   * @param {number} armAngle - Current arm angle in radians
   * @param {number} scale - Scale factor (typically gridSize or min(scaleX, scaleY))
   * @param {number|undefined} drawCount - Number of draws to display (optional)
   */
  renderAtPosition(ctx, centerX, centerY, armAngle, scale, drawCount) {
    const armLength = this.armLength * scale;
    const pivotRadius = this.pivotRadius * scale;
    const grabberRadius = this.grabberRadius * scale;

    // Calculate grabber position
    const grabberX = centerX + armLength * Math.cos(armAngle);
    const grabberY = centerY + armLength * Math.sin(armAngle);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = scale * 0.0625;  // Same proportion as other components (4/64)

    // Draw arm line
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(grabberX, grabberY);
    ctx.stroke();

    // Draw center pivot circle (filled with white background)
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.arc(centerX, centerY, pivotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw draw count text if available
    if (drawCount !== undefined && drawCount > 0) {
      const text = `×${drawCount}`;
      // Adjust font size for double digits
      const fontScale = drawCount >= 10 ? 0.85 : 1.1;
      ctx.fillStyle = "#000";
      ctx.font = `bold ${pivotRadius * fontScale}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, centerX, centerY);
    }

    // Draw grabber circle at end (filled)
    ctx.fillStyle = "#888";
    ctx.beginPath();
    ctx.arc(grabberX, grabberY, grabberRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  },

  // Visual rendering
  visual: {
    size: {width: 64, height: 64},

    render(ctx, component, time) {
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }

      const spec = ComponentRegistry.get('arm');

      // Get pivot center (offset toward sack)
      const pivotCenter = spec.getPivotCenter(component);
      const centerX = pivotCenter.x * gridSize;
      const centerY = pivotCenter.y * gridSize;

      // Get current arm angle
      const currentTime = time !== undefined ? time : (component.simulation ? component.simulation.time : 0);
      const armAngle = spec.getCurrentArmAngle(component, currentTime);

      // Use canonical rendering function
      spec.renderAtPosition(ctx, centerX, centerY, armAngle, gridSize, component.params.drawCount);
    }
  },

  // Level editor metadata
  editor: {
    icon: "🦾",
    category: "Transport",
    defaultParams: {
      assignedSackId: null,
      outputConveyorId: null
    }
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(ArmSpec);
}
