/**
 * Ball - Primary game object
 *
 * Balls flow through the factory. Components own ball trajectories.
 */

class Ball {
  constructor(id, color) {
    // Identity
    this.id = id;
    this.color = color;
    this.colorVisible = true;

    // Spatial state
    this.position = {x: 0, y: 0};  // Grid coordinates

    // Component association
    this.componentId = null;
    this.componentState = null;

    // Trajectory (function: progress → position)
    this.trajectory = null;
    this.trajectoryStartTime = 0;
    this.trajectoryDuration = 0;
    this.trajectoryWaypoints = [];

    // Visual properties (set by component state)
    this.visualProperties = {
      opacity: 1.0,
      scale: 1.0,
      rotation: 0
    };

    // Metadata
    this.sourceId = null;          // Which sack produced this ball
    this.inputDirection = null;    // Direction ball entered component
    this.bufferIndex = 0;          // Position in buffer
    this.outputIndex = 0;          // Position in output sequence
    this.arrivalIndex = 0;         // Order of arrival at observation
  }

  /**
   * Get visual position at current time (for rendering)
   */
  getVisualPosition(currentTime) {
    if (!this.trajectory) {
      throw new Error(`Ball ${this.id} has no trajectory but getVisualPosition was called. Ball state: ${this.componentState}, componentId: ${this.componentId}. This indicates a bug - the ball should either have a trajectory or the component state should have a getPosition method.`);
    }

    const elapsed = currentTime - this.trajectoryStartTime;
    const progress = Math.min(1, elapsed / this.trajectoryDuration);

    return this.trajectory(progress);
  }

  /**
   * Check if trajectory is complete
   */
  isTrajectoryComplete(currentTime) {
    if (!this.trajectory) return false; // No trajectory means not moving, not "complete"
    const elapsed = currentTime - this.trajectoryStartTime;
    return elapsed >= this.trajectoryDuration;
  }

  /**
   * Set static position (no trajectory)
   */
  setPosition(x, y) {
    this.position = {x, y};
    this.trajectory = null;
  }

  /**
   * Set trajectory from waypoints
   */
  setTrajectory(waypoints, duration, startTime) {
    if (waypoints.length === 0) {
      throw new Error("Waypoints cannot be empty");
    }

    if (waypoints.length === 1) {
      // Static position
      this.position = {...waypoints[0]};
      this.trajectory = null;
      return;
    }

    this.trajectoryWaypoints = waypoints;
    this.trajectory = createPiecewiseLinearTrajectory(waypoints);
    this.trajectoryDuration = duration;
    this.trajectoryStartTime = startTime;
  }
}
