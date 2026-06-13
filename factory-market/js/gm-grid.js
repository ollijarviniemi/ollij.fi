// GMGrid — the game master's view of what every player sees. One small factory
// replay per trader (that trader's seed + the shared veiled level + N). Cells
// are auto-sized to fill the area (fit); zoom + pan work like the chip-firing
// game: transform-based (translate + scale) with smooth easing toward a target,
// plain-wheel zoom-at-cursor, and direct drag-to-pan.
(function () {
    const GAP = 12, CHROME = 30;
    const MIN_ZOOM = 1, MAX_ZOOM = 6;

    class GMGrid {
        constructor(container) {
            this.container = container;     // viewport (overflow hidden)
            this.cellsEl = null;
            this.cells = new Map();         // seed -> { el, replay, name }
            this.level = null; this.N = 1; this.revealed = false;
            // transform state (applied + target, eased)
            this.scale = 1; this.px = 0; this.py = 0;
            this.tscale = 1; this.tpx = 0; this.tpy = 0;
            this._ease = null;
            this._initInput();
        }

        _ensure() {
            if (!this.cellsEl) {
                this.cellsEl = document.createElement('div');
                this.cellsEl.className = 'gm-cells';
                this.container.appendChild(this.cellsEl);
            }
        }

        update(level, players, N, revealed) {
            this._ensure();
            this.level = level; this.N = N;
            const prevCount = this.cells.size;
            const want = new Map(players.filter(p => p.seed != null).map(p => [p.seed, p.name]));

            for (const [seed, cell] of this.cells) {
                if (!want.has(seed)) { cell.replay.destroy(); cell.el.remove(); this.cells.delete(seed); }
            }
            for (const [seed, name] of want) {
                let cell = this.cells.get(seed);
                if (!cell) {
                    const el = document.createElement('div');
                    el.className = 'gm-cell';
                    el.innerHTML = `<div class="name"></div><div class="cwrap"><canvas></canvas></div>`;
                    el.querySelector('.name').textContent = name;
                    this.cellsEl.appendChild(el);
                    const replay = new FactoryReplay(el.querySelector('canvas'), { pad: 10 });
                    replay.load(JSON.parse(JSON.stringify(level)), seed, N);
                    cell = { el, replay, name };
                    this.cells.set(seed, cell);
                } else {
                    if (cell.name !== name) { cell.el.querySelector('.name').textContent = name; cell.name = name; }
                    cell.replay.setTarget(N);
                }
            }

            if (revealed && !this.revealed) { for (const c of this.cells.values()) c.replay.reveal(); }
            this.revealed = revealed;

            let ph = this.cellsEl.querySelector('.gm-grid-empty');
            if (this.cells.size === 0) {
                if (!ph) { ph = document.createElement('div'); ph.className = 'gm-grid-empty'; ph.textContent = 'No players have joined yet.'; this.cellsEl.appendChild(ph); }
            } else if (ph) ph.remove();

            // Fit only on first fill; afterwards keep the GM's zoom/pan.
            if (prevCount === 0 && this.cells.size > 0) this.fit(); else this._relayout();
        }

        // Size the cells (at scale 1) to fill the viewport for the player count.
        _relayout() {
            const P = this.cells.size;
            if (!P || !this.cellsEl) return;
            const vw = this.container.clientWidth, vh = this.container.clientHeight;
            if (vw < 10 || vh < 10) return;
            const g = this.level?.grid || { width: 10, height: 8 };
            const A = g.width / g.height;
            let best = { cw: 0, cols: 1, cellW: vw, cwrapH: vh - CHROME };
            for (let cols = 1; cols <= P; cols++) {
                const rows = Math.ceil(P / cols);
                const cellW = (vw - (cols - 1) * GAP) / cols;
                const cwrapH = (vh - (rows - 1) * GAP) / rows - CHROME;
                if (cwrapH <= 0) continue;
                const fitW = Math.min(cellW, cwrapH * A);
                if (fitW > best.cw) best = { cw: fitW, cols, cellW, cwrapH };
            }
            this.cellsEl.style.gridTemplateColumns = `repeat(${best.cols}, ${best.cellW}px)`;
            for (const c of this.cells.values()) c.el.querySelector('.cwrap').style.height = `${Math.max(60, best.cwrapH)}px`;
            for (const c of this.cells.values()) c.replay.refit();
            this._clamp(); this._apply();
        }

        // ---- transform (chip-firing-style) ----
        _apply() { if (this.cellsEl) this.cellsEl.style.transform = `translate(${this.px}px, ${this.py}px) scale(${this.scale})`; }

        _clamp() {
            const vw = this.container.clientWidth, vh = this.container.clientHeight;
            const cw = (this.cellsEl?.offsetWidth || vw) * this.tscale;
            const ch = (this.cellsEl?.offsetHeight || vh) * this.tscale;
            this.tpx = Math.min(0, Math.max(Math.min(0, vw - cw), this.tpx));
            this.tpy = Math.min(0, Math.max(Math.min(0, vh - ch), this.tpy));
        }

        _startEase() {
            if (this._ease) return;
            const step = () => {
                const k = 0.28;
                this.scale += (this.tscale - this.scale) * k;
                this.px += (this.tpx - this.px) * k;
                this.py += (this.tpy - this.py) * k;
                this._apply();
                if (Math.abs(this.tscale - this.scale) < 1e-3 && Math.abs(this.tpx - this.px) < 0.5 && Math.abs(this.tpy - this.py) < 0.5) {
                    this.scale = this.tscale; this.px = this.tpx; this.py = this.tpy; this._apply();
                    this._ease = null; return;
                }
                this._ease = requestAnimationFrame(step);
            };
            this._ease = requestAnimationFrame(step);
        }

        _zoomAt(clientX, clientY, factor) {
            const rect = this.container.getBoundingClientRect();
            const mx = clientX - rect.left, my = clientY - rect.top;
            const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.tscale * factor));
            const contentX = (mx - this.tpx) / this.tscale, contentY = (my - this.tpy) / this.tscale;
            this.tpx = mx - contentX * nz; this.tpy = my - contentY * nz; this.tscale = nz;
            this._clamp(); this._startEase();
        }

        zoomBy(factor) {
            const rect = this.container.getBoundingClientRect();
            this._zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
        }

        fit() { this.tscale = 1; this.tpx = 0; this.tpy = 0; this.scale = 1; this.px = 0; this.py = 0; this._relayout(); }

        refit() { this._relayout(); }

        replayAll() { for (const c of this.cells.values()) c.replay.restart(); }

        clear() {
            for (const c of this.cells.values()) { c.replay.destroy(); c.el.remove(); }
            this.cells.clear();
            if (this.cellsEl) this.cellsEl.innerHTML = '';
            this.revealed = false;
        }

        _initInput() {
            const C = this.container;
            C.addEventListener('wheel', (e) => {
                e.preventDefault();
                this._zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1 / 1.12 : 1.12);
            }, { passive: false });

            let down = false, sx = 0, sy = 0, spx = 0, spy = 0;
            C.addEventListener('mousedown', (e) => { down = true; sx = e.clientX; sy = e.clientY; spx = this.tpx; spy = this.tpy; C.classList.add('grabbing'); });
            window.addEventListener('mousemove', (e) => {
                if (!down) return;
                this.tpx = spx + (e.clientX - sx); this.tpy = spy + (e.clientY - sy);
                this._clamp();
                this.px = this.tpx; this.py = this.tpy; this._apply(); // direct = responsive drag
            });
            window.addEventListener('mouseup', () => { down = false; C.classList.remove('grabbing'); });
        }
    }
    window.GMGrid = GMGrid;
})();
