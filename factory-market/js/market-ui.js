// Market sidebar: the 10-row betting grid (MarketGrid) with per-column trade
// buttons above (+1/+5/+25) and below (-1/-5/-25), plus a Manifold-style
// probability-over-time chart. The GM panel is rendered by main.js.
(function () {
    const f2 = (x) => (Math.round(x * 100) / 100).toLocaleString();

    let els = {}, trade = null, onGM = null, grid = null, graph = null, graphKey = null, live = false;

    function mount(refs, onTrade, gmRenderer) {
        els = refs; trade = onTrade; onGM = gmRenderer;
        // Keep the wall-clock chart advancing even when nobody is trading.
        setInterval(() => { if (live && graph && els.probGraph) els.probGraph.innerHTML = graph.svg(Date.now()); }, 1000);
    }

    function render(state) {
        const r = state.round, isGM = !!state.you?.isGM;
        els.bankroll.textContent = state.you ? f2(state.you.bankroll) : '—';
        if (!grid) grid = new MarketGrid(els.marketCanvas);

        if (!r) {
            live = false;
            els.status.textContent = isGM ? 'Pick a level and start a round.' : 'Waiting for the host to start…';
            els.marketCanvas.style.display = 'none';
            els.mktBuys.innerHTML = ''; els.mktSells.innerHTML = '';
            els.probGraph.innerHTML = ''; els.results.innerHTML = '';
            graph = null; graphKey = null;
            if (isGM && onGM) onGM(els.gmPanel, state); else els.gmPanel.hidden = true;
            return;
        }

        const resolved = r.phase === 'resolved';
        live = !resolved;
        els.marketCanvas.style.display = '';
        els.status.textContent = resolved ? 'Resolved — true odds shown in green.' : '';

        const prices = r.options.map(o => o.price);
        grid.set(r.options, prices, { truth: r.trueProbs || null });

        const interactive = !resolved && !isGM;
        els.mktBuys.innerHTML = rowHTML(r, 'buy', interactive);
        els.mktSells.innerHTML = rowHTML(r, 'sell', interactive);
        els.mktBuys.querySelectorAll('button').forEach(b => b.onclick = () => trade(b.dataset.act, Number(b.dataset.opt), Number(b.dataset.amt)));
        els.mktSells.querySelectorAll('button').forEach(b => b.onclick = () => trade(b.dataset.act, Number(b.dataset.opt), Number(b.dataset.amt)));

        // probability-over-time (wall clock), resets each round
        const colors = r.options.map((_, k) => (window.MARKET_COLORS || [])[k] || '#888');
        // Key on the round seq, not the level id: replaying the same level starts a fresh chart.
        if (!graph || graphKey !== r.seq) { graph = new ProbGraph(colors); graphKey = r.seq; }
        if (!resolved) graph.push(prices, Date.now());
        els.probGraph.innerHTML = graph.svg(Date.now());

        els.results.innerHTML = resolved ? results(r) : '';
        if (isGM && onGM) onGM(els.gmPanel, state); else els.gmPanel.hidden = true;
    }

    function rowHTML(r, side, interactive) {
        const W = grid.width, gx = grid.gridX, cw = grid.cellW;
        const amts = side === 'buy' ? [25, 5, 1] : [1, 5, 25];
        const cells = r.options.map((o, k) => {
            const col = (window.MARKET_COLORS || [])[k] || '#888';
            const btns = interactive ? amts.map(a =>
                `<button data-act="${side === 'buy' ? 'up' : 'down'}" data-opt="${o.index}" data-amt="${a}">${side === 'buy' ? '+' : '–'}${a}</button>`).join('') : '';
            if (side === 'buy') return `<div class="mcol" style="width:${cw}px">${btns}</div>`;
            const mine = (r.myShares || [])[k] || 0;
            // signed net position on THIS option (− = short). Span always present
            // so the column keeps a constant height whether or not you hold one.
            const posTxt = Math.abs(mine) > 0.5 ? `${mine > 0 ? '+' : '−'}${Math.abs(Math.round(mine))}` : '';
            return `<div class="mcol" style="width:${cw}px"><span class="mlabel" style="background:${col}">${o.label}</span><span class="mpos">${posTxt}</span>${btns}</div>`;
        }).join('');
        return `<div class="mrow" style="width:${W}px"><div class="mgutter" style="width:${gx}px"></div>${cells}</div>`;
    }

    function results(r) {
        const rows = (r.results || []).slice().sort((a, b) => (b.payout - b.spent) - (a.payout - a.spent))
            .map(x => { const pl = x.payout - x.spent;
                return `<tr><td>${x.name}</td><td class="${pl >= 0 ? 'pos' : 'neg'}">${pl >= 0 ? '+' : ''}${f2(pl)}</td></tr>`; }).join('');
        return `<div class="results"><div class="sb-title">P / L</div><table><tbody>${rows}</tbody></table></div>`;
    }

    window.MarketUI = { mount, render };
})();
