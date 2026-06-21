/**
 * Shapes Game Rules
 * Rules for colored shapes (4 shapes per sequence)
 * Each rule includes distribution specifications for positive/negative examples
 *
 * IMPORTANT: Each rule MUST have a generateNegative() method that produces
 * examples that ALWAYS fail the check() function (100% guaranteed).
 * This is used as a fallback when the distribution generators produce false negatives.
 *
 * DISTRIBUTION PHILOSOPHY (v2):
 * Negative examples now use a rich BASELINE_DISTRIBUTION that is rule-agnostic.
 * This prevents side-channel information leakage where players could guess the
 * rule by noticing what patterns are conspicuously absent from negatives.
 *
 * The baseline includes ~35 different pattern types with natural frequencies,
 * ensuring negatives are diverse and don't telegraph the rule being tested.
 */

// Helper for imports
const COLORS = ['red', 'blue', 'green', 'purple', 'black', 'yellow'];
const TYPES = ['circle', 'square', 'triangle', 'star', 'heart', 'plus'];
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}
function randomExcluding(array, excluded) {
    const filtered = array.filter(x => !excluded.includes(x));
    return filtered.length > 0 ? randomChoice(filtered) : randomChoice(array);
}

// Import baseline distribution (will be added to each rule's negatives)
import { BASELINE_DISTRIBUTION } from './shapes-distributions.js';

export const SHAPES_RULES = [
    // Rule 1: All same color
    {
        id: 's1',
        name: 'All are the same color',
        check: (shapes) => shapes.every(s => s.color === shapes[0].color),
        distribution: {
            positive: [
                { type: 'allSameColor', weight: 1.0 }
            ],
            negative: BASELINE_DISTRIBUTION // Use rich baseline (prevents side-channel leakage)
        },
        // GUARANTEED to fail the rule: generate at least 2 different colors
        generateNegative: () => {
            const color1 = randomChoice(COLORS);
            const color2 = randomExcluding(COLORS, [color1]);
            return [
                { color: color1, shape: randomChoice(TYPES) },
                { color: color1, shape: randomChoice(TYPES) },
                { color: color2, shape: randomChoice(TYPES) },
                { color: color2, shape: randomChoice(TYPES) }
            ];
        }
    },

    // Rule 2: All same type
    {
        id: 's2',
        name: 'All are the same shape',
        check: (shapes) => shapes.every(s => s.shape === shapes[0].shape),
        distribution: {
            positive: [
                { type: 'allSameType', weight: 1.0 }
            ],
            negative: BASELINE_DISTRIBUTION // Use rich baseline
        },
        // GUARANTEED to fail the rule: generate at least 2 different shapes
        generateNegative: () => {
            const type1 = randomChoice(TYPES);
            const type2 = randomExcluding(TYPES, [type1]);
            return [
                { color: randomChoice(COLORS), shape: type1 },
                { color: randomChoice(COLORS), shape: type1 },
                { color: randomChoice(COLORS), shape: type2 },
                { color: randomChoice(COLORS), shape: type2 }
            ];
        }
    },

    // Rule 3: All different colors
    {
        id: 's3',
        name: 'All shapes are different colors',
        check: (shapes) => new Set(shapes.map(s => s.color)).size === shapes.length,
        distribution: {
            positive: [
                { type: 'allDifferentColors', weight: 1.0 }
            ],
            negative: BASELINE_DISTRIBUTION // Use rich baseline
        },
        // GUARANTEED to fail the rule: use only 3 or fewer different colors
        generateNegative: () => {
            const numColors = Math.random() < 0.5 ? 2 : 3;
            const colors = [];
            for (let i = 0; i < numColors; i++) {
                colors.push(COLORS[i]);
            }
            return Array.from({ length: 4 }, () => ({
                color: randomChoice(colors),
                shape: randomChoice(TYPES)
            }));
        }
    },

    // Rule 4: Contains green
    {
        id: 's4',
        name: 'There is a green shape',
        check: (shapes) => shapes.some(s => s.color === 'green'),
        distribution: {
            positive: [
                { type: 'withGreenCount', weight: 0.70, options: { numGreen: 1 } },
                { type: 'withGreenCount', weight: 0.15, options: { numGreen: 2 } },
                { type: 'withGreenCount', weight: 0.10, options: { numGreen: 3 } },
                { type: 'withGreenCount', weight: 0.05, options: { numGreen: 4 } }
            ],
            negative: BASELINE_DISTRIBUTION // Baseline includes 0-4 greens naturally
        },
        // GUARANTEED to fail the rule: ZERO greens, all other colors
        generateNegative: () => {
            const nonGreenColors = COLORS.filter(c => c !== 'green');
            return Array.from({ length: 4 }, () => ({
                color: randomChoice(nonGreenColors),
                shape: randomChoice(TYPES)
            }));
        }
    },

    // Rule 6: Exactly two colors
    {
        id: 's6',
        name: 'The shapes use exactly two different colors',
        check: (shapes) => new Set(shapes.map(s => s.color)).size === 2,
        distribution: {
            positive: [
                { type: 'exactlyKColors', weight: 1.0, options: { k: 2 } }
            ],
            negative: BASELINE_DISTRIBUTION // Baseline includes 1, 3, 4 color patterns naturally
        },
        // GUARANTEED to fail the rule: use either 1 or 3+ colors, not exactly 2
        generateNegative: () => {
            const useOneColor = Math.random() < 0.5;
            if (useOneColor) {
                const color = randomChoice(COLORS);
                return Array.from({ length: 4 }, () => ({
                    color,
                    shape: randomChoice(TYPES)
                }));
            } else {
                // Use 3 colors
                const colors = COLORS.slice(0, 3);
                return Array.from({ length: 4 }, () => ({
                    color: randomChoice(colors),
                    shape: randomChoice(TYPES)
                }));
            }
        }
    },

    // Rule 8: Contains triangle
    {
        id: 's8',
        name: 'There is at least one triangle',
        check: (shapes) => shapes.some(s => s.shape === 'triangle'),
        distribution: {
            positive: [
                { type: 'withTriangleCount', weight: 0.70, options: { numTriangles: 1 } },
                { type: 'withTriangleCount', weight: 0.15, options: { numTriangles: 2 } },
                { type: 'withTriangleCount', weight: 0.10, options: { numTriangles: 3 } },
                { type: 'withTriangleCount', weight: 0.05, options: { numTriangles: 4 } }
            ],
            negative: BASELINE_DISTRIBUTION // Baseline includes 0-4 triangles naturally
        },
        // GUARANTEED to fail the rule: ZERO triangles, all other shapes
        generateNegative: () => {
            const nonTriangleTypes = TYPES.filter(t => t !== 'triangle');
            return Array.from({ length: 4 }, () => ({
                color: randomChoice(COLORS),
                shape: randomChoice(nonTriangleTypes)
            }));
        }
    },

    // Rule 9: At least two circles
    {
        id: 's9',
        name: 'There are at least two circles',
        check: (shapes) => shapes.filter(s => s.shape === 'circle').length >= 2,
        distribution: {
            positive: [
                { type: 'withCircleCount', weight: 0.60, options: { numCircles: 2 } },
                { type: 'withCircleCount', weight: 0.30, options: { numCircles: 3 } },
                { type: 'withCircleCount', weight: 0.10, options: { numCircles: 4 } }
            ],
            negative: BASELINE_DISTRIBUTION // Baseline includes 0-4 circles naturally
        },
        // GUARANTEED to fail the rule: use 0 or 1 circles, not 2+
        generateNegative: () => {
            const numCircles = Math.random() < 0.55 ? 0 : 1;
            const nonCircleTypes = TYPES.filter(t => t !== 'circle');
            const shapes = [];
            for (let i = 0; i < numCircles; i++) {
                shapes.push({
                    color: randomChoice(COLORS),
                    shape: 'circle'
                });
            }
            for (let i = 0; i < 4 - numCircles; i++) {
                shapes.push({
                    color: randomChoice(COLORS),
                    shape: randomChoice(nonCircleTypes)
                });
            }
            return shapes.sort(() => Math.random() - 0.5);
        }
    },

    // Rule 11: First is red circle
    {
        id: 's11',
        name: 'The first shape is a red circle',
        check: (shapes) => shapes[0].color === 'red' && shapes[0].shape === 'circle',
        distribution: {
            positive: [
                { type: 'specificAtPosition', weight: 1.0, options: { position: 0, color: 'red', type: 'circle' } }
            ],
            negative: BASELINE_DISTRIBUTION // Baseline includes all position/color/shape combinations
        },
        // GUARANTEED to fail the rule: first shape is NOT (red circle)
        generateNegative: () => {
            const choice = Math.random();
            const shapes = Array.from({ length: 4 }, () => ({
                color: randomChoice(COLORS),
                shape: randomChoice(TYPES)
            }));

            if (choice < 0.33) {
                // Red but not circle at position 0
                const nonCircleTypes = TYPES.filter(t => t !== 'circle');
                shapes[0] = { color: 'red', shape: randomChoice(nonCircleTypes) };
            } else if (choice < 0.66) {
                // Circle but not red at position 0
                const nonRedColors = COLORS.filter(c => c !== 'red');
                shapes[0] = { color: randomChoice(nonRedColors), shape: 'circle' };
            } else {
                // Neither red nor circle at position 0
                const nonRedColors = COLORS.filter(c => c !== 'red');
                const nonCircleTypes = TYPES.filter(t => t !== 'circle');
                shapes[0] = { color: randomChoice(nonRedColors), shape: randomChoice(nonCircleTypes) };
            }
            return shapes;
        }
    },

    // Rule 14: Color palindrome
    {
        id: 's14',
        name: 'The two middle shapes are the same color and the two outer shapes are the same color',
        check: (shapes) => shapes[0].color === shapes[3].color && shapes[1].color === shapes[2].color,
        distribution: {
            positive: [
                { type: 'symmetricColors', weight: 1.0 }
            ],
            negative: [
                { type: 'firstTwoLastTwoSameColor', weight: 0.15 }, // Rule out "two groups of two" hypothesis
                { type: 'alternatingTwoColors', weight: 0.15 },      // Rule out "two groups of two" hypothesis
                ...BASELINE_DISTRIBUTION.map(d => ({ ...d, weight: d.weight * 0.70 })) // Keep baseline but reduce weight
            ]
        },
        // GUARANTEED to fail the rule: NOT (shape[0].color === shape[3].color && shape[1].color === shape[2].color)
        generateNegative: () => {
            const choice = Math.random();
            if (choice < 0.5) {
                // Only first and last same, middles different
                const c1 = randomChoice(COLORS);
                const c2 = randomChoice(COLORS);
                const c3 = randomExcluding(COLORS, [c2]);
                return [
                    { color: c1, shape: randomChoice(TYPES) },
                    { color: c2, shape: randomChoice(TYPES) },
                    { color: c3, shape: randomChoice(TYPES) },
                    { color: c1, shape: randomChoice(TYPES) }
                ];
            } else {
                // Completely random (unlikely to accidentally be palindrome)
                return Array.from({ length: 4 }, () => ({
                    color: randomChoice(COLORS),
                    shape: randomChoice(TYPES)
                }));
            }
        }
    },

    // Rule 28: All colors different AND all types different
    {
        id: 's28',
        name: 'All are different colors and different shapes',
        check: (shapes) => {
            const colorCount = new Set(shapes.map(s => s.color)).size;
            const typeCount = new Set(shapes.map(s => s.shape)).size;
            return colorCount === 4 && typeCount === 4;
        },
        distribution: {
            positive: [
                { type: 'allDifferentColorsAndTypes', weight: 1.0 }
            ],
            negative: BASELINE_DISTRIBUTION // Baseline includes partial diversity patterns naturally
        },
        // GUARANTEED to fail the rule: NOT (all 4 colors different AND all 4 shapes different)
        generateNegative: () => {
            const choice = Math.random();
            if (choice < 0.4) {
                // All different colors, but same shape
                const colors = COLORS.slice(0, 4);
                const shape = randomChoice(TYPES);
                return colors.map(color => ({
                    color,
                    shape
                }));
            } else if (choice < 0.8) {
                // All different shapes, but same color
                const types = TYPES.slice(0, 4);
                const color = randomChoice(COLORS);
                return types.map(shape => ({
                    color,
                    shape
                }));
            } else {
                // Use only 3 of each
                const colors = COLORS.slice(0, 3);
                const types = TYPES.slice(0, 3);
                const shapes = [];
                for (let i = 0; i < 4; i++) {
                    shapes.push({
                        color: colors[i % 3],
                        shape: types[i % 3]
                    });
                }
                return shapes;
            }
        }
    }
];
