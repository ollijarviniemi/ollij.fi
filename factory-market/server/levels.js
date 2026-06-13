// Level loading + DGP locking for the multiplayer market game.
//
// Levels are authored in the existing Inference editor and exported to
// levels/export.json. Each level may carry several `dgpAlternatives` (different
// hidden factories with different true output distributions). For a multiplayer
// round the server picks ONE alternative as the truth, merges it into the level
// (replicating the engine's selectAndMergeDGP), and strips the rest — so every
// client simulates the same hidden factory but with their own draw seed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const EXPORT_PATH = join(__dir, '..', 'levels', 'export.json');

let _data = null;
function load() {
    if (!_data) _data = JSON.parse(readFileSync(EXPORT_PATH, 'utf8'));
    return _data;
}
/** Force a reload from disk (so newly authored levels show up without restart). */
export function reload() { _data = null; return load().levels.length; }

function observationOptions(level) {
    const obs = (level.components || []).filter(c => c.type === 'observation');
    obs.sort((a, b) => (a.params.observationIndex ?? 0) - (b.params.observationIndex ?? 0));
    return obs.map(c => {
        const index = c.params.observationIndex ?? 0;
        return { index, label: String.fromCharCode(65 + index), id: c.id };
    });
}

/**
 * Lightweight catalog for the GM's level picker. Each level gets a stable
 * "group.position" code (e.g. "3.2" = 2nd level of the 3rd group) derived from
 * the manager's `groups` map, and the list is sorted by that code so the GM can
 * refer to levels by index. Levels in no group fall into a trailing bucket.
 */
export function listLevels() {
    const data = load();
    const groups = data.groups || {};
    const codeById = new Map();
    let gi = 0;
    for (const key of Object.keys(groups)) {
        gi++;
        (groups[key] || []).forEach((id, k) => { if (!codeById.has(id)) codeById.set(id, [gi, k + 1]); });
    }
    const ungroupedBucket = gi + 1;
    let u = 0;
    const out = data.levels.map(l => {
        const code = codeById.get(l.meta.id) || [ungroupedBucket, ++u];
        return {
            id: l.meta.id,
            title: l.meta.title || l.meta.id,
            code: `${code[0]}.${code[1]}`,
            sortKey: code[0] * 1000 + code[1],
            numOptions: observationOptions(l).length,
            numAlternatives: (l.dgpAlternatives || []).length || 1,
        };
    });
    out.sort((a, b) => a.sortKey - b.sortKey);
    return out.map(({ sortKey, ...rest }) => rest);
}

/**
 * Enumerate the hypotheses (DGP alternatives) of a level for the GM's picker:
 * one entry per alternative with its label, option labels, and true probs.
 */
export function listHypotheses(id) {
    const base = load().levels.find(l => l.meta.id === id);
    if (!base) throw new Error(`No such level: ${id}`);
    const alts = base.dgpAlternatives;
    if (!alts || alts.length === 0) {
        const { options, trueProbs } = lockLevel(id);
        return [{ index: 0, label: 'Only outcome', options: options.map(o => o.label), trueProbs }];
    }
    return alts.map((a, i) => {
        const { options, trueProbs } = lockLevel(id, i);
        return { index: i, label: a.label || `Version ${i + 1}`, options: options.map(o => o.label), trueProbs };
    });
}

/**
 * Lock a level for a round. Picks DGP alternative `altIndex` (random if omitted),
 * merges it in, and returns the client-ready level plus the hidden truth.
 *
 * @returns {{ level, options:[{index,label,id}], trueProbs:number[] }}
 */
export function lockLevel(id, altIndex) {
    const base = load().levels.find(l => l.meta.id === id);
    if (!base) throw new Error(`No such level: ${id}`);

    const merged = JSON.parse(JSON.stringify(base));
    let selected = null;
    if (base.dgpAlternatives && base.dgpAlternatives.length > 0) {
        const idx = Number.isInteger(altIndex)
            ? Math.max(0, Math.min(altIndex, base.dgpAlternatives.length - 1))
            : Math.floor(Math.random() * base.dgpAlternatives.length);
        selected = base.dgpAlternatives[idx];
        if (selected.components?.length) merged.components = [...merged.components, ...selected.components];
        if (selected.connections?.length) merged.connections = [...merged.connections, ...selected.connections];
        merged._selectedDGP = { ...JSON.parse(JSON.stringify(selected)), index: idx };
    }
    delete merged.dgpAlternatives;

    const options = observationOptions(merged);
    if (options.length < 2) throw new Error(`Level ${id} has ${options.length} observation points; need >= 2.`);

    const dist = (selected && selected.correctDistribution) || merged.correctDistribution || {};
    const trueProbs = options.map(o => {
        const p = dist[o.label];
        if (typeof p !== 'number') {
            throw new Error(`Level ${id}: correctDistribution missing key '${o.label}'. Got: ${JSON.stringify(dist)}`);
        }
        return p;
    });
    const total = trueProbs.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 0.02) {
        throw new Error(`Level ${id}: true probabilities sum to ${total}, not 1. dist=${JSON.stringify(dist)}`);
    }
    // Normalize tiny rounding so the market and resolution agree to full precision.
    const normProbs = trueProbs.map(p => p / total);

    return { level: merged, options, trueProbs: normProbs };
}
