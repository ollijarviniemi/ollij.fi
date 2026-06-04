/**
 * Ball Colors Configuration
 *
 * Central definition of all available ball colors in the system.
 * Used by renderer, components, and editor.
 */

const BALL_COLORS = {
  red: '#D94040',     // Vermilion-red: separates better from green under deuteranomaly
  blue: '#3060D0',    // Deep blue: high luminance contrast vs red and green
  green: '#18A858',   // Teal-green: more blue component helps separate from red
  yellow: '#FDD835',
  purple: '#8E24AA',
  black: '#212121'
};

// Ordered list for cycling through colors
const COLOR_CYCLE = ['red', 'blue', 'green', 'yellow', 'purple', 'black'];

// Get hex color value
function getColorHex(colorName) {
  return BALL_COLORS[colorName] || '#888888';
}

// Get next color in cycle
function getNextColor(currentColor) {
  const currentIndex = COLOR_CYCLE.indexOf(currentColor);
  if (currentIndex === -1) return COLOR_CYCLE[0];
  return COLOR_CYCLE[(currentIndex + 1) % COLOR_CYCLE.length];
}

// Component colors for visual distinction
const COMPONENT_COLORS = {
  conveyor: '#707070',    // Gray (neutral transport)
  filter: '#9575CD',      // Purple (color-based routing)
  shuffler: '#FF9800',    // Orange (randomization)
  splitter: '#26A69A',    // Teal (branching)
  duplicator: '#42A5F5',  // Blue (multiplication)
  merger: '#66BB6A',      // Green (combining)
  sack: '#F0E6DC',        // Soft cream (ball container)
  observation: '#FFFFFF', // White (collection endpoint)
  blackPit: '#000000',    // Black (destruction endpoint)
  accent: '#FFD700'       // Gold (highlights/arrows)
};

// Observation point colors for "dist" mode
// Distinct, saturated colors for A, B, C, D, E, F, G, H (up to 8 observation points)
// These are used both as observation point background colors and terminal world overlay colors
const OBSERVATION_COLORS = [
  '#81C784',  // A - Light green
  '#64B5F6',  // B - Light blue
  '#FFB74D',  // C - Light orange
  '#BA68C8',  // D - Light purple
  '#4DD0E1',  // E - Cyan
  '#F06292',  // F - Pink
  '#AED581',  // G - Lime
  '#90A4AE'   // H - Blue-gray
];

// Get observation point color by index (0 = A, 1 = B, etc.)
function getObservationColor(index) {
  return OBSERVATION_COLORS[index % OBSERVATION_COLORS.length];
}

// Get observation point label by index (0 = 'A', 1 = 'B', etc.)
function getObservationLabel(index) {
  return String.fromCharCode(65 + index);  // 65 = 'A'
}

// Helper to darken a color by a factor (0-1)
function darkenColor(hex, factor = 0.7) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Helper to lighten a color by a factor (0-1, where 1 = white)
function lightenColor(hex, factor = 0.3) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const newR = Math.round(r + (255 - r) * factor);
  const newG = Math.round(g + (255 - g) * factor);
  const newB = Math.round(b + (255 - b) * factor);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Draw an equilateral triangle arrow (direction indicator)
 * All angles are 60°, tip points in the specified direction
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - Center X position
 * @param {number} y - Center Y position
 * @param {number} angle - Direction angle in radians (0 = right, π/2 = down)
 * @param {number} size - Size of the arrow (distance from center to vertices)
 * @param {string} color - Fill color (default: black)
 */
function drawDirectionArrow(ctx, x, y, angle, size, color = '#000') {
  ctx.fillStyle = color;
  ctx.beginPath();
  // Tip of arrow (pointing in direction)
  ctx.moveTo(
    x + size * Math.cos(angle),
    y + size * Math.sin(angle)
  );
  // Back-left corner (120° counterclockwise from tip)
  ctx.lineTo(
    x + size * Math.cos(angle + Math.PI * 2 / 3),
    y + size * Math.sin(angle + Math.PI * 2 / 3)
  );
  // Back-right corner (120° clockwise from tip)
  ctx.lineTo(
    x + size * Math.cos(angle - Math.PI * 2 / 3),
    y + size * Math.sin(angle - Math.PI * 2 / 3)
  );
  ctx.closePath();
  ctx.fill();
}

// Direction angles for convenience
const DIRECTION_ANGLES = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2
};

/**
 * Draw a colorblind-accessible marker on a ball.
 * Red = dot, Blue = vertical bar, Green = cross, Yellow = nothing.
 */
function drawBallMarker(ctx, x, y, radius, colorName) {
  const markerColor = '#ffffff';
  const r = radius * 0.79;  // Bar/cross tips + half line width reach the inner edge of the ball border
  ctx.strokeStyle = markerColor;
  ctx.fillStyle = markerColor;
  ctx.lineWidth = Math.max(1, radius * 0.18);
  ctx.lineCap = 'round';

  if (colorName === 'red') {
    // Dot
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (colorName === 'blue') {
    // Vertical bar
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  } else if (colorName === 'green') {
    // Cross (diagonal tips just reach the ball edge)
    const d = r * 0.707;  // r / sqrt(2) — diagonal distance = r
    ctx.beginPath();
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
  // yellow and others: no marker
}

// Export for browser
if (typeof window !== 'undefined') {
  window.BallColors = {
    COLORS: BALL_COLORS,
    CYCLE: COLOR_CYCLE,
    getHex: getColorHex,
    getNext: getNextColor,
    drawMarker: drawBallMarker,
    colorblindMode: false
  };

  window.ComponentColors = {
    COLORS: COMPONENT_COLORS,
    darken: darkenColor,
    lighten: lightenColor,
    drawArrow: drawDirectionArrow,
    DIRECTION_ANGLES: DIRECTION_ANGLES
  };

  window.ObservationColors = {
    COLORS: OBSERVATION_COLORS,
    getColor: getObservationColor,
    getLabel: getObservationLabel
  };
}
