/**
 * Trajectory System
 *
 * All ball paths are piecewise linear (composed of straight line segments)
 */

/**
 * Create piecewise linear trajectory from waypoints
 */
function createPiecewiseLinearTrajectory(waypoints) {
  if (waypoints.length < 2) {
    throw new Error("Need at least 2 waypoints for trajectory");
  }

  // Compute segment lengths
  const segments = [];
  let totalLength = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const length = Math.sqrt(
      Math.pow(end.x - start.x, 2) +
      Math.pow(end.y - start.y, 2)
    );
    segments.push({start, end, length});
    totalLength += length;
  }

  // Normalize segment progress ranges
  let accum = 0;
  segments.forEach(seg => {
    seg.startProgress = accum / totalLength;
    seg.endProgress = (accum + seg.length) / totalLength;
    accum += seg.length;
  });

  // Return trajectory function
  return (progress) => {
    // Clamp progress
    progress = Math.max(0, Math.min(1, progress));

    // Find which segment we're in
    for (const seg of segments) {
      if (progress >= seg.startProgress && progress <= seg.endProgress) {
        // Interpolate within segment
        const segLength = seg.endProgress - seg.startProgress;
        const segProgress = segLength > 0
          ? (progress - seg.startProgress) / segLength
          : 0;

        return {
          x: lerp(seg.start.x, seg.end.x, segProgress),
          y: lerp(seg.start.y, seg.end.y, segProgress)
        };
      }
    }

    // Fallback: last waypoint
    return {...waypoints[waypoints.length - 1]};
  };
}

/**
 * Compute trajectory duration based on distance and speed
 */
function computeTrajectoryDuration(waypoints, speed) {
  if (waypoints.length < 2) return 0;

  let totalDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const dx = waypoints[i + 1].x - waypoints[i].x;
    const dy = waypoints[i + 1].y - waypoints[i].y;
    totalDistance += Math.sqrt(dx * dx + dy * dy);
  }

  return (totalDistance / speed) * 1000;  // Convert to milliseconds
}

/**
 * Linear interpolation
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Easing functions
 */
function linear(t) {
  return t;
}

function easeInCubic(t) {
  return t * t * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Apply easing to trajectory
 */
function applyEasing(trajectory, easingFunc) {
  return (progress) => trajectory(easingFunc(progress));
}

/**
 * Create arc trajectory for 90° curved turns
 * Ball follows a circular arc from entry to exit
 *
 * @param {Object} center - Arc center {x, y} in grid coordinates
 * @param {number} radius - Arc radius in grid units (typically 0.5)
 * @param {number} startAngle - Start angle in radians
 * @param {number} endAngle - End angle in radians
 * @param {boolean} anticlockwise - Direction of travel
 */
function createArcTrajectory(center, radius, startAngle, endAngle, anticlockwise) {
  // Compute angle difference in the correct direction
  let angleDiff = endAngle - startAngle;

  if (anticlockwise) {
    // For anticlockwise, need positive angle difference
    while (angleDiff <= 0) angleDiff += 2 * Math.PI;
  } else {
    // For clockwise, need negative angle difference
    while (angleDiff >= 0) angleDiff -= 2 * Math.PI;
  }

  return (progress) => {
    const angle = startAngle + angleDiff * progress;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle)
    };
  };
}

/**
 * Compute arc trajectory length
 */
function computeArcLength(radius, startAngle, endAngle, anticlockwise) {
  let angleDiff = endAngle - startAngle;
  if (anticlockwise) {
    while (angleDiff <= 0) angleDiff += 2 * Math.PI;
  } else {
    while (angleDiff >= 0) angleDiff -= 2 * Math.PI;
  }
  return radius * Math.abs(angleDiff);
}

/**
 * Create trajectory for filter/merger paths that may be straight or curved
 *
 * @param {Object} componentPos - Component position {x, y} in grid coordinates
 * @param {string} fromSide - Entry side: 'up', 'down', 'left', 'right'
 * @param {string} toSide - Exit side: 'up', 'down', 'left', 'right'
 * @returns {Object} {trajectory: function, length: number}
 */
function createFilterMergerTrajectory(componentPos, fromSide, toSide) {
  const pos = componentPos;

  // Side to position mapping (in grid coordinates)
  const sideToPos = {
    'up': {x: pos.x + 0.5, y: pos.y},
    'down': {x: pos.x + 0.5, y: pos.y + 1},
    'left': {x: pos.x, y: pos.y + 0.5},
    'right': {x: pos.x + 1, y: pos.y + 0.5}
  };

  const entry = sideToPos[fromSide];
  const exit = sideToPos[toSide];

  // Check if opposite sides (straight path)
  const isOpposite = (fromSide === 'up' && toSide === 'down') ||
                     (fromSide === 'down' && toSide === 'up') ||
                     (fromSide === 'left' && toSide === 'right') ||
                     (fromSide === 'right' && toSide === 'left');

  if (isOpposite) {
    // Straight line trajectory
    const length = Math.sqrt(
      Math.pow(exit.x - entry.x, 2) + Math.pow(exit.y - entry.y, 2)
    );

    return {
      trajectory: (progress) => ({
        x: lerp(entry.x, exit.x, progress),
        y: lerp(entry.y, exit.y, progress)
      }),
      length: length
    };
  }

  // Curved 90° arc trajectory
  // Find the corner that connects both sides
  const cornerOffsets = {
    'up-left': {x: 0, y: 0},
    'up-right': {x: 1, y: 0},
    'down-left': {x: 0, y: 1},
    'down-right': {x: 1, y: 1},
    'left-up': {x: 0, y: 0},
    'left-down': {x: 0, y: 1},
    'right-up': {x: 1, y: 0},
    'right-down': {x: 1, y: 1}
  };

  const cornerOffset = cornerOffsets[`${fromSide}-${toSide}`];
  if (!cornerOffset) {
    throw new Error(`Invalid side combination: ${fromSide} -> ${toSide}`);
  }

  const center = {
    x: pos.x + cornerOffset.x,
    y: pos.y + cornerOffset.y
  };

  const radius = 0.5;  // Center of belt

  // Compute angles from center to entry/exit
  const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
  const endAngle = Math.atan2(exit.y - center.y, exit.x - center.x);

  // Determine direction: for 90° turn, pick the shorter arc
  // Compute raw angle difference
  let rawDiff = endAngle - startAngle;
  // Normalize to [-π, π]
  while (rawDiff > Math.PI) rawDiff -= 2 * Math.PI;
  while (rawDiff < -Math.PI) rawDiff += 2 * Math.PI;

  // anticlockwise if positive angle difference
  const anticlockwise = rawDiff > 0;

  const arcLength = computeArcLength(radius, startAngle, endAngle, anticlockwise);

  return {
    trajectory: createArcTrajectory(center, radius, startAngle, endAngle, anticlockwise),
    length: arcLength
  };
}
