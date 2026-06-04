/**
 * Sack Component - Ball Source
 *
 * Produces colored balls according to distribution
 */

const SackSpec = {
  type: "sack",
  displayName: "Sack (Ball Container)",

  // NOT observable - sacks are the source of uncertainty!
  isObservable: false,

  ports: {
    inputs: [],
    outputs: [
      {id: "output", direction: null, offset: {x: 0.5, y: 0.7}, required: false}
    ]
  },

  // Sack doesn't have ball states (balls spawn outside)
  states: {},
  transitions: {},

  // Ball production logic
  behavior: {
    /**
     * Draw one ball from sack
     */
    draw(rng, params) {
      if (!params.contents) {
        throw new Error("Sack contents not set! Must assign sack contents from hypothesis before producing balls. This typically happens in sampleAndAssignHypothesis().");
      }

      const contents = params.contents;  // {red: 7, blue: 3}
      const colors = Object.keys(contents);
      const weights = colors.map(c => contents[c]);

      if (weights.length === 0) {
        throw new Error("Sack has no contents (empty distribution)");
      }

      return rng.weightedChoice(colors, weights);
    }
  },

  // For Bayesian inference
  inference: {
    /**
     * Given observed color, what's probability under this distribution?
     */
    getProbability(color, params) {
      const contents = params.contents;
      const total = Object.values(contents).reduce((a, b) => a + b, 0);
      return (contents[color] || 0) / total;
    }
  },

  // Visual rendering
  visual: {
    imagePath: "images/sack_{label}.png",
    size: {width: 32, height: 40},

    render(ctx, component) {
      // Check if sack should be hidden (during animation)
      if (component.params.hidden) {
        return;
      }

      const pos = component.position;
      const gridSize = ctx.canvas._gridSize;
      if (!gridSize) {
        throw new Error('gridSize not available on canvas context');
      }

      const renderer = window.SackRenderer;
      if (!renderer) {
        throw new Error('SackRenderer not loaded! Make sure config/sack-renderer.js is included before components.');
      }

      const px = pos.x * gridSize;
      const py = pos.y * gridSize;

      // Sack dimensions
      const sackWidth = gridSize * renderer.SACK_WIDTH_RATIO;
      const sackHeight = gridSize * renderer.SACK_HEIGHT_RATIO;
      const sackX = px + (gridSize - sackWidth) / 2;
      const sackY = py + (gridSize - sackHeight) / 2 + gridSize * 0.05;

      const contents = component.params.contents;
      const showContents = component.params.showContents === true;
      const fillColor = component.params.listColor || renderer.DEFAULT_COLOR;

      renderer.renderSack(ctx, sackX, sackY, sackWidth, sackHeight, {
        fillColor,
        contents,
        showContents
      });

      // Draw golden star if this is the betting sack (on top of everything)
      if (component.params.isBettingSack) {
        const centerX = px + gridSize / 2;
        const centerY = sackY + sackHeight / 2;
        renderer.drawStar(ctx, centerX, centerY, gridSize * 0.3);
      }
    }
  },

  // Level editor metadata
  editor: {
    icon: "🎒",
    category: "Source",
    defaultParams: {
      // NO default contents - must be explicitly set or assigned from hypothesis!
      label: "A",
      showContents: true
    }
  }
};

// Register component
if (typeof ComponentRegistry !== 'undefined') {
  ComponentRegistry.register(SackSpec);
}
