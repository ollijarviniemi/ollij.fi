/**
 * Points Game Rules
 * Rules for points on a discrete grid (visible as coordinate system)
 * Points are placed on integer coordinates, avoiding borders for visual pleasingness
 *
 * Grid: 16×11 cells, coordinates x ∈ [1, 15], y ∈ [1, 10] (1-cell margin on all sides)
 *
 * IMPORTANT: Each rule MUST have a generateNegative() method that produces
 * examples that ALWAYS fail the check() function (100% guaranteed).
 *
 * Rules inspired by TODO/tiede.tex:
 * - Kaikki samalla suoralla (all on same line)
 * - Symmetrinen pystysuunnassa (vertical symmetry)
 * - Yhtenäinen (connected)
 * - 180 asteen rotaatiosymmetria (180° rotation symmetry)
 * - Jotkin kolme samalla suoralla (some three on same line)
 * - Konveksi (convex hull)
 * - Peitettävissä kahdella suoralla (coverable by two lines)
 * - Jotkin neljä pistettä muodostaa neliön (some four points form square)
 * - Pistejoukolla on labelointi x₁≤x₂≤...≤xₙ ja y₁≤y₂≤...≤yₙ (weak order property)
 * - Kenenkään lähin naapuri ei ole yksikäsitteisesti määritetty (no unique nearest neighbor)
 */

// Helper functions
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// Geometry helpers
function distance(p1, p2) {
    return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function distanceSquared(p1, p2) {
    return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
}

function areCollinear(p1, p2, p3) {
    // Three points are collinear if cross product is zero
    // (p2 - p1) × (p3 - p1) = 0
    const dx1 = p2.x - p1.x;
    const dy1 = p2.y - p1.y;
    const dx2 = p3.x - p1.x;
    const dy2 = p3.y - p1.y;
    return Math.abs(dx1 * dy2 - dy1 * dx2) < 0.01;
}

function crossProduct(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points) {
    if (points.length < 3) return points;

    // Sort points
    const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);

    // Build lower hull
    const lower = [];
    for (const p of sorted) {
        while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    // Build upper hull
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    // Remove last point of each half because it's repeated
    lower.pop();
    upper.pop();

    return lower.concat(upper);
}

export const POINTS_RULES = [
    // Rule 1: All points on same line
    {
        id: 'p1',
        name: 'All points lie on the same line',
        check: (points) => {
            if (points.length <= 2) return true;

            for (let i = 2; i < points.length; i++) {
                if (!areCollinear(points[0], points[1], points[i])) {
                    return false;
                }
            }
            return true;
        },
        distribution: {
            positive: [
                { type: 'horizontalLine', weight: 0.1 },
                { type: 'verticalLine', weight: 0.1 },
                { type: '45degreeLine', weight: 0.1 },
                { type: 'oneToTwoLine', weight: 0.1 },
                { type: 'oneToThreeLine', weight: 0.1 },
                { type: 'twoToThreeLine', weight: 0.1 },
                { type: 'oneToFourLine', weight: 0.1 },
                { type: 'threeToFourLine', weight: 0.1 },
                { type: 'twoToFiveLine', weight: 0.1 },
                { type: 'threeToFiveLine', weight: 0.1 }
            ]
        },
        roundSpecificNegative: [
            { type: 'cross', weight: 0.025 },
            { type: 'Y', weight: 0.025 },
            { type: 'X', weight: 0.025 },
            { type: 'H', weight: 0.025 },
            { type: 'Z', weight: 0.025 },
            { type: 'N', weight: 0.025 },
            { type: 'T', weight: 0.025 },
            { type: 'L', weight: 0.025 },
            { type: 'squareBorders', weight: 0.05 },
            { type: 'twoLines', weight: 0.1 },
            { type: 'twoParallelLines', weight: 0.1 },
            { type: 'lattice', weight: 0.1 },
            { type: 'random_points', weight: 0.05, count: 3},
            { type: 'random_points', weight: 0.05, count: 4},
            { type: 'random_points', weight: 0.05, count: 5},
            { type: 'random_points', weight: 0.05, count: 6},
        ],
        generateNegative: () => {
            // Triangle: guaranteed not collinear
            return [
                { x: 2, y: 2 },
                { x: 14, y: 2 },
                { x: 8, y: 10 }
            ];
        }
    },

    // Rule 2: No shared x or y coordinates (complete general position)
    {
        id: 'p2',
        name: 'Each row and each column contains at most one point',
        check: (points) => {
            if (points.length <= 1) return true;

            // Check all x-coordinates are unique
            const xCoords = points.map(p => p.x);
            const uniqueX = new Set(xCoords);
            if (uniqueX.size !== xCoords.length) return false;

            // Check all y-coordinates are unique
            const yCoords = points.map(p => p.y);
            const uniqueY = new Set(yCoords);
            if (uniqueY.size !== yCoords.length) return false;

            return true;
        },
        distribution: {
            positive: [
                { type: 'p2DiagonalLine', weight: 0.15 },
                { type: 'p2ScatteredRandom', weight: 0.20 },
                { type: 'p2StaircaseAscending', weight: 0.10 },
                { type: 'p2StaircaseDescending', weight: 0.10 },
                { type: 'p2ZigZag', weight: 0.10 },
                { type: 'p2PermutationPattern', weight: 0.15 },
                { type: 'p2MonotonicCurve', weight: 0.10 },
                { type: 'p2RandomWalk', weight: 0.10 }
            ]
        },
        roundSpecificNegative: [
            { type: 'p2VerticalPair', weight: 0.15 },
            { type: 'p2HorizontalPair', weight: 0.15 },
            { type: 'p2VerticalLine', weight: 0.10 },
            { type: 'p2HorizontalLine', weight: 0.10 },
            { type: 'p2SharedXScattered', weight: 0.15 },
            { type: 'p2SharedYScattered', weight: 0.15 },
            { type: 'p2LShape', weight: 0.10 },
            { type: 'p2CrossPattern', weight: 0.10 }
        ],
        generateNegative: () => {
            // Two points with same x-coordinate
            return [
                { x: 5, y: 3 },
                { x: 5, y: 8 },
                { x: 11, y: 5 }
            ];
        }
    },

    // Rule 3: Connected (graph connectivity)
    {
        id: 'p3',
        name: 'The points form one connected cluster of neighbors',
        check: (points) => {
            if (points.length <= 1) return true;

            // Build adjacency based on proximity (threshold = 1 unit)
            const threshold = 1
            const visited = new Set();
            const queue = [0];
            visited.add(0);

            while (queue.length > 0) {
                const idx = queue.shift();
                const current = points[idx];

                for (let i = 0; i < points.length; i++) {
                    if (!visited.has(i) && distance(current, points[i]) <= threshold) {
                        visited.add(i);
                        queue.push(i);
                    }
                }
            }

            return visited.size === points.length;
        },
        distribution: {
            positive: [
                { type: 'connectedPath', weight: 0.3 },
                { type: 'connectedCluster', weight: 0.3 },
                { type: 'connectedTree', weight: 0.2 },
                { type: 'connectedLoop', weight: 0.2 }
            ]
        },
        roundSpecificNegative: [
            { type: 'twoComponents', weight: 0.3 },
            { type: 'threeComponents', weight: 0.3 },
            { type: 'isolatedPoints', weight: 0.2 },
            { type: 'almostConnected', weight: 0.2 }
        ],
        generateNegative: () => {
            return [
                { x: 2, y: 2 },
                { x: 3, y: 2 },
                { x: 14, y: 10 },
                { x: 15, y: 10 }
            ];
        }
    },

    // Rule 4: 180° rotation symmetry
    {
        id: 'p4',
        name: 'Rotating the figure 180 degrees gives the same figure',
        check: (points) => {
            if (points.length === 0) return true;

            // Find centroid
            const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
            const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

            // For each point, check if its 180° rotation exists
            for (const p of points) {
                const rotX = 2 * cx - p.x;
                const rotY = 2 * cy - p.y;
                const hasRotation = points.some(q =>
                    Math.abs(q.x - rotX) < 0.01 && Math.abs(q.y - rotY) < 0.01
                );
                if (!hasRotation) return false;
            }
            return true;
        },
        distribution: {
            positive: [
                { type: 'rotationallySymmetric', weight: 0.8 },
                { type: 'rotationalAndLineSymmetric', weight: 0.2 },
            ]
        },
        roundSpecificNegative: [
            { type: 'almostRotationallySymmetric', weight: 0.2 },
            { type: 'verticallySymmetric', weight: 0.2 },
            { type: 'horizontallySymmetric', weight: 0.2 },
            { type: 'translatedCopy', weight: 0.2 },
            { type: 'asymmetric', weight: 0.2 }
        ],
        generateNegative: () => {
            return [
                { x: 2, y: 2 },
                { x: 14, y: 10 },
                { x: 8, y: 6 }
            ];
        }
    },

    // Rule 5: Some three points are collinear
    {
        id: 'p5',
        name: 'Some three points lie on the same line',
        check: (points) => {
            if (points.length < 3) return false;

            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    for (let k = j + 1; k < points.length; k++) {
                        if (areCollinear(points[i], points[j], points[k])) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },
        distribution: {
            positive: [
                { type: 'threeOnLineWithExtra', weight: 0.6 },
                { type: 'fourOnLine', weight: 0.1 },
                { type: 'twoLines', weight: 0.1 },
                { type: 'lineAndExtra', weight: 0.1 },
                { type: 'lattice', weight: 0.1 }
            ]
        },
        roundSpecificNegative: [
            { type: 'generalPosition', weight: 0.4 },
            { type: 'regularPolygon', weight: 0.15 },
            { type: 'randomScattered', weight: 0.15 }
        ],
        generateNegative: () => {
            // Place points in general position (no three collinear)
            return [
                { x: 2, y: 2 },
                { x: 9, y: 5 },
                { x: 14, y: 4 },
                { x: 7, y: 10 }
            ];
        }
    },

    // Rule 6: Convex (all points on convex hull)
    {
        id: 'p6',
        name: 'No point lies inside the region formed by the others',
        check: (points) => {
            if (points.length <= 3) return true;

            const hull = convexHull(points);

            // Check if all points are either on the hull or on edges between hull vertices
            for (const point of points) {
                // Check if point is a hull vertex
                const isHullVertex = hull.some(h => h.x === point.x && h.y === point.y);

                if (!isHullVertex) {
                    // Check if point is on any edge of the hull (collinear with two consecutive vertices)
                    let onEdge = false;
                    for (let i = 0; i < hull.length; i++) {
                        const v1 = hull[i];
                        const v2 = hull[(i + 1) % hull.length];

                        // Check if point is collinear with v1 and v2
                        if (areCollinear(v1, v2, point)) {
                            // Also check if point is between v1 and v2 (not outside)
                            const minX = Math.min(v1.x, v2.x);
                            const maxX = Math.max(v1.x, v2.x);
                            const minY = Math.min(v1.y, v2.y);
                            const maxY = Math.max(v1.y, v2.y);

                            if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
                                onEdge = true;
                                break;
                            }
                        }
                    }

                    if (!onEdge) {
                        return false; // Point is strictly interior
                    }
                }
            }

            return true;
        },
        distribution: {
            positive: [
                { type: 'convexRandom', weight: 0.6 },
                { type: 'regularPolygon', weight: 0.2 },
                { type: 'convexArc', weight: 0.2 }
            ]
        },
        roundSpecificNegative: [
            { type: 'withInteriorPoints', weight: 0.4 },
            { type: 'almostConvex', weight: 0.3 },
            { type: 'cluster', weight: 0.3 }
        ],
        generateNegative: () => {
            // Rectangle with interior point
            return [
                { x: 2, y: 2 },
                { x: 14, y: 2 },
                { x: 14, y: 10 },
                { x: 3, y: 9 },
                { x: 8, y: 6 }
            ];
        }
    },

    // Rule 7: Can be covered by two lines
    {
        id: 'p7',
        name: 'The points can be covered by two lines',
        check: (points) => {
            if (points.length <= 2) return true;

            // Try all pairs of points to define first line
            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    const line1Points = [];
                    const otherPoints = [];

                    for (let k = 0; k < points.length; k++) {
                        if (areCollinear(points[i], points[j], points[k])) {
                            line1Points.push(points[k]);
                        } else {
                            otherPoints.push(points[k]);
                        }
                    }

                    // Check if remaining points are collinear
                    if (otherPoints.length === 0) return true;
                    if (otherPoints.length === 1) return true;
                    if (otherPoints.length === 2) return true;

                    let allCollinear = true;
                    for (let m = 2; m < otherPoints.length; m++) {
                        if (!areCollinear(otherPoints[0], otherPoints[1], otherPoints[m])) {
                            allCollinear = false;
                            break;
                        }
                    }
                    if (allCollinear) return true;
                }
            }
            return false;
        },
        distribution: {
            positive: [
                { type: 'twoLines', weight: 0.4 },
                { type: 'parallelLines', weight: 0.2 },
                { type: 'perpendicularLines', weight: 0.2 },
                { type: 'oneLine', weight: 0.2 }
            ]
        },
        roundSpecificNegative: [
            { type: 'threeLines', weight: 0.3 },
            { type: 'triangle', weight: 0.3 },
            { type: 'almostTwoLines', weight: 0.2 },
            { type: 'generalPosition', weight: 0.2 }
        ],
        generateNegative: () => {
            // Three non-concurrent lines
            return [
                { x: 2, y: 2 },
                { x: 8, y: 2 },
                { x: 2, y: 9 },
                { x: 8, y: 8 },
                { x: 14, y: 5 }
            ];
        }
    },

    // Rule 8: Some four points form a square
    {
        id: 'p8',
        name: 'Some four points form a square',
        check: (points) => {
            if (points.length < 4) return false;

            // Try all combinations of 4 points
            for (let i = 0; i < points.length; i++) {
                for (let j = i + 1; j < points.length; j++) {
                    for (let k = j + 1; k < points.length; k++) {
                        for (let l = k + 1; l < points.length; l++) {
                            const quad = [points[i], points[j], points[k], points[l]];
                            if (isSquare(quad)) return true;
                        }
                    }
                }
            }
            return false;
        },
        distribution: {
            positive: [
                { type: 'squareWithExtra', weight: 0.5 },
                { type: 'multipleSquares', weight: 0.2 },
                { type: 'squareAndLine', weight: 0.15 },
                { type: 'squareInPattern', weight: 0.15 }
            ]
        },
        roundSpecificNegative: [
            { type: 'rectangle', weight: 0.25 },
            { type: 'rhombus', weight: 0.25 },
            { type: 'almostSquare', weight: 0.25 },
            { type: 'generalPosition', weight: 0.25 }
        ],
        generateNegative: () => {
            // Rectangle (not square)
            return [
                { x: 2, y: 2 },
                { x: 10, y: 3 },
                { x: 10, y: 8 },
                { x: 2, y: 8 }
            ];
        }
    },

    // Rule 9: Weak order property (can label so x₁≤x₂≤...≤xₙ AND y₁≤y₂≤...≤yₙ)
    {
        id: 'p9',
        name: 'The points can be visited by moving up and/or right at every step',
        check: (points) => {
            if (points.length <= 1) return true;

            // Sort by x, then by y as tiebreaker
            const sorted = [...points].sort((a, b) => {
                if (a.x !== b.x) return a.x - b.x;
                return a.y - b.y;
            });

            // Check if y values are non-decreasing
            for (let i = 1; i < sorted.length; i++) {
                if (sorted[i].y < sorted[i-1].y) {
                    return false;
                }
            }
            return true;
        },
        distribution: {
            positive: [
                { type: 'weakOrderLine', weight: 0.1 },
                { type: 'weakOrderAddRandomVector', weight: 0.3 },
                { type: 'weakOrderZigZag', weight: 0.1 },
                { type: 'weakOrderStaircase', weight: 0.1 },
                { type: 'weakOrderConnected', weight: 0.1 },
                { type: 'weakOrderL', weight: 0.1 },
                { type: 'weakOrderTwoHorizontalLines', weight: 0.05 },
                { type: 'weakOrderTwoVerticalLines', weight: 0.05 },
                { type: 'weakOrderTwoLines', weight: 0.1 },
            ]
        },
        roundSpecificNegative: [
            { type: 'generalPosition', weight: 0.2 },
            { type: 'decreasingLine', weight: 0.2 },
            { type: 'nonWeakOrderL', weight: 0.2 },
            { type: 'nonWeakOrderTwoLines', weight: 0.2 },
            { type: 'nonWeakOrderConnected', weight: 0.2 },
        ],
        generateNegative: () => {
            // Points that violate weak order
            return [
                { x: 2, y: 9 },
                { x: 8, y: 2 },
                { x: 13, y: 6 }
            ];
        }
    },

    // Rule 10: Each point is collinear with at least 2 others
    {
        id: 'p10',
        name: 'Every point lies on the same line as at least two other points',
        check: (points) => {
            if (points.length < 3) return false;

            for (let i = 0; i < points.length; i++) {
                let collinearCount = 0;

                for (let j = 0; j < points.length; j++) {
                    if (i === j) continue;
                    for (let k = j + 1; k < points.length; k++) {
                        if (k === i) continue;
                        if (areCollinear(points[i], points[j], points[k])) {
                            collinearCount++;
                            break; // Found one pair that's collinear with point i, that's enough
                        }
                    }
                    if (collinearCount > 0) break; // Found collinear triple, move on
                }

                if (collinearCount === 0) return false; // Point i is not collinear with any pair
            }
            return true;
        },
        distribution: {
            positive: [
                // Simple line configurations
                { type: 'twoLines', weight: 0.08 },
                { type: 'threeLines', weight: 0.08 },
                { type: 'linesShareEndpoint', weight: 0.06 },
                { type: 'linesShareMidpoint', weight: 0.06 },
                { type: 'perpendicularLinesSharedEnd', weight: 0.05 },
                { type: 'angledLinesSharedEnd', weight: 0.05 },
                { type: 'threeLinesSharedPoint', weight: 0.06 },
                // Rich geometric patterns
                { type: 'hollowRectangle', weight: 0.08 },
                { type: 'squareBorders', weight: 0.06 },
                { type: 'H', weight: 0.06 },
                { type: 'zigzag', weight: 0.06 },
                { type: 'connectedPath', weight: 0.06 },
                // Two-column/row patterns with points between
                { type: 'twoColumnsWithMiddlePoints', weight: 0.07 },
                { type: 'twoRowsWithMiddlePoints', weight: 0.07 },
                { type: 'LShapeWithMiddlePointsPositive', weight: 0.07, generator: () => window.PointDistributions.LShapeWithMiddlePoints(true) },
                // Diverse blob patterns (varying sizes)
                { type: 'smallRadialBlob', weight: 0.08 },
                { type: 'largeRadialBlob', weight: 0.08 },
                { type: 'mediumAsymmetricBlob', weight: 0.08 },
                // Letter patterns (positive: satisfy collinearity rule)
                { type: 'letterI', weight: 0.06 },
                { type: 'letterL', weight: 0.06 },
                { type: 'letterT', weight: 0.06 },
                { type: 'letterF', weight: 0.06 }
            ]
        },
        roundSpecificNegative: [
            // Simple negatives
            { type: 'almostTwoLines', weight: 0.12 },
            { type: 'randomScattered', weight: 0.08 },
            { type: 'generalPosition', weight: 0.08 },
            // Rich pattern negatives (similar to positives but broken)
            { type: 'rectangleWithFloatingPoint', weight: 0.12 },
            { type: 'hWithFloatingPoint', weight: 0.12 },
            { type: 'pathWithDetour', weight: 0.08 },
            { type: 'zigzagWithOutlier', weight: 0.08 },
            // Subtle negatives - most points satisfy rule, one subtly fails
            { type: 'denseBlobWithIsolatedPoint', weight: 0.12 },
            { type: 'almostGrid', weight: 0.11 },
            { type: 'threeLinesPlusAlmostCollinear', weight: 0.10 },
            { type: 'starPatternWithGap', weight: 0.09 },
            { type: 'serpentinePathWithKink', weight: 0.08 },
            { type: 'crossWithExtraArm', weight: 0.08 },
            // Letter patterns (negative: fail collinearity rule)
            { type: 'letterC', weight: 0.07 },
            { type: 'letterO', weight: 0.07 },
            { type: 'letterV', weight: 0.07 },
            { type: 'letterP', weight: 0.07 },
            // L-shape with middle points crossing diagonal
            { type: 'LShapeWithMiddlePointsNegative', weight: 0.08, generator: () => window.PointDistributions.LShapeWithMiddlePoints(false) }
        ],
        generateNegative: () => {
            // Create a pattern where at least one point is not collinear with any pair
            // Triangle with one extra point not on any line
            return [
                { x: 3, y: 3 },
                { x: 10, y: 3 },
                { x: 6, y: 8 },
                { x: 13, y: 6 } // Not collinear with any pair of the triangle
            ];
        }
    }
];

// Helper function to check if 4 points form a square
function isSquare(quad) {
    // Calculate all 6 pairwise distances
    const dists = [];
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            dists.push(distanceSquared(quad[i], quad[j]));
        }
    }
    dists.sort((a, b) => a - b);

    // A square has 4 equal sides and 2 equal diagonals
    // So sorted distances should be: [s, s, s, s, d, d]
    const side = dists[0];
    const diag = dists[4];

    // Check if first 4 are equal (sides) and last 2 are equal (diagonals)
    // and diagonal = side * sqrt(2)
    const sidesEqual = Math.abs(dists[0] - side) < 0.01 &&
                       Math.abs(dists[1] - side) < 0.01 &&
                       Math.abs(dists[2] - side) < 0.01 &&
                       Math.abs(dists[3] - side) < 0.01;

    const diagsEqual = Math.abs(dists[4] - diag) < 0.01 &&
                       Math.abs(dists[5] - diag) < 0.01;

    const diagCorrect = Math.abs(diag - 2 * side) < 0.1; // Allow small tolerance

    return sidesEqual && diagsEqual && diagCorrect;
}
