/**
 * Renderer
 *
 * Renders simulation state to canvas
 */

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridSize = 64;  // pixels per grid cell
    this.images = {};    // Loaded images
    this.imagesLoaded = false;
    this.showLabels = false;  // Component labels like A1, B2
  }

  /**
   * Load all images
   */
  async loadImages(imagePaths) {
    const promises = imagePaths.map(path => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          this.images[path] = img;
          resolve();
        };
        img.onerror = () => {
          console.warn(`Failed to load image: ${path}`);
          resolve();  // Continue even if image fails
        };
        img.src = path;
      });
    });

    await Promise.all(promises);
    this.imagesLoaded = true;
  }

  /**
   * Main render function
   */
  render(simulation, currentTime) {
    // Store gridSize on canvas for components to access
    this.canvas._gridSize = this.gridSize;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid (optional)
    if (this.showGrid) {
      this.drawGrid();
    }

    // Draw button wires FIRST (under other components)
    this.drawButtonWires(simulation.components);

    // Draw regular non-arm components first (sacks, conveyors, etc.)
    simulation.components.forEach(comp => {
      const spec = ComponentRegistry.get(comp.type);
      if ((!spec || !spec.isOverlay) && comp.type !== 'arm') {
        this.drawComponent(comp);
      }
    });

    // Draw arms on top of sacks/conveyors
    simulation.components.forEach(comp => {
      if (comp.type === 'arm') {
        this.drawComponent(comp);
      }
    });

    // Draw overlay components (buttons) on top
    simulation.components.forEach(comp => {
      const spec = ComponentRegistry.get(comp.type);
      if (spec && spec.isOverlay) {
        this.drawComponent(comp);
      }
    });

    // Draw component labels (after components, before balls)
    if (this.showLabels) {
      this.drawComponentLabels(simulation.components);
    }

    // Draw balls
    simulation.balls.forEach(ball => {
      this.drawBall(ball, currentTime, simulation);
    });
  }

  /**
   * Draw grid lines
   */
  drawGrid() {
    this.ctx.strokeStyle = "#ddd";
    this.ctx.lineWidth = 1;

    for (let x = 0; x < this.canvas.width; x += this.gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    for (let y = 0; y < this.canvas.height; y += this.gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }

  /**
   * Draw button wires (under other components)
   */
  drawButtonWires(components) {
    const buttons = components.filter(c => c.type === 'button');
    if (buttons.length === 0) return;

    const buttonSpec = ComponentRegistry.get('button');
    if (!buttonSpec || !buttonSpec.visual.renderWire) return;

    for (const button of buttons) {
      buttonSpec.visual.renderWire(this.ctx, button);
    }
  }

  /**
   * Draw component
   */
  drawComponent(component) {
    const spec = ComponentRegistry.get(component.type);
    const pos = this.gridToPixel(component.position);

    // Try to use component's render method
    if (spec.visual.render) {
      this.ctx.save();
      spec.visual.render(this.ctx, component);
      this.ctx.restore();
    }

    // If image available, draw over it
    const imagePath = this.resolveImagePath(spec.visual.imagePath, component);
    if (imagePath && this.images[imagePath]) {
      const img = this.images[imagePath];
      this.ctx.drawImage(img, pos.x, pos.y);
    }

    // Draw plex glass overlay
    if (component.params && component.params.plex) {
      this.ctx.save();

      // Clip to component boundaries
      this.ctx.beginPath();
      this.ctx.rect(pos.x, pos.y, this.gridSize, this.gridSize);
      this.ctx.clip();

      // Semi-transparent gray background
      this.ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
      this.ctx.fillRect(pos.x, pos.y, this.gridSize, this.gridSize);

      // Draw diagonal stripes
      this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
      this.ctx.lineWidth = 2;

      const stripeSpacing = this.gridSize / 6; // 6 stripes across
      for (let i = -this.gridSize; i < this.gridSize * 2; i += stripeSpacing) {
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x + i, pos.y);
        this.ctx.lineTo(pos.x + i + this.gridSize, pos.y + this.gridSize);
        this.ctx.stroke();
      }

      this.ctx.restore();

      // Draw border (after restore so it's not clipped)
      this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.8)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(pos.x, pos.y, this.gridSize, this.gridSize);
    }
  }

  /**
   * Draw ball
   */
  drawBall(ball, currentTime, simulation) {
    // Skip consumed balls immediately (before trying to get position)
    // This prevents errors when balls are marked consumed but haven't been filtered out yet
    if (ball.componentState === 'consumed') {
      return;
    }

    // Skip balls in observation points with >25 balls (they show a count instead)
    // Only skip 'observed' balls, not 'arriving' balls (which are still animating)
    if (ball.componentState === 'observed') {
      const comp = simulation.getComponent(ball.componentId);
      if (comp && comp.type === 'observation' && comp.observedBalls && comp.observedBalls.length > 25) {
        return;
      }
    }

    // Get visual position - may be from trajectory or component state
    let visualPos;
    const component = simulation.getComponent(ball.componentId);

    // CRITICAL: Check for trajectory FIRST - only use getPosition() if no trajectory exists
    if (ball.trajectory) {
      // Ball is following a trajectory - use that
      visualPos = ball.getVisualPosition(currentTime);
    } else if (component && ball.componentState) {
      // No trajectory - check if the component state has a custom getPosition method
      const spec = ComponentRegistry.get(component.type);
      const stateSpec = spec.states?.[ball.componentState];
      if (stateSpec && stateSpec.getPosition) {
        visualPos = stateSpec.getPosition(ball, component, currentTime);
      } else {
        // No trajectory AND no getPosition - this is an error
        throw new Error(
          `Ball ${ball.id} has no trajectory and its state "${ball.componentState}" (component ${component.type}) ` +
          `has no getPosition method. This indicates a bug - the ball should either have a trajectory or ` +
          `the component state should have a getPosition method.`
        );
      }
    } else {
      // No component or state - fall back to trajectory (will throw if missing)
      visualPos = ball.getVisualPosition(currentTime);
    }

    const px = this.gridToPixel(visualPos);

    // Get visual properties
    let visualProps = ball.visualProperties;

    if (component) {
      const spec = ComponentRegistry.get(component.type);
      const stateSpec = spec.states[ball.componentState];

      if (stateSpec && stateSpec.visual) {
        visualProps = this.evaluateVisualProps(stateSpec.visual, ball, currentTime);
      }
    }

    // Skip rendering if ball is invisible (consumed check already done at function start)
    if (visualProps.opacity <= 0.01 || visualProps.scale <= 0.01) {
      return;
    }

    // Apply transformations
    this.ctx.save();
    this.ctx.globalAlpha = visualProps.opacity;

    if (visualProps.rotation) {
      this.ctx.translate(px.x, px.y);
      this.ctx.rotate(visualProps.rotation * Math.PI / 180);
      this.ctx.translate(-px.x, -px.y);
    }

    // Draw ball
    const radius = (this.gridSize * 0.2) * visualProps.scale;  // 40% of grid cell size (diameter), so radius = 20%

    // Check if current component has plex glass
    const isPlexed = component && component.params && component.params.plex;
    const colorVisible = ball.colorVisible && !isPlexed;

    const color = colorVisible ? this.getBallColor(ball.color) : '#888888';

    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    this.ctx.beginPath();
    this.ctx.arc(px.x, px.y, radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // Draw colorblind marker if enabled
    if (colorVisible && window.BallColors.colorblindMode) {
      window.BallColors.drawMarker(this.ctx, px.x, px.y, radius, ball.color);
    }

    // Draw "?" if color hidden
    if (!colorVisible) {
      this.ctx.fillStyle = '#000';
      this.ctx.font = 'bold 10px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('?', px.x, px.y);
    }

    this.ctx.restore();
  }

  /**
   * Get ball color hex code
   */
  getBallColor(colorName) {
    if (!window.BallColors) {
      throw new Error('BallColors not loaded! Make sure config/colors.js is included.');
    }
    return window.BallColors.getHex(colorName);
  }

  /**
   * Evaluate visual properties (handle functions)
   */
  evaluateVisualProps(visual, ball, currentTime) {
    const progress = ball.trajectoryDuration > 0
      ? Math.min(1, (currentTime - ball.trajectoryStartTime) / ball.trajectoryDuration)
      : 0;

    return {
      opacity: typeof visual.opacity === 'function' ? visual.opacity(progress, ball, currentTime) : (visual.opacity || 1.0),
      scale: typeof visual.scale === 'function' ? visual.scale(progress, ball, currentTime) : (visual.scale || 1.0),
      rotation: typeof visual.rotation === 'function' ? visual.rotation(progress, ball, currentTime) : (visual.rotation || 0)
    };
  }

  /**
   * Grid to pixel conversion
   */
  gridToPixel(gridPos) {
    return {
      x: gridPos.x * this.gridSize,
      y: gridPos.y * this.gridSize
    };
  }

  /**
   * Resolve image path with parameters
   */
  resolveImagePath(template, component) {
    if (!template) return null;

    return template
      .replace('{direction}', component.params.direction || '')
      .replace('{label}', component.params.label || '');
  }

  /**
   * Toggle grid visibility
   */
  setShowGrid(show) {
    this.showGrid = show;
  }

  /**
   * Toggle component labels visibility
   */
  setShowLabels(show) {
    this.showLabels = show;
  }

  /**
   * Compute bounding rectangle of all components
   * Returns {minX, minY, maxX, maxY} in grid coordinates
   */
  computeBoundingBox(components) {
    if (!components || components.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    components.forEach(comp => {
      const x = comp.position.x;
      const y = comp.position.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });

    return { minX, minY, maxX, maxY };
  }

  /**
   * Get label for a component position relative to bounding box
   * Returns string like "A1", "B2", etc.
   * Column = letter (A, B, C...), Row = number (1, 2, 3...)
   */
  getComponentLabel(position, boundingBox) {
    const relX = position.x - boundingBox.minX;
    const relY = position.y - boundingBox.minY;

    // Column letter (A, B, C, ...)
    const colLetter = String.fromCharCode(65 + relX);  // 65 = 'A'
    // Row number (1-indexed)
    const rowNumber = relY + 1;

    return `${colLetter}${rowNumber}`;
  }

  /**
   * Draw component labels
   */
  drawComponentLabels(components) {
    if (!components || components.length === 0) return;

    const boundingBox = this.computeBoundingBox(components);

    this.ctx.save();
    this.ctx.font = 'bold 12px sans-serif';
    this.ctx.fillStyle = '#000000';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    components.forEach(comp => {
      const label = this.getComponentLabel(comp.position, boundingBox);
      const pos = this.gridToPixel(comp.position);

      // Draw label in top-left corner with small padding
      this.ctx.fillText(label, pos.x + 3, pos.y + 2);
    });

    this.ctx.restore();
  }
}
