// ProbGraph — a Manifold-style probability chart over WALL-CLOCK time. Stepped
// lines (a price holds flat, then jumps on a trade at the moment it happens),
// fixed 0–100% scale. Re-rendered on a timer so the line keeps extending to
// "now" even when nobody is trading.
(function () {
    const W = 320, H = 150, PADL = 26, PADR = 8, PADT = 8, PADB = 8;

    class ProbGraph {
        constructor(colors) { this.colors = colors; this.samples = []; this.t0 = null; }
        reset() { this.samples = []; this.t0 = null; }

        push(prices, now) {
            if (this.t0 === null) this.t0 = now;
            const last = this.samples[this.samples.length - 1];
            if (last && last.p.every((p, i) => Math.abs(p - prices[i]) < 1e-4)) return; // step only on a real move
            this.samples.push({ t: now, p: prices.slice() });
        }

        svg(now) {
            const plotW = W - PADL - PADR, plotH = H - PADT - PADB;
            const t0 = this.t0 ?? now;
            const span = Math.max(now - t0, 1000); // at least 1s wide
            const X = (t) => PADL + ((t - t0) / span) * plotW;
            const Y = (p) => PADT + (1 - p) * plotH;

            let g = '';
            for (const v of [0, 0.25, 0.5, 0.75, 1]) {
                const y = Y(v).toFixed(1);
                g += `<line x1="${PADL}" y1="${y}" x2="${W - PADR}" y2="${y}" stroke="${v === 0.5 ? '#e2e2e2' : '#f2f2f2'}" stroke-width="1"/>`;
                g += `<text x="${PADL - 5}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="#aaa">${v * 100}%</text>`;
            }

            let lines = '';
            const n = this.colors.length;
            if (this.samples.length) {
                for (let o = 0; o < n; o++) {
                    let d = `M${X(this.samples[0].t).toFixed(1)},${Y(this.samples[0].p[o]).toFixed(1)}`;
                    for (let i = 1; i < this.samples.length; i++) {
                        const x = X(this.samples[i].t).toFixed(1);
                        d += ` L${x},${Y(this.samples[i - 1].p[o]).toFixed(1)} L${x},${Y(this.samples[i].p[o]).toFixed(1)}`;
                    }
                    d += ` L${X(now).toFixed(1)},${Y(this.samples[this.samples.length - 1].p[o]).toFixed(1)}`; // hold to now
                    lines += `<path d="${d}" fill="none" stroke="${this.colors[o]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
                }
            }
            return `<svg viewBox="0 0 ${W} ${H}">${g}${lines}</svg>`;
        }
    }
    window.ProbGraph = ProbGraph;
})();
