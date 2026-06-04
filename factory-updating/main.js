/**
 * Main Application
 *
 * Ties together simulation, rendering, and Bayesian inference
 */

class BayesianFactoryApp {
  constructor() {
    this.canvas = document.getElementById('factory-canvas');
    this.level = null;
    this.simulation = null;
    this.renderer = null;
    this.bayesianInference = null;
    this.running = false;
    this.speed = 1.0;
    this.lastTime = 0;

    // UI elements
    this.playPauseBtn = document.getElementById('play-pause');
    this.resetBtn = document.getElementById('reset');
    this.speedBtn = document.getElementById('speed');
    this.hypothesisList = document.getElementById('hypothesis-list');
    this.ballsSeenEl = document.getElementById('balls-seen');
    this.entropyEl = document.getElementById('entropy');
    this.mostLikelyInfo = document.getElementById('most-likely-info');

    this.ballsSeen = 0;
  }

  /**
   * Initialize app with level
   */
  async init(level) {
    this.level = level;

    // Create renderer first to get gridSize
    this.renderer = new Renderer(this.canvas);
    this.renderer.setShowGrid(true);

    // Set canvas size based on level grid and renderer's gridSize
    this.canvas.width = level.grid.width * this.renderer.gridSize;
    this.canvas.height = level.grid.height * this.renderer.gridSize;

    // Create simulation
    this.simulation = new Simulation(level, level.simulation);
    this.simulation.resolveReferences();

    // Build hypotheses
    const builder = new HypothesisBuilder(level.hypothesisSpace);
    const hypotheses = builder.build();

    // Create Bayesian inference
    this.bayesianInference = new BayesianInference(hypotheses);

    // Set up observation callback
    const collectionPoint = this.simulation.getComponent("collection1");
    if (collectionPoint) {
      collectionPoint.onObservation = (data) => {
        this.handleObservation(data.observation);
      };
    }

    // Set up UI handlers
    this.setupUIHandlers();

    // Render initial state
    this.updateUI();
    this.renderer.render(this.simulation, 0);

  }

  /**
   * Setup UI button handlers
   */
  setupUIHandlers() {
    this.playPauseBtn.onclick = () => {
      if (this.running) {
        this.pause();
      } else {
        this.play();
      }
    };

    this.resetBtn.onclick = () => {
      this.reset();
    };

    this.speedBtn.onclick = () => {
      this.cycleSpeed();
    };
  }

  /**
   * Play simulation
   */
  play() {
    this.running = true;
    this.playPauseBtn.textContent = "⏸️ Pause";
    this.playPauseBtn.classList.remove('primary');
    this.lastTime = performance.now();
    this.loop();
  }

  /**
   * Pause simulation
   */
  pause() {
    this.running = false;
    this.playPauseBtn.textContent = "▶️ Play";
    this.playPauseBtn.classList.add('primary');
  }

  /**
   * Reset simulation
   */
  reset() {
    this.pause();
    this.simulation.reset();
    this.bayesianInference.reset();
    this.ballsSeen = 0;
    this.updateUI();
    this.renderer.render(this.simulation, 0);
  }

  /**
   * Cycle through speeds
   */
  cycleSpeed() {
    const speeds = [0.5, 1.0, 2.0, 4.0];
    const currentIndex = speeds.indexOf(this.speed);
    this.speed = speeds[(currentIndex + 1) % speeds.length];
    this.speedBtn.textContent = `${this.speed}x`;
  }

  /**
   * Main game loop
   */
  loop() {
    if (!this.running) return;

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastTime) * this.speed;
    this.lastTime = currentTime;

    // Update simulation
    this.simulation.tick(deltaTime);

    // Render
    this.renderer.render(this.simulation, this.simulation.getTime());

    // Continue loop
    requestAnimationFrame(() => this.loop());
  }

  /**
   * Handle new observation
   */
  handleObservation(observation) {

    this.ballsSeen++;

    // Update Bayesian inference
    this.bayesianInference.update(observation);

    // Update UI
    this.updateUI();
  }

  /**
   * Update UI with current state
   */
  updateUI() {
    // Update stats
    this.ballsSeenEl.textContent = this.ballsSeen;
    this.entropyEl.textContent = this.bayesianInference.getEntropy().toFixed(2);

    // Update hypothesis list
    this.hypothesisList.innerHTML = '';

    const topHypotheses = this.bayesianInference.getTopN(Math.min(5, this.bayesianInference.hypotheses.length));

    topHypotheses.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'hypothesis-item' + (i === 0 ? ' top' : '');

      const label = document.createElement('div');
      label.className = 'hypothesis-label';
      label.textContent = item.hypothesis.label;

      const prob = document.createElement('div');
      prob.className = 'hypothesis-probability';
      prob.textContent = `${(item.probability * 100).toFixed(1)}%`;

      const bar = document.createElement('div');
      bar.className = 'probability-bar';
      const fill = document.createElement('div');
      fill.className = 'probability-fill';
      fill.style.width = `${item.probability * 100}%`;
      bar.appendChild(fill);

      div.appendChild(label);
      div.appendChild(prob);
      div.appendChild(bar);

      this.hypothesisList.appendChild(div);
    });

    // Update most likely info
    if (this.ballsSeen > 0) {
      const mostLikely = this.bayesianInference.getMostLikely();
      this.mostLikelyInfo.textContent = `Most likely: ${mostLikely.hypothesis.label} (${(mostLikely.probability * 100).toFixed(1)}%)`;
    } else {
      this.mostLikelyInfo.textContent = "No observations yet";
    }
  }
}

// Initialize app when page loads
window.addEventListener('DOMContentLoaded', () => {
  const app = new BayesianFactoryApp();
  app.init(TestSimpleLevel);
  window.app = app;  // For debugging
});
