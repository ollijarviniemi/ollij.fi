/**
 * DGP Alternative System
 *
 * At level load time, samples one DGP alternative using seeded RNG
 * and merges its components/connections into the main level data.
 */

/**
 * Select a DGP alternative and merge it into the level.
 *
 * @param {Object} level - The level JSON object
 * @param {RNG} rng - Seeded RNG instance (must have .next() returning [0,1))
 * @returns {Object} - A new level object with the selected alternative merged in
 */
function selectAndMergeDGP(level, rng) {
    if (!level.dgpAlternatives || level.dgpAlternatives.length === 0) {
        return level;
    }

    // Sample one alternative
    const index = Math.floor(rng.next() * level.dgpAlternatives.length);
    const selected = level.dgpAlternatives[index];

    // Deep clone level to avoid mutation
    const merged = JSON.parse(JSON.stringify(level));

    // Merge components
    if (selected.components && selected.components.length > 0) {
        merged.components = [...merged.components, ...selected.components];
    }

    // Merge connections
    if (selected.connections && selected.connections.length > 0) {
        merged.connections = [...merged.connections, ...selected.connections];
    }

    // Store which DGP was selected (for ground truth computation)
    // Include all fields from the selected alternative (especially correctDistribution)
    merged._selectedDGP = {
        ...JSON.parse(JSON.stringify(selected)),
        index: index
    };

    // Remove dgpAlternatives from merged level (no longer needed)
    delete merged.dgpAlternatives;

    return merged;
}
