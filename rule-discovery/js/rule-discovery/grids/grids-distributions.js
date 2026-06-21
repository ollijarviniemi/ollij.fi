/**
 * Grids Game - Distribution Generators
 * Systematically organized generators for 6x6 grid patterns
 */

// =============================================================================
// HELPER UTILITIES
// =============================================================================

function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function createEmptyGrid() {
    return Array.from({ length: 6 }, () => Array(6).fill(false));
}

function countBlacks(grid) {
    let count = 0;
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j]) count++;
        }
    }
    return count;
}

function getAllPositions() {
    const positions = [];
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            positions.push([i, j]);
        }
    }
    return positions;
}

function getBorderPositions() {
    const positions = [];
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (i === 0 || i === 5 || j === 0 || j === 5) {
                positions.push([i, j]);
            }
        }
    }
    return positions;
}

function getNeighborCount(grid, r, c) {
    let count = 0;
    [[r-1,c], [r+1,c], [r,c-1], [r,c+1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && grid[nr][nc]) {
            count++;
        }
    });
    return count;
}

function isConnected(grid) {
    const blackCells = [];
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j]) blackCells.push([i, j]);
        }
    }
    if (blackCells.length === 0) return true;

    const visited = new Set();
    const queue = [blackCells[0]];
    visited.add(`${blackCells[0][0]},${blackCells[0][1]}`);

    while (queue.length > 0) {
        const [r, c] = queue.shift();
        [[r-1,c], [r+1,c], [r,c-1], [r,c+1]].forEach(([nr, nc]) => {
            if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && grid[nr][nc]) {
                const key = `${nr},${nc}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push([nr, nc]);
                }
            }
        });
    }
    return visited.size === blackCells.length;
}

// Place cells randomly in a region
function placeInRegion(grid, positions, count) {
    shuffle(positions);
    for (let i = 0; i < Math.min(count, positions.length); i++) {
        const [r, c] = positions[i];
        grid[r][c] = true;
    }
}

// Grow a connected component (biased toward recent cells for more squiggle-like shapes)
function growConnectedBlob(grid, startR, startC, targetCount) {
    grid[startR][startC] = true;
    const frontier = [[startR, startC]];
    let currentCount = 1;

    while (currentCount < targetCount && frontier.length > 0) {
        // Bias toward recent cells (70% chance to pick from last 3 cells)
        let baseIdx;
        if (frontier.length > 3 && Math.random() < 0.7) {
            baseIdx = randomInt(frontier.length - 3, frontier.length - 1);
        } else {
            baseIdx = randomInt(0, frontier.length - 1);
        }
        const [br, bc] = frontier[baseIdx];

        const neighbors = [[br-1, bc], [br+1, bc], [br, bc-1], [br, bc+1]];
        const validNeighbors = neighbors.filter(([nr, nc]) =>
            nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !grid[nr][nc]
        );

        if (validNeighbors.length === 0) {
            frontier.splice(baseIdx, 1);
            continue;
        }

        const [nr, nc] = randomChoice(validNeighbors);
        grid[nr][nc] = true;
        frontier.push([nr, nc]);
        currentCount++;
    }
}

// =============================================================================
// BASIC GENERATORS
// =============================================================================

export function uniformRandom() {
    const grid = createEmptyGrid();
    const count = randomInt(0, 15);
    for (let i = 0; i < count; i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function withBlackCount(count = 5) {
    const grid = createEmptyGrid();
    const positions = getAllPositions();
    shuffle(positions);
    for (let i = 0; i < Math.min(count, 36); i++) {
        const [r, c] = positions[i];
        grid[r][c] = true;
    }
    return grid;
}

// =============================================================================
// RULE 2: SYMMETRY GENERATORS
// =============================================================================

export function verticalSymmetry() {
    const grid = createEmptyGrid();
    const count = randomInt(2, 12);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 2);
        grid[r][c] = true;
        grid[r][5-c] = true;
    }
    return grid;
}

export function horizontalSymmetry() {
    const grid = createEmptyGrid();
    const count = randomInt(2, 12);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 2);
        const c = randomInt(0, 5);
        grid[r][c] = true;
        grid[5-r][c] = true;
    }
    return grid;
}

export function anySymmetry() {
    return Math.random() < 0.5 ? verticalSymmetry() : horizontalSymmetry();
}

export function fullySymmetric() {
    const grid = createEmptyGrid();
    const count = randomInt(2, 10);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 2);
        const c = randomInt(0, 2);
        grid[r][c] = true;
        grid[r][5-c] = true;
        grid[5-r][c] = true;
        grid[5-r][5-c] = true;
    }
    return grid;
}

export function almostSymmetric() {
    const grid = anySymmetry();
    // Break symmetry with 1-2 cells
    for (let i = 0; i < randomInt(1, 2); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = !grid[randomInt(0, 5)][randomInt(0, 5)];
    }
    return grid;
}

export function leftRightEqual() {
    const grid = createEmptyGrid();
    const count = randomInt(2, 10);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 2);
        grid[r][c] = true;
        grid[r][c + 3] = true;
    }
    return grid;
}

export function topBottomEqual() {
    const grid = createEmptyGrid();
    const count = randomInt(2, 10);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 2);
        const c = randomInt(0, 5);
        grid[r][c] = true;
        grid[r + 3][c] = true;
    }
    return grid;
}

export function copy3X3() {
    const grid = createEmptyGrid();
    // Create pattern in one 3x3, copy to another
    const pattern = [];
    const count = randomInt(3, 7);
    for (let i = 0; i < count; i++) {
        pattern.push([randomInt(0, 2), randomInt(0, 2)]);
    }

    const offset1 = [[0,0], [0,3], [3,0], [3,3]];
    shuffle(offset1);
    const [r1, c1] = offset1[0];
    const [r2, c2] = offset1[1];

    pattern.forEach(([dr, dc]) => {
        grid[r1 + dr][c1 + dc] = true;
        grid[r2 + dr][c2 + dc] = true;
    });
    return grid;
}

export function leftRightMirror() {
    // Mirror but NOT vertical axis symmetry (confusing pattern)
    const grid = createEmptyGrid();
    const count = randomInt(3, 10);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 2);
        grid[r][c] = true;
        grid[5-r][5-c] = true; // Mirrored, not symmetric
    }
    return grid;
}

export function topBottomMirror() {
    const grid = createEmptyGrid();
    const count = randomInt(3, 10);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 2);
        const c = randomInt(0, 5);
        grid[r][c] = true;
        grid[5-r][5-c] = true;
    }
    return grid;
}

export function _180degreeRotInv() {
    const grid = createEmptyGrid();
    const count = randomInt(3, 12);
    for (let i = 0; i < count; i++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 5);
        grid[r][c] = true;
        grid[5-r][5-c] = true;
    }
    return grid;
}

// =============================================================================
// RULE 3: CONNECTED COMPONENT GENERATORS
// =============================================================================

export function connectedLongSquiggle() {
    const grid = createEmptyGrid();
    let r = randomInt(0, 5);
    let c = randomInt(0, 5);
    grid[r][c] = true;

    const length = randomInt(10, 22);
    const path = [[r, c]]; // Keep track of path for backtracking

    for (let i = 1; i < length; i++) {
        // Try to grow from current position (creates meandering path)
        let neighbors = [[r-1,c], [r+1,c], [r,c-1], [r,c+1]].filter(([nr, nc]) =>
            nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !grid[nr][nc]
        );

        // If stuck, backtrack along the path
        while (neighbors.length === 0 && path.length > 1) {
            path.pop();
            [r, c] = path[path.length - 1];
            neighbors = [[r-1,c], [r+1,c], [r,c-1], [r,c+1]].filter(([nr, nc]) =>
                nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !grid[nr][nc]
            );
        }

        if (neighbors.length === 0) break;

        [r, c] = randomChoice(neighbors);
        grid[r][c] = true;
        path.push([r, c]);
    }
    return grid;
}

export function connectedManyBlacks(count) {
    const grid = createEmptyGrid();
    const startR = randomInt(1, 4);
    const startC = randomInt(1, 4);
    growConnectedBlob(grid, startR, startC, count);
    return grid;
}

export function twoBlobsConViaPath() {
    const grid = createEmptyGrid();
    // Create two blobs
    growConnectedBlob(grid, 1, 1, randomInt(5, 8));
    growConnectedBlob(grid, 4, 4, randomInt(5, 8));

    // Connect with thin path (already connected by growth)
    return grid;
}

export function tree() {
    const grid = createEmptyGrid();
    const root = [randomInt(1, 4), randomInt(1, 4)];
    grid[root[0]][root[1]] = true;

    const branches = [root];
    const totalCells = randomInt(8, 18);
    let currentCount = 1;

    while (currentCount < totalCells && branches.length > 0) {
        const branchIdx = randomInt(0, branches.length - 1);
        const [r, c] = branches[branchIdx];

        const neighbors = [[r-1,c], [r+1,c], [r,c-1], [r,c+1]].filter(([nr, nc]) =>
            nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !grid[nr][nc]
        );

        if (neighbors.length === 0) {
            branches.splice(branchIdx, 1);
            continue;
        }

        const [nr, nc] = randomChoice(neighbors);
        grid[nr][nc] = true;
        branches.push([nr, nc]);
        currentCount++;
    }
    return grid;
}

export function thinkBlob() {
    const grid = createEmptyGrid();
    growConnectedBlob(grid, randomInt(2, 3), randomInt(2, 3), randomInt(12, 20));
    return grid;
}

// Helper: Grow a component but stop if it would touch existing components
function growComponentWithSeparation(grid, startR, startC, targetSize) {
    if (grid[startR][startC]) return false; // Already occupied

    // Check if start position would be adjacent to existing components
    const neighbors = [[startR-1,startC], [startR+1,startC], [startR,startC-1], [startR,startC+1]];
    for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && grid[nr][nc]) {
            return false; // Would be adjacent
        }
    }

    grid[startR][startC] = true;
    const frontier = [[startR, startC]];
    let currentSize = 1;

    while (currentSize < targetSize && frontier.length > 0) {
        // Bias toward recent cells for squiggle-like shapes
        let baseIdx;
        if (frontier.length > 3 && Math.random() < 0.7) {
            baseIdx = randomInt(frontier.length - 3, frontier.length - 1);
        } else {
            baseIdx = randomInt(0, frontier.length - 1);
        }
        const [br, bc] = frontier[baseIdx];

        const validNeighbors = [[br-1, bc], [br+1, bc], [br, bc-1], [br, bc+1]].filter(([nr, nc]) => {
            if (nr < 0 || nr >= 6 || nc < 0 || nc >= 6 || grid[nr][nc]) return false;

            // Check if this cell would be adjacent to a different component
            const cellNeighbors = [[nr-1,nc], [nr+1,nc], [nr,nc-1], [nr,nc+1]];
            for (const [nnr, nnc] of cellNeighbors) {
                if (nnr >= 0 && nnr < 6 && nnc >= 0 && nnc < 6 && grid[nnr][nnc]) {
                    // Check if this neighbor is part of our current component
                    let isOurComponent = false;
                    for (const [fr, fc] of frontier) {
                        if (fr === nnr && fc === nnc) {
                            isOurComponent = true;
                            break;
                        }
                    }
                    // Also check if it's the cell we're growing from
                    if (nnr === br && nnc === bc) isOurComponent = true;
                    if (nnr === startR && nnc === startC) isOurComponent = true;

                    if (!isOurComponent) return false; // Would touch another component
                }
            }
            return true;
        });

        if (validNeighbors.length === 0) {
            frontier.splice(baseIdx, 1);
            continue;
        }

        const [nr, nc] = randomChoice(validNeighbors);
        grid[nr][nc] = true;
        frontier.push([nr, nc]);
        currentSize++;
    }

    return true; // Successfully placed
}

// Properly separated multi-component generators
export function twoLargeComponents() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const grid = createEmptyGrid();
        const positions = shuffle([[0,0], [0,5], [5,0], [5,5], [2,2], [2,3], [3,2], [3,3]]).slice(0, 2);

        let success = true;
        for (const [r, c] of positions) {
            if (!growComponentWithSeparation(grid, r, c, randomInt(8, 12))) {
                success = false;
                break;
            }
        }

        if (success && validateSeparateComponents(grid, 2)) {
            return grid;
        }
    }
    return createEmptyGrid();
}

export function threeMediumComponents() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const grid = createEmptyGrid();
        const positions = shuffle([[0,0], [0,5], [5,0], [5,5], [0,2], [5,2], [2,0], [2,5]]).slice(0, 3);

        let success = true;
        for (const [r, c] of positions) {
            if (!growComponentWithSeparation(grid, r, c, randomInt(5, 8))) {
                success = false;
                break;
            }
        }

        if (success && validateSeparateComponents(grid, 3)) {
            return grid;
        }
    }
    return createEmptyGrid();
}

export function fourSquiggles() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const grid = createEmptyGrid();
        const positions = [[0,0], [0,5], [5,0], [5,5]];

        let success = true;
        for (const [r, c] of positions) {
            if (!growComponentWithSeparation(grid, r, c, randomInt(3, 5))) {
                success = false;
                break;
            }
        }

        if (success && validateSeparateComponents(grid, 4)) {
            return grid;
        }
    }
    return createEmptyGrid();
}

export function fiveSquiggles() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const grid = createEmptyGrid();
        const positions = shuffle([[0,0], [0,3], [0,5], [3,0], [3,5], [5,0], [5,3], [5,5]]).slice(0, 5);

        let success = true;
        for (const [r, c] of positions) {
            if (!growComponentWithSeparation(grid, r, c, randomInt(2, 4))) {
                success = false;
                break;
            }
        }

        if (success && validateSeparateComponents(grid, 5)) {
            return grid;
        }
    }
    return createEmptyGrid();
}

// Helper: Check if position and its orthogonal neighbors are free (for component separation)
function isAreaFree(grid, r, c) {
    if (grid[r][c]) return false;
    // Check only 4 orthogonal neighbors to ensure separation (diagonal ok)
    const neighbors = [[r-1,c], [r+1,c], [r,c-1], [r,c+1]];
    for (const [nr, nc] of neighbors) {
        if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && grid[nr][nc]) {
            return false;
        }
    }
    return true;
}

// Helper: Get all connected components in a grid
function getComponents(grid) {
    const visited = Array.from({ length: 6 }, () => Array(6).fill(false));
    const components = [];

    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j] && !visited[i][j]) {
                const component = [];
                const queue = [[i, j]];
                visited[i][j] = true;

                while (queue.length > 0) {
                    const [r, c] = queue.shift();
                    component.push([r, c]);

                    [[r-1,c], [r+1,c], [r,c-1], [r,c+1]].forEach(([nr, nc]) => {
                        if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 &&
                            grid[nr][nc] && !visited[nr][nc]) {
                            visited[nr][nc] = true;
                            queue.push([nr, nc]);
                        }
                    });
                }
                components.push(component);
            }
        }
    }
    return components;
}

// Helper: Check if any two components are orthogonally adjacent
function componentsAreAdjacent(comp1, comp2) {
    for (const [r1, c1] of comp1) {
        for (const [r2, c2] of comp2) {
            // Check if orthogonally adjacent
            if ((Math.abs(r1 - r2) === 1 && c1 === c2) ||
                (Math.abs(c1 - c2) === 1 && r1 === r2)) {
                return true;
            }
        }
    }
    return false;
}

// Helper: Validate that all components are truly separate
function validateSeparateComponents(grid, exactCount) {
    const components = getComponents(grid);

    // Must have exact number of components
    if (components.length !== exactCount) {
        return false;
    }

    // Check all pairs of components for adjacency
    for (let i = 0; i < components.length; i++) {
        for (let j = i + 1; j < components.length; j++) {
            if (componentsAreAdjacent(components[i], components[j])) {
                return false;
            }
        }
    }

    return true;
}

// Wrapper: Resample a generator function until it produces exactly N separate components
function ensureSeparateComponents(generatorFn, targetCount, maxAttempts = 50) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const grid = generatorFn();
        if (validateSeparateComponents(grid, targetCount)) {
            if (attempt > 0) {
            }
            return grid;
        }
    }
    // Fallback after max attempts
    return generatorFn();
}

// Factory for creating many separate components of specified size ranges
function manySeparateComponentsFactory(minSize, maxSize, minComps, maxComps) {
    return function() {
        let targetComps = randomInt(minComps, maxComps);

        // Try with current target, reducing by 1 each time we fail
        while (targetComps >= Math.max(2, minComps - 2)) {
            let resampleAttempts = 0;

            while (resampleAttempts < 20) {
                const grid = createEmptyGrid();
                let placed = 0;

                for (let attempt = 0; attempt < 100 && placed < targetComps; attempt++) {
                    const r = randomInt(0, 5);
                    const c = randomInt(0, 5);

                    // Only place if area is free (ensures separation)
                    if (isAreaFree(grid, r, c)) {
                        const size = randomInt(minSize, maxSize);
                        if (size === 1) {
                            grid[r][c] = true;
                        } else {
                            growConnectedBlob(grid, r, c, size);
                        }
                        placed++;
                    }
                }

                // Validate that components are truly separate and count matches exactly
                if (validateSeparateComponents(grid, targetComps)) {
                    return grid;
                }

                resampleAttempts++;
            }

            // Failed with this target, try one less
            targetComps--;
        }

        // Final fallback: return simple random
        const grid = createEmptyGrid();
        const count = randomInt(minSize * 2, maxSize * 3);
        for (let i = 0; i < count; i++) {
            grid[randomInt(0, 5)][randomInt(0, 5)] = true;
        }
        return grid;
    };
}

export const many2_4 = manySeparateComponentsFactory(2, 4, 3, 5);  // Reduced from 4-7
export const many2_4s = many2_4;

// =============================================================================
// RULE 4: BORDER GENERATORS
// =============================================================================

export function borderUniRand() {
    const grid = createEmptyGrid();
    const borderPos = getBorderPositions();
    const count = randomInt(4, 16);
    placeInRegion(grid, borderPos, count);
    return grid;
}

export function threeEdgesRand() {
    const grid = createEmptyGrid();
    const edges = [
        [[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]], // top
        [[5,0],[5,1],[5,2],[5,3],[5,4],[5,5]], // bottom
        [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]], // left
        [[0,5],[1,5],[2,5],[3,5],[4,5],[5,5]]  // right
    ];
    shuffle(edges);
    const positions = [...edges[0], ...edges[1], ...edges[2]];
    const uniquePos = Array.from(new Set(positions.map(JSON.stringify))).map(JSON.parse);
    placeInRegion(grid, uniquePos, randomInt(6, 14));
    return grid;
}

export function twoEdgesRand() {
    const grid = createEmptyGrid();
    const edges = [
        [[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]], // top
        [[5,0],[5,1],[5,2],[5,3],[5,4],[5,5]], // bottom
        [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]], // left
        [[0,5],[1,5],[2,5],[3,5],[4,5],[5,5]]  // right
    ];
    shuffle(edges);
    const positions = [...edges[0], ...edges[1]];
    const uniquePos = Array.from(new Set(positions.map(JSON.stringify))).map(JSON.parse);
    placeInRegion(grid, uniquePos, randomInt(4, 10));
    return grid;
}

export function corner2x2sRand() {
    const grid = createEmptyGrid();
    const corners = [
        [[0,0],[0,1],[1,0],[1,1]],
        [[0,4],[0,5],[1,4],[1,5]],
        [[4,0],[4,1],[5,0],[5,1]],
        [[4,4],[4,5],[5,4],[5,5]]
    ];
    const positions = corners.flat();
    placeInRegion(grid, positions, randomInt(4, 12));
    return grid;
}

export function noDeadCenter() {
    const grid = createEmptyGrid();
    const positions = getAllPositions().filter(([r, c]) => !(r >= 2 && r <= 3 && c >= 2 && c <= 3));
    placeInRegion(grid, positions, randomInt(8, 18));
    return grid;
}

export function on3VerticalStripes() {
    const grid = createEmptyGrid();
    const positions = [];
    for (let r = 0; r < 6; r++) {
        for (let c of [0, 1, 2, 3, 4, 5]) {
            if (c <= 1 || (c >= 2 && c <= 3) || c >= 4) {
                positions.push([r, c]);
            }
        }
    }
    placeInRegion(grid, positions, randomInt(8, 16));
    return grid;
}

export function on2HorizontalStripes() {
    const grid = createEmptyGrid();
    const positions = [];
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
            if (r <= 2 || r >= 3) {
                positions.push([r, c]);
            }
        }
    }
    placeInRegion(grid, positions, randomInt(8, 16));
    return grid;
}

export function noCenter2Columns() {
    const grid = createEmptyGrid();
    const positions = getAllPositions().filter(([r, c]) => c < 2 || c > 3);
    placeInRegion(grid, positions, randomInt(8, 16));
    return grid;
}

export function noCenter2Rows() {
    const grid = createEmptyGrid();
    const positions = getAllPositions().filter(([r, c]) => r < 2 || r > 3);
    placeInRegion(grid, positions, randomInt(8, 16));
    return grid;
}

export function corner2x2s() {
    const grid = createEmptyGrid();
    const corners = [
        [[0,0],[0,1],[1,0],[1,1]],
        [[0,4],[0,5],[1,4],[1,5]],
        [[4,0],[4,1],[5,0],[5,1]],
        [[4,4],[4,5],[5,4],[5,5]]
    ];
    corners.forEach(corner => {
        if (Math.random() < 0.5) {
            corner.forEach(([r, c]) => grid[r][c] = true);
        }
    });
    return grid;
}

export function noBorders() {
    const grid = createEmptyGrid();
    const positions = getAllPositions().filter(([r, c]) =>
        r > 0 && r < 5 && c > 0 && c < 5
    );
    placeInRegion(grid, positions, randomInt(4, 12));
    return grid;
}

// Due to character limit, I'll continue in the next part...

// =============================================================================
// RULE 5: NO ISOLATED GENERATORS (continued from components)
// =============================================================================

export const fourSquiqqles = fourSquiggles; // Typo variant
export const many3s = manySeparateComponentsFactory(3, 3, 3, 5);  // Reduced from 4-8 (size 3 needs more space)
export const longSquiqqle = connectedLongSquiggle; // Typo variant

export const many1_4s = manySeparateComponentsFactory(1, 4, 4, 7);  // Reduced from 5-9
export const many1_2s = manySeparateComponentsFactory(1, 2, 5, 8);  // Reduced from 6-10
export const many1_3s = manySeparateComponentsFactory(1, 3, 4, 7);  // Reduced from 5-9

export function fourSquiqqlesOne1() {
    const grid = fourSquiggles();
    // Add one isolated cell
    for (let attempt = 0; attempt < 20; attempt++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 5);
        if (!grid[r][c] && getNeighborCount(grid, r, c) === 0) {
            grid[r][c] = true;
            break;
        }
    }
    return grid;
}

export function isolatedDots(count) {
    const grid = createEmptyGrid();
    const positions = getAllPositions();
    shuffle(positions);
    let placed = 0;
    for (const [r, c] of positions) {
        if (placed >= count) break;
        if (!grid[r][c] && getNeighborCount(grid, r, c) === 0) {
            grid[r][c] = true;
            placed++;
        }
    }
    return grid;
}

// =============================================================================
// RULE 6: SPATIAL CONSTRAINT GENERATORS
// =============================================================================

export function allInOneHalf() {
    const grid = createEmptyGrid();
    const half = randomChoice(['top', 'bottom', 'left', 'right']);
    const positions = [];

    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if ((half === 'top' && i < 3) || (half === 'bottom' && i >= 3) ||
                (half === 'left' && j < 3) || (half === 'right' && j >= 3)) {
                positions.push([i, j]);
            }
        }
    }
    placeInRegion(grid, positions, randomInt(4, 12));
    return grid;
}

export function allInOneThird() {
    const grid = createEmptyGrid();
    const positions = [];
    const choice = randomInt(0, 5); // 6 options: rows 0-1, 2-3, 4-5 or cols 0-1, 2-3, 4-5

    if (choice < 3) { // Row-based
        const rowStart = choice * 2;
        for (let i = rowStart; i < rowStart + 2; i++) {
            for (let j = 0; j < 6; j++) {
                positions.push([i, j]);
            }
        }
    } else { // Column-based
        const colStart = (choice - 3) * 2;
        for (let i = 0; i < 6; i++) {
            for (let j = colStart; j < colStart + 2; j++) {
                positions.push([i, j]);
            }
        }
    }
    placeInRegion(grid, positions, randomInt(3, 9));
    return grid;
}

export function allInOneCol() {
    const grid = createEmptyGrid();
    const col = randomInt(0, 5);
    const count = randomInt(2, 6);
    const positions = [];
    for (let i = 0; i < 6; i++) {
        positions.push([i, col]);
    }
    placeInRegion(grid, positions, count);
    return grid;
}

export function allInOneRow() {
    const grid = createEmptyGrid();
    const row = randomInt(0, 5);
    const count = randomInt(2, 6);
    const positions = [];
    for (let j = 0; j < 6; j++) {
        positions.push([row, j]);
    }
    placeInRegion(grid, positions, count);
    return grid;
}

export function allInOneHalfMiddleRemoved() {
    const grid = allInOneHalf();
    // Find which half is used and remove middle row/col
    let hasTop = false, hasBottom = false, hasLeft = false, hasRight = false;
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j]) {
                if (i < 3) hasTop = true;
                if (i >= 3) hasBottom = true;
                if (j < 3) hasLeft = true;
                if (j >= 3) hasRight = true;
            }
        }
    }

    if (hasTop && !hasBottom) {
        for (let j = 0; j < 6; j++) grid[2][j] = false;
    } else if (hasBottom && !hasTop) {
        for (let j = 0; j < 6; j++) grid[3][j] = false;
    } else if (hasLeft && !hasRight) {
        for (let i = 0; i < 6; i++) grid[i][2] = false;
    } else if (hasRight && !hasLeft) {
        for (let i = 0; i < 6; i++) grid[i][3] = false;
    }
    return grid;
}

export function allInOneHalfEdgeRemoved() {
    const grid = allInOneHalf();
    // Remove edge of the half
    let hasTop = false, hasBottom = false, hasLeft = false, hasRight = false;
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j]) {
                if (i < 3) hasTop = true;
                if (i >= 3) hasBottom = true;
                if (j < 3) hasLeft = true;
                if (j >= 3) hasRight = true;
            }
        }
    }

    if (hasTop && !hasBottom) {
        for (let j = 0; j < 6; j++) grid[0][j] = false;
    } else if (hasBottom && !hasTop) {
        for (let j = 0; j < 6; j++) grid[5][j] = false;
    } else if (hasLeft && !hasRight) {
        for (let i = 0; i < 6; i++) grid[i][0] = false;
    } else if (hasRight && !hasLeft) {
        for (let i = 0; i < 6; i++) grid[i][5] = false;
    }
    return grid;
}

export function allInCorner3x3() {
    const grid = createEmptyGrid();
    const corner = randomChoice([[0,0], [0,3], [3,0], [3,3]]);
    const [startR, startC] = corner;
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (Math.random() < 0.5) {
                grid[startR + i][startC + j] = true;
            }
        }
    }
    return grid;
}

export function allInEdge2x3s() {
    const grid = createEmptyGrid();
    const edges = [
        {positions: [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]]},
        {positions: [[0,4],[0,5],[1,4],[1,5],[2,4],[2,5]]},
        {positions: [[3,0],[3,1],[4,0],[4,1],[5,0],[5,1]]},
        {positions: [[3,4],[3,5],[4,4],[4,5],[5,4],[5,5]]}
    ];
    const chosen = randomChoice(edges);
    placeInRegion(grid, chosen.positions, randomInt(3, 6));
    return grid;
}

export function allInOneHalfBordersOnly() {
    const grid = createEmptyGrid();
    const half = randomChoice(['top', 'bottom', 'left', 'right']);
    const positions = [];

    if (half === 'top') {
        for (let j = 0; j < 6; j++) positions.push([0, j]);
        for (let i = 1; i < 3; i++) { positions.push([i, 0]); positions.push([i, 5]); }
    } else if (half === 'bottom') {
        for (let j = 0; j < 6; j++) positions.push([5, j]);
        for (let i = 3; i < 5; i++) { positions.push([i, 0]); positions.push([i, 5]); }
    } else if (half === 'left') {
        for (let i = 0; i < 6; i++) positions.push([i, 0]);
        for (let j = 1; j < 3; j++) { positions.push([0, j]); positions.push([5, j]); }
    } else {
        for (let i = 0; i < 6; i++) positions.push([i, 5]);
        for (let j = 3; j < 5; j++) { positions.push([0, j]); positions.push([5, j]); }
    }

    placeInRegion(grid, positions, randomInt(4, 10));
    return grid;
}

// NEW: Rule 6 negative generators - have 3+ white rows/cols but blacks in multiple halves
export function threeWhiteRowsButMultipleHalves() {
    const grid = createEmptyGrid();
    // Keep rows 2-4 white, but put blacks in both top and bottom
    const topRows = [0, 1];
    const bottomRows = [5];

    // Place some blacks in top half
    for (let r of topRows) {
        for (let c of [randomInt(0, 2), randomInt(3, 5)]) {
            if (Math.random() < 0.7) grid[r][c] = true;
        }
    }
    // Place some blacks in bottom half
    for (let r of bottomRows) {
        for (let c of [randomInt(0, 2), randomInt(3, 5)]) {
            if (Math.random() < 0.7) grid[r][c] = true;
        }
    }
    return grid;
}

export function threeWhiteColsButMultipleHalves() {
    const grid = createEmptyGrid();
    // Keep cols 2-4 white, but put blacks in both left and right
    const leftCols = [0, 1];
    const rightCols = [5];

    // Place some blacks in left half
    for (let c of leftCols) {
        for (let r of [randomInt(0, 2), randomInt(3, 5)]) {
            if (Math.random() < 0.7) grid[r][c] = true;
        }
    }
    // Place some blacks in right half
    for (let c of rightCols) {
        for (let r of [randomInt(0, 2), randomInt(3, 5)]) {
            if (Math.random() < 0.7) grid[r][c] = true;
        }
    }
    return grid;
}

export function fourWhiteRowsButMultipleHalves() {
    const grid = createEmptyGrid();
    // Keep middle 4 rows white
    const topRows = [0];
    const bottomRows = [5];

    for (let r of topRows) {
        for (let c = 0; c < 6; c++) {
            if (Math.random() < 0.6) grid[r][c] = true;
        }
    }
    for (let r of bottomRows) {
        for (let c = 0; c < 6; c++) {
            if (Math.random() < 0.6) grid[r][c] = true;
        }
    }
    return grid;
}

export function fourWhiteColsButMultipleHalves() {
    const grid = createEmptyGrid();
    // Keep middle 4 cols white
    const leftCols = [0];
    const rightCols = [5];

    for (let c of leftCols) {
        for (let r = 0; r < 6; r++) {
            if (Math.random() < 0.6) grid[r][c] = true;
        }
    }
    for (let c of rightCols) {
        for (let r = 0; r < 6; r++) {
            if (Math.random() < 0.6) grid[r][c] = true;
        }
    }
    return grid;
}

export function noCenter2RorC() {
    const grid = createEmptyGrid();
    const positions = getAllPositions().filter(([r, c]) =>
        (r < 2 || r > 3) && (c < 2 || c > 3)
    );
    placeInRegion(grid, positions, randomInt(8, 16));
    return grid;
}

export function noEdge2RorC() {
    const grid = createEmptyGrid();
    const positions = getAllPositions().filter(([r, c]) =>
        r >= 2 && r <= 3 && c >= 2 && c <= 3
    );
    placeInRegion(grid, positions, randomInt(3, 8));
    return grid;
}

export function allInTwoThirds() {
    const grid = createEmptyGrid();
    const choice = randomInt(0, 3);
    const positions = [];

    if (choice === 0) { // Rows 0-3
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 6; j++) positions.push([i, j]);
        }
    } else if (choice === 1) { // Rows 2-5
        for (let i = 2; i < 6; i++) {
            for (let j = 0; j < 6; j++) positions.push([i, j]);
        }
    } else if (choice === 2) { // Cols 0-3
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 4; j++) positions.push([i, j]);
        }
    } else { // Cols 2-5
        for (let i = 0; i < 6; i++) {
            for (let j = 2; j < 6; j++) positions.push([i, j]);
        }
    }
    placeInRegion(grid, positions, randomInt(8, 18));
    return grid;
}

export function allInCorner2x2s() {
    const grid = corner2x2s();
    return grid;
}

export function allInThreeRorC() {
    const grid = createEmptyGrid();
    if (Math.random() < 0.5) {
        // Three rows
        const start = randomInt(0, 3);
        for (let i = start; i < start + 3; i++) {
            for (let j = 0; j < 6; j++) {
                if (Math.random() < 0.6) grid[i][j] = true;
            }
        }
    } else {
        // Three columns
        const start = randomInt(0, 3);
        for (let i = 0; i < 6; i++) {
            for (let j = start; j < start + 3; j++) {
                if (Math.random() < 0.6) grid[i][j] = true;
            }
        }
    }
    return grid;
}

export function allInMiddle2RorC() {
    const grid = createEmptyGrid();
    if (Math.random() < 0.5) {
        // Middle 2 rows
        for (let i = 2; i < 4; i++) {
            for (let j = 0; j < 6; j++) {
                if (Math.random() < 0.6) grid[i][j] = true;
            }
        }
    } else {
        // Middle 2 columns
        for (let i = 0; i < 6; i++) {
            for (let j = 2; j < 4; j++) {
                if (Math.random() < 0.6) grid[i][j] = true;
            }
        }
    }
    return grid;
}

export function allInMiddle4x4() {
    const grid = createEmptyGrid();
    for (let i = 1; i < 5; i++) {
        for (let j = 1; j < 5; j++) {
            if (Math.random() < 0.5) grid[i][j] = true;
        }
    }
    return grid;
}


// =============================================================================
// RULE 7: ONE PER ROW/COLUMN GENERATORS
// =============================================================================

export function onePerRowAndColumn() {
    const grid = createEmptyGrid();
    const perm = [0, 1, 2, 3, 4, 5];
    shuffle(perm);
    for (let i = 0; i < 6; i++) {
        grid[i][perm[i]] = true;
    }
    return grid;
}

export function almostOnePerRowColumn() {
    const grid = onePerRowAndColumn();
    // Break constraint slightly
    const action = randomChoice(['add', 'remove']);
    if (action === 'add') {
        let r = randomInt(0, 5);
        let c = randomInt(0, 5);
        while (grid[r][c]) c = randomInt(0, 5);
        grid[r][c] = true;
    } else {
        const r = randomInt(0, 5);
        for (let j = 0; j < 6; j++) {
            if (grid[r][j]) {
                grid[r][j] = false;
                break;
            }
        }
    }
    return grid;
}

export function onePerRowColumnOneMissing() {
    const grid = createEmptyGrid();
    const perm = [0, 1, 2, 3, 4, 5];
    shuffle(perm);
    for (let i = 0; i < 5; i++) { // Only 5 rows
        grid[i][perm[i]] = true;
    }
    return grid;
}

export function onePerRowColumnOneExtra() {
    const grid = onePerRowAndColumn();
    // Add extra in one row
    const r = randomInt(0, 5);
    for (let c = 0; c < 6; c++) {
        if (!grid[r][c]) {
            grid[r][c] = true;
            break;
        }
    }
    return grid;
}

// =============================================================================
// RULE 8: FITS IN NxM GENERATORS
// =============================================================================

function fitsInWindow(width, height) {
    const grid = createEmptyGrid();
    const startR = randomInt(0, 6 - height);
    const startC = randomInt(0, 6 - width);
    const count = randomInt(Math.min(3, width * height), width * height);

    const positions = [];
    for (let i = startR; i < startR + height; i++) {
        for (let j = startC; j < startC + width; j++) {
            positions.push([i, j]);
        }
    }
    placeInRegion(grid, positions, count);
    return grid;
}

export function fitsIn4x4() { return fitsInWindow(4, 4); }
export function fitsIn3x3() { return fitsInWindow(3, 3); }
export function fitsIn3x4() { return fitsInWindow(4, 3); }
export function fitsIn2x4() { return fitsInWindow(4, 2); }
export function fitsIn2x3() { return fitsInWindow(3, 2); }
export function fitsIn2x5() { return fitsInWindow(5, 2); }
export function fitsIn3x5() { return fitsInWindow(5, 3); }
export function fitsIn4x5() { return fitsInWindow(5, 4); }
export function fitsIn2x6() { return fitsInWindow(6, 2); }

export function twoCompsIn4x4() {
    const grid = createEmptyGrid();
    const startR = randomInt(0, 2);
    const startC = randomInt(0, 2);

    growConnectedBlob(grid, startR + 1, startC + 1, randomInt(3, 6));
    growConnectedBlob(grid, startR + 2, startC + 2, randomInt(3, 6));
    return grid;
}

function placePolyomino(grid, startR, startC, shape) {
    shape.forEach(([dr, dc]) => {
        if (startR + dr >= 0 && startR + dr < 6 && startC + dc >= 0 && startC + dc < 6) {
            grid[startR + dr][startC + dc] = true;
        }
    });
}

const PENTOMINOES = [
    [[0,0],[0,1],[1,0],[1,1],[2,0]], // P
    [[0,0],[0,1],[0,2],[1,1],[2,1]], // T
    [[0,0],[1,0],[1,1],[1,2],[2,2]], // Z
];

export function pentominoIn4x4() {
    const grid = createEmptyGrid();
    const startR = randomInt(0, 2);
    const startC = randomInt(0, 2);
    const shape = randomChoice(PENTOMINOES);
    placePolyomino(grid, startR, startC, shape);

    // Add extras within 4x4
    for (let i = 0; i < randomInt(5, 10); i++) {
        const r = startR + randomInt(0, 3);
        const c = startC + randomInt(0, 3);
        if (r < 6 && c < 6) grid[r][c] = true;
    }
    return grid;
}

const TETROMINOS = [
    [[0,0],[0,1],[1,0],[1,1]], // O
    [[0,0],[1,0],[2,0],[3,0]], // I
    [[0,0],[0,1],[0,2],[1,0]], // L
    [[0,1],[1,0],[1,1],[1,2]], // T
];

export function randomTetris() {
    const grid = createEmptyGrid();
    const startR = randomInt(0, 2);
    const startC = randomInt(0, 2);
    const shape = randomChoice(TETROMINOS);
    placePolyomino(grid, startR, startC, shape);

    for (let i = 0; i < randomInt(6, 12); i++) {
        const r = startR + randomInt(0, 3);
        const c = startC + randomInt(0, 3);
        if (r < 6 && c < 6) grid[r][c] = true;
    }
    return grid;
}

export function sextominoIn4x4() {
    const grid = createEmptyGrid();
    const startR = randomInt(0, 2);
    const startC = randomInt(0, 2);

    // Create 6-cell shape
    grid[startR][startC] = true;
    growConnectedBlob(grid, startR, startC, 6);

    // Add extras within 4x4
    for (let i = 0; i < randomInt(6, 12); i++) {
        const r = startR + randomInt(0, 3);
        const c = startC + randomInt(0, 3);
        if (r < 6 && c < 6) grid[r][c] = true;
    }
    return grid;
}

export function sextominoNot4x4() {
    const grid = createEmptyGrid();
    // Place in a 5x2 or 2x5 configuration
    const horizontal = Math.random() < 0.5;
    if (horizontal) {
        const startR = randomInt(0, 4);
        for (let i = 0; i < 6; i++) {
            grid[startR][i] = true;
        }
    } else {
        const startC = randomInt(0, 4);
        for (let i = 0; i < 6; i++) {
            grid[i][startC] = true;
        }
    }
    return grid;
}

export function septominoNot4x4() {
    const grid = sextominoNot4x4();
    // Add one more cell
    for (let attempt = 0; attempt < 20; attempt++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 5);
        if (!grid[r][c] && getNeighborCount(grid, r, c) > 0) {
            grid[r][c] = true;
            break;
        }
    }
    return grid;
}

export function fitsInTwo2x2s() {
    const grid = createEmptyGrid();
    const corners = [[0,0], [0,4], [4,0], [4,4]];
    shuffle(corners);
    const [r1, c1] = corners[0];
    const [r2, c2] = corners[1];

    [[r1,c1],[r1,c1+1],[r1+1,c1],[r1+1,c1+1]].forEach(([r,c]) => {
        if (Math.random() < 0.7) grid[r][c] = true;
    });
    [[r2,c2],[r2,c2+1],[r2+1,c2],[r2+1,c2+1]].forEach(([r,c]) => {
        if (Math.random() < 0.7) grid[r][c] = true;
    });
    return grid;
}

export function fitsInTwo2x3s() {
    const grid = createEmptyGrid();
    const positions = [
        [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]],
        [[0,3],[0,4],[0,5],[1,3],[1,4],[1,5]],
        [[4,0],[4,1],[4,2],[5,0],[5,1],[5,2]],
        [[4,3],[4,4],[4,5],[5,3],[5,4],[5,5]]
    ];
    shuffle(positions);

    positions[0].forEach(([r,c]) => { if (Math.random() < 0.6) grid[r][c] = true; });
    positions[1].forEach(([r,c]) => { if (Math.random() < 0.6) grid[r][c] = true; });
    return grid;
}

export function fitsInTwo2x4s() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 4; j++) {
            if (Math.random() < 0.6) grid[i][j] = true;
        }
    }
    for (let i = 4; i < 6; i++) {
        for (let j = 2; j < 6; j++) {
            if (Math.random() < 0.6) grid[i][j] = true;
        }
    }
    return grid;
}

// =============================================================================
// RULE 9: 2x2 SQUARE SHAPE GENERATORS
// =============================================================================

function place2x2Square(grid, r, c) {
    [[r,c], [r,c+1], [r+1,c], [r+1,c+1]].forEach(([nr,nc]) => {
        if (nr < 6 && nc < 6) grid[nr][nc] = true;
    });
}

function has2x2SquareFactory(minExtra, maxExtra) {
    return function() {
        const grid = createEmptyGrid();
        const r = randomInt(0, 4);
        const c = randomInt(0, 4);
        place2x2Square(grid, r, c);

        const extraCount = randomInt(minExtra, maxExtra);
        for (let i = 0; i < extraCount; i++) {
            grid[randomInt(0, 5)][randomInt(0, 5)] = true;
        }
        return grid;
    };
}

export const has2x2Plus10_15 = has2x2SquareFactory(10, 15);
export const has2x2Plus15_20 = has2x2SquareFactory(15, 20);
export const has2x2Plus20_25 = has2x2SquareFactory(20, 25);

export function has3x3Square() {
    const grid = createEmptyGrid();
    const r = randomInt(0, 3);
    const c = randomInt(0, 3);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            grid[r+i][c+j] = true;
        }
    }
    // Add random extra cells
    const extraCount = randomInt(5, 12);
    for (let i = 0; i < extraCount; i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function has4x4Square() {
    const grid = createEmptyGrid();
    const r = randomInt(0, 2);
    const c = randomInt(0, 2);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            grid[r+i][c+j] = true;
        }
    }
    // Add random extra cells
    const extraCount = randomInt(3, 8);
    for (let i = 0; i < extraCount; i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function multiple2x2s() {
    const grid = createEmptyGrid();
    const numSquares = randomInt(2, 4);
    for (let i = 0; i < numSquares; i++) {
        const r = randomInt(0, 4);
        const c = randomInt(0, 4);
        place2x2Square(grid, r, c);
    }
    // Add random extra cells
    const extraCount = randomInt(6, 12);
    for (let i = 0; i < extraCount; i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function has2x3RectPlus() {
    const grid = createEmptyGrid();
    const r = randomInt(0, 4);
    const c = randomInt(0, 3);
    for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 3; j++) {
            grid[r+i][c+j] = true;
        }
    }
    for (let i = 0; i < randomInt(8, 15); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function has3x2RectPlus() {
    const grid = createEmptyGrid();
    const r = randomInt(0, 3);
    const c = randomInt(0, 4);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
            grid[r+i][c+j] = true;
        }
    }
    for (let i = 0; i < randomInt(8, 15); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function hasTshape() {
    const grid = createEmptyGrid();
    const r = randomInt(1, 4);
    const c = randomInt(1, 4);
    // T shape
    grid[r][c-1] = true;
    grid[r][c] = true;
    grid[r][c+1] = true;
    grid[r+1][c] = true;

    for (let i = 0; i < randomInt(10, 18); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function has2x1Plus() {
    const grid = createEmptyGrid();
    const num = randomInt(4, 8);
    for (let i = 0; i < num; i++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 4);
        grid[r][c] = true;
        grid[r][c+1] = true;
    }
    return grid;
}

export function has1x2Plus() {
    const grid = createEmptyGrid();
    const num = randomInt(4, 8);
    for (let i = 0; i < num; i++) {
        const r = randomInt(0, 4);
        const c = randomInt(0, 5);
        grid[r][c] = true;
        grid[r+1][c] = true;
    }
    return grid;
}

export function hasLshape() {
    const grid = createEmptyGrid();
    const num = randomInt(3, 6);
    for (let i = 0; i < num; i++) {
        const r = randomInt(0, 4);
        const c = randomInt(0, 4);
        grid[r][c] = true;
        grid[r+1][c] = true;
        grid[r][c+1] = true;
    }
    for (let i = 0; i < randomInt(5, 12); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function hasPlusShape() {
    const grid = createEmptyGrid();
    const num = randomInt(2, 4);
    for (let i = 0; i < num; i++) {
        const r = randomInt(1, 4);
        const c = randomInt(1, 4);
        grid[r][c] = true;
        grid[r-1][c] = true;
        grid[r+1][c] = true;
        grid[r][c-1] = true;
        grid[r][c+1] = true;
    }
    return grid;
}

export function hasDiagonal3() {
    const grid = createEmptyGrid();
    const num = randomInt(3, 6);
    for (let i = 0; i < num; i++) {
        const r = randomInt(0, 3);
        const c = randomInt(0, 3);
        grid[r][c] = true;
        grid[r+1][c+1] = true;
        grid[r+2][c+2] = true;
    }
    for (let i = 0; i < randomInt(8, 15); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function hasDiagonal4() {
    const grid = createEmptyGrid();
    const num = randomInt(2, 4);
    for (let i = 0; i < num; i++) {
        const r = randomInt(0, 2);
        const c = randomInt(0, 2);
        for (let j = 0; j < 4; j++) {
            grid[r+j][c+j] = true;
        }
    }
    for (let i = 0; i < randomInt(8, 15); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function denseCheckerboard() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if ((i + j) % 2 === 0) {
                grid[i][j] = Math.random() < 0.8;
            }
        }
    }
    return grid;
}

export function denseStripedPattern() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 6; i++) {
        const fill = i % 2 === 0;
        if (fill) {
            for (let j = 0; j < 6; j++) {
                grid[i][j] = Math.random() < 0.8;
            }
        }
    }
    return grid;
}

export function denseSpiralPattern() {
    const grid = createEmptyGrid();
    const path = [
        [0,0],[0,1],[0,2],[0,3],[0,4],[0,5],
        [1,5],[2,5],[3,5],[4,5],[5,5],
        [5,4],[5,3],[5,2],[5,1],[5,0],
        [4,0],[3,0],[2,0],[1,0],
        [1,1],[1,2],[1,3],[1,4],
        [2,4],[3,4],[4,4],
        [4,3],[4,2],[4,1],
        [3,1],[2,1],[2,2],[2,3],[3,3],[3,2]
    ];
    const fillCount = randomInt(20, 30);
    for (let i = 0; i < fillCount && i < path.length; i++) {
        const [r, c] = path[i];
        grid[r][c] = true;
    }
    return grid;
}

export function denseZigzag() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 6; i++) {
        const offset = i % 2;
        for (let j = offset; j < 6; j += 2) {
            grid[i][j] = Math.random() < 0.7;
        }
    }
    return grid;
}


// =============================================================================
// RULE 10: 4-NEIGHBORS GENERATORS
// =============================================================================

function plusShapeFactory(minExtra, maxExtra) {
    return function() {
        const grid = createEmptyGrid();
        const r = randomInt(1, 4);
        const c = randomInt(1, 4);
        // Plus shape - center has 4 neighbors
        grid[r][c] = true;
        grid[r-1][c] = true;
        grid[r+1][c] = true;
        grid[r][c-1] = true;
        grid[r][c+1] = true;

        const extraCount = randomInt(minExtra, maxExtra);
        for (let i = 0; i < extraCount; i++) {
            grid[randomInt(0, 5)][randomInt(0, 5)] = true;
        }
        return grid;
    };
}

export const plusShapePlus10_15 = plusShapeFactory(10, 15);
export const plusShapePlus15_20 = plusShapeFactory(15, 20);
export const plusShapePlus20_25 = plusShapeFactory(20, 25);

export function multiplePlusShapes() {
    const grid = createEmptyGrid();
    const num = randomInt(2, 3);
    const positions = [[1,1], [1,4], [4,1], [4,4]];
    shuffle(positions);

    for (let i = 0; i < num && i < positions.length; i++) {
        const [r, c] = positions[i];
        if (r >= 1 && r <= 4 && c >= 1 && c <= 4) {
            grid[r][c] = true;
            grid[r-1][c] = true;
            grid[r+1][c] = true;
            grid[r][c-1] = true;
            grid[r][c+1] = true;
        }
    }
    // Add random extra cells
    const extraCount = randomInt(8, 14);
    for (let i = 0; i < extraCount; i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function crossShapePlus() {
    const grid = createEmptyGrid();
    // X-shaped cross
    const r = randomInt(1, 4);
    const c = randomInt(1, 4);

    grid[r][c] = true;
    grid[r-1][c-1] = true;
    grid[r-1][c+1] = true;
    grid[r+1][c-1] = true;
    grid[r+1][c+1] = true;
    grid[r-1][c] = true;
    grid[r+1][c] = true;
    grid[r][c-1] = true;
    grid[r][c+1] = true;

    for (let i = 0; i < randomInt(10, 18); i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function denseBlob4Neighbors() {
    const grid = createEmptyGrid();
    growConnectedBlob(grid, randomInt(2, 3), randomInt(2, 3), randomInt(16, 24));
    // Add random extra cells
    const extraCount = randomInt(2, 6);
    for (let i = 0; i < extraCount; i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function largeBlobMany4Neighbors() {
    const grid = createEmptyGrid();
    growConnectedBlob(grid, randomInt(2, 3), randomInt(2, 3), randomInt(20, 28));
    // Add random extra cells
    const extraCount = randomInt(2, 5);
    for (let i = 0; i < extraCount; i++) {
        grid[randomInt(0, 5)][randomInt(0, 5)] = true;
    }
    return grid;
}

export function max3Neighbors() {
    const grid = createEmptyGrid();
    let r = randomInt(1, 4);
    let c = randomInt(1, 4);
    grid[r][c] = true;

    // Add cells ensuring max 3 neighbors
    for (let i = 0; i < randomInt(8, 15); i++) {
        const neighbors = [[r-1,c], [r+1,c], [r,c-1], [r,c+1]].filter(([nr, nc]) =>
            nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !grid[nr][nc]
        );
        if (neighbors.length === 0) {
            // Start new component
            r = randomInt(0, 5);
            c = randomInt(0, 5);
            if (!grid[r][c]) grid[r][c] = true;
            continue;
        }

        // Check that adding this neighbor won't create 4-neighbor cell
        shuffle(neighbors);
        let added = false;
        for (const [nr, nc] of neighbors) {
            grid[nr][nc] = true;
            // Check if this created a 4-neighbor situation
            let has4Neighbors = false;
            for (let checkR = 0; checkR < 6; checkR++) {
                for (let checkC = 0; checkC < 6; checkC++) {
                    if (grid[checkR][checkC] && getNeighborCount(grid, checkR, checkC) === 4) {
                        has4Neighbors = true;
                        break;
                    }
                }
                if (has4Neighbors) break;
            }

            if (has4Neighbors) {
                grid[nr][nc] = false; // Undo
            } else {
                r = nr;
                c = nc;
                added = true;
                break;
            }
        }
        if (!added) {
            // Try new location
            r = randomInt(0, 5);
            c = randomInt(0, 5);
        }
    }
    return grid;
}

export function denseMax3Neighbors() {
    const grid = max3Neighbors();
    // Add more cells ensuring max 3
    for (let attempt = 0; attempt < 30; attempt++) {  // Increased from 15 to 30
        const r = randomInt(0, 5);
        const c = randomInt(0, 5);
        if (!grid[r][c]) {
            grid[r][c] = true;
            // Check if this created 4 neighbors
            let has4 = false;
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j] && getNeighborCount(grid, i, j) === 4) {
                        has4 = true;
                        break;
                    }
                }
                if (has4) break;
            }
            if (has4) grid[r][c] = false;
        }
    }
    return grid;
}

// Very high density variations without 4 neighbors
export function veryDenseMax3Neighbors() {
    const grid = createEmptyGrid();
    // Try to fill as much as possible without creating 4 neighbors
    for (let attempt = 0; attempt < 100; attempt++) {
        const r = randomInt(0, 5);
        const c = randomInt(0, 5);
        if (!grid[r][c]) {
            grid[r][c] = true;
            // Check if this created 4 neighbors
            let has4 = false;
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j] && getNeighborCount(grid, i, j) === 4) {
                        has4 = true;
                        break;
                    }
                }
                if (has4) break;
            }
            if (has4) grid[r][c] = false;
        }
    }
    return grid;
}

export function denseCheckerboardMax3() {
    const grid = createEmptyGrid();
    // Checkerboard-like but ensuring no 4 neighbors
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if ((i + j) % 2 === 0 && Math.random() < 0.9) {
                grid[i][j] = true;
            }
        }
    }
    // Remove any cells with 4 neighbors
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j] && getNeighborCount(grid, i, j) === 4) {
                grid[i][j] = false;
            }
        }
    }
    return grid;
}

export function denseStripesMax3() {
    const grid = createEmptyGrid();
    // Horizontal stripes ensuring no 4 neighbors
    for (let i = 0; i < 6; i++) {
        if (i % 2 === 0) {
            for (let j = 0; j < 6; j++) {
                if (Math.random() < 0.85) {
                    grid[i][j] = true;
                }
            }
        }
    }
    // Remove any cells with 4 neighbors
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j] && getNeighborCount(grid, i, j) === 4) {
                grid[i][j] = false;
            }
        }
    }
    return grid;
}

export function mostlyFilledMax3() {
    const grid = createEmptyGrid();
    // Fill most cells randomly
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (Math.random() < 0.75) {
                grid[i][j] = true;
            }
        }
    }
    // Remove any cells with 4 neighbors
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j] && getNeighborCount(grid, i, j) === 4) {
                grid[i][j] = false;
            }
        }
    }
    return grid;
}

export function longSnake() {
    return connectedLongSquiggle();
}

export function treeMax3() {
    return tree();
}

export function checkerboardDense() {
    return denseCheckerboard();
}

export function spiralNoCenter() {
    const grid = denseSpiralPattern();
    // Remove center cells
    grid[2][2] = false;
    grid[2][3] = false;
    grid[3][2] = false;
    grid[3][3] = false;
    return grid;
}

export function borderThickNoCenter() {
    const grid = createEmptyGrid();
    // Thick border
    for (let i = 0; i < 6; i++) {
        grid[0][i] = true;
        grid[1][i] = Math.random() < 0.7;
        grid[4][i] = Math.random() < 0.7;
        grid[5][i] = true;
    }
    for (let i = 2; i < 4; i++) {
        grid[i][0] = true;
        grid[i][1] = Math.random() < 0.7;
        grid[i][4] = Math.random() < 0.7;
        grid[i][5] = true;
    }
    // Remove center
    grid[2][2] = false;
    grid[2][3] = false;
    grid[3][2] = false;
    grid[3][3] = false;
    return grid;
}

export function multipleDisjointBlobs() {
    return threeMediumComponents();
}

export function lShapesMany() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const grid = createEmptyGrid();
        const positions = shuffle([[0,0], [0,3], [0,5], [3,0], [3,3], [3,5], [5,0], [5,3], [5,5]]);

        let placed = 0;
        for (const [r, c] of positions) {
            if (placed >= 3) break;
            // Check if L-shape can be placed without touching existing
            if (r <= 4 && c <= 4 &&
                !grid[r][c] && !grid[r+1][c] && !grid[r][c+1]) {
                // Check no adjacency to existing components
                const cells = [[r,c], [r+1,c], [r,c+1]];
                let canPlace = true;
                for (const [cr, cc] of cells) {
                    const neighbors = [[cr-1,cc], [cr+1,cc], [cr,cc-1], [cr,cc+1]];
                    for (const [nr, nc] of neighbors) {
                        if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && grid[nr][nc]) {
                            // Check if this neighbor is part of current L-shape
                            let isPartOfShape = false;
                            for (const [sr, sc] of cells) {
                                if (nr === sr && nc === sc) {
                                    isPartOfShape = true;
                                    break;
                                }
                            }
                            if (!isPartOfShape) {
                                canPlace = false;
                                break;
                            }
                        }
                    }
                    if (!canPlace) break;
                }

                if (canPlace) {
                    grid[r][c] = true;
                    grid[r+1][c] = true;
                    grid[r][c+1] = true;
                    placed++;
                }
            }
        }

        if (validateSeparateComponents(grid, 3)) {
            return grid;
        }
    }
    return createEmptyGrid();
}

export function tShapesMany() {
    for (let attempt = 0; attempt < 50; attempt++) {
        const grid = createEmptyGrid();
        const positions = shuffle([[1,1], [1,4], [4,1], [4,4], [1,2], [1,3], [4,2], [4,3]]);

        let placed = 0;
        for (const [r, c] of positions) {
            if (placed >= 3) break;
            // Check if T-shape can be placed without touching existing
            if (r >= 1 && r <= 4 && c >= 1 && c <= 4 &&
                !grid[r][c] && !grid[r-1][c] && !grid[r][c-1] && !grid[r][c+1]) {
                // Check no adjacency to existing components
                const cells = [[r,c], [r-1,c], [r,c-1], [r,c+1]];
                let canPlace = true;
                for (const [cr, cc] of cells) {
                    const neighbors = [[cr-1,cc], [cr+1,cc], [cr,cc-1], [cr,cc+1]];
                    for (const [nr, nc] of neighbors) {
                        if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && grid[nr][nc]) {
                            // Check if this neighbor is part of current T-shape
                            let isPartOfShape = false;
                            for (const [sr, sc] of cells) {
                                if (nr === sr && nc === sc) {
                                    isPartOfShape = true;
                                    break;
                                }
                            }
                            if (!isPartOfShape) {
                                canPlace = false;
                                break;
                            }
                        }
                    }
                    if (!canPlace) break;
                }

                if (canPlace) {
                    grid[r][c] = true;
                    grid[r-1][c] = true;
                    grid[r][c-1] = true;
                    grid[r][c+1] = true;
                    placed++;
                }
            }
        }

        if (validateSeparateComponents(grid, 3)) {
            return grid;
        }
    }
    return createEmptyGrid();
}

// =============================================================================
// LEGACY/COMPATIBILITY GENERATORS
// =============================================================================

export function has2x2BlackSquare() { return has2x2Plus10_15(); }
export function hasCellWith4Neighbors() { return plusShapePlus10_15(); }
export function borderOnly() { return borderUniRand(); }
export function checkerboardPositions() { return denseCheckerboard(); }

// Old baseline generators (keeping for compatibility)
export function connectedBlobs(count = null) {
    if (count === null) count = randomInt(3, 10);
    const grid = createEmptyGrid();
    growConnectedBlob(grid, randomInt(1, 4), randomInt(1, 4), count);
    return grid;
}

export function denseConnectedBlob() {
    return connectedBlobs(randomInt(15, 25));
}

export function blockResolution(blockSize = 2) {
    const grid = createEmptyGrid();
    const blockGrid = Array.from({ length: Math.ceil(6/blockSize) }, () =>
        Array(Math.ceil(6/blockSize)).fill(false)
    );

    const blockCount = randomInt(2, blockGrid.length * blockGrid[0].length / 2);
    for (let i = 0; i < blockCount; i++) {
        const br = randomInt(0, blockGrid.length - 1);
        const bc = randomInt(0, blockGrid[0].length - 1);
        blockGrid[br][bc] = true;
    }

    for (let i = 0; i < blockGrid.length; i++) {
        for (let j = 0; j < blockGrid[0].length; j++) {
            if (blockGrid[i][j]) {
                for (let di = 0; di < blockSize; di++) {
                    for (let dj = 0; dj < blockSize; dj++) {
                        const r = i * blockSize + di;
                        const c = j * blockSize + dj;
                        if (r < 6 && c < 6) {
                            grid[r][c] = true;
                        }
                    }
                }
            }
        }
    }
    return grid;
}

export function noIsolatedBlacks() {
    return many2_4s();
}

export function disconnectedBlobs() {
    return twoLargeComponents();
}

export function fewIsolatedBlacks() {
    return many1_4s();
}

export function diagonalPattern() {
    return hasDiagonal3();
}

export function borderPattern() {
    return borderUniRand();
}

export function checkerboardPattern() {
    return denseCheckerboard();
}

export function almostBlockResolution() {
    const grid = blockResolution(2);
    // Break one block
    grid[randomInt(0, 5)][randomInt(0, 5)] = !grid[randomInt(0, 5)][randomInt(0, 5)];
    return grid;
}

export function tiled3x3() {
    const grid = createEmptyGrid();
    const pattern = [];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            if (Math.random() < 0.5) pattern.push([i, j]);
        }
    }

    [[0,0], [0,3], [3,0], [3,3]].forEach(([startR, startC]) => {
        pattern.forEach(([dr, dc]) => {
            grid[startR + dr][startC + dc] = true;
        });
    });
    return grid;
}

export function almostTiled() {
    const grid = tiled3x3();
    grid[randomInt(0, 5)][randomInt(0, 5)] = !grid[randomInt(0, 5)][randomInt(0, 5)];
    return grid;
}

export function has3x3BlackSquare() { return has3x3Square(); }
export function almost3x3Square() {
    const grid = has3x3Square();
    // Remove one cell from the square
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            if (grid[i][j]) {
                grid[i][j] = false;
                return grid;
            }
        }
    }
    return grid;
}

export function nonDecreasingRows() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 6; i++) {
        let lastBlack = -1;
        for (let j = 0; j < 6; j++) {
            if (Math.random() < 0.4) {
                if (j > lastBlack) {
                    grid[i][j] = true;
                    lastBlack = j;
                }
            }
        }
    }
    return grid;
}

export function almostNonDecreasing() {
    const grid = nonDecreasingRows();
    // Add one violating cell
    for (let i = 0; i < 6; i++) {
        let lastBlack = -1;
        for (let j = 0; j < 6; j++) {
            if (grid[i][j]) lastBlack = j;
        }
        if (lastBlack > 0 && !grid[i][lastBlack - 1]) {
            grid[i][lastBlack - 1] = true;
            break;
        }
    }
    return grid;
}

export function highDensityRandom() {
    return withBlackCount(randomInt(18, 28));
}

export function invertedPattern() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
            grid[i][j] = Math.random() < 0.7;
        }
    }
    return grid;
}

export function multipleLargeBlobs() {
    return twoLargeComponents();
}

export function highCellCount() {
    return withBlackCount(randomInt(25, 32));
}

export function downwardRightCascade() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j <= i && j < 6; j++) {
            if (Math.random() < 0.6) grid[i][j] = true;
        }
    }
    return grid;
}

export function upwardCascade() {
    const grid = createEmptyGrid();
    for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6 - i; j++) {
            if (Math.random() < 0.6) grid[i][j] = true;
        }
    }
    return grid;
}

export function pathPattern() {
    return connectedLongSquiggle();
}

export function evenSumCoordinates() {
    return checkerboardPositions();
}

// =============================================================================
// EXPORTS AND BASELINE DISTRIBUTION
// =============================================================================

export function sampleFromDistribution(distributions) {
    const totalWeight = distributions.reduce((sum, d) => sum + d.weight, 0);
    let random = Math.random() * totalWeight;

    for (const dist of distributions) {
        random -= dist.weight;
        if (random <= 0) {
            return dist.generator();
        }
    }
    return distributions[distributions.length - 1].generator();
}

const BASELINE_DISTRIBUTION_RAW = [
    { type: 'withBlackCount', weight: 0.02, options: { count: 0 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 1 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 2 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 3 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 4 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 5 } },
    { type: 'withBlackCount', weight: 0.03, options: { count: 6 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 7 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 8 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 10 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 12 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 15 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 18 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 20 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 22 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 25 } },
    { type: 'withBlackCount', weight: 0.02, options: { count: 28 } },
    { type: 'uniformRandom', weight: 0.05 },
    { type: 'connectedBlobs', weight: 0.04 },
    { type: 'denseConnectedBlob', weight: 0.04 },
    { type: 'blockResolution', weight: 0.05, options: { blockSize: 2 } },
    { type: 'onePerRowAndColumn', weight: 0.05 },
    { type: 'tiled3x3', weight: 0.05 },
    { type: 'noIsolatedBlacks', weight: 0.05 },
    { type: 'verticalSymmetry', weight: 0.075 },
    { type: 'horizontalSymmetry', weight: 0.075 },
    { type: 'has3x3BlackSquare', weight: 0.02 },
    { type: 'nonDecreasingRows', weight: 0.015 },
    { type: 'hasCellWith4Neighbors', weight: 0.015 },
    { type: 'diagonalPattern', weight: 0.01 },
    { type: 'borderPattern', weight: 0.005 },
    { type: 'checkerboardPattern', weight: 0.005 },
    { type: 'almostOnePerRowColumn', weight: 0.015 },
    { type: 'disconnectedBlobs', weight: 0.015 },
    { type: 'almostSymmetric', weight: 0.01 },
    { type: 'almostBlockResolution', weight: 0.01 },
    { type: 'fewIsolatedBlacks', weight: 0.015 },
    { type: 'almostTiled', weight: 0.01 },
    { type: 'almost3x3Square', weight: 0.01 },
    { type: 'almostNonDecreasing', weight: 0.01 },
    { type: 'max3Neighbors', weight: 0.01 },
    { type: 'leftRightEqual', weight: 0.02 },
    { type: 'evenSumCoordinates', weight: 0.02 },
    { type: 'fullySymmetric', weight: 0.015 },
    { type: 'downwardRightCascade', weight: 0.015 },
    { type: 'upwardCascade', weight: 0.015 },
    { type: 'pathPattern', weight: 0.015 },
    { type: 'highDensityRandom', weight: 0.03 },
    { type: 'invertedPattern', weight: 0.025 },
    { type: 'multipleLargeBlobs', weight: 0.025 },
    { type: 'denseStripedPattern', weight: 0.02 },
    { type: 'highCellCount', weight: 0.02 }
];

const totalWeight = BASELINE_DISTRIBUTION_RAW.reduce((sum, d) => sum + d.weight, 0);
export const BASELINE_DISTRIBUTION = BASELINE_DISTRIBUTION_RAW.map(d => ({
    ...d,
    weight: d.weight / totalWeight
}));

// Note: Export with special name handling for "180degreeRotInv"
export const GridDistributions = {
    uniformRandom, withBlackCount, verticalSymmetry, horizontalSymmetry,
    anySymmetry, fullySymmetric, almostSymmetric, leftRightEqual, topBottomEqual,
    copy3X3, leftRightMirror, topBottomMirror, '180degreeRotInv': _180degreeRotInv,
    connectedLongSquiggle, connectedManyBlacks, twoBlobsConViaPath, tree, thinkBlob,
    twoLargeComponents, threeMediumComponents, fourSquiggles, fiveSquiggles, many2_4,
    borderUniRand, threeEdgesRand, twoEdgesRand, corner2x2sRand, noDeadCenter,
    on3VerticalStripes, on2HorizontalStripes, noCenter2Columns, noCenter2Rows,
    corner2x2s, noBorders, many2_4s, fourSquiqqles, many3s, longSquiqqle,
    many1_4s, many1_2s, many1_3s, fourSquiqqlesOne1, isolatedDots,
    threeWhiteRowsButMultipleHalves, threeWhiteColsButMultipleHalves,
    fourWhiteRowsButMultipleHalves, fourWhiteColsButMultipleHalves,
    allInOneHalf, allInOneThird, allInOneCol, allInOneRow, allInOneHalfMiddleRemoved,
    allInOneHalfEdgeRemoved, allInCorner3x3, allInEdge2x3s, allInOneHalfBordersOnly,
    noCenter2RorC, noEdge2RorC, allInTwoThirds, allInCorner2x2s, allInThreeRorC,
    allInMiddle2RorC, allInMiddle4x4, onePerRowAndColumn, almostOnePerRowColumn,
    onePerRowColumnOneMissing, onePerRowColumnOneExtra, fitsIn4x4, fitsIn3x3,
    fitsIn3x4, fitsIn2x4, fitsIn2x3, fitsIn2x5, fitsIn3x5, fitsIn4x5, fitsIn2x6,
    twoCompsIn4x4, pentominoIn4x4, randomTetris, sextominoIn4x4, sextominoNot4x4,
    septominoNot4x4, fitsInTwo2x2s, fitsInTwo2x3s, fitsInTwo2x4s,
    'has2x2Plus10-15': has2x2Plus10_15, 'has2x2Plus15-20': has2x2Plus15_20,
    'has2x2Plus20-25': has2x2Plus20_25, has3x3Square, has4x4Square, multiple2x2s,
    has2x3RectPlus, has3x2RectPlus, hasTshape, has2x1Plus, has1x2Plus, hasLshape,
    hasPlusShape, hasDiagonal3, hasDiagonal4, denseCheckerboard, denseStripedPattern,
    denseSpiralPattern, denseZigzag, 'plusShapePlus10-15': plusShapePlus10_15,
    'plusShapePlus15-20': plusShapePlus15_20, 'plusShapePlus20-25': plusShapePlus20_25,
    multiplePlusShapes, crossShapePlus, denseBlob4Neighbors, largeBlobMany4Neighbors,
    max3Neighbors, denseMax3Neighbors, veryDenseMax3Neighbors, denseCheckerboardMax3,
    denseStripesMax3, mostlyFilledMax3, longSnake, treeMax3, checkerboardDense,
    spiralNoCenter, borderThickNoCenter, multipleDisjointBlobs, lShapesMany,
    tShapesMany, has2x2BlackSquare, hasCellWith4Neighbors, borderOnly,
    checkerboardPositions, connectedBlobs, denseConnectedBlob, blockResolution,
    noIsolatedBlacks, disconnectedBlobs, fewIsolatedBlacks, diagonalPattern,
    borderPattern, checkerboardPattern, almostBlockResolution, tiled3x3, almostTiled,
    has3x3BlackSquare, almost3x3Square, nonDecreasingRows, almostNonDecreasing,
    highDensityRandom, invertedPattern, multipleLargeBlobs, highCellCount,
    downwardRightCascade, upwardCascade, pathPattern, evenSumCoordinates,
    sampleFromDistribution, BASELINE_DISTRIBUTION
};
