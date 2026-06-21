/**
 * Three Numbers Game - Distribution Utilities
 * Generators for creating triples of positive integers with various properties
 * All generators ensure positive integers only (≥1)
 */

/**
 * Helper: Generate random positive integer in range [1, max]
 */
function randomInt(max) {
    return 1 + Math.floor(Math.random() * max);
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

// =============================================================================
// BASIC GENERATORS
// =============================================================================

/**
 * 1. Uniformly random with max element <= N
 * @param {number} maxElement - Maximum value for any element (default 20)
 * @returns {number[]} Triple of random positive integers
 */
export function uniformRandom(maxElement = 20) {
    return [
        randomInt(maxElement),
        randomInt(maxElement),
        randomInt(maxElement)
    ];
}

/**
 * 2. Uniformly random with sum in range [minSum, maxSum]
 * @param {Object} options
 * @param {number} options.maxSum - Maximum sum of all three elements (default 30)
 * @param {number} options.minSum - Minimum sum of all three elements (default 3)
 * @returns {number[]} Triple with sum in specified range
 */
export function uniformRandomSum(options = {}) {
    // Handle both old API (single number) and new API (object with options)
    const maxSum = typeof options === 'number' ? options : (options.maxSum || 30);
    const minSum = typeof options === 'number' ? 3 : (options.minSum || 3);

    // FIXED: Support minSum parameter for t12 (sum > 20) rule
    // Generate three random positive integers that sum to [minSum, maxSum]
    const maxAttempts = 100;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const a = randomInt(Math.min(maxSum - 2, maxSum)); // Leave room for b and c
        const remainingForB = maxSum - a - 1; // Need at least 1 for c
        if (remainingForB < 1) continue;

        const b = randomInt(remainingForB);
        const remainingForC = maxSum - a - b;
        if (remainingForC < 1) continue;

        const c = randomInt(remainingForC);
        const sum = a + b + c;

        // Check if sum is in desired range
        if (sum >= minSum && sum <= maxSum) {
            return shuffle([a, b, c]);
        }
    }

    // Fallback: simple distribution targeting middle of range
    const targetSum = Math.floor((minSum + maxSum) / 2);
    const third = Math.floor(targetSum / 3);
    return [randomInt(third), randomInt(third), randomInt(third)];
}

// =============================================================================
// SEQUENCE GENERATORS
// =============================================================================

/**
 * 3. Random sequence (with various options)
 * @param {Object} options
 * @param {boolean} options.strictly - If true, uses strict inequality (default false)
 * @param {string} options.direction - 'increasing' or 'decreasing' (default 'increasing')
 * @param {number|null} options.arithmetic - If number, arithmetic sequence with this difference; if null, random differences
 * @param {number} options.maxElement - Maximum element value (default 20)
 * @returns {number[]} Triple satisfying the sequence properties
 */
export function randomSequence(options = {}) {
    const {
        strictly = false,
        direction = 'increasing',
        arithmetic = null,
        maxElement = 20
    } = options;

    if (arithmetic !== null) {
        // Arithmetic sequence with fixed difference
        const diff = Math.abs(arithmetic);
        if (diff === 0 && strictly) {
            // Can't have strictly increasing/decreasing with 0 difference
            return randomSequence({ ...options, arithmetic: 1 });
        }

        // Generate starting point
        const maxStart = direction === 'increasing'
            ? Math.max(1, maxElement - 2 * diff)
            : maxElement;
        const start = randomInt(maxStart);

        if (direction === 'increasing') {
            return [start, start + diff, start + 2 * diff];
        } else {
            const a = start;
            const b = Math.max(1, start - diff);
            const c = Math.max(1, b - diff);
            return [a, b, c];
        }
    } else {
        // Random differences
        if (direction === 'increasing') {
            // FIXED: Don't clamp b and c - this can create equals for strict sequences
            // Instead, ensure we generate values that won't exceed maxElement
            const a = randomInt(Math.max(1, maxElement - 10));
            const minDiff = strictly ? 1 : 0;

            // For strict sequences, ensure b < c by leaving room
            const maxBIncrease = Math.max(1, Math.floor((maxElement - a) / 2));
            const b = a + minDiff + randomInt(maxBIncrease);

            const maxCIncrease = Math.max(1, maxElement - b);
            const c = b + minDiff + randomInt(maxCIncrease);

            return [a, b, c];
        } else {
            const a = randomInt(maxElement);
            const minDiff = strictly ? 1 : 0;
            const maxDecreaseB = Math.max(1, a - minDiff - 1);
            const b = Math.max(1, a - minDiff - randomInt(maxDecreaseB));
            const maxDecreaseC = Math.max(1, b - minDiff - 1);
            const c = Math.max(1, b - minDiff - randomInt(maxDecreaseC));
            return [a, b, c];
        }
    }
}

/**
 * 4. Random constant sequence (all three equal)
 * @param {number} maxElement - Maximum value (default 20)
 * @returns {number[]} Triple of equal values
 */
export function constantSequence(maxElement = 20) {
    const value = randomInt(maxElement);
    return [value, value, value];
}

/**
 * 5. Linear multiples [a, 2a, 3a]
 * @param {number} maxElement - Maximum value for largest element (default 30)
 * @returns {number[]} Triple in form [a, 2a, 3a]
 */
export function linearMultiples(maxElement = 30) {
    const a = randomInt(Math.floor(maxElement / 3));
    return [a, 2 * a, 3 * a];
}

/**
 * 6. Exponential multiples [a, 2a, 4a]
 * @param {number} maxElement - Maximum value for largest element (default 40)
 * @returns {number[]} Triple in form [a, 2a, 4a]
 */
export function exponentialMultiples(maxElement = 40) {
    const a = randomInt(Math.floor(maxElement / 4));
    return [a, 2 * a, 4 * a];
}

// =============================================================================
// POSITIONAL GENERATORS
// =============================================================================

/**
 * 7. Sequence with extremum at specific position
 * @param {Object} options
 * @param {string} options.extremum - 'largest' or 'smallest'
 * @param {number} options.position - Position (0, 1, or 2)
 * @param {number} options.maxElement - Maximum element value (default 20)
 * @returns {number[]} Triple with specified extremum at position
 */
export function extremumAtPosition(options = {}) {
    const {
        extremum = 'largest',
        position = 1,
        maxElement = 20
    } = options;

    if (extremum === 'largest') {
        // Generate largest value at position, others smaller
        const largest = randomInt(maxElement);
        const other1 = randomInt(largest);
        const other2 = randomInt(largest);

        const values = [other1, other2, other1];
        values[position] = largest;
        return values;
    } else {
        // Generate smallest value at position, others larger
        const smallest = randomInt(Math.floor(maxElement / 2));
        const other1 = smallest + randomInt(Math.floor(maxElement / 2));
        const other2 = smallest + randomInt(Math.floor(maxElement / 2));

        const values = [other1, other2, other1];
        values[position] = smallest;
        return values;
    }
}

/**
 * 8. Two equal at specific positions, third different
 * @param {Object} options
 * @param {number} options.position1 - First equal position
 * @param {number} options.position2 - Second equal position
 * @param {number} options.maxElement - Maximum element value (default 20)
 * @returns {number[]} Triple with two equal values
 */
export function equalAtPositions(options = {}) {
    const {
        position1 = 0,
        position2 = 1,
        maxElement = 20
    } = options;

    const equalValue = randomInt(maxElement);
    let differentValue;
    do {
        differentValue = randomInt(maxElement);
    } while (differentValue === equalValue && maxElement > 1);

    const values = [differentValue, differentValue, differentValue];
    values[position1] = equalValue;
    values[position2] = equalValue;

    return values;
}

// =============================================================================
// ARITHMETIC RELATIONSHIP GENERATORS
// =============================================================================

/**
 * 9. Largest equals sum of other two (at specific position)
 * @param {Object} options
 * @param {number} options.position - Position of sum (default 2)
 * @param {number} options.maxElement - Maximum value for sum (default 30)
 * @returns {number[]} Triple where largest = sum of others
 */
export function largestIsSum(options = {}) {
    const {
        position = 2,
        maxElement = 30
    } = options;

    const a = randomInt(Math.floor(maxElement / 2));
    const b = randomInt(Math.floor(maxElement / 2));
    const sum = a + b;

    if (position === 0) return [sum, a, b];
    if (position === 1) return [a, sum, b];
    return [a, b, sum];
}

/**
 * 10. Largest equals product of other two (order-independent)
 * @param {Object} options
 * @param {number} options.position - Position to place product (default 2)
 * @param {number} options.maxElement - Maximum value for product (default 30)
 * @returns {number[]} Triple where largest = product of others
 */
export function largestIsProduct(options = {}) {
    const {
        position = 2,
        maxElement = 30
    } = options;

    const a = randomInt(Math.min(10, Math.floor(Math.sqrt(maxElement))));
    const b = randomInt(Math.floor(maxElement / a));
    const product = a * b;

    if (position === 0) return [product, a, b];
    if (position === 1) return [a, product, b];
    return [a, b, product];
}

// =============================================================================
// PARITY AND DIVISIBILITY GENERATORS
// =============================================================================

/**
 * 11. Specific number of even values
 * @param {Object} options
 * @param {number} options.numEven - Number of even values (0, 1, 2, or 3)
 * @param {number} options.maxElement - Maximum element value (default 20)
 * @returns {number[]} Triple with specified number of evens
 */
export function withEvenCount(options = {}) {
    const {
        numEven = 3,
        maxElement = 20
    } = options;

    const numOdd = 3 - numEven;
    const values = [];

    // Generate evens
    for (let i = 0; i < numEven; i++) {
        values.push(2 * randomInt(Math.floor(maxElement / 2)));
    }

    // Generate odds
    for (let i = 0; i < numOdd; i++) {
        values.push(2 * randomInt(Math.floor(maxElement / 2)) - 1);
    }

    return shuffle(values);
}

// =============================================================================
// STATISTICAL PROPERTY GENERATORS
// =============================================================================

/**
 * 12. Sequence with specific median value
 * @param {Object} options
 * @param {number} options.median - Target median value
 * @param {number} options.maxElement - Maximum value for non-median elements
 * @returns {number[]} Triple with specified median
 */
export function withMedian(options = {}) {
    const {
        median = 5,
        maxElement = 20
    } = options;

    // Generate one value below median and one above
    const below = randomInt(Math.min(median - 1, maxElement));
    const above = median + randomInt(Math.max(1, maxElement - median));

    // Shuffle to randomize which position the median appears
    return shuffle([below, median, above]);
}

/**
 * 13. Sequence satisfying triangle inequality (a+b>c, b+c>a, a+c>b)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 20)
 * @returns {number[]} Triple that forms valid triangle
 */
export function triangleInequality(options = {}) {
    const { maxElement = 20 } = options;

    // Generate two sides, ensure third satisfies triangle inequality
    const a = randomInt(maxElement);
    const b = randomInt(maxElement);

    // Third side must be: |a-b| < c < a+b
    const minC = Math.abs(a - b) + 1;
    const maxC = Math.min(a + b - 1, maxElement);

    if (minC > maxC) {
        // Retry with better values
        return triangleInequality(options);
    }

    const c = minC + randomInt(Math.max(1, maxC - minC + 1));

    return shuffle([a, b, c]);
}

/**
 * 14. Sequence where largest > 2 × second-largest
 * @param {Object} options
 * @param {number} options.maxElement - Maximum element value (default 20)
 * @returns {number[]} Triple where max > 2 * second
 */
export function largestGreaterThanTwiceSecond(options = {}) {
    const { maxElement = 20 } = options;

    // Generate smallest and second values, ensure largest is > 2 * second
    const smallest = randomInt(Math.max(1, Math.floor(maxElement / 5)));
    const second = smallest + randomInt(Math.max(1, Math.floor(maxElement / 4)));

    // Largest must be STRICTLY > 2 * second
    const minLargest = 2 * second + 1;
    if (minLargest > maxElement) {
        // Retry with smaller values
        return largestGreaterThanTwiceSecond(options);
    }

    const largest = minLargest + randomInt(Math.max(1, maxElement - minLargest));

    return shuffle([smallest, second, largest]);
}

/**
 * 15. Sequence with range (max - min) within specified limit
 * @param {Object} options
 * @param {number} options.maxRange - Maximum range (default 5)
 * @param {number} options.maxElement - Maximum element value (default 20)
 * @returns {number[]} Triple with range <= maxRange
 */
export function withMaxRange(options = {}) {
    const {
        maxRange = 5,
        maxElement = 20
    } = options;

    // Generate a base value, then generate two more within maxRange
    const base = randomInt(Math.max(1, maxElement - maxRange));
    const b = base + randomInt(maxRange + 1); // Can be base to base+maxRange
    const c = base + randomInt(maxRange + 1);

    return shuffle([base, b, c]);
}

/**
 * 16. Sequence where all values are in specified range [min, max]
 * @param {Object} options
 * @param {number} options.min - Minimum value (default 1)
 * @param {number} options.max - Maximum value (default 20)
 * @returns {number[]} Triple where all values in [min, max]
 */
export function inRange(options = {}) {
    const {
        min = 1,
        max = 20
    } = options;

    // Generate three random values in the specified range
    const rangeSize = max - min + 1;
    const a = min + Math.floor(Math.random() * rangeSize);
    const b = min + Math.floor(Math.random() * rangeSize);
    const c = min + Math.floor(Math.random() * rangeSize);

    return [a, b, c];
}

/**
 * 17. Three consecutive numbers in any order (shuffled)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value for start (default 20)
 * @returns {number[]} Triple of consecutive integers in random order
 */
export function shuffledConsecutive(options = {}) {
    const { maxElement = 20 } = options;
    const start = randomInt(Math.max(1, maxElement - 2));
    return shuffle([start, start + 1, start + 2]);
}

/**
 * 18. Three consecutive numbers IN ORDER (not shuffled)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value for start (default 20)
 * @returns {number[]} Triple [n, n+1, n+2] in order
 */
export function consecutiveInOrder(options = {}) {
    const { maxElement = 20 } = options;
    const start = randomInt(Math.max(1, maxElement - 2));
    return [start, start + 1, start + 2];
}

// =============================================================================
// NEAR-MISS GENERATORS (for testing misconceptions)
// =============================================================================

/**
 * 19. Triple where a+b=c but sum is at wrong position (position 0 or 1, not 2)
 * Used for testing position-dependent sum rules
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 20)
 * @returns {number[]} Triple with sum at position 0 or 1
 */
export function withSumAtWrongPosition(options = {}) {
    const { maxElement = 20 } = options;

    // Generate a+b=c relationship
    const a = randomInt(Math.floor(maxElement / 2));
    const b = randomInt(Math.floor(maxElement / 2));
    const sum = a + b;

    // Place sum at position 0 or 1 (not 2)
    return Math.random() < 0.5 ? [sum, a, b] : [a, sum, b];
}

/**
 * 20. Each is multiple of previous (order matters!)
 * Generates [a, k*a, m*k*a] where k,m >= 1 (allows equals)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 100)
 * @returns {number[]} Triple where b = k*a and c = m*b
 */
export function eachMultipleOfPrevious(options = {}) {
    const { maxElement = 100 } = options;

    // Generate base value a
    const a = randomInt(Math.min(10, Math.floor(maxElement / 8)));

    // Generate first multiplier k (1 to 4, including 1 for equals)
    const k = 1 + randomInt(4);
    const b = a * k;

    if (b > maxElement) {
        return eachMultipleOfPrevious(options);
    }

    // Generate second multiplier m (1 to 4, including 1 for equals)
    const m = 1 + randomInt(4);
    const c = b * m;

    if (c > maxElement) {
        return eachMultipleOfPrevious(options);
    }

    return [a, b, c];
}

/**
 * 21. Partially equal multiples: [a, a, k*a] or [a, k*a, k*a]
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 50)
 * @returns {number[]} Triple with two equal and third is multiple
 */
export function partiallyEqualMultiples(options = {}) {
    const { maxElement = 50 } = options;

    // Generate base value a
    const a = randomInt(Math.min(10, Math.floor(maxElement / 5)));

    // Generate multiplier k (2 to 5)
    const k = 2 + randomInt(4);
    const ka = a * k;

    if (ka > maxElement) {
        return partiallyEqualMultiples(options);
    }

    // Randomly choose pattern
    if (Math.random() < 0.5) {
        return [a, a, ka];
        // Examples: [2, 2, 6], [3, 3, 12], [4, 4, 8]
    } else {
        return [a, ka, ka];
        // Examples: [2, 6, 6], [3, 12, 12], [4, 8, 8]
    }
}

/**
 * 22. Near-miss for "each multiple of previous": first step passes, second fails
 * Generates [a, k*a, (k*a + offset)] where b is multiple of a, but c is NOT multiple of b
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 50)
 * @returns {number[]} Triple where b % a === 0 but c % b !== 0
 */
export function almostEachMultiple(options = {}) {
    const { maxElement = 50 } = options;

    // Generate base value a
    const a = randomInt(Math.min(10, Math.floor(maxElement / 3)));

    // Generate first multiplier k (2 to 4)
    const k = 2 + randomInt(3);
    const b = a * k;

    // Generate c that is NOT a multiple of b
    // Strategy: c = b + offset where offset is not a multiple of b
    const maxOffset = Math.min(maxElement - b, b - 1);
    if (maxOffset < 1) {
        return almostEachMultiple({ maxElement });
    }

    let c;
    let attempts = 0;
    do {
        const offset = 1 + randomInt(maxOffset);
        c = b + offset;
        attempts++;
    } while (c % b === 0 && attempts < 20);

    return [a, b, c];
}

/**
 * 23. Sequence containing specific value but with different median
 * Used to prevent cheap "contains X" heuristics for median rules
 * @param {Object} options
 * @param {number} options.value - Value that must appear (default 5)
 * @param {number} options.excludeMedian - Median to avoid (default 5)
 * @param {number} options.maxElement - Maximum element value (default 20)
 * @returns {number[]} Triple containing value but with different median
 */
export function withValueButWrongMedian(options = {}) {
    const {
        value = 5,
        excludeMedian = 5,
        maxElement = 20
    } = options;

    // Generate a triple containing 'value' where the median (middle when sorted) != excludeMedian
    // Strategy: Generate three values, ensure one is 'value', then check sorted median
    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Place value at random position, generate two other values
        const otherValue1 = randomInt(maxElement);
        const otherValue2 = randomInt(maxElement);

        const triple = shuffle([value, otherValue1, otherValue2]);

        // Check if median != excludeMedian
        const sorted = [...triple].sort((a, b) => a - b);
        if (sorted[1] !== excludeMedian) {
            return triple;
        }
    }

    // Fallback: Force a configuration that works
    // Put value at extreme, ensure middle is != excludeMedian
    let middle;
    do {
        middle = randomInt(maxElement);
    } while (middle === excludeMedian && maxElement > 1);

    if (value < middle) {
        // [value, middle, high] - value is smallest
        const high = middle + randomInt(Math.max(1, maxElement - middle));
        return shuffle([value, middle, high]);
    } else {
        // [low, middle, value] - value is largest
        const low = randomInt(Math.max(1, middle));
        return shuffle([low, middle, value]);
    }
}

// =============================================================================
// ADVANCED PATTERN GENERATORS
// =============================================================================

/**
 * 24. Fibonacci-like: c = a + b (in some order)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @returns {number[]} Triple where one element is sum of other two
 */
export function fibonacciLike(options = {}) {
    const { maxElement = 30 } = options;
    const a = randomInt(Math.floor(maxElement / 3));
    const b = randomInt(Math.floor(maxElement / 3));
    const c = a + b;
    return shuffle([a, b, c]);
}

/**
 * 25. Powers of same base: [n, n², n³] or variations
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 100)
 * @returns {number[]} Triple with power relationship
 */
export function powersOfBase(options = {}) {
    const { maxElement = 100 } = options;

    // Find suitable base
    const maxBase = Math.floor(Math.pow(maxElement, 1/3));
    const base = 2 + randomInt(Math.max(1, maxBase - 1));

    // Choose power pattern
    const pattern = Math.floor(Math.random() * 3);

    if (pattern === 0) {
        // [n, n², n³]
        return shuffle([base, base * base, base * base * base]);
    } else if (pattern === 1) {
        // [1, n, n²]
        return shuffle([1, base, base * base]);
    } else {
        // [n, n², n⁴]
        const squared = base * base;
        return shuffle([base, squared, squared * squared]);
    }
}

/**
 * 26. Geometric sequence: [a, ar, ar²]
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 50)
 * @returns {number[]} Triple forming geometric sequence
 */
export function geometricSequence(options = {}) {
    const { maxElement = 50 } = options;

    // Choose ratio (2 or 3 work well)
    const ratio = [2, 3][Math.floor(Math.random() * 2)];
    const maxStart = Math.floor(maxElement / (ratio * ratio));
    const start = randomInt(Math.max(1, maxStart));

    return [start, start * ratio, start * ratio * ratio];
}

/**
 * 27. Arithmetic-geometric hybrid: some operations on sequence
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @returns {number[]} Triple with mixed arithmetic pattern
 */
export function arithmeticGeometricMix(options = {}) {
    const { maxElement = 30 } = options;

    const patterns = [
        // [n, 2n+1, 3n+2]
        () => {
            const n = randomInt(Math.floor(maxElement / 3));
            return [n, 2*n + 1, 3*n + 2];
        },
        // [n, n+2, 2n]
        () => {
            const n = randomInt(Math.floor(maxElement / 2));
            return shuffle([n, n + 2, 2 * n]);
        },
        // [n², n, n+n²]
        () => {
            const n = randomInt(Math.floor(Math.sqrt(maxElement / 2)));
            return shuffle([n * n, n, n + n * n]);
        }
    ];

    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    return pattern();
}

/**
 * 28. Digit-based: digits sum to same value
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 99)
 * @returns {number[]} Triple where digit sums match
 */
export function sameDigitSum(options = {}) {
    const { maxElement = 99 } = options;

    const digitSum = (n) => {
        let sum = 0;
        while (n > 0) {
            sum += n % 10;
            n = Math.floor(n / 10);
        }
        return sum;
    };

    // Generate first number
    const a = randomInt(Math.min(maxElement, 99));
    const targetSum = digitSum(a);

    // Find two more with same digit sum
    const candidates = [];
    for (let i = 1; i <= Math.min(maxElement, 99); i++) {
        if (digitSum(i) === targetSum && i !== a) {
            candidates.push(i);
        }
    }

    if (candidates.length >= 2) {
        const b = candidates[Math.floor(Math.random() * candidates.length)];
        const c = candidates[Math.floor(Math.random() * candidates.length)];
        return shuffle([a, b, c]);
    }

    // Fallback
    return uniformRandom(maxElement);
}

/**
 * 29. Perfect squares in sequence
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 100)
 * @returns {number[]} Triple of perfect squares
 */
export function perfectSquares(options = {}) {
    const { maxElement = 100 } = options;
    const maxN = Math.floor(Math.sqrt(maxElement));

    // Generate three different square roots
    const roots = [];
    while (roots.length < 3) {
        const root = randomInt(maxN);
        if (!roots.includes(root)) {
            roots.push(root);
        }
    }

    return shuffle(roots.map(r => r * r));
}

/**
 * 30. Prime numbers
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 50)
 * @returns {number[]} Triple of prime numbers
 */
export function primeNumbers(options = {}) {
    const { maxElement = 50 } = options;

    const isPrime = (n) => {
        if (n <= 1) return false;
        if (n <= 3) return true;
        if (n % 2 === 0 || n % 3 === 0) return false;
        for (let i = 5; i * i <= n; i += 6) {
            if (n % i === 0 || n % (i + 2) === 0) return false;
        }
        return true;
    };

    const primes = [];
    for (let i = 2; i <= maxElement && primes.length < 20; i++) {
        if (isPrime(i)) primes.push(i);
    }

    if (primes.length >= 3) {
        const selected = [];
        while (selected.length < 3) {
            const p = primes[Math.floor(Math.random() * primes.length)];
            if (!selected.includes(p)) {
                selected.push(p);
            }
        }
        return shuffle(selected);
    }

    return uniformRandom(maxElement);
}

/**
 * 31. Divisibility chain: a|b and b|c
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 100)
 * @returns {number[]} Triple where a divides b and b divides c
 */
export function divisibilityChain(options = {}) {
    const { maxElement = 100 } = options;

    const a = randomInt(Math.min(10, Math.floor(maxElement / 10)));
    const k1 = 2 + randomInt(3);
    const b = a * k1;

    if (b > maxElement) {
        return divisibilityChain(options);
    }

    const k2 = 2 + randomInt(Math.floor(maxElement / b));
    const c = b * k2;

    if (c > maxElement) {
        return divisibilityChain(options);
    }

    return [a, b, c];
}

/**
 * 32. Modular arithmetic: all same remainder when divided by k
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @param {number} options.modulus - Modulus to use (default random 3-7)
 * @returns {number[]} Triple with same remainder mod k
 */
export function sameRemainder(options = {}) {
    const { maxElement = 30, modulus = 3 + randomInt(5) } = options;

    const remainder = randomInt(modulus);
    const a = remainder + modulus * randomInt(Math.floor(maxElement / modulus));
    const b = remainder + modulus * randomInt(Math.floor(maxElement / modulus));
    const c = remainder + modulus * randomInt(Math.floor(maxElement / modulus));

    return [a, b, c];
}

/**
 * 33. Ratios: a:b = b:c (geometric mean)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 50)
 * @returns {number[]} Triple satisfying ratio relationship
 */
export function geometricMean(options = {}) {
    const { maxElement = 50 } = options;

    // Generate a and ratio r such that a*r² <= maxElement
    const a = randomInt(Math.min(10, Math.floor(maxElement / 9)));
    const ratio = 2 + randomInt(2); // ratio of 2 or 3
    const b = a * ratio;
    const c = b * ratio;

    if (c > maxElement) {
        return geometricMean(options);
    }

    return [a, b, c];
}

/**
 * 34. Palindromic: reads same forwards and backwards
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 99)
 * @returns {number[]} Triple that's palindromic
 */
export function palindromic(options = {}) {
    const { maxElement = 99 } = options;

    const middle = randomInt(maxElement);
    const outer = randomInt(maxElement);

    return [outer, middle, outer];
}

/**
 * 35. Mountain: increases then decreases
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @returns {number[]} Triple in mountain pattern
 */
export function mountain(options = {}) {
    const { maxElement = 30 } = options;

    const low1 = randomInt(Math.floor(maxElement / 2));
    const peak = low1 + randomInt(Math.floor(maxElement / 2));
    const low2 = randomInt(peak);

    return [low1, peak, low2];
}

/**
 * 36. Valley: decreases then increases
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @returns {number[]} Triple in valley pattern
 */
export function valley(options = {}) {
    const { maxElement = 30 } = options;

    const high1 = randomInt(maxElement);
    const valley = randomInt(Math.floor(maxElement / 2));
    const high2 = valley + randomInt(Math.floor(maxElement / 2));

    return [high1, valley, high2];
}

/**
 * 37. Largest equals twice second-largest (boundary case for t23)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @returns {number[]} Triple where largest = 2 * second-largest
 */
export function largestEqualsTwiceSecond(options = {}) {
    const { maxElement = 30 } = options;

    const smallest = 1 + randomInt(Math.floor(maxElement / 3));
    const second = smallest + randomInt(Math.floor(maxElement / 3));
    const largest = 2 * second;

    if (largest > maxElement) {
        return largestEqualsTwiceSecond(options);
    }

    return shuffle([smallest, second, largest]);
}

/**
 * 38. Boundary violation: one or two values violate range (for t24)
 * @param {Object} options
 * @param {number} options.min - Minimum allowed value
 * @param {number} options.max - Maximum allowed value
 * @param {string} options.violationType - 'one' or 'two' values violate
 * @returns {number[]} Triple with boundary violations
 */
export function boundaryViolation(options = {}) {
    const { min = 5, max = 15, violationType = 'one' } = options;

    const numViolations = violationType === 'one' ? 1 : 2;
    const numInRange = 3 - numViolations;

    const result = [];

    // Add values in range
    for (let i = 0; i < numInRange; i++) {
        result.push(min + randomInt(max - min + 1));
    }

    // Add violations
    for (let i = 0; i < numViolations; i++) {
        const violateHigh = Math.random() < 0.5;
        if (violateHigh) {
            result.push(max + 1 + randomInt(5));
        } else {
            result.push(Math.max(0, min - 1 - randomInt(Math.min(5, min))));
        }
    }

    return shuffle(result);
}

/**
 * 39. Two share a common factor, third doesn't (for t25)
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 20)
 * @returns {number[]} Triple where two share factor, third doesn't
 */
export function twoShareFactor(options = {}) {
    const { maxElement = 20 } = options;

    // Pick a common factor >= 2
    const factor = 2 + randomInt(Math.min(5, Math.floor(maxElement / 4)));

    // Generate two multiples of the factor
    const mult1 = factor * (1 + randomInt(Math.floor(maxElement / factor)));
    const mult2 = factor * (1 + randomInt(Math.floor(maxElement / factor)));

    // Generate a third number that's coprime to the factor
    // Simple approach: pick a prime or 1
    const primes = [1, 3, 5, 7, 11, 13, 17, 19];
    const coprimes = primes.filter(p => p <= maxElement && gcd(p, factor) === 1);

    if (coprimes.length === 0) {
        // Fallback if no suitable coprime
        return [mult1, mult2, 1];
    }

    const coprime = coprimes[randomInt(coprimes.length)];

    return shuffle([mult1, mult2, coprime]);
}

// Helper function for GCD
function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

// =============================================================================
// GCD-SPECIFIC GENERATORS (for t25)
// =============================================================================

/**
 * 40. Triple with specified GCD value
 * Generates [d*a, d*b, d*c] where gcd(a,b,c) = 1 and d is the target GCD
 * @param {Object} options
 * @param {number} options.targetGCD - Desired GCD value (default random 2-5)
 * @param {number} options.maxElement - Maximum value (default 40)
 * @returns {number[]} Triple with GCD = targetGCD
 */
export function withSpecificGCD(options = {}) {
    const { maxElement = 40 } = options;
    let { targetGCD } = options;

    // If no target specified, pick random GCD from 2-5
    if (!targetGCD) {
        targetGCD = 2 + randomInt(4); // 2, 3, 4, or 5
    }

    // Generate three coprime positive integers (gcd = 1)
    // Strategy: Pick from set of small primes and 1
    const smallPrimes = [1, 2, 3, 5, 7, 11, 13];
    const maxBase = Math.floor(maxElement / targetGCD);

    let a, b, c;
    let attempts = 0;
    do {
        // Pick three values, ensuring they're within bounds
        a = smallPrimes[randomInt(Math.min(smallPrimes.length, Math.ceil(maxBase / 2)))];
        b = smallPrimes[randomInt(Math.min(smallPrimes.length, Math.ceil(maxBase / 2)))];
        c = smallPrimes[randomInt(Math.min(smallPrimes.length, Math.ceil(maxBase / 2)))];

        // Make sure gcd(a,b,c) = 1 and all fit within bounds
        attempts++;
    } while ((gcd(gcd(a, b), c) !== 1 || a * targetGCD > maxElement ||
              b * targetGCD > maxElement || c * targetGCD > maxElement) &&
             attempts < 50);

    // If failed to find coprime triple, use simple fallback
    if (attempts >= 50) {
        a = 1;
        b = 2;
        c = 3;
    }

    // Multiply by target GCD
    return shuffle([a * targetGCD, b * targetGCD, c * targetGCD]);
}

/**
 * 41. Multiples of common divisor with varied structure
 * Generates [d*a, d*b, d*c] with various patterns for a,b,c
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 40)
 * @returns {number[]} Triple with GCD >= 2
 */
export function commonDivisorVaried(options = {}) {
    const { maxElement = 40 } = options;

    // Pick common divisor from 2-6
    const d = 2 + randomInt(5);
    const maxBase = Math.floor(maxElement / d);

    if (maxBase < 3) {
        return commonDivisorVaried({ maxElement: 60 }); // Need larger space
    }

    // Choose pattern type
    const patternType = randomInt(5);
    let a, b, c;

    switch (patternType) {
        case 0: // All different, spread out
            a = 1 + randomInt(Math.floor(maxBase / 3));
            b = a + 1 + randomInt(Math.floor(maxBase / 3));
            c = b + 1 + randomInt(maxBase - b);
            break;
        case 1: // Two close, one far
            a = 1 + randomInt(Math.floor(maxBase / 2));
            b = a + 1;
            c = b + 2 + randomInt(maxBase - b - 1);
            break;
        case 2: // Clustered
            a = 1 + randomInt(maxBase - 2);
            b = a + randomInt(3); // 0-2 away
            c = a + randomInt(3);
            break;
        case 3: // One is 1, others vary
            a = 1;
            b = 2 + randomInt(Math.floor(maxBase / 2));
            c = b + 1 + randomInt(maxBase - b);
            break;
        default: // Random uniform
            a = 1 + randomInt(maxBase);
            b = 1 + randomInt(maxBase);
            c = 1 + randomInt(maxBase);
    }

    return shuffle([a * d, b * d, c * d]);
}

/**
 * 42. Pairwise large GCDs but three-way GCD = 1
 * Generates triples where gcd(a,b), gcd(b,c), gcd(a,c) are large but gcd(a,b,c) = 1
 * Example: [6, 10, 15] - gcd(6,10)=2, gcd(10,15)=5, gcd(6,15)=3, but gcd(6,10,15)=1
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 40)
 * @returns {number[]} Triple with pairwise GCDs > 1 but overall GCD = 1
 */
export function pairwiseGcdNotOverall(options = {}) {
    const { maxElement = 40 } = options;

    // Strategy: Use products of distinct prime pairs
    // a = p1 * p2, b = p1 * p3, c = p2 * p3
    // Then gcd(a,b) = p1, gcd(b,c) = p3, gcd(a,c) = p2, but gcd(a,b,c) = 1

    const primes = [2, 3, 5, 7, 11, 13];

    // Pick three distinct primes
    const shuffledPrimes = [...primes].sort(() => Math.random() - 0.5);
    const p1 = shuffledPrimes[0];
    const p2 = shuffledPrimes[1];
    const p3 = shuffledPrimes[2];

    const a = p1 * p2;
    const b = p1 * p3;
    const c = p2 * p3;

    // Check if within bounds
    if (Math.max(a, b, c) > maxElement) {
        // Try with smaller primes
        const p1_small = 2;
        const p2_small = 3;
        const p3_small = 5;
        return shuffle([p1_small * p2_small, p1_small * p3_small, p2_small * p3_small]);
    }

    return shuffle([a, b, c]);
}

/**
 * 43. Consecutive multiples of same divisor [d*k, d*(k+1), d*(k+2)]
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @returns {number[]} Consecutive multiples
 */
export function consecutiveMultiples(options = {}) {
    const { maxElement = 30 } = options;

    // Pick divisor from 2-5
    const d = 2 + randomInt(4);

    // Pick starting multiplier
    const maxK = Math.floor((maxElement / d) - 2);
    if (maxK < 1) {
        return consecutiveMultiples({ maxElement: 40 });
    }

    const k = 1 + randomInt(maxK);

    return [d * k, d * (k + 1), d * (k + 2)];
}

/**
 * 44. Powers of a prime [p, p^2, p^3] or similar
 * @param {Object} options
 * @param {number} options.maxElement - Maximum value (default 30)
 * @returns {number[]} Powers with large GCD
 */
export function primePowers(options = {}) {
    const { maxElement = 30 } = options;

    // Pick a small prime
    const primes = [2, 3, 5];
    const p = primes[randomInt(primes.length)];

    // Generate various power combinations
    const patterns = [
        [1, 1, 2],  // [p, p, p^2]
        [1, 2, 2],  // [p, p^2, p^2]
        [1, 2, 3],  // [p, p^2, p^3]
        [2, 2, 2],  // [p^2, p^2, p^2]
        [1, 1, 1],  // [p, p, p]
        [2, 3, 4]   // [p^2, p^3, p^4]
    ];

    const pattern = patterns[randomInt(patterns.length)];
    const values = pattern.map(exp => Math.pow(p, exp));

    // Check bounds
    if (Math.max(...values) > maxElement) {
        // Fallback to simpler pattern
        return shuffle([p, p, p * 2]);
    }

    return shuffle(values);
}

// =============================================================================
// BASELINE DISTRIBUTION
// =============================================================================

const BASELINE_DISTRIBUTION_RAW = [
    // Basic uniform distributions
    { type: 'uniformRandom', weight: 0.08, options: { maxElement: 10 } },
    { type: 'uniformRandom', weight: 0.12, options: { maxElement: 20 } },
    { type: 'uniformRandom', weight: 0.08, options: { maxElement: 30 } },
    { type: 'uniformRandom', weight: 0.05, options: { maxElement: 50 } },
    { type: 'uniformRandom', weight: 0.03, options: { maxElement: 100 } },

    // Sum-constrained distributions
    { type: 'uniformRandomSum', weight: 0.03, options: { maxSum: 10 } },
    { type: 'uniformRandomSum', weight: 0.04, options: { maxSum: 20 } },
    { type: 'uniformRandomSum', weight: 0.04, options: { maxSum: 30 } },
    { type: 'uniformRandomSum', weight: 0.03, options: { maxSum: 50 } },
    { type: 'uniformRandomSum', weight: 0.02, options: { minSum: 20, maxSum: 40 } },
    { type: 'uniformRandomSum', weight: 0.02, options: { minSum: 40, maxSum: 60 } },

    // Sequences - strictly increasing
    { type: 'randomSequence', weight: 0.03, options: { strictly: true, direction: 'increasing', arithmetic: 1, maxElement: 15 } },
    { type: 'randomSequence', weight: 0.03, options: { strictly: true, direction: 'increasing', arithmetic: 2, maxElement: 20 } },
    { type: 'randomSequence', weight: 0.02, options: { strictly: true, direction: 'increasing', arithmetic: 3, maxElement: 25 } },
    { type: 'randomSequence', weight: 0.02, options: { strictly: true, direction: 'increasing', arithmetic: 5, maxElement: 40 } },
    { type: 'randomSequence', weight: 0.02, options: { strictly: true, direction: 'increasing', arithmetic: null, maxElement: 20 } },

    // Sequences - non-strict increasing
    { type: 'randomSequence', weight: 0.02, options: { strictly: false, direction: 'increasing', arithmetic: 1, maxElement: 20 } },
    { type: 'randomSequence', weight: 0.02, options: { strictly: false, direction: 'increasing', arithmetic: 2, maxElement: 25 } },

    // Sequences - decreasing
    { type: 'randomSequence', weight: 0.015, options: { strictly: true, direction: 'decreasing', arithmetic: 1, maxElement: 20 } },
    { type: 'randomSequence', weight: 0.015, options: { strictly: true, direction: 'decreasing', arithmetic: 2, maxElement: 20 } },
    { type: 'randomSequence', weight: 0.01, options: { strictly: true, direction: 'decreasing', arithmetic: null, maxElement: 20 } },

    // Constants and near-constants
    { type: 'constantSequence', weight: 0.03, options: { maxElement: 20 } },
    { type: 'equalAtPositions', weight: 0.02, options: { position1: 0, position2: 1, maxElement: 20 } },
    { type: 'equalAtPositions', weight: 0.02, options: { position1: 1, position2: 2, maxElement: 20 } },
    { type: 'equalAtPositions', weight: 0.02, options: { position1: 0, position2: 2, maxElement: 20 } },

    // Linear and exponential patterns
    { type: 'linearMultiples', weight: 0.03, options: { maxElement: 30 } },
    { type: 'exponentialMultiples', weight: 0.03, options: { maxElement: 40 } },
    { type: 'geometricSequence', weight: 0.02, options: { maxElement: 50 } },
    { type: 'geometricMean', weight: 0.015, options: { maxElement: 50 } },

    // Extremum positions
    { type: 'extremumAtPosition', weight: 0.02, options: { extremum: 'largest', position: 0, maxElement: 20 } },
    { type: 'extremumAtPosition', weight: 0.02, options: { extremum: 'largest', position: 1, maxElement: 20 } },
    { type: 'extremumAtPosition', weight: 0.02, options: { extremum: 'largest', position: 2, maxElement: 20 } },
    { type: 'extremumAtPosition', weight: 0.015, options: { extremum: 'smallest', position: 0, maxElement: 20 } },
    { type: 'extremumAtPosition', weight: 0.015, options: { extremum: 'smallest', position: 1, maxElement: 20 } },
    { type: 'extremumAtPosition', weight: 0.015, options: { extremum: 'smallest', position: 2, maxElement: 20 } },

    // Arithmetic relationships
    { type: 'largestIsSum', weight: 0.03, options: { position: 2, maxElement: 30 } },
    { type: 'largestIsSum', weight: 0.02, options: { position: 0, maxElement: 30 } },
    { type: 'largestIsSum', weight: 0.02, options: { position: 1, maxElement: 30 } },
    { type: 'largestIsProduct', weight: 0.025, options: { position: 2, maxElement: 30 } },
    { type: 'largestIsProduct', weight: 0.015, options: { position: 0, maxElement: 30 } },
    { type: 'largestIsProduct', weight: 0.015, options: { position: 1, maxElement: 30 } },
    { type: 'fibonacciLike', weight: 0.02, options: { maxElement: 30 } },

    // Parity
    { type: 'withEvenCount', weight: 0.02, options: { numEven: 0, maxElement: 20 } },
    { type: 'withEvenCount', weight: 0.02, options: { numEven: 1, maxElement: 20 } },
    { type: 'withEvenCount', weight: 0.02, options: { numEven: 2, maxElement: 20 } },
    { type: 'withEvenCount', weight: 0.02, options: { numEven: 3, maxElement: 20 } },

    // Statistical properties
    { type: 'withMedian', weight: 0.015, options: { median: 3, maxElement: 15 } },
    { type: 'withMedian', weight: 0.015, options: { median: 5, maxElement: 15 } },
    { type: 'withMedian', weight: 0.015, options: { median: 7, maxElement: 15 } },
    { type: 'withMedian', weight: 0.015, options: { median: 10, maxElement: 20 } },

    { type: 'triangleInequality', weight: 0.025, options: { maxElement: 20 } },
    { type: 'largestGreaterThanTwiceSecond', weight: 0.02, options: { maxElement: 30 } },

    { type: 'withMaxRange', weight: 0.02, options: { maxRange: 3, maxElement: 20 } },
    { type: 'withMaxRange', weight: 0.02, options: { maxRange: 5, maxElement: 20 } },
    { type: 'withMaxRange', weight: 0.015, options: { maxRange: 10, maxElement: 30 } },

    // Range constraints
    { type: 'inRange', weight: 0.02, options: { min: 1, max: 5 } },
    { type: 'inRange', weight: 0.02, options: { min: 5, max: 15 } },
    { type: 'inRange', weight: 0.02, options: { min: 10, max: 20 } },
    { type: 'inRange', weight: 0.015, options: { min: 1, max: 10 } },

    // Consecutive patterns
    { type: 'shuffledConsecutive', weight: 0.025, options: { maxElement: 20 } },
    { type: 'consecutiveInOrder', weight: 0.02, options: { maxElement: 20 } },

    // Divisibility and multiples
    { type: 'eachMultipleOfPrevious', weight: 0.02, options: { maxElement: 100 } },
    { type: 'partiallyEqualMultiples', weight: 0.02, options: { maxElement: 50 } },
    { type: 'divisibilityChain', weight: 0.015, options: { maxElement: 100 } },
    { type: 'sameRemainder', weight: 0.015, options: { maxElement: 30 } },

    // Powers and special numbers
    { type: 'powersOfBase', weight: 0.02, options: { maxElement: 100 } },
    { type: 'perfectSquares', weight: 0.015, options: { maxElement: 100 } },
    { type: 'primeNumbers', weight: 0.015, options: { maxElement: 50 } },

    // Pattern shapes
    { type: 'palindromic', weight: 0.02, options: { maxElement: 50 } },
    { type: 'mountain', weight: 0.02, options: { maxElement: 30 } },
    { type: 'valley', weight: 0.02, options: { maxElement: 30 } },

    // Mixed patterns
    { type: 'arithmeticGeometricMix', weight: 0.02, options: { maxElement: 30 } },
    { type: 'sameDigitSum', weight: 0.01, options: { maxElement: 99 } },
];

// Normalize weights to sum to 1
const totalWeight = BASELINE_DISTRIBUTION_RAW.reduce((sum, d) => sum + d.weight, 0);
export const BASELINE_DISTRIBUTION = BASELINE_DISTRIBUTION_RAW.map(d => ({
    ...d,
    weight: d.weight / totalWeight
}));

// =============================================================================
// SAMPLING FROM DISTRIBUTION
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

    // Fallback
    return distributions[distributions.length - 1].generator();
}

/**
 * All generators available for export
 */
export const ThreeNumberDistributions = {
    uniformRandom,
    uniformRandomSum,
    randomSequence,
    constantSequence,
    linearMultiples,
    exponentialMultiples,
    extremumAtPosition,
    equalAtPositions,
    largestIsSum,
    largestIsProduct,
    withEvenCount,
    withMedian,
    triangleInequality,
    largestGreaterThanTwiceSecond,
    withMaxRange,
    inRange,
    shuffledConsecutive,
    withSumAtWrongPosition,
    consecutiveInOrder,
    eachMultipleOfPrevious,
    partiallyEqualMultiples,
    almostEachMultiple,
    withValueButWrongMedian,

    // Advanced patterns
    fibonacciLike,
    powersOfBase,
    geometricSequence,
    arithmeticGeometricMix,
    sameDigitSum,
    perfectSquares,
    primeNumbers,
    divisibilityChain,
    sameRemainder,
    geometricMean,
    palindromic,
    mountain,
    valley,
    largestEqualsTwiceSecond,
    boundaryViolation,
    twoShareFactor,

    // GCD-specific generators
    withSpecificGCD,
    commonDivisorVaried,
    pairwiseGcdNotOverall,
    consecutiveMultiples,
    primePowers,

    sampleFromDistribution,
    BASELINE_DISTRIBUTION
};
