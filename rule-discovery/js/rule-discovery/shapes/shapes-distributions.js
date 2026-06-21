/**
 * Shapes Game - Distribution Utilities
 * Generators for creating sequences of 4 (color, type) pairs
 * Colors: red, blue, green, purple, black, yellow
 * Types: circle, square, triangle, star, heart, plus
 */

const COLORS = ['red', 'blue', 'green', 'purple', 'black', 'yellow'];
const TYPES = ['circle', 'square', 'triangle', 'star', 'heart', 'plus'];

/**
 * Helper: Get random element from array
 */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Helper: Shuffle array in place
 */
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Helper: Get corner count for a shape type
 */
function cornerCount(shapeType) {
    switch(shapeType) {
        case 'circle': return 0;
        case 'triangle': return 3;
        case 'square': return 4;
        case 'star': return 5;
        case 'heart': return 0; // treat as round
        case 'plus': return 4;
        default: return 0;
    }
}

/**
 * 1. Uniformly random shapes
 * @returns {Array} Array of 4 shape objects {color, shape}
 */
export function uniformRandom() {
    return Array.from({ length: 4 }, () => ({
        color: randomChoice(COLORS),
        shape: randomChoice(TYPES)
    }));
}

/**
 * 2. All same color, random types
 * @param {string} color - Specific color (optional, random if not provided)
 * @returns {Array} Array of 4 shapes with same color
 */
export function allSameColor(color = null) {
    const chosenColor = color || randomChoice(COLORS);
    return Array.from({ length: 4 }, () => ({
        color: chosenColor,
        shape: randomChoice(TYPES)
    }));
}

/**
 * 3. All same type, random colors
 * @param {string} type - Specific type (optional, random if not provided)
 * @returns {Array} Array of 4 shapes with same type
 */
export function allSameType(type = null) {
    const chosenType = type || randomChoice(TYPES);
    return Array.from({ length: 4 }, () => ({
        color: randomChoice(COLORS),
        shape: chosenType
    }));
}

/**
 * 4. All different colors, random types
 * @returns {Array} Array of 4 shapes with 4 different colors
 */
export function allDifferentColors() {
    const colors = shuffle([...COLORS]).slice(0, 4);
    return colors.map(color => ({
        color,
        shape: randomChoice(TYPES)
    }));
}

/**
 * 5. All different types, random colors
 * @returns {Array} Array of 4 shapes with 4 different types
 */
export function allDifferentTypes() {
    const types = shuffle([...TYPES]).slice(0, 4);
    return types.map(type => ({
        color: randomChoice(COLORS),
        shape: type
    }));
}

/**
 * 6. Exactly K distinct colors
 * @param {number} k - Number of distinct colors (1-4)
 * @returns {Array} Array of 4 shapes with exactly k colors
 */
export function exactlyKColors(k) {
    if (k < 1 || k > 4) k = 2;

    // Choose k colors
    const chosenColors = shuffle([...COLORS]).slice(0, k);

    // Distribute them across 4 shapes, ensuring all k colors appear
    const colorSequence = [];

    // First, ensure each color appears at least once if k <= 4
    for (let i = 0; i < Math.min(k, 4); i++) {
        colorSequence.push(chosenColors[i % k]);
    }

    // Fill remaining slots
    while (colorSequence.length < 4) {
        colorSequence.push(randomChoice(chosenColors));
    }

    shuffle(colorSequence);

    return colorSequence.map(color => ({
        color,
        shape: randomChoice(TYPES)
    }));
}

/**
 * 7. Exactly K distinct types
 * @param {number} k - Number of distinct types (1-4)
 * @returns {Array} Array of 4 shapes with exactly k types
 */
export function exactlyKTypes(k) {
    if (k < 1 || k > 4) k = 2;

    // Choose k types
    const chosenTypes = shuffle([...TYPES]).slice(0, k);

    // Distribute them across 4 shapes, ensuring all k types appear
    const typeSequence = [];

    // First, ensure each type appears at least once if k <= 4
    for (let i = 0; i < Math.min(k, 4); i++) {
        typeSequence.push(chosenTypes[i % k]);
    }

    // Fill remaining slots
    while (typeSequence.length < 4) {
        typeSequence.push(randomChoice(chosenTypes));
    }

    shuffle(typeSequence);

    return typeSequence.map(shape => ({
        color: randomChoice(COLORS),
        shape
    }));
}

/**
 * 8. First and last same on specified attribute
 * @param {string} attribute - 'color' or 'shape'
 * @returns {Array} Array of 4 shapes where first and last match on attribute
 */
export function firstAndLastSame(attribute = 'color') {
    const shapes = uniformRandom();

    if (attribute === 'color') {
        shapes[3].color = shapes[0].color;
    } else {
        shapes[3].shape = shapes[0].shape;
    }

    return shapes;
}

/**
 * 9. Specific shape at position
 * @param {number} position - Position 0-3
 * @param {string} color - Color (null for random)
 * @param {string} type - Type (null for random)
 * @returns {Array} Array of 4 shapes with specific shape at position
 */
export function specificAtPosition(position, color = null, type = null) {
    const shapes = uniformRandom();
    shapes[position] = {
        color: color || randomChoice(COLORS),
        shape: type || randomChoice(TYPES)
    };
    return shapes;
}

/**
 * 10. Color pattern
 * @param {Array} pattern - Array of 4 colors
 * @returns {Array} Array of 4 shapes with specified color pattern
 */
export function colorPattern(pattern) {
    if (!pattern || pattern.length !== 4) {
        pattern = Array.from({ length: 4 }, () => randomChoice(COLORS));
    }

    return pattern.map(color => ({
        color,
        shape: randomChoice(TYPES)
    }));
}

/**
 * 11. Type pattern
 * @param {Array} pattern - Array of 4 types
 * @returns {Array} Array of 4 shapes with specified type pattern
 */
export function typePattern(pattern) {
    if (!pattern || pattern.length !== 4) {
        pattern = Array.from({ length: 4 }, () => randomChoice(TYPES));
    }

    return pattern.map(shape => ({
        color: randomChoice(COLORS),
        shape
    }));
}

/**
 * 12. At least K shapes with specific attribute value
 * @param {string} attribute - 'color' or 'shape'
 * @param {string} value - Specific color or type
 * @param {number} k - Minimum count
 * @returns {Array} Array of 4 shapes with at least k having the attribute
 */
export function atLeastK(attribute, value, k) {
    if (k < 1) k = 1;
    if (k > 4) k = 4;

    const shapes = uniformRandom();

    // Ensure at least k have the attribute
    for (let i = 0; i < k; i++) {
        if (attribute === 'color') {
            shapes[i].color = value;
        } else {
            shapes[i].shape = value;
        }
    }

    shuffle(shapes);
    return shapes;
}

/**
 * 13. Exactly K shapes with specific attribute value
 * @param {string} attribute - 'color' or 'shape'
 * @param {string} value - Specific color or type
 * @param {number} k - Exact count
 * @returns {Array} Array of 4 shapes with exactly k having the attribute
 */
export function exactlyK(attribute, value, k) {
    if (k < 0) k = 0;
    if (k > 4) k = 4;

    const shapes = [];

    // Add k shapes with the attribute
    for (let i = 0; i < k; i++) {
        if (attribute === 'color') {
            shapes.push({ color: value, shape: randomChoice(TYPES) });
        } else {
            shapes.push({ color: randomChoice(COLORS), shape: value });
        }
    }

    // Add 4-k shapes without the attribute
    const availableValues = attribute === 'color'
        ? COLORS.filter(c => c !== value)
        : TYPES.filter(t => t !== value);

    for (let i = 0; i < 4 - k; i++) {
        if (attribute === 'color') {
            shapes.push({ color: randomChoice(availableValues), shape: randomChoice(TYPES) });
        } else {
            shapes.push({ color: randomChoice(COLORS), shape: randomChoice(availableValues) });
        }
    }

    shuffle(shapes);
    return shapes;
}

/**
 * 14. Corner count strictly increasing
 * @returns {Array} Array of 4 shapes with strictly increasing corners
 */
export function increasingCorners() {
    // Get types sorted by corner count
    const typesByCorners = [...TYPES].sort((a, b) => cornerCount(a) - cornerCount(b));

    // Pick 4 with strictly increasing corners
    // Possible sequences: circle/heart (0), triangle (3), square/plus (4), star (5)
    const sequences = [
        ['circle', 'triangle', 'square', 'star'],
        ['circle', 'triangle', 'plus', 'star'],
        ['heart', 'triangle', 'square', 'star'],
        ['heart', 'triangle', 'plus', 'star']
    ];

    const chosen = randomChoice(sequences);

    return chosen.map(shape => ({
        color: randomChoice(COLORS),
        shape
    }));
}

/**
 * 15. Corner count non-decreasing
 * @returns {Array} Array of 4 shapes with non-decreasing corners
 */
export function nonDecreasingCorners() {
    const shapes = increasingCorners();

    // Randomly allow some equal corners
    if (Math.random() < 0.5 && shapes.length > 1) {
        const i = Math.floor(Math.random() * (shapes.length - 1));
        shapes[i + 1].shape = shapes[i].shape;
    }

    return shapes;
}

/**
 * 16. Symmetric colors (palindrome)
 * @returns {Array} Array of 4 shapes with palindromic colors
 */
export function symmetricColors() {
    const c1 = randomChoice(COLORS);
    const c2 = randomChoice(COLORS);

    const colors = [c1, c2, c2, c1];

    return colors.map(color => ({
        color,
        shape: randomChoice(TYPES)
    }));
}

/**
 * 17. Symmetric types (palindrome)
 * @returns {Array} Array of 4 shapes with palindromic types
 */
export function symmetricTypes() {
    const t1 = randomChoice(TYPES);
    const t2 = randomChoice(TYPES);

    const types = [t1, t2, t2, t1];

    return types.map(shape => ({
        color: randomChoice(COLORS),
        shape
    }));
}

/**
 * NEW: First two same color, last two same color (but NOT palindrome)
 * Specifically designed to rule out the hypothesis:
 * "Can be divided into two groups of two with same colors"
 * Pattern: [c1, c1, c2, c2] where c1 ≠ c2
 * This FAILS the palindrome rule (0≠3, 1≠2) but satisfies "two groups of two"
 * @returns {Array} Array of 4 shapes
 */
export function firstTwoLastTwoSameColor() {
    const c1 = randomChoice(COLORS);
    const c2 = randomExcluding(COLORS, [c1]);

    return [
        { color: c1, shape: randomChoice(TYPES) },
        { color: c1, shape: randomChoice(TYPES) },
        { color: c2, shape: randomChoice(TYPES) },
        { color: c2, shape: randomChoice(TYPES) }
    ];
}

/**
 * NEW: Alternating two colors (but NOT palindrome)
 * Pattern: [c1, c2, c1, c2] where c1 ≠ c2
 * This FAILS the palindrome rule (0≠3, 1≠2) but satisfies "two groups of two"
 * (positions 0&2 same, positions 1&3 same)
 * @returns {Array} Array of 4 shapes
 */
export function alternatingTwoColors() {
    const c1 = randomChoice(COLORS);
    const c2 = randomExcluding(COLORS, [c1]);

    return [
        { color: c1, shape: randomChoice(TYPES) },
        { color: c2, shape: randomChoice(TYPES) },
        { color: c1, shape: randomChoice(TYPES) },
        { color: c2, shape: randomChoice(TYPES) }
    ];
}

/**
 * 18. No two adjacent same color
 * @returns {Array} Array of 4 shapes with no adjacent same colors
 */
export function noAdjacentSameColor() {
    const shapes = [];
    let lastColor = null;

    for (let i = 0; i < 4; i++) {
        const availableColors = lastColor
            ? COLORS.filter(c => c !== lastColor)
            : COLORS;

        const color = randomChoice(availableColors);
        shapes.push({
            color,
            shape: randomChoice(TYPES)
        });
        lastColor = color;
    }

    return shapes;
}

/**
 * 19. No two adjacent same type
 * @returns {Array} Array of 4 shapes with no adjacent same types
 */
export function noAdjacentSameType() {
    const shapes = [];
    let lastType = null;

    for (let i = 0; i < 4; i++) {
        const availableTypes = lastType
            ? TYPES.filter(t => t !== lastType)
            : TYPES;

        const shape = randomChoice(availableTypes);
        shapes.push({
            color: randomChoice(COLORS),
            shape
        });
        lastType = shape;
    }

    return shapes;
}

/**
 * 20. All colors different AND all types different
 * @returns {Array} Array of 4 shapes with all distinct colors and types
 */
export function allDifferentColorsAndTypes() {
    const colors = shuffle([...COLORS]).slice(0, 4);
    const types = shuffle([...TYPES]).slice(0, 4);

    return colors.map((color, i) => ({
        color,
        shape: types[i]
    }));
}

/**
 * 21. Exactly N green shapes (STRICT: other colors are never green)
 * @param {number} numGreen - Number of green shapes (0-4)
 * @returns {Array} Array with exactly numGreen green, rest are other colors
 */
export function withGreenCount(numGreen = 1) {
    if (numGreen < 0) numGreen = 0;
    if (numGreen > 4) numGreen = 4;

    const shapes = [];

    // Add numGreen green shapes
    for (let i = 0; i < numGreen; i++) {
        shapes.push({
            color: 'green',
            shape: randomChoice(TYPES)
        });
    }

    // Add (4 - numGreen) NON-green shapes - STRICTLY exclude green
    const nonGreenColors = COLORS.filter(c => c !== 'green');
    for (let i = 0; i < 4 - numGreen; i++) {
        shapes.push({
            color: randomChoice(nonGreenColors),
            shape: randomChoice(TYPES)
        });
    }

    shuffle(shapes);
    return shapes;
}

/**
 * 22. Exactly N triangle shapes (STRICT: no triangles in non-triangle slots)
 * @param {number} numTriangles - Number of triangle shapes (0-4)
 * @returns {Array} Array with exactly numTriangles triangles, rest are other shapes
 */
export function withTriangleCount(numTriangles = 1) {
    if (numTriangles < 0) numTriangles = 0;
    if (numTriangles > 4) numTriangles = 4;

    const shapes = [];

    // Add numTriangles triangle shapes
    for (let i = 0; i < numTriangles; i++) {
        shapes.push({
            color: randomChoice(COLORS),
            shape: 'triangle'
        });
    }

    // Add (4 - numTriangles) NON-triangle shapes - STRICTLY exclude triangles
    const nonTriangleTypes = TYPES.filter(t => t !== 'triangle');
    for (let i = 0; i < 4 - numTriangles; i++) {
        shapes.push({
            color: randomChoice(COLORS),
            shape: randomChoice(nonTriangleTypes)
        });
    }

    shuffle(shapes);
    return shapes;
}

/**
 * 23. Exactly N circle shapes (STRICT: no circles in non-circle slots)
 * @param {number} numCircles - Number of circle shapes (0-4)
 * @returns {Array} Array with exactly numCircles circles, rest are other shapes
 */
export function withCircleCount(numCircles = 1) {
    if (numCircles < 0) numCircles = 0;
    if (numCircles > 4) numCircles = 4;

    const shapes = [];

    // Add numCircles circle shapes
    for (let i = 0; i < numCircles; i++) {
        shapes.push({
            color: randomChoice(COLORS),
            shape: 'circle'
        });
    }

    // Add (4 - numCircles) NON-circle shapes - STRICTLY exclude circles
    const nonCircleTypes = TYPES.filter(t => t !== 'circle');
    for (let i = 0; i < 4 - numCircles; i++) {
        shapes.push({
            color: randomChoice(COLORS),
            shape: randomChoice(nonCircleTypes)
        });
    }

    shuffle(shapes);
    return shapes;
}

/**
 * 24. All different colors AND all same shape
 * @returns {Array} Array with all 4 different colors but same shape
 */
export function allDifferentColorsAndSameShape() {
    const colors = shuffle([...COLORS]).slice(0, 4);
    const shape = randomChoice(TYPES);

    return colors.map(color => ({
        color,
        shape
    }));
}

/**
 * 25. All different shapes AND all same color
 * @returns {Array} Array with all 4 different shapes but same color
 */
export function allDifferentShapesAndSameColor() {
    const types = shuffle([...TYPES]).slice(0, 4);
    const color = randomChoice(COLORS);

    return types.map(shape => ({
        color,
        shape
    }));
}

/**
 * Helper: Sample from weighted distribution
 * @param {Array} distributions - Array of {weight, generator} objects
 * @returns {Array} Generated sequence of 4 shapes
 */
export function sampleFromDistribution(distributions) {
    const totalWeight = distributions.reduce((sum, d) => sum + d.weight, 0);
    let random = Math.random() * totalWeight;

    for (const dist of distributions) {
        random -= dist.weight;
        if (random <= 0) {
            return dist.generator();
        }
    }

    // Fallback
    return distributions[distributions.length - 1].generator();
}

/**
 * BASELINE DISTRIBUTION: Rich, diverse mixture used as foundation for negative examples
 * This is rule-agnostic and prevents side-channel information leakage
 *
 * Philosophy: Negatives should come from a broad distribution that doesn't reveal
 * which specific rule is being tested. Players must test hypotheses, not exploit gaps.
 */
export const BASELINE_DISTRIBUTION = [
    // Core diversity patterns (44%)
    { type: 'uniformRandom', weight: 0.12 },
    { type: 'allSameColor', weight: 0.07 },
    { type: 'allSameType', weight: 0.07 },
    { type: 'allDifferentColors', weight: 0.06 },
    { type: 'allDifferentTypes', weight: 0.06 },
    { type: 'allDifferentColorsAndTypes', weight: 0.06 },

    // Exactly K patterns (30%)
    { type: 'exactlyKColors', weight: 0.08, options: { k: 2 } },
    { type: 'exactlyKColors', weight: 0.08, options: { k: 3 } },
    { type: 'exactlyKTypes', weight: 0.07, options: { k: 2 } },
    { type: 'exactlyKTypes', weight: 0.07, options: { k: 3 } },

    // Symmetry and structure (16%)
    { type: 'symmetricColors', weight: 0.04 },
    { type: 'symmetricTypes', weight: 0.04 },
    { type: 'firstAndLastSame', weight: 0.03, options: { attribute: 'color' } },
    { type: 'firstAndLastSame', weight: 0.03, options: { attribute: 'shape' } },
    { type: 'noAdjacentSameColor', weight: 0.01 },
    { type: 'noAdjacentSameType', weight: 0.01 },

    // Combined patterns (8%)
    { type: 'allDifferentColorsAndSameShape', weight: 0.04 },
    { type: 'allDifferentShapesAndSameColor', weight: 0.04 },

    // Specific color counts (green) - natural frequencies (6%)
    { type: 'withGreenCount', weight: 0.015, options: { numGreen: 0 } },
    { type: 'withGreenCount', weight: 0.015, options: { numGreen: 1 } },
    { type: 'withGreenCount', weight: 0.012, options: { numGreen: 2 } },
    { type: 'withGreenCount', weight: 0.010, options: { numGreen: 3 } },
    { type: 'withGreenCount', weight: 0.008, options: { numGreen: 4 } },

    // Specific shape counts (triangle) - natural frequencies (6%)
    { type: 'withTriangleCount', weight: 0.015, options: { numTriangles: 0 } },
    { type: 'withTriangleCount', weight: 0.015, options: { numTriangles: 1 } },
    { type: 'withTriangleCount', weight: 0.012, options: { numTriangles: 2 } },
    { type: 'withTriangleCount', weight: 0.010, options: { numTriangles: 3 } },
    { type: 'withTriangleCount', weight: 0.008, options: { numTriangles: 4 } },

    // Specific shape counts (circle) - natural frequencies (6%)
    { type: 'withCircleCount', weight: 0.015, options: { numCircles: 0 } },
    { type: 'withCircleCount', weight: 0.015, options: { numCircles: 1 } },
    { type: 'withCircleCount', weight: 0.012, options: { numCircles: 2 } },
    { type: 'withCircleCount', weight: 0.010, options: { numCircles: 3 } },
    { type: 'withCircleCount', weight: 0.008, options: { numCircles: 4 } }
];

// Validate baseline distribution sums to ~1.0
const totalWeight = BASELINE_DISTRIBUTION.reduce((sum, d) => sum + d.weight, 0);
if (Math.abs(totalWeight - 1.0) > 0.01) {
}

/**
 * All generators available for export
 */
export const ShapeDistributions = {
    uniformRandom,
    allSameColor,
    allSameType,
    allDifferentColors,
    allDifferentTypes,
    allDifferentColorsAndTypes,
    exactlyKColors,
    exactlyKTypes,
    firstAndLastSame,
    specificAtPosition,
    colorPattern,
    typePattern,
    atLeastK,
    exactlyK,
    increasingCorners,
    nonDecreasingCorners,
    symmetricColors,
    symmetricTypes,
    firstTwoLastTwoSameColor,
    alternatingTwoColors,
    noAdjacentSameColor,
    noAdjacentSameType,
    withGreenCount,
    withTriangleCount,
    withCircleCount,
    allDifferentColorsAndSameShape,
    allDifferentShapesAndSameColor,
    sampleFromDistribution,
    BASELINE_DISTRIBUTION
};
