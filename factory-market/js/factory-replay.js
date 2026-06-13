// FactoryReplay — drives the shared factory engine to animate a player's private
// stream of balls, one at a time, deterministically from a seed.
//
// Determinism contract: balls are produced STRICTLY one at a time (the next is
// drawn only once the previous has landed in an observation bin). This keeps the
// routing RNG (splitter/shuffler) consuming in a fixed order, so the same seed
// always yields the same draws + routing. Ball colors are precomputed per index
// from the seed, independent of routing. "Restart" rebuilds the Simulation from
// the same seed → byte-identical replay. Raising the target (GM increments N)
// just appends the next draw without disturbing the first N.
//
// Globals required (loaded via <script> before this file): Simulation, VeilRenderer.

(function () {
    const FIXED_STEP = 25; // sim-ms per integration step (deterministic schedule)

    function activeBalls(sim) {
        return sim.balls.filter(b => b.componentState !== 'observed' && b.componentState !== 'consumed');
    }

    class FactoryReplay {
        /**
         * @param {HTMLCanvasElement} canvas
         * @param {object} opts { cellSize, speed, onTally }
         */
        constructor(canvas, opts = {}) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.cellSize = opts.cellSize || 56;
            this.speed = opts.speed || 2.0;            // 2× by default
            this.onTally = opts.onTally || null;
            this.pad = opts.pad ?? 44;
            // The arm draws a new ball every ~1 wall-second regardless of whether
            // the previous has landed (like an x2/x3 arm) — balls overlap. Tied to
            // SIM time (= 1000ms * speed) so the schedule stays deterministic and
            // the GM's grid matches each player's own view exactly.
            this.drawIntervalSim = opts.drawIntervalSim ?? (1000 * this.speed);

            this.level = null;
            this.seed = null;
            this.target = 0;        // how many balls should be shown (= N)
            this.spawned = 0;
            this.armSeq = [];
            this.sim = null;
            this.renderer = null;
            this._raf = null;
            this._lastT = 0;
        }

        /** Load a locked level + this player's seed. Resets to N=target balls. */
        load(level, seed, target) {
            this.level = level;
            this.seed = seed;
            this.target = target || 1;
            this._revealed = false;
            this._fitCanvas();
            this._build();
            this._start();
        }

        /** GM raised N: show more balls (keep the first ones identical). */
        setTarget(n) {
            if (n <= this.target) { this.target = n; return; }
            this.target = n;
            this._start(); // wake the loop if it had frozen
        }

        /** Replay from ball 1 with the same seed (byte-identical). */
        restart() {
            this._build();
            this._start();
        }

        /** Re-fit the canvas to its (now-visible) container and repaint. */
        refit() {
            if (!this.level) return;
            this._fitCanvas();
            if (this.renderer) this.renderer.gridSize = this.cellSize;
            // Repaint when the animation loop isn't running (a frozen frame would
            // otherwise stay blank after a resize clears the canvas).
            if (!this._raf) this._paint();
        }

        /** Lift the plexiglass — show what was behind the veil (on resolve). */
        reveal() {
            this._revealed = true;
            if (this.renderer && this.renderer.setVeiledTiles) this.renderer.setVeiledTiles([]);
            if (!this._raf) this._paint();
        }

        // ---- internals ----

        _fitCanvas() {
            const g = this.level.grid || { width: 12, height: 8 };
            // Fill the parent area: fit to its width, and to its height too when
            // the parent has a real height (the game's .canvas-area). For the
            // tutorial's height:auto wrap, fall back to width-only.
            const area = this.canvas.parentElement;
            const aw = (area?.clientWidth || g.width * 40) - this.pad;
            const ah = (area?.clientHeight || 0) - this.pad;
            let cell = Math.floor(aw / g.width);
            if (ah > 60) cell = Math.min(cell, Math.floor(ah / g.height));
            cell = Math.max(18, cell);
            this.cellSize = cell;
            const w = g.width * cell, h = g.height * cell;
            // Assigning canvas.width/height CLEARS the canvas — only do it when the
            // size actually changes, so a no-op refit doesn't blank a frozen frame.
            if (this.canvas.width !== w || this.canvas.height !== h) {
                this.canvas.width = w; this.canvas.height = h;
            }
        }

        _build() {
            // Fresh Simulation guarantees a clean, deterministic run from the seed.
            this.sim = new Simulation(this.level, {
                seed: this.seed,
                ballSpeed: this.speed,
                ballsToSpawn: 0, // we drive production manually
            });
            if (typeof this.sim.resolveReferences === 'function') this.sim.resolveReferences();
            // Disable the engine's automatic schedule-driven spawning: we produce
            // balls ourselves on a fixed sim-time cadence (see _start/_spawnDue).
            this._armSeqFrom(this.level);
            this.sim.samplingSchedule = [];
            this.sim.scheduleIndex = 0;
            this.spawned = 0;

            if (!this.renderer) {
                this.renderer = new VeilRenderer(this.canvas);
            }
            this.renderer.gridSize = this.cellSize;
            if (typeof this.renderer.setShowGrid === 'function') this.renderer.setShowGrid(true);
            if (typeof this.renderer.setVeiledTiles === 'function') {
                this.renderer.setVeiledTiles(this._revealed ? [] : (this.level.veiledTiles || []));
            }
            this._emitTally();
        }

        _armSeqFrom(level) {
            const sched = level.samplingSchedule || [];
            const seq = sched.map(e => e.armId || e.sackId).filter(Boolean);
            if (seq.length === 0) {
                const arms = (level.components || []).filter(c => c.type === 'arm');
                if (arms.length) seq.push(...arms.map(a => a.id));
            }
            if (seq.length === 0) {
                // last resort: a sack feeding directly
                const sacks = (level.components || []).filter(c => c.type === 'sack');
                seq.push(...sacks.map(s => s.id));
            }
            this.armSeq = seq;
        }

        _observationComps() {
            return (this.level.components || [])
                .filter(c => c.type === 'observation')
                .sort((a, b) => (a.params.observationIndex ?? 0) - (b.params.observationIndex ?? 0))
                .map(c => this.sim.getComponent ? this.sim.getComponent(c.id)
                    : this.sim.components.find(k => k.id === c.id));
        }

        _emitTally() {
            if (!this.onTally) return;
            const counts = this._observationComps().map(c => (c && c.observations ? c.observations.length : 0));
            this.onTally(counts, this.spawned, this.target);
        }

        _spawnNext() {
            if (!this.armSeq.length) return;
            const armId = this.armSeq[this.spawned % this.armSeq.length];
            this.sim.produceBallFromArm(armId);
            this.spawned++;
        }

        // Spawn any balls whose draw time has arrived (sim.time >= k * interval).
        _spawnDue() {
            let spawned = false;
            while (this.spawned < this.target && this.sim.time >= this.spawned * this.drawIntervalSim) {
                this._spawnNext(); spawned = true;
            }
            return spawned;
        }

        _start() {
            if (this._raf) return; // already looping
            this._lastT = performance.now();
            this._acc = 0;
            const loop = () => {
                const now = performance.now();
                this._acc += Math.min(now - this._lastT, 100) * this.speed; // sim-ms to advance
                this._lastT = now;

                // Fixed-step integration → deterministic schedule even though balls
                // overlap; production is checked at each fixed sim-time boundary.
                let steps = 0, changed = false;
                if (this._spawnDue()) changed = true;
                while (this._acc >= FIXED_STEP && steps < 240) {
                    this.sim.tick(FIXED_STEP);
                    this._acc -= FIXED_STEP; steps++;
                    if (this._spawnDue()) changed = true;
                }
                if (changed) this._emitTally();

                this._paint();

                const done = this.spawned >= this.target && activeBalls(this.sim).length === 0;
                if (done) { this._raf = null; this._emitTally(); return; } // freeze
                this._raf = requestAnimationFrame(loop);
            };
            this._raf = requestAnimationFrame(loop);
        }

        _paint() {
            const t = (typeof this.sim.getTime === 'function') ? this.sim.getTime() : this.sim.time;
            this.ctx.fillStyle = '#f7f7f5';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderer.render(this.sim, t);
        }

        destroy() {
            if (this._raf) cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }

    window.FactoryReplay = FactoryReplay;
})();
