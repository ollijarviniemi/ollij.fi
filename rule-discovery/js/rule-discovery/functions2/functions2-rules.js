/**
 * Functions2 Game Rules - Bivariate Functions
 * 10 mathematical function rules for two variables
 */

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
        [a, b] = [b, a % b];
    }
    return a;
}

function lcm(a, b) {
    if (a === 0 || b === 0) return 0;
    return Math.abs(a * b) / gcd(a, b);
}

export const FUNCTIONS2_RULES = [
    {
        id: 'f2_1',
        name: 'x and y ➝ x + y',
        arity: 2,
        check: (x, y) => x + y,
        testInputs: [
            [0, 0], [1, 1], [2, 3], [3, 5], [5, 7], [10, 10], [1, 0], [0, 1],
            [2, 8], [4, 6], [3, 9], [7, 2], [8, 15], [15, 20], [7, 13], [12, 8],
            [5, 5], [10, 2], [12, 12], [4, 8], [10, 20], [11, 12], [50, 50]
        ]
    },
    {
        id: 'f2_2',
        name: 'x and y ➝ 3*x + 2*y + 1',
        arity: 2,
        check: (x, y) => 3 * x + 2 * y + 1,
        testInputs: [
            [0, 0], [1, 1], [2, 3], [3, 2], [5, 5], [10, 5], [1, 0], [0, 1],
            [4, 2], [6, 8], [3, 7], [8, 3], [9, 4], [8, 10], [7, 4], [12, 7]
        ]
    },
    {
        id: 'f2_3',
        name: 'x and y ➝ x * y',
        arity: 2,
        check: (x, y) => x * y,
        testInputs: [
            [0, 0], [1, 1], [2, 3], [3, 5], [5, 4], [10, 2], [1, 0], [0, 5],
            [2, 4], [4, 3], [3, 6], [6, 2], [7, 5], [6, 7], [8, 3], [12, 1],
            [4, 4], [4, 5], [5, 6], [10, 3], [10, 5], [5, 5], [3, 3], [20, 2]
        ]
    },
    {
        id: 'f2_4',
        name: 'x and y ➝ x (returns the first number)',
        arity: 2,
        check: (x, y) => x,
        testInputs: [
            [0, 0], [1, 5], [2, 3], [3, 10], [5, 1], [10, 20], [7, 0], [15, 8],
            [4, 7], [6, 9], [8, 3], [20, 5], [11, 14], [12, 12], [8, 15], [25, 1]
        ]
    },
    {
        id: 'f2_5',
        name: 'x and y ➝ max(x, y) (returns the larger number)',
        arity: 2,
        check: (x, y) => Math.max(x, y),
        testInputs: [
            [0, 0], [1, 5], [5, 1], [3, 3], [10, 2], [2, 10], [7, 8], [8, 7],
            [4, 9], [9, 4], [6, 11], [11, 6], [15, 20], [20, 15], [0, 10], [10, 0],
            [49, 50], [11, 22], [12, 34], [99, 5], [3, 100], [34, 32], [50, 39]
        ]
    },
    {
        id: 'f2_6',
        name: 'x and y ➝ returns the distance between the two numbers (notation: |x - y|)',
        arity: 2,
        check: (x, y) => Math.abs(x - y),
        testInputs: [
            [0, 0], [1, 5], [5, 1], [3, 3], [10, 2], [2, 10], [7, 8], [15, 8],
            [4, 9], [9, 4], [6, 3], [11, 18], [20, 5], [5, 20], [12, 12], [0, 7],
            [30, 20], [5, 15], [20, 18], [14, 18], [15, 16], [34, 37], [45, 55], [100, 99],
            
        ]
    },
    {
        id: 'f2_7',
        name: 'x and y ➝ returns the largest number that divides both numbers (notation: gcd(x, y))',
        arity: 2,
        check: (x, y) => gcd(x, y),
        testInputs: [
            [6, 9], [12, 18], [8, 12], [15, 20], [7, 11], [10, 15], [14, 21], [16, 24],
            [5, 10], [9, 12], [18, 24], [20, 30], [6, 15], [8, 20], [21, 28], [25, 30],
            [48, 49], [30, 40], [11, 22], [22, 33], [20, 27]
        ]
    },
    {
        id: 'f2_8',
        name: 'x and y ➝ returns the smallest number divisible by both x and y (notation: lcm(x, y))',
        arity: 2,
        check: (x, y) => lcm(x, y),
        testInputs: [
            [2, 3], [4, 6], [3, 5], [6, 8], [5, 7], [4, 10], [6, 9], [8, 12],
            [3, 4], [5, 6], [2, 5], [3, 7], [4, 5], [6, 10], [5, 8], [7, 10],
            [10, 15], [14, 21]
        ]
    },
    {
        id: 'f2_9',
        name: 'x and y ➝ (x+1)*(y-1)',
        arity: 2,
        check: (x, y) => (x + 1) * (y - 1),
        testInputs: [
            [0, 2], [1, 3], [2, 4], [3, 5], [5, 6], [10, 11], [1, 1], [0, 1],
            [4, 6], [6, 8], [3, 7], [5, 2], [7, 8], [4, 10], [8, 3], [9, 11],
            [4, 4], [5, 5], [6, 6], [4, 11]
        ]
    },
    {
        id: 'f2_10',
        name: 'x and y ➝ x*x - y*y. This is the same as (x-y)*(x+y)',
        arity: 2,
        check: (x, y) => x * x - y * y,
        testInputs: [
            [3, 2], [5, 3], [4, 1], [6, 4], [5, 5], [10, 5], [7, 2], [8, 6],
            [2, 3], [1, 4], [3, 5], [4, 7], [0, 3], [3, 0], [9, 7], [11, 10],
            [3, 3], [4, 4], [5, 5], [1, 2], [1, 3], [3, 1], [5, 4], [6, 4], [8, 6], [5, 4]
        ]
    },
];
