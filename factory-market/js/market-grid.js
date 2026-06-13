// MarketGrid — the prediction market drawn as the factory games' 10-row × N-col
// probability grid. This canvas is pure display: the blue line per column is the
// market price; the green dashed line is the true probability (GM / after
// resolve). Per-column +/- trade buttons and the A/B/C labels are HTML, laid out
// by market-ui.js using the geometry this exposes (gridX, cellW, width).
(function () {
    const ROWS = 10, CELL_H = 42, LABEL_W = 38, TOP = 12, BOT = 8;

    class MarketGrid {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.options = []; this.prices = []; this.truth = null;
        }

        set(options, prices, { truth = null } = {}) {
            this.options = options; this.prices = prices; this.truth = truth;
            this._layout(); this._draw();
        }

        _layout() {
            const n = this.options.length || 1;
            const avail = this.canvas.parentElement?.clientWidth || 280;
            const cellW = Math.max(64, Math.min(160, Math.floor((avail - 2 * LABEL_W - 2) / n)));
            this.cellW = cellW; this.gridX = LABEL_W; this.gridY = TOP;
            this.gridW = n * cellW; this.gridH = ROWS * CELL_H;
            this.width = LABEL_W + this.gridW + LABEL_W + 2;
            this.canvas.width = this.width;
            this.canvas.height = TOP + this.gridH + BOT;
        }

        _draw() {
            const ctx = this.ctx, { gridX, gridY, gridW, gridH, cellW } = this;
            const n = this.options.length;
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.setLineDash([]);
            for (let c = 0; c <= n; c++) { const x = gridX + c * cellW; line(ctx, x, gridY, x, gridY + gridH); }
            ctx.setLineDash([4, 4]);
            for (let r = 1; r < ROWS; r++) {
                const y = gridY + r * CELL_H, major = r % 2 === 0;
                ctx.strokeStyle = major ? '#666' : '#aaa'; ctx.lineWidth = major ? 1.2 : 0.5;
                line(ctx, gridX, y, gridX + gridW, y);
            }
            ctx.setLineDash([]); ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
            line(ctx, gridX, gridY, gridX + gridW, gridY);
            line(ctx, gridX, gridY + gridH, gridX + gridW, gridY + gridH);

            ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            for (let i = 0; i <= ROWS; i += 2) {
                ctx.fillStyle = '#555'; ctx.font = '500 12px sans-serif';
                ctx.fillText(`${(ROWS - i) * 10}%`, LABEL_W - 5, gridY + i * CELL_H);
            }

            for (let c = 0; c < n; c++) {
                const col = COLORS[c % COLORS.length], p = this.prices[c] || 0;
                const x1 = gridX + c * cellW, x2 = x1 + cellW, y = gridY + (1 - p) * gridH;
                ctx.fillStyle = hexA(col, 0.12); ctx.fillRect(x1, y, cellW, gridY + gridH - y);
                ctx.strokeStyle = col; ctx.lineWidth = 3; line(ctx, x1, y, x2, y);
                ctx.fillStyle = '#111'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                ctx.fillText(`${Math.round(p * 100)}%`, (x1 + x2) / 2, y - 3);
            }

            if (this.truth) {
                ctx.strokeStyle = '#0a7d28'; ctx.lineWidth = 3; ctx.setLineDash([]); // solid green = true odds
                for (let c = 0; c < n; c++) {
                    const y = gridY + (1 - (this.truth[c] || 0)) * gridH;
                    line(ctx, gridX + c * cellW, y, gridX + (c + 1) * cellW, y);
                }
            }
        }
    }
    function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
    // Exact match to the engine's observation-point colors (probability-games-
    // common/config/colors.js) so the sidebar A/B/C/D match the canvas boxes.
    const COLORS = ['#81C784', '#64B5F6', '#FFB74D', '#BA68C8', '#4DD0E1', '#F06292', '#AED581', '#90A4AE'];
    window.MarketGrid = MarketGrid;
    window.MARKET_COLORS = COLORS;
})();
