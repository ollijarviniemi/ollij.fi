/**
 * Grids Game Rules
 * Rules for 6x6 grid patterns with some cells filled black
 * Each rule includes distribution specifications for positive/negative examples
 *
 * IMPORTANT: Each rule MUST have a generateNegative() method that produces
 * examples that ALWAYS fail the check() function (100% guaranteed).
 *
 * ROUND-SPECIFIC NEGATIVES:
 * Each rule has 5-10 generators that are close matches to positive examples
 * but fail the rule. These are more targeted than the generic baseline.
 *
 * NEW RULE PROGRESSION (Easy → Hard):
 * 1. At most 6 black cells
 * 2. Symmetric (vertical OR horizontal)
 * 3. All blacks connected (one blob)
 * 4. All blacks on border only
 * 5. No isolated blacks (all have ≥1 neighbor)
 * 6. All blacks in one half (top/bottom OR left/right)
 * 7. Exactly one black per row AND column
 * 8. All blacks fit in some 4×4 subgrid
 * 9. Has a 2×2 black square somewhere
 * 10. Some black has 4 neighbors (all sides)
 */

// Helper functions
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Import baseline distribution
import { BASELINE_DISTRIBUTION } from './grids-distributions.js';

export const GRIDS_RULES = [
    // Rule 1: At most 6 black cells
    // Rule 2: Symmetric (vertical OR horizontal)
    {
        id: 'g2',
        name: 'The grid is symmetric vertically or horizontally',
        check: (grid) => {
            // Check vertical symmetry
            let verticalSym = true;
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 3; j++) {
                    if (grid[i][j] !== grid[i][5-j]) {
                        verticalSym = false;
                        break;
                    }
                }
                if (!verticalSym) break;
            }

            if (verticalSym) return true;

            // Check horizontal symmetry
            let horizontalSym = true;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j] !== grid[5-i][j]) {
                        horizontalSym = false;
                        break;
                    }
                }
                if (!horizontalSym) break;
            }

            return horizontalSym;
        },
        distribution: {
            positive: [
                { type: 'verticalSymmetry', weight: 0.35 },
                { type: 'horizontalSymmetry', weight: 0.35 },
                { type: 'fullySymmetric', weight: 0.3 },
            ]
        },
        roundSpecificNegative: [
            { type: 'almostSymmetric', weight: 0.10 },
            { type: 'leftRightEqual', weight: 0.15 },
            { type: 'topBottomEqual', weight: 0.15 },
            { type: 'copy3X3', weight: 0.15 },
            { type: 'leftRightMirror', weight: 0.15 },
            { type: 'topBottomMirror', weight: 0.15 },
            { type: '180degreeRotInv', weight: 0.15 },            
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            const count = randomInt(3, 12);
            for (let i = 0; i < count; i++) {
                grid[randomInt(0, 5)][randomInt(0, 5)] = true;
            }
            return grid;
        }
    },

    // Rule 3: All blacks connected (one blob)
    {
        id: 'g3',
        name: 'The black cells form one connected region',
        check: (grid) => {
            const blackCells = [];
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) {
                        blackCells.push([i, j]);
                    }
                }
            }

            if (blackCells.length === 0) return true;

            // BFS from first black cell
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
        },
        distribution: {
            positive: [
                { type: 'connectedLongSquiggle', weight: 0.3 },
                { type: 'connectedManyBlacks', weight: 0.05, options: { count: 15}},
                { type: 'connectedManyBlacks', weight: 0.05, options: { count: 18}},
                { type: 'connectedManyBlacks', weight: 0.05, options: { count: 21}},
                { type: 'connectedManyBlacks', weight: 0.05, options: { count: 24}},
                { type: 'connectedManyBlacks', weight: 0.05, options: { count: 27}},
                { type: 'connectedManyBlacks', weight: 0.05, options: { count: 30}},
                { type: 'twoBlobsConViaPath', weight: 0.15},
                { type: 'tree', weight: 0.15},
                { type: 'thinkBlob', weight: 0.1},
            ]
        },
        roundSpecificNegative: [
            { type: 'twoLargeComponents', weight: 0.2 },
            { type: 'threeMediumComponents', weight: 0.2},
            { type: 'fourSquiggles', weight: 0.2 },
            { type: 'fiveSquiggles', weight: 0.2 },
            { type: 'many2_4', weight: 0.2 },
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            // Create two separate blobs
            grid[1][1] = true;
            grid[1][2] = true;
            grid[4][4] = true;
            grid[4][5] = true;
            return grid;
        }
    },

    // Rule 1: At most 6 black cells
    {
        id: 'g1',
        name: 'At most 6 black cells',
        check: (grid) => {
            let count = 0;
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) count++;
                }
            }
            return count <= 6;
        },
        distribution: {
            positive: [
                { type: 'withBlackCount', weight: 0.10, options: { count: 0 } },
                { type: 'withBlackCount', weight: 0.15, options: { count: 1 } },
                { type: 'withBlackCount', weight: 0.15, options: { count: 2 } },
                { type: 'withBlackCount', weight: 0.15, options: { count: 3 } },
                { type: 'withBlackCount', weight: 0.15, options: { count: 4 } },
                { type: 'withBlackCount', weight: 0.15, options: { count: 5 } },
                { type: 'withBlackCount', weight: 0.15, options: { count: 6 } }
            ]
        },
        roundSpecificNegative: [
            { type: 'withBlackCount', weight: 0.25, options: { count: 7 } },
            { type: 'withBlackCount', weight: 0.20, options: { count: 8 } },
            { type: 'withBlackCount', weight: 0.15, options: { count: 9 } },
            { type: 'withBlackCount', weight: 0.12, options: { count: 10 } },
            { type: 'withBlackCount', weight: 0.10, options: { count: 12 } },
            { type: 'withBlackCount', weight: 0.08, options: { count: 15 } },
            { type: 'withBlackCount', weight: 0.05, options: { count: 18 } },
            { type: 'withBlackCount', weight: 0.05, options: { count: 20 } }
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            const count = randomInt(7, 15);
            const positions = [];
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    positions.push([i, j]);
                }
            }
            for (let i = 0; i < count; i++) {
                const idx = randomInt(0, positions.length - 1);
                const [r, c] = positions[idx];
                positions.splice(idx, 1);
                grid[r][c] = true;
            }
            return grid;
        }
    },


    // Rule 6: All blacks in one half
    {
        id: 'g6',
        name: 'All black cells are in one half',
        check: (grid) => {
            let topHalf = true;
            let bottomHalf = true;
            let leftHalf = true;
            let rightHalf = true;

            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) {
                        if (i >= 3) topHalf = false;
                        if (i < 3) bottomHalf = false;
                        if (j >= 3) leftHalf = false;
                        if (j < 3) rightHalf = false;
                    }
                }
            }

            return topHalf || bottomHalf || leftHalf || rightHalf;
        },
        distribution: {
            positive: [
                { type: 'allInOneHalf', weight: 0.3 },
                { type: 'allInOneThird', weight: 0.1 },
                { type: 'allInOneCol', weight: 0.05 },
                { type: 'allInOneRow', weight: 0.05 },
                { type: 'allInOneHalfMiddleRemoved', weight: 0.1 },
                { type: 'allInOneHalfEdgeRemoved', weight: 0.1 },
                { type: 'allInCorner3x3', weight: 0.1},
                { type: 'allInEdge2x3s', weight: 0.1},
                { type: 'allInOneHalfBordersOnly', weight: 0.1},
            ]
        },
        roundSpecificNegative: [
            { type: 'threeWhiteRowsButMultipleHalves', weight: 0.15 },
            { type: 'threeWhiteColsButMultipleHalves', weight: 0.15 },
            { type: 'fourWhiteRowsButMultipleHalves', weight: 0.10 },
            { type: 'fourWhiteColsButMultipleHalves', weight: 0.10 },
            { type: 'noCenter2RorC', weight: 0.15 },
            { type: 'noEdge2RorC', weight: 0.15 },
            { type: 'allInTwoThirds', weight: 0.15 },
            { type: 'allInCorner2x2s', weight: 0.15 },
            { type: 'allInThreeRorC', weight: 0.15 },
            { type: 'allInMiddle2RorC', weight: 0.15 },
            { type: 'allInMiddle4x4', weight: 0.1 },
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            // Spread across multiple halves
            grid[1][1] = true;
            grid[4][4] = true;
            grid[1][4] = true;
            grid[4][1] = true;
            return grid;
        }
    },

    // Rule 4: All blacks on border only
    {
        id: 'g4',
        name: 'All black cells are on the outer border',
        check: (grid) => {
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) {
                        // Must be on border (first/last row or first/last column)
                        if (i !== 0 && i !== 5 && j !== 0 && j !== 5) {
                            return false;
                        }
                    }
                }
            }
            return true;
        },
        distribution: {
            positive: [
                { type: 'borderUniRand', weight: 0.25},
                { type: 'threeEdgesRand', weight: 0.25},
                { type: 'twoEdgesRand', weight: 0.25},
                { type: 'corner2x2sRand', weight: 0.25},
            ]
        },
        roundSpecificNegative: [
            { type: 'noDeadCenter', weight: 0.15},
            { type: 'on3VerticalStripes', weight: 0.1},
            { type: 'on2HorizontalStripes', weight: 0.15},
            { type: 'noCenter2Columns', weight: 0.15},
            { type: 'noCenter2Rows', weight: 0.15},
            { type: 'corner2x2s', weight: 0.15},
            { type: 'noBorders', weight: 0.15}
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            // Add some interior cells
            grid[2][2] = true;
            grid[3][3] = true;
            // Maybe some border too
            if (Math.random() < 0.5) {
                grid[0][0] = true;
                grid[5][5] = true;
            }
            return grid;
        }
    },

    // Rule 7: Exactly one black per row AND column
    {
        id: 'g7',
        name: 'Every row and column has exactly one black cell',
        check: (grid) => {
            // Check rows
            for (let i = 0; i < 6; i++) {
                let count = 0;
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) count++;
                }
                if (count !== 1) return false;
            }

            // Check columns
            for (let j = 0; j < 6; j++) {
                let count = 0;
                for (let i = 0; i < 6; i++) {
                    if (grid[i][j]) count++;
                }
                if (count !== 1) return false;
            }

            return true;
        },
        distribution: {
            positive: [
                { type: 'onePerRowAndColumn', weight: 1.0 }
            ]
        },
        roundSpecificNegative: [
            { type: 'almostOnePerRowColumn', weight: 0.2 },
            { type: 'onePerRowColumnOneMissing', weight: 0.2 },
            { type: 'onePerRowColumnOneExtra', weight: 0.2 },
            { type: 'withBlackCount', weight: 0.1, options: { count: 5 } },
            { type: 'withBlackCount', weight: 0.2, options: { count: 6 } },
            { type: 'withBlackCount', weight: 0.1, options: { count: 7 } },
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            // Missing one row
            for (let i = 0; i < 5; i++) {
                grid[i][i] = true;
            }
            return grid;
        }
    },

    // Rule 5: No isolated blacks
    {
        id: 'g5',
        name: 'Every black cell has at least one black neighbor',
        check: (grid) => {
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) {
                        let hasNeighbor = false;
                        [[i-1,j], [i+1,j], [i,j-1], [i,j+1]].forEach(([ni, nj]) => {
                            if (ni >= 0 && ni < 6 && nj >= 0 && nj < 6 && grid[ni][nj]) {
                                hasNeighbor = true;
                            }
                        });
                        if (!hasNeighbor) return false;
                    }
                }
            }
            return true;
        },
        distribution: {
            positive: [
                { type: 'denseConnectedBlob', weight: 0.25},
                { type: 'connectedManyBlacks', weight: 0.15, options: { count: 20}},
                { type: 'connectedManyBlacks', weight: 0.10, options: { count: 25}},
                { type: 'twoLargeComponents', weight: 0.15},
                { type: 'threeMediumComponents', weight: 0.15},
                { type: 'longSquiqqle', weight: 0.10},
                { type: 'many2_4s', weight: 0.10},
            ]
        },
        roundSpecificNegative: [
            { type: 'many1_4s', weight: 0.2},
            { type: 'many1_2s', weight: 0.2},
            { type: 'many1_3s', weight: 0.2},
            { type: 'fourSquiqqlesOne1', weight: 0.2},
            { type: 'isolatedDots', weight: 0.04, options: {count: 2}},
            { type: 'isolatedDots', weight: 0.04, options: {count: 4}},
            { type: 'isolatedDots', weight: 0.04, options: {count: 7}},
            { type: 'isolatedDots', weight: 0.04, options: {count: 10}},
            { type: 'isolatedDots', weight: 0.04, options: {count: 14}},
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            grid[2][2] = true; // isolated
            grid[0][0] = true;
            grid[0][1] = true;
            return grid;
        }
    },

    // Rule 8: All blacks fit in some 4×4 subgrid
    {
        id: 'g8',
        name: 'All black cells fit within some 4 by 4 area',
        check: (grid) => {
            // Try all possible 4x4 windows
            for (let startR = 0; startR <= 2; startR++) {
                for (let startC = 0; startC <= 2; startC++) {
                    let allInWindow = true;
                    for (let i = 0; i < 6; i++) {
                        for (let j = 0; j < 6; j++) {
                            if (grid[i][j]) {
                                if (i < startR || i >= startR + 4 || j < startC || j >= startC + 4) {
                                    allInWindow = false;
                                    break;
                                }
                            }
                        }
                        if (!allInWindow) break;
                    }
                    if (allInWindow) return true;
                }
            }
            return false;
        },
        distribution: {
            positive: [
                { type: 'fitsIn4x4', weight: 0.15 },
                { type: 'fitsIn3x3', weight: 0.1 },
                { type: 'fitsIn3x4', weight: 0.1 },
                { type: 'fitsIn2x4', weight: 0.05 },
                { type: 'fitsIn2x3', weight: 0.05 },
                { type: 'twoCompsIn4x4', weight: 0.1 },
                { type: 'pentominoIn4x4', weight: 0.15 },
                { type: 'randomTetris', weight: 0.15 },
                { type: 'sextominoIn4x4', weight: 0.15 },
            ]
        },
        roundSpecificNegative: [
            { type: 'fitsIn2x5', weight: 0.15 },
            { type: 'fitsIn3x5', weight: 0.15 },
            { type: 'fitsIn4x5', weight: 0.15 },
            { type: 'sextominoNot4x4', weight: 0.15 },
            { type: 'septominoNot4x4', weight: 0.15 },
            { type: 'fitsInTwo2x2s', weight: 0.05 },
            { type: 'fitsInTwo2x3s', weight: 0.05 },
            { type: 'fitsInTwo2x4s', weight: 0.05 },
            { type: 'fitsIn2x6', weight: 0.1 },
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            // Spread across corners - at least 3 corners to ensure can't fit in 4x4
            grid[0][0] = true;
            grid[0][5] = true;
            grid[5][0] = true;
            return grid;
        }
    },


    // Rule 9: Has a 2×2 black square somewhere
    {
        id: 'g9',
        name: 'There is a 2 by 2 black square somewhere',
        check: (grid) => {
            for (let i = 0; i <= 4; i++) {
                for (let j = 0; j <= 4; j++) {
                    if (grid[i][j] && grid[i][j+1] && grid[i+1][j] && grid[i+1][j+1]) {
                        return true;
                    }
                }
            }
            return false;
        },
        distribution: {
            positive: [
                { type: 'has2x2Plus10-15', weight: 0.15 },
                { type: 'has2x2Plus15-20', weight: 0.15 },
                { type: 'has2x2Plus20-25', weight: 0.15 },
                { type: 'has3x3Square', weight: 0.1 },
                { type: 'has4x4Square', weight: 0.05 },
                { type: 'multiple2x2s', weight: 0.1 },
                { type: 'has2x3RectPlus', weight: 0.1 },
                { type: 'has3x2RectPlus', weight: 0.1 },
                { type: 'hasTshape', weight: 0.1 }
            ]
        },
        roundSpecificNegative: [
            { type: 'has2x1Plus', weight: 0.08 },
            { type: 'has1x2Plus', weight: 0.08 },
            { type: 'hasLshape', weight: 0.12 },
            { type: 'hasPlusShape', weight: 0.12 },
            { type: 'hasDiagonal3', weight: 0.1 },
            { type: 'hasDiagonal4', weight: 0.1 },
            { type: 'denseCheckerboard', weight: 0.1 },
            { type: 'denseStripedPattern', weight: 0.1 },
            { type: 'denseSpiralPattern', weight: 0.1 },
            { type: 'denseZigzag', weight: 0.1 }
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            const count = randomInt(15, 25);
            for (let i = 0; i < count; i++) {
                grid[randomInt(0, 5)][randomInt(0, 5)] = true;
            }
            // Break any 2x2 squares
            for (let i = 0; i <= 4; i++) {
                for (let j = 0; j <= 4; j++) {
                    if (grid[i][j] && grid[i][j+1] && grid[i+1][j] && grid[i+1][j+1]) {
                        grid[i + randomInt(0, 1)][j + randomInt(0, 1)] = false;
                    }
                }
            }
            return grid;
        }
    },


    // Rule 10: Some black has 4 neighbors
    {
        id: 'g10',
        name: 'Some black cell has 4 black neighbors',
        check: (grid) => {
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) {
                        // Check if all 4 orthogonal neighbors are black
                        const hasTop = i > 0 && grid[i-1][j];
                        const hasBottom = i < 5 && grid[i+1][j];
                        const hasLeft = j > 0 && grid[i][j-1];
                        const hasRight = j < 5 && grid[i][j+1];

                        if (hasTop && hasBottom && hasLeft && hasRight) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },
        distribution: {
            positive: [
                { type: 'plusShapePlus10-15', weight: 0.15 },
                { type: 'plusShapePlus15-20', weight: 0.15 },
                { type: 'plusShapePlus20-25', weight: 0.15 },
                { type: 'multiplePlusShapes', weight: 0.1 },
                { type: 'has3x3Square', weight: 0.1 },
                { type: 'has4x4Square', weight: 0.05 },
                { type: 'crossShapePlus', weight: 0.1 },
                { type: 'denseBlob4Neighbors', weight: 0.1 },
                { type: 'largeBlobMany4Neighbors', weight: 0.1 }
            ]
        },
        roundSpecificNegative: [
            { type: 'max3Neighbors', weight: 0.08 },
            { type: 'denseMax3Neighbors', weight: 0.08 },
            { type: 'veryDenseMax3Neighbors', weight: 0.08 },
            { type: 'denseCheckerboardMax3', weight: 0.08 },
            { type: 'denseStripesMax3', weight: 0.08 },
            { type: 'mostlyFilledMax3', weight: 0.08 },
            { type: 'longSnake', weight: 0.08 },
            { type: 'treeMax3', weight: 0.07 },
            { type: 'checkerboardDense', weight: 0.07 },
            { type: 'spiralNoCenter', weight: 0.07 },
            { type: 'borderThickNoCenter', weight: 0.06 },
            { type: 'multipleDisjointBlobs', weight: 0.06 },
            { type: 'lShapesMany', weight: 0.07 },
            { type: 'tShapesMany', weight: 0.07 }
        ],
        generateNegative: () => {
            const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
            // Dense grid but no cell with 4 neighbors
            const count = randomInt(18, 26);
            for (let i = 0; i < count; i++) {
                grid[randomInt(0, 5)][randomInt(0, 5)] = true;
            }
            // Remove any cells that have 4 neighbors
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < 6; j++) {
                    if (grid[i][j]) {
                        const hasTop = i > 0 && grid[i-1][j];
                        const hasBottom = i < 5 && grid[i+1][j];
                        const hasLeft = j > 0 && grid[i][j-1];
                        const hasRight = j < 5 && grid[i][j+1];

                        if (hasTop && hasBottom && hasLeft && hasRight) {
                            // Remove one neighbor to break the 4-neighbor property
                            grid[i + (Math.random() < 0.5 ? -1 : 1)][j] = false;
                        }
                    }
                }
            }
            return grid;
        }
    }
];
