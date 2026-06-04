/**
 * Button Component - Trigger Overlay
 *
 * An overlay component that sits ON TOP of a conveyor belt.
 * When a ball passes through the center, it triggers an adjacent arm
 * to draw a ball from its connected sack after a short delay.
 */

const BUTTON_DELAY = 100; // ms delay before arm draws

const ButtonSpec = {
  type: "button",
  displayName: "Button",

  // Not observable - just a trigger
  isObservable: false,

  // This is an overlay component - sits on top of another component
  isOverlay: true,

  // Allowed on conveyors and conveyor-turns
  allowedHostTypes: ['conveyor', 'conveyor-turn'],

  ports: {
    inputs: [],
    outputs: []
  },

  states: {},
  transitions: {},

  /**
   * Find target arm from button position
   * First checks for adjacent arms, then checks for adjacent sacks
   * and finds the arm connected to that sack (two tiles away)
   * Returns the arm component or null if not found
   */
  findAdjacentArm(component, simulation) {
    const pos = component.position;
    const adjacentPositions = [
      {x: pos.x - 1, y: pos.y},
      {x: pos.x + 1, y: pos.y},
      {x: pos.x, y: pos.y - 1},
      {x: pos.x, y: pos.y + 1}
    ];

    // First, check for directly adjacent arms
    for (const adjPos of adjacentPositions) {
      const arm = simulation.components.find(c =>
        c.type === 'arm' &&
        c.position.x === adjPos.x &&
        c.position.y === adjPos.y
      );
      if (arm) {
        return arm;
      }
    }

    // If no adjacent arm, check for adjacent sacks and find their connected arm
    for (const adjPos of adjacentPositions) {
      const sack = simulation.components.find(c =>
        c.type === 'sack' &&
        c.position.x === adjPos.x &&
        c.position.y === adjPos.y
      );
      if (sack) {
        // Find arm adjacent to this sack (two tiles away from button)
        const sackAdjacentPositions = [
          {x: sack.position.x - 1, y: sack.position.y},
          {x: sack.position.x + 1, y: sack.position.y},
          {x: sack.position.x, y: sack.position.y - 1},
          {x: sack.position.x, y: sack.position.y + 1}
        ];

        for (const sackAdjPos of sackAdjacentPositions) {
          const arm = simulation.components.find(c =>
            c.type === 'arm' &&
            c.position.x === sackAdjPos.x &&
            c.position.y === sackAdjPos.y
          );
          if (arm) {
            return arm;
          }
        }
      }
    }

    return null;
  },

  /**
   * Check if a ball has crossed the center of this button's cell
   * Returns true if the ball crossed center between lastTime and currentTime
   */
  checkBallCrossedCenter(ball, component, lastTime, currentTime) {
    if (!ball.trajectory || !ball.trajectoryStartTime || !ball.trajectoryDuration) {
      return false;
    }

    // Only check balls on the host component (conveyor or conveyor-turn)
    const hostComponent = component.hostComponent;
    if (!hostComponent || ball.componentId !== hostComponent.id) {
      return false;
    }

    // Calculate progress at last time and current time
    const lastProgress = Math.max(0, Math.min(1,
      (lastTime - ball.trajectoryStartTime) / ball.trajectoryDuration
    ));
    const currentProgress = Math.max(0, Math.min(1,
      (currentTime - ball.trajectoryStartTime) / ball.trajectoryDuration
    ));

    // Ball crosses center at progress 0.5 (midpoint of trajectory)
    // Check if center was crossed between last and current time
    return lastProgress < 0.5 && currentProgress >= 0.5;
  },

  /**
   * Trigger the connected arm to draw a ball
   */
  triggerArm(component, simulation, triggerTime) {
    const arm = component.targetArm;
    if (!arm) {
      console.warn(`Button ${component.id} has no target arm`);
      return;
    }

    // Schedule a ball draw after BUTTON_DELAY
    const drawTime = triggerTime + BUTTON_DELAY;

    // Add to dynamic schedule
    if (!simulation.dynamicSchedule) {
      simulation.dynamicSchedule = [];
    }
    simulation.dynamicSchedule.push({
      armId: arm.id,
      time: drawTime,
      triggeredBy: component.id
    });

    // Sort by time
    simulation.dynamicSchedule.sort((a, b) => a.time - b.time);
  },

  // Visual rendering
  visual: {
    size: {width: 64, height: 64},

    /**
     * Draw a button at the specified position with given rotation
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {number} centerX - X position of button center (pixels)
     * @param {number} centerY - Y position of button center (pixels)
     * @param {number} beltWidth - Width of the belt (pixels)
     * @param {number} buttonSize - Size of the button along the belt direction (pixels)
     * @param {number} rotation - Rotation angle in radians (0 = horizontal belt going right)
     */
    drawButton(ctx, centerX, centerY, beltWidth, buttonSize, rotation) {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);

      // Draw gray rectangular button background
      // Button is buttonSize along belt direction, beltWidth perpendicular to belt
      ctx.fillStyle = '#888';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;

      ctx.fillRect(-buttonSize / 2, -beltWidth / 2, buttonSize, beltWidth);
      ctx.strokeRect(-buttonSize / 2, -beltWidth / 2, buttonSize, beltWidth);

      // Draw red circle in center
      const circleRadius = Math.min(buttonSize, beltWidth) * 0.35;
      ctx.fillStyle = '#CC0000';
      ctx.beginPath();
      ctx.arc(0, 0, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    },

    render(ctx, component, time) {
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }

      const pos = component.position;
      const px = pos.x * gridSize;
      const py = pos.y * gridSize;

      // Button dimensions (matches belt width)
      const beltWidth = gridSize * 0.375;
      const buttonSize = beltWidth * 0.8;

      // Get host component to determine button position and orientation
      const hostComponent = component.hostComponent;
      const hostType = hostComponent?.type || 'conveyor';

      let centerX, centerY, rotation;

      if (hostType === 'conveyor-turn') {
        // For conveyor-turn: position at midpoint of arc, rotated to align with belt
        const turn = hostComponent.params?.turn || 'right-to-down';

        // Corner configs matching conveyor-turn.js
        const cornerConfigs = {
          "right-to-down": { cx: 0, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: 0 },
          "right-to-up": { cx: 0, cy: 0, entryAngle: Math.PI/2, exitAngle: 0 },
          "left-to-down": { cx: gridSize, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: Math.PI },
          "left-to-up": { cx: gridSize, cy: 0, entryAngle: Math.PI/2, exitAngle: Math.PI },
          "down-to-right": { cx: gridSize, cy: 0, entryAngle: Math.PI, exitAngle: Math.PI/2 },
          "down-to-left": { cx: 0, cy: 0, entryAngle: 0, exitAngle: Math.PI/2 },
          "up-to-right": { cx: gridSize, cy: gridSize, entryAngle: Math.PI, exitAngle: -Math.PI/2 },
          "up-to-left": { cx: 0, cy: gridSize, entryAngle: 0, exitAngle: -Math.PI/2 }
        };

        const config = cornerConfigs[turn];
        const arcRadius = gridSize * 0.5;  // Center of belt

        // Calculate midpoint angle
        let angleDiff = config.exitAngle - config.entryAngle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const midAngle = config.entryAngle + angleDiff / 2;

        // Button position at arc midpoint
        centerX = px + config.cx + arcRadius * Math.cos(midAngle);
        centerY = py + config.cy + arcRadius * Math.sin(midAngle);

        // Rotation: tangent to the arc (perpendicular to radius)
        // midAngle points from corner to button, so tangent is midAngle + π/2
        rotation = midAngle + Math.PI / 2;

      } else {
        // For straight conveyor: position at cell center
        centerX = px + gridSize * 0.5;
        centerY = py + gridSize * 0.5;

        // Rotation based on conveyor direction
        const direction = hostComponent?.params?.direction || 'right';
        const directionRotations = {
          'right': 0,
          'left': Math.PI,
          'down': Math.PI / 2,
          'up': -Math.PI / 2
        };
        rotation = directionRotations[direction] || 0;
      }

      this.drawButton(ctx, centerX, centerY, beltWidth, buttonSize, rotation);
    },

    /**
     * Get the visual center position of the button (accounting for conveyor-turn arc)
     * @param {Object} component - Button component
     * @param {number} gridSize - Grid cell size in pixels
     * @returns {{x: number, y: number}} Center position in pixels
     */
    getButtonCenter(component, gridSize) {
      const pos = component.position;
      const px = pos.x * gridSize;
      const py = pos.y * gridSize;

      const hostComponent = component.hostComponent;
      const hostType = hostComponent?.type || 'conveyor';

      if (hostType === 'conveyor-turn') {
        const turn = hostComponent.params?.turn || 'right-to-down';

        const cornerConfigs = {
          "right-to-down": { cx: 0, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: 0 },
          "right-to-up": { cx: 0, cy: 0, entryAngle: Math.PI/2, exitAngle: 0 },
          "left-to-down": { cx: gridSize, cy: gridSize, entryAngle: -Math.PI/2, exitAngle: Math.PI },
          "left-to-up": { cx: gridSize, cy: 0, entryAngle: Math.PI/2, exitAngle: Math.PI },
          "down-to-right": { cx: gridSize, cy: 0, entryAngle: Math.PI, exitAngle: Math.PI/2 },
          "down-to-left": { cx: 0, cy: 0, entryAngle: 0, exitAngle: Math.PI/2 },
          "up-to-right": { cx: gridSize, cy: gridSize, entryAngle: Math.PI, exitAngle: -Math.PI/2 },
          "up-to-left": { cx: 0, cy: gridSize, entryAngle: 0, exitAngle: -Math.PI/2 }
        };

        const config = cornerConfigs[turn];
        const arcRadius = gridSize * 0.5;

        let angleDiff = config.exitAngle - config.entryAngle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        const midAngle = config.entryAngle + angleDiff / 2;

        return {
          x: px + config.cx + arcRadius * Math.cos(midAngle),
          y: py + config.cy + arcRadius * Math.sin(midAngle)
        };
      } else {
        // For straight conveyor: cell center
        return {
          x: px + gridSize * 0.5,
          y: py + gridSize * 0.5
        };
      }
    },

    /**
     * Render the wire from button to arm
     * This should be called BEFORE other components are rendered
     */
    renderWire(ctx, component) {
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) return;

      const targetArm = component.targetArm;
      if (!targetArm) return;

      const buttonCenter = this.getButtonCenter(component, gridSize);
      const armCenterX = (targetArm.position.x + 0.5) * gridSize;
      const armCenterY = (targetArm.position.y + 0.5) * gridSize;

      // Draw black wire
      ctx.save();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(buttonCenter.x, buttonCenter.y);
      ctx.lineTo(armCenterX, armCenterY);
      ctx.stroke();

      ctx.restore();
    }
  },

  // Level editor metadata
  editor: {
    icon: "🔴",
    category: "Control",
    hotkey: "n",
    defaultParams: {}
  }
};

// Export BUTTON_DELAY for use in simulation
if (typeof window !== 'undefined') {
  window.BUTTON_DELAY = BUTTON_DELAY;
}

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(ButtonSpec);
}
