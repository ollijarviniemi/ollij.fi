/**
 * Sack Renderer - Shared utility for rendering sack graphics
 *
 * Single source of truth for sack visualization across:
 * - Game board (components/sack.js)
 * - Animation player (bayesian/animation-player.js)
 * - Betting interface (bayesian/betting-interface.js)
 */

const SackRenderer = {
  // Sack dimensions as fractions of cell/container size
  SACK_WIDTH_RATIO: 0.8,
  SACK_HEIGHT_RATIO: 0.85,

  // Visual styling
  DEFAULT_COLOR: '#F0E6DC',  // Soft cream
  BORDER_WIDTH: 4,

  /**
   * Render a complete sack with optional contents
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} x - X position of sack
   * @param {number} y - Y position of sack
   * @param {number} width - Sack width
   * @param {number} height - Sack height
   * @param {Object} options - Rendering options
   * @param {string} options.fillColor - Sack fill color
   * @param {Object} options.contents - Ball distribution {red: 70, blue: 30}
   * @param {boolean} options.showContents - Whether to show balls and tag
   * @param {number} options.alpha - Opacity for contents (0-1)
   */
  renderSack(ctx, x, y, width, height, options = {}) {
    const {
      fillColor = this.DEFAULT_COLOR,
      contents = null,
      showContents = false,
      alpha = 1.0
    } = options;

    // Draw sack interior first (before balls)
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y);
    ctx.closePath();
    ctx.fill();

    // Render balls if showing contents
    if (showContents && contents && Object.keys(contents).length > 0) {
      ctx.save();
      if (alpha < 1.0) {
        ctx.globalAlpha = alpha;
      }
      this.renderBallsInSack(ctx, x, y, width, height, contents);
      this.renderHangingTag(ctx, x, y, width, height, contents);
      ctx.restore();
    }

    // Draw strong black border (U-shape, open at top) AFTER balls
    ctx.strokeStyle = '#000';
    ctx.lineWidth = this.BORDER_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y);
    ctx.stroke();
  },

  /**
   * Generate tightly packed ball positions that fill the sack
   * Exactly 6 balls fit along the bottom, touching left/right/bottom borders
   */
  generatePackedPositions(width, height) {
    const borderInset = this.BORDER_WIDTH / 2;  // Border extends 2px inward

    // Inner dimensions (between inner edges of borders)
    const innerWidth = width - this.BORDER_WIDTH;    // width - 4
    const innerHeight = height - this.BORDER_WIDTH;  // height - 4

    // Ball radius for exactly 6 balls along bottom:
    // 6 balls, 5 gaps: leftmost edge at left border, rightmost edge at right border
    // Ball centers: r, r + 1.9r, r + 3.8r, r + 5.7r, r + 7.6r, r + 9.5r from left inner border
    // Rightmost ball right edge: r + 9.5r + r = 11.5r from left inner border
    // 11.5r = innerWidth → r = innerWidth / 11.5
    const ballRadius = innerWidth / 11.5;
    const ballDiameter = 2 * ballRadius;

    const horizSpacing = ballDiameter * 0.95;  // 1.9r
    const vertSpacing = ballDiameter * 0.85;   // 1.7r

    // Bottom row: ball centers positioned so edges touch borders
    const bottomY = height - borderInset - ballRadius;  // Bottom balls touch bottom border
    const leftX = borderInset + ballRadius;              // Left balls touch left border

    // How many rows fit from bottom to top?
    const topY = borderInset + ballRadius;  // Topmost possible ball center
    const rows = Math.floor((bottomY - topY) / vertSpacing) + 1;

    const positions = [];

    // Generate bottom-up: row 0 is at bottom with 6 balls
    for (let row = 0; row < rows; row++) {
      const posY = bottomY - row * vertSpacing;

      // Skip if ball would exceed top border
      if (posY - ballRadius < borderInset) continue;

      // Even rows (0, 2, 4...): 6 balls, no offset - these touch left/right borders
      // Odd rows (1, 3, 5...): 5 balls, offset by horizSpacing/2
      const isOffsetRow = (row % 2 === 1);
      const rowOffset = isOffsetRow ? horizSpacing / 2 : 0;
      const numBalls = isOffsetRow ? 5 : 6;

      for (let col = 0; col < numBalls; col++) {
        const posX = leftX + rowOffset + col * horizSpacing;
        positions.push({ x: posX, y: posY });
      }
    }

    return { positions, ballRadius };
  },

  /**
   * Render balls inside the sack, filling it completely
   */
  renderBallsInSack(ctx, sackX, sackY, sackWidth, sackHeight, contents) {
    const colors = Object.keys(contents);
    const total = Object.values(contents).reduce((a, b) => a + b, 0);
    if (total === 0) return;

    // Get packed positions
    const { positions, ballRadius } = this.generatePackedPositions(sackWidth, sackHeight);
    const numBalls = positions.length;

    // Determine how many balls of each color (proportional)
    const ballCounts = {};
    let assigned = 0;
    colors.forEach((color, idx) => {
      if (idx === colors.length - 1) {
        ballCounts[color] = numBalls - assigned;
      } else {
        const count = Math.round((contents[color] / total) * numBalls);
        ballCounts[color] = count;
        assigned += count;
      }
    });

    // Create array of ball colors
    const ballColors = [];
    colors.forEach(color => {
      for (let i = 0; i < ballCounts[color]; i++) {
        ballColors.push(color);
      }
    });

    // Shuffle colors using deterministic seed
    const seed = total * 1000 + colors.length * 100 + Object.values(contents)[0];
    this.shuffleArray(ballColors, seed);

    // Draw balls
    const getHex = window.BallColors?.getHex || (c => c);
    for (let i = 0; i < Math.min(ballColors.length, positions.length); i++) {
      const pos = positions[i];
      const colorName = ballColors[i];
      const hex = getHex(colorName);

      // Ball fill
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.arc(sackX + pos.x, sackY + pos.y, ballRadius, 0, Math.PI * 2);
      ctx.fill();

      // Ball outline (thicker for visibility)
      ctx.strokeStyle = this.darkenColor(hex);
      ctx.lineWidth = 2;
      ctx.stroke();

      if (window.BallColors?.colorblindMode) {
        window.BallColors.drawMarker(ctx, sackX + pos.x, sackY + pos.y, ballRadius, colorName);
      }
    }
  },

  /**
   * Render tag showing ball counts inside the sack
   */
  renderHangingTag(ctx, sackX, sackY, sackWidth, sackHeight, contents) {
    const colors = Object.keys(contents);
    if (colors.length === 0) return;

    // Scale tag based on sack size
    const scale = sackWidth / 50; // Base scale

    // Tag dimensions
    const tagWidth = 28 * scale;
    const lineHeight = 11 * scale;
    const tagHeight = lineHeight * colors.length + 6 * scale;

    // Tag position: inside sack, upper-left area
    const tagX = sackX + 4 * scale;
    const tagY = sackY + 4 * scale;

    // Draw tag background (paper-like) with slight transparency
    ctx.fillStyle = 'rgba(255, 254, 240, 0.9)';
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagWidth, tagHeight, 2);
    ctx.fill();
    ctx.stroke();

    // Draw color counts on tag
    const getHex = window.BallColors?.getHex || (c => c);
    ctx.font = `bold ${Math.floor(9 * scale)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    colors.forEach((color, idx) => {
      const rowY = tagY + 4 * scale + idx * lineHeight + lineHeight / 2;
      const circleX = tagX + 5 * scale;
      const circleR = 3 * scale;

      // Color circle
      ctx.fillStyle = getHex(color);
      ctx.beginPath();
      ctx.arc(circleX, rowY, circleR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      if (window.BallColors?.colorblindMode) {
        window.BallColors.drawMarker(ctx, circleX, rowY, circleR, color);
      }

      // Count text
      ctx.fillStyle = '#333';
      ctx.fillText(`:${contents[color]}`, circleX + circleR + 2 * scale, rowY);
    });
  },

  /**
   * Deterministic shuffle using seed
   */
  shuffleArray(array, seed) {
    const seededRandom = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  },

  /**
   * Darken a hex color
   */
  darkenColor(hex, factor = 0.7) {
    if (window.ComponentColors?.darken) {
      return window.ComponentColors.darken(hex, factor);
    }
    // Fallback implementation
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);

    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  },

  /**
   * Draw a golden star (for betting sack indicator)
   * Draws a proper 5-pointed star using 10 points (alternating outer tips and inner valleys)
   */
  drawStar(ctx, cx, cy, radius) {
    ctx.save();
    ctx.fillStyle = window.ComponentColors?.COLORS?.accent || '#FFD700';
    ctx.strokeStyle = '#DAA520';
    ctx.lineWidth = 1.5;

    // Inner radius ratio for regular 5-pointed star: sin(18°)/sin(54°) ≈ 0.382
    const innerRadius = radius * 0.382;

    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      // 10 points, 36° apart, starting from top
      const angle = (i * Math.PI / 5) - Math.PI / 2;
      // Alternate between outer (tips) and inner (valleys)
      const r = (i % 2 === 0) ? radius : innerRadius;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
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
  }
};

// Export for browser
if (typeof window !== 'undefined') {
  window.SackRenderer = SackRenderer;
}
