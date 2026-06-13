// Single-player level preview for the level editor. Reads the level the editor
// stashed in localStorage, lets the author flip through the hidden DGP versions
// (each with its true distribution), and animates the factory with FactoryReplay
// — all inside factory-market (no jumping to factory-inference).
(function () {
    const COLORS = window.MARKET_COLORS || ['#81C784', '#64B5F6', '#FFB74D', '#BA68C8', '#4DD0E1', '#F06292', '#AED581', '#90A4AE'];
    const KEY = 'factory-market_testLevel';
    const $ = (id) => document.getElementById(id);

    let level = null, altIndex = 0, veiled = false, replay = null;
    try { level = JSON.parse(localStorage.getItem(KEY)); } catch { level = null; }

    if (!level || !level.components) {
        $('empty').hidden = false;
        $('status').textContent = ''; $('btn-replay').hidden = true; $('veil-toggle').parentElement.hidden = true;
        return;
    }

    const N = Math.min(40, level.simulation?.ballsToSpawn || 25);
    const alts = level.dgpAlternatives || [];

    // Merge a chosen hidden DGP version into the level (mirrors the server's lockLevel).
    function lockAlt(lvl, idx) {
        const m = JSON.parse(JSON.stringify(lvl));
        const sel = (m.dgpAlternatives || [])[idx];
        if (sel) {
            if (sel.components?.length) m.components = [...m.components, ...sel.components];
            if (sel.connections?.length) m.connections = [...(m.connections || []), ...sel.connections];
            m._selectedDGP = sel;
            if (sel.correctDistribution) m.correctDistribution = sel.correctDistribution;
        }
        delete m.dgpAlternatives;
        return m;
    }

    function observationLabels(lvl) {
        return (lvl.components || []).filter(c => c.type === 'observation')
            .sort((a, b) => (a.params.observationIndex ?? 0) - (b.params.observationIndex ?? 0))
            .map(c => String.fromCharCode(65 + (c.params.observationIndex ?? 0)));
    }

    function renderHyps() {
        if (!alts.length) { $('hyps').innerHTML = ''; return; }
        $('hyps').innerHTML = `<div class="sb-title">Hidden version (truth)</div>` + alts.map((a, i) => {
            const labels = observationLabels(level);
            const dist = a.correctDistribution || {};
            const distStr = labels.map(l => `${l} ${Math.round((dist[l] || 0) * 100)}%`).join(' · ');
            return `<div class="hyp ${i === altIndex ? 'on' : ''}" data-i="${i}"><span>${a.label || 'Version ' + (i + 1)}</span><span class="dist">${distStr}</span></div>`;
        }).join('');
        $('hyps').querySelectorAll('.hyp').forEach(el => el.onclick = () => { altIndex = Number(el.dataset.i); load(); });
    }

    function renderTruth(merged) {
        const labels = observationLabels(merged);
        const dist = merged.correctDistribution || {};
        $('truth').innerHTML = `<div class="sb-title">True distribution</div>` + labels.map((l, k) => {
            const p = dist[l] || 0, col = COLORS[k % COLORS.length];
            return `<div class="opt"><div class="opt-row"><span class="mlabel" style="background:${col}">${l}</span>
                <span class="opt-price">${Math.round(p * 100)}%</span></div>
                <div class="opt-bar"><div class="fill" style="width:${(p * 100).toFixed(1)}%;background:${col}"></div></div></div>`;
        }).join('');
    }

    function onTally(counts, spawned, target) {
        const labels = observationLabels(level);
        $('bins').innerHTML = `<div class="sb-title">Where ${spawned}/${target} landed</div><div class="bins">` +
            labels.map((l, k) => `<span class="bin"><b>${l}</b> ${counts[k] || 0}</span>`).join('') + `</div>`;
    }

    function load() {
        const merged = lockAlt(level, altIndex);
        $('status').textContent = alts.length ? `Previewing “${alts[altIndex]?.label || 'Version ' + (altIndex + 1)}”` : 'Preview';
        if (replay) replay.destroy();
        replay = new FactoryReplay($('factory-canvas'), { onTally });
        replay.load(JSON.parse(JSON.stringify(merged)), level.simulation?.seed || 12345, N);
        if (!veiled) replay.reveal();           // authors see the mechanism by default
        renderHyps(); renderTruth(merged);
    }

    $('btn-replay').onclick = () => { if (replay) replay.restart(); if (!veiled && replay) replay.reveal(); };
    $('veil-toggle').onchange = (e) => { if (!level) return; veiled = e.target.checked; load(); };
    load();
})();
