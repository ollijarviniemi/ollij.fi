/**
 * Ball Colors Configuration
 *
 * Central definition of all available ball colors in the system.
 * Used by renderer, components, and editor.
 */

const BALL_COLORS = {
  red: '#E53935',
  blue: '#1E88E5',
  green: '#43A047',
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

// Export for browser
if (typeof window !== 'undefined') {
  window.BallColors = {
    COLORS: BALL_COLORS,
    CYCLE: COLOR_CYCLE,
    getHex: getColorHex,
    getNext: getNextColor
  };

  window.ComponentColors = {
    COLORS: COMPONENT_COLORS,
    darken: darkenColor,
    lighten: lightenColor,
    drawArrow: drawDirectionArrow,
    DIRECTION_ANGLES: DIRECTION_ANGLES
  };
}
