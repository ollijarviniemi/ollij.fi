/**
 * VeilRenderer
 *
 * Extends the base Renderer with veil support.
 * Veiled tiles are drawn as opaque black overlays that hide
 * both components and balls beneath them.
 */

class VeilRenderer extends Renderer {
  constructor(canvas) {
    super(canvas);
    this._veiledTileSet = new Set();  // "x,y" strings for fast lookup
  }

  /**
   * Set veiled tiles from level data.
   * @param {Array<{x: number, y: number}>} tiles
   */
  setVeiledTiles(tiles) {
    this._veiledTileSet.clear();
    if (!tiles) return;
    for (const t of tiles) {
      this._veiledTileSet.add(`${t.x},${t.y}`);
    }
  }

  /**
   * Clear all veiled tiles (reveal hidden components).
   */
  clearVeil() {
    this._veiledTileSet.clear();
  }

  /**
   * Check if a grid position is veiled.
   */
  isVeiled(gx, gy) {
    return this._veiledTileSet.has(`${gx},${gy}`);
  }

  /**
   * Override render to add veil overlay after everything else.
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

    // Draw regular components (skip veiled)
    simulation.components.forEach(comp => {
      const spec = ComponentRegistry.get(comp.type);
      if (!spec || !spec.isOverlay) {
        this.drawComponent(comp);
      }
    });

    // Draw overlay components (skip veiled)
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

    // Draw balls (skip veiled)
    simulation.balls.forEach(ball => {
      this.drawBall(ball, currentTime, simulation);
    });

    // Draw veil overlays on top of everything
    this.drawVeilOverlays();
  }

  /**
   * Override drawComponent: skip if component is on a veiled tile.
   */
  drawComponent(component) {
    const pos = component.position;
    if (this.isVeiled(pos.x, pos.y)) {
      return;  // Don't draw anything on veiled tiles
    }
    super.drawComponent(component);
  }

  /**
   * Override drawBall: skip if ball's visual position is on a veiled tile.
   * Also hide ball color if it originated from a veiled component (prevents
   * color flash when transitioning from veil to plex).
   */
  drawBall(ball, currentTime, simulation) {
    // Skip consumed balls (same as base)
    if (ball.componentState === 'consumed') return;

    // Determine ball's visual position to check against veil
    let visualPos;
    try {
      const component = simulation.getComponent(ball.componentId);
      if (ball.trajectory) {
        visualPos = ball.getVisualPosition(currentTime);
      } else if (component && ball.componentState) {
        const spec = ComponentRegistry.get(component.type);
        const stateSpec = spec.states?.[ball.componentState];
        if (stateSpec && stateSpec.getPosition) {
          visualPos = stateSpec.getPosition(ball, component, currentTime);
        }
      }
    } catch (e) {
      // If we can't determine position, let the base class handle (it will throw if needed)
    }

    if (visualPos) {
      const tileX = Math.floor(visualPos.x);
      const tileY = Math.floor(visualPos.y);
      if (this.isVeiled(tileX, tileY)) {
        return;  // Ball is on a veiled tile — don't render
      }
    }

    // If the ball's owning component is on a veiled tile, hide its color.
    // This prevents a color flash when a ball exits the veil onto a plex tile
    // (the ball is in transit, componentId still points to the veiled source).
    const ownerComp = simulation.getComponent(ball.componentId);
    if (ownerComp && this.isVeiled(ownerComp.position.x, ownerComp.position.y)) {
      const savedColorVisible = ball.colorVisible;
      ball.colorVisible = false;
      super.drawBall(ball, currentTime, simulation);
      ball.colorVisible = savedColorVisible;
      return;
    }

    super.drawBall(ball, currentTime, simulation);
  }

  /**
   * Draw opaque black veil overlays with diagonal stripes on each veiled tile.
   */
  drawVeilOverlays() {
    if (this._veiledTileSet.size === 0) return;

    const gs = this.gridSize;

    for (const key of this._veiledTileSet) {
      const [gx, gy] = key.split(',').map(Number);
      const px = gx * gs;
      const py = gy * gs;

      this.ctx.save();

      // Clip to tile
      this.ctx.beginPath();
      this.ctx.rect(px, py, gs, gs);
      this.ctx.clip();

      // Opaque black background
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
      this.ctx.fillRect(px, py, gs, gs);

      // Dark gray diagonal stripes
      this.ctx.strokeStyle = 'rgba(60, 60, 60, 0.6)';
      this.ctx.lineWidth = 2;

      const stripeSpacing = gs / 6;
      for (let i = -gs; i < gs * 2; i += stripeSpacing) {
        this.ctx.beginPath();
        this.ctx.moveTo(px + i, py);
        this.ctx.lineTo(px + i + gs, py + gs);
        this.ctx.stroke();
      }

      this.ctx.restore();

      // Border (after restore so it's not clipped)
      this.ctx.strokeStyle = 'rgba(40, 40, 40, 0.9)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(px, py, gs, gs);
    }
  }
}
