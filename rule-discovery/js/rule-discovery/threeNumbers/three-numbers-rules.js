/**
 * Three Numbers Game Rules
 * 25 rules for triples of numbers (2-4-6 game style)
 * Each rule includes distribution specifications for positive/negative examples
 */

export const THREE_NUMBERS_RULES = [
    // Rule 1: Strictly increasing
    {
        id: 't1',
        name: 'The numbers increase from left to right',
        check: (a, b, c) => a < b && b < c,
        positiveExample: [2, 4, 6],
        distribution: {
            positive: [
                { type: 'randomSequence', weight: 0.4, options: { strictly: true, direction: 'increasing', maxElement: 10 } }, // Small numbers, small gaps
                { type: 'randomSequence', weight: 0.3, options: { strictly: true, direction: 'increasing', maxElement: 30 } }, // Larger range
                { type: 'uniformRandom', weight: 0.3, options: { maxElement: 50 } } // Mixed magnitudes with large gaps
            ],
            negative: [
                // Near-miss: non-strict increasing (a ≤ b ≤ c) - catches misconception that equals are OK
                { type: 'randomSequence', weight: 0.30, options: { strictly: false, direction: 'increasing', maxElement: 20 } },

                // Near-miss: two equal consecutive values
                { type: 'equalAtPositions', weight: 0.20, options: { position1: 0, position2: 1, maxElement: 20 } }, // [5, 5, 8]
                { type: 'equalAtPositions', weight: 0.20, options: { position1: 1, position2: 2, maxElement: 20 } }, // [2, 5, 5]

                // Wrong direction: decreasing
                { type: 'randomSequence', weight: 0.15, options: { strictly: true, direction: 'decreasing', maxElement: 20 } },

                // All equal - extreme case
                { type: 'constantSequence', weight: 0.15, options: { maxElement: 20 } }
            ]
        }
    },

    // Rule 2: All equal
    {
        id: 't2',
        name: 'The numbers are all equal',
        check: (a, b, c) => a === b && b === c,
        positiveExample: [3, 3, 3],
        distribution: {
            positive: [
                { type: 'constantSequence', weight: 1.0, options: { maxElement: 20 } }
            ],
            negative: [
                // Near-miss: exactly two equal (very close to "all equal")
                { type: 'equalAtPositions', weight: 0.35, options: { position1: 0, position2: 1, maxElement: 20 } }, // [5, 5, 8]
                { type: 'equalAtPositions', weight: 0.35, options: { position1: 1, position2: 2, maxElement: 20 } }, // [2, 5, 5]
                { type: 'equalAtPositions', weight: 0.30, options: { position1: 0, position2: 2, maxElement: 20 } }  // [5, 8, 5]
            ]
        }
    },

    // Rule 4: Arithmetic and strictly increasing
    {
        id: 't4',
        name: 'The increase from the first number to the second equals the increase from the second to the third',
        check: (a, b, c) => a < b && b < c && (b - a) === (c - b),
        positiveExample: [2, 4, 6],
        distribution: {
            positive: [
                { type: 'randomSequence', weight: 0.3, options: { strictly: true, direction: 'increasing', arithmetic: 1, maxElement: 15 } }, // diff=1
                { type: 'randomSequence', weight: 0.3, options: { strictly: true, direction: 'increasing', arithmetic: 2, maxElement: 20 } }, // diff=2
                { type: 'randomSequence', weight: 0.2, options: { strictly: true, direction: 'increasing', arithmetic: 3, maxElement: 25 } }, // diff=3
                { type: 'randomSequence', weight: 0.2, options: { strictly: true, direction: 'increasing', arithmetic: 5, maxElement: 40 } }  // diff=5 (larger gaps)
            ],
            negative: [
                // Near-miss: strictly increasing but NOT arithmetic (unequal differences)
                { type: 'randomSequence', weight: 0.35, options: { strictly: true, direction: 'increasing', arithmetic: null, maxElement: 20 } },

                // Near-miss: geometric progression [a, 2a, 4a] - increasing but differences not equal
                { type: 'exponentialMultiples', weight: 0.25, options: { maxElement: 40 } },

                // Near-miss: arithmetic but DECREASING [9, 6, 3]
                { type: 'randomSequence', weight: 0.20, options: { strictly: true, direction: 'decreasing', arithmetic: 2, maxElement: 20 } },

                // Near-miss: equal differences (0) but not strictly increasing [5, 5, 5]
                { type: 'constantSequence', weight: 0.20, options: { maxElement: 20 } }
            ]
        }
    },

    // Rule 5: Doubling (b=2a, c=4a)
    {
        id: 't5',
        name: 'Each number is always double the previous one',
        check: (a, b, c) => b === 2 * a && c === 4 * a,
        positiveExample: [1, 2, 4],
        distribution: {
            positive: [
                { type: 'exponentialMultiples', weight: 1.0, options: { maxElement: 40 } }
            ],
            negative: [
                // Near-miss: linear multiples [a, 2a, 3a] - first step correct (b=2a) but second wrong (c≠4a)
                { type: 'linearMultiples', weight: 0.40, options: { maxElement: 30 } },

                // Near-miss: geometric with ratio 3 [a, 3a, 9a] - multiplicative pattern but wrong ratio
                { type: 'geometricSequence', weight: 0.25, options: { maxElement: 50 } },

                // Near-miss: powers of base [n, n², n³] or [n, n², n⁴] - exponential but not doubling
                { type: 'powersOfBase', weight: 0.20, options: { maxElement: 100 } },

                // Near-miss: [a, 2a, 2a] - first step correct, second step fails (multiplies by 1)
                { type: 'partiallyEqualMultiples', weight: 0.15, options: { maxElement: 50 } }
            ]
        }
    },

    // Rule 13: Consecutive (diff=1) IN ORDER
    {
        id: 't13',
        name: 'Each number is always the previous one plus one',
        check: (a, b, c) => b === a + 1 && c === b + 1,
        positiveExample: [3, 4, 5],
        distribution: {
            positive: [
                // NOTE: Order matters! [5,4,3] would FAIL this rule (unlike t19)
                { type: 'randomSequence', weight: 1.0, options: { strictly: true, direction: 'increasing', arithmetic: 1, maxElement: 20 } }
            ],
            negative: [
                // Near-miss: consecutive but SHUFFLED [5, 3, 4] - would pass t19 but fails t13
                { type: 'shuffledConsecutive', weight: 0.30, options: { maxElement: 20 } },

                // Near-miss: arithmetic with diff=2 [3, 5, 7] - pattern similar but wrong step size
                { type: 'randomSequence', weight: 0.30, options: { strictly: true, direction: 'increasing', arithmetic: 2, maxElement: 20 } },

                // Near-miss: arithmetic with diff=3 [2, 5, 8]
                { type: 'randomSequence', weight: 0.20, options: { strictly: true, direction: 'increasing', arithmetic: 3, maxElement: 20 } },

                // Near-miss: non-strict increasing [3, 4, 4] - almost consecutive
                { type: 'randomSequence', weight: 0.20, options: { strictly: false, direction: 'increasing', arithmetic: 1, maxElement: 20 } }
            ]
        }
    },

    // Rule 7: Largest in middle
    {
        id: 't7',
        name: 'The largest number is in the middle',
        check: (a, b, c) => b >= a && b >= c,
        positiveExample: [1, 2, 1],
        distribution: {
            positive: [
                { type: 'extremumAtPosition', weight: 1.0, options: { extremum: 'largest', position: 1, maxElement: 20 } }
            ],
            negative: [
                // Near-miss: largest at START [10, 5, 3] - mountain shape but wrong position
                { type: 'extremumAtPosition', weight: 0.35, options: { extremum: 'largest', position: 0, maxElement: 20 } },

                // Near-miss: largest at END [3, 5, 10] - strictly increasing puts largest at end
                { type: 'extremumAtPosition', weight: 0.35, options: { extremum: 'largest', position: 2, maxElement: 20 } },

                // Near-miss: valley pattern [8, 2, 7] - middle is SMALLEST not largest
                { type: 'valley', weight: 0.30, options: { maxElement: 30 } }
            ]
        }
    },

    // Rule 8: Exactly two equal
    {
        id: 't8',
        name: 'Exactly two of the numbers are equal to each other',
        check: (a, b, c) => (a === b && b !== c) || (b === c && a !== b) || (a === c && a !== b),
        positiveExample: [1, 1, 2],
        distribution: {
            positive: [
                { type: 'equalAtPositions', weight: 0.33, options: { position1: 0, position2: 1, maxElement: 20 } },
                { type: 'equalAtPositions', weight: 0.33, options: { position1: 1, position2: 2, maxElement: 20 } },
                { type: 'equalAtPositions', weight: 0.34, options: { position1: 0, position2: 2, maxElement: 20 } }
            ],
            negative: [
                // Near-miss: ALL three equal [5, 5, 5] - too many equals (fails "exactly two")
                { type: 'constantSequence', weight: 0.40, options: { maxElement: 20 } },

                // Near-miss: all DIFFERENT - strictly increasing [2, 5, 9]
                { type: 'randomSequence', weight: 0.30, options: { strictly: true, direction: 'increasing', maxElement: 20 } },

                // Near-miss: all DIFFERENT - arithmetic [3, 6, 9]
                { type: 'randomSequence', weight: 0.30, options: { strictly: true, direction: 'increasing', arithmetic: 3, maxElement: 20 } }
            ]
        }
    },

    // Rule 12: Sum > 20
    {
        id: 't12',
        name: 'The sum of the numbers is greater than 20',
        check: (a, b, c) => a + b + c > 20,
        positiveExample: [7, 8, 9],
        distribution: {
            positive: [
                { type: 'uniformRandomSum', weight: 0.4, options: { maxSum: 30, minSum: 21 } }, // Near boundary
                { type: 'uniformRandomSum', weight: 0.4, options: { maxSum: 50, minSum: 30 } }, // Medium sums
                { type: 'uniformRandomSum', weight: 0.2, options: { maxSum: 80, minSum: 50 } }  // Large sums
            ],
            negative: [
                // Near-miss: sum exactly 20 [6, 7, 7] or [5, 7, 8] - boundary case
                { type: 'uniformRandomSum', weight: 0.50, options: { minSum: 18, maxSum: 20 } },

                // Near-miss: sum 15-20 [5, 6, 7] - close to boundary
                { type: 'uniformRandomSum', weight: 0.30, options: { minSum: 15, maxSum: 20 } },

                // Clearly under: sum ≤ 10 [1, 2, 3]
                { type: 'uniformRandomSum', weight: 0.20, options: { minSum: 3, maxSum: 10 } }
            ]
        }
    },

    // Rule 14: Range <= 5
    {
        id: 't14',
        name: 'The difference between the largest and smallest number is at most 5',
        check: (a, b, c) => Math.max(a, b, c) - Math.min(a, b, c) <= 5,
        positiveExample: [2, 4, 6],
        distribution: {
            positive: [
                { type: 'withMaxRange', weight: 1.0, options: { maxRange: 5, maxElement: 20 } }
            ],
            negative: [
                // Near-miss: range exactly 6 via arithmetic sequence [2, 5, 8] (diff=3 per step)
                { type: 'randomSequence', weight: 0.35, options: { strictly: true, direction: 'increasing', arithmetic: 3, maxElement: 20 } },

                // Near-miss: range 7-10 via larger arithmetic steps [1, 6, 11] (diff=5 per step → range=10)
                { type: 'randomSequence', weight: 0.35, options: { strictly: true, direction: 'increasing', arithmetic: 5, maxElement: 20 } },

                // Large range: exponential [1, 2, 4] has range 3 (passes), but [2, 4, 8] has range 6 (fails)
                { type: 'exponentialMultiples', weight: 0.30, options: { maxElement: 40 } }
            ]
        }
    },

    // Rule 15: All even
    {
        id: 't15',
        name: 'All the numbers are even',
        check: (a, b, c) => a % 2 === 0 && b % 2 === 0 && c % 2 === 0,
        positiveExample: [2, 4, 6],
        distribution: {
            positive: [
                { type: 'withEvenCount', weight: 1.0, options: { numEven: 3, maxElement: 20 } }
            ],
            negative: [
                // Near-miss: exactly TWO even [2, 4, 7] - almost satisfies "all even"
                { type: 'withEvenCount', weight: 0.40, options: { numEven: 2, maxElement: 20 } },

                // Near-miss: exactly ONE even [2, 5, 9] - one even mixed with odds
                { type: 'withEvenCount', weight: 0.30, options: { numEven: 1, maxElement: 20 } },

                // Opposite: all ODD [3, 5, 7] - tests understanding that odd ≠ even
                { type: 'withEvenCount', weight: 0.30, options: { numEven: 0, maxElement: 20 } }
            ]
        }
    },

    // Rule 17: All < 10
    {
        id: 't17',
        name: 'All the numbers are less than 10',
        check: (a, b, c) => a < 10 && b < 10 && c < 10,
        positiveExample: [2, 4, 6],
        distribution: {
            positive: [
                { type: 'uniformRandom', weight: 0.7, options: { maxElement: 9 } }, // General case
                { type: 'constantSequence', weight: 0.15, options: { maxElement: 9 } }, // Edge: all equal
                { type: 'uniformRandom', weight: 0.15, options: { maxElement: 3 } } // Very small numbers
            ],
            negative: [
                // Near-miss: boundary violation - at least one value is exactly 10 or just over
                { type: 'inRange', weight: 0.40, options: { min: 8, max: 12 } }, // [8, 9, 10] or [9, 10, 11]

                // Near-miss: two values OK, one clearly over [5, 7, 15]
                { type: 'inRange', weight: 0.30, options: { min: 5, max: 15 } },

                // Clearly fails: all values well over 10 [15, 18, 20]
                { type: 'inRange', weight: 0.30, options: { min: 11, max: 25 } }
            ]
        }
    },

    // Rule 18: a + b = c
    {
        id: 't18',
        name: 'First + second = third',
        check: (a, b, c) => a + b === c,
        positiveExample: [2, 4, 6],
        distribution: {
            positive: [
                { type: 'largestIsSum', weight: 0.6, options: { position: 2, maxElement: 30 } }, // General case
                { type: 'largestIsSum', weight: 0.2, options: { position: 2, maxElement: 10 } }, // Small numbers
                { type: 'largestIsSum', weight: 0.2, options: { position: 2, maxElement: 60 } }  // Larger sums
            ],
            negative: [
                // Near-miss: sum relationship exists but at WRONG POSITION [6, 2, 4] where 6=2+4 but c≠a+b
                { type: 'withSumAtWrongPosition', weight: 0.35, options: { maxElement: 20 } },

                // Near-miss: PRODUCT instead of sum [2, 3, 6] where c=a*b not c=a+b
                { type: 'largestIsProduct', weight: 0.30, options: { position: 2, maxElement: 30 } },

                // Near-miss: arithmetic sequence [3, 6, 9] - looks like pattern but 3+6≠9
                { type: 'randomSequence', weight: 0.20, options: { strictly: true, direction: 'increasing', arithmetic: 3, maxElement: 20 } },

                // Near-miss: fibonacci-like but shuffled - sum exists but positions mixed
                { type: 'fibonacciLike', weight: 0.15, options: { maxElement: 30 } }
            ]
        }
    },

    // Rule 19: Three consecutive in some order
    {
        id: 't19',
        name: 'The numbers are three consecutive numbers in some order',
        check: (a, b, c) => {
            const sorted = [a, b, c].sort((x, y) => x - y);
            return sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1;
        },
        positiveExample: [3, 4, 5],
        distribution: {
            positive: [
                // CRITICAL: Must shuffle to show [5,3,4], [4,5,3], etc., not just [3,4,5]
                { type: 'shuffledConsecutive', weight: 1, options: { maxElement: 20 } },
            ],
            negative: [
                // Near-miss: diff=2 arithmetic [2, 4, 6] - every-other-consecutive
                { type: 'randomSequence', weight: 0.35, options: { strictly: true, direction: 'increasing', arithmetic: 2, maxElement: 20 } },

                // Near-miss: two consecutive, third breaks pattern [3, 4, 7] or [2, 5, 6]
                { type: 'equalAtPositions', weight: 0.25, options: { position1: 0, position2: 1, maxElement: 20 } }, // [5, 5, 6] - two equal

                // Near-miss: diff=3 arithmetic [3, 6, 9]
                { type: 'randomSequence', weight: 0.20, options: { strictly: true, direction: 'increasing', arithmetic: 3, maxElement: 20 } },

                // Clear fail: random gaps [2, 7, 15]
                { type: 'randomSequence', weight: 0.20, options: { strictly: true, direction: 'increasing', arithmetic: null, maxElement: 20 } }
            ]
        }
    },

    // Rule 20: Median = 5
    {
        id: 't20',
        name: 'The median is 5: when the numbers are sorted by size, the middle number is five',
        check: (a, b, c) => {
            const sorted = [a, b, c].sort((x, y) => x - y);
            return sorted[1] === 5;
        },
        positiveExample: [2, 5, 8],
        distribution: {
            positive: [
                // NOTE: Order-independent (sorts before checking). Generator shuffles positions.
                { type: 'withMedian', weight: 1.0, options: { median: 5, maxElement: 15 } }
            ],
            negative: [
                // CRITICAL: Contains 5 but wrong median [1, 3, 5] or [5, 8, 10] - prevents "contains 5" heuristic
                { type: 'withValueButWrongMedian', weight: 0.50, options: { value: 5, excludeMedian: 5, maxElement: 15 } },

                // Near-miss: median = 4 [2, 4, 7] - one away from target
                { type: 'withMedian', weight: 0.20, options: { median: 4, maxElement: 15 } },

                // Near-miss: median = 6 [3, 6, 9] - one away from target
                { type: 'withMedian', weight: 0.20, options: { median: 6, maxElement: 15 } },

                // Far miss: median = 10 [7, 10, 12]
                { type: 'withMedian', weight: 0.10, options: { median: 10, maxElement: 20 } }
            ]
        }
    },

    // Rule 21: Triangle inequality
    {
        id: 't21',
        name: 'The largest number is smaller than the sum of the other two',
        check: (a, b, c) => {
            return a > 0 && b > 0 && c > 0 && a + b > c && b + c > a && a + c > b;
        },
        positiveExample: [3, 4, 5],
        distribution: {
            positive: [
                { type: 'triangleInequality', weight: 1.0, options: { maxElement: 15 } }
            ],
            negative: [
                // Near-miss: exponential [a, 2a, 4a] - violates because a+2a=3a < 4a (e.g., [1,2,4]: 1+2=3 < 4)
                { type: 'exponentialMultiples', weight: 0.40, options: { maxElement: 40 } },

                // Near-miss: large arithmetic gaps [2, 7, 12] - gap=5, so 2+7=9 < 12
                { type: 'randomSequence', weight: 0.35, options: { strictly: true, direction: 'increasing', arithmetic: 5, maxElement: 20 } },

                // Near-miss: very large gaps [1, 3, 10] - smallest two don't exceed largest
                { type: 'largestGreaterThanTwiceSecond', weight: 0.25, options: { maxElement: 30 } }
            ]
        }
    },

    // Rule 22: Each is multiple of previous
    {
        id: 't22',
        name: 'Each number is always divisible by the previous one',
        check: (a, b, c) => {
            return a > 0 && b > 0 && c > 0 && b % a === 0 && c % b === 0;
        },
        positiveExample: [1, 2, 4],
        distribution: {
            positive: [
                // NOTE: Order matters! [4,2,1] would FAIL (2 % 4 !== 0)
                // Creates diverse examples: [1,2,4], [2,6,18], [1,3,12], [3,9,27], [3,3,9], [2,6,6], [5,5,5], etc.
                { type: 'eachMultipleOfPrevious', weight: 0.4, options: { maxElement: 100 } }, // General case: both k>=2
                { type: 'eachMultipleOfPrevious', weight: 0.15, options: { maxElement: 50 } }, // Smaller numbers
                { type: 'exponentialMultiples', weight: 0.15, options: { maxElement: 40 } },   // Classic [a, 2a, 4a]
                { type: 'partiallyEqualMultiples', weight: 0.2, options: { maxElement: 50 } }, // [a,a,ka] or [a,ka,ka]
                { type: 'constantSequence', weight: 0.1, options: { maxElement: 20 } }         // All equal: [a, a, a]
            ],
            negative: [
                // Near-miss: b % a === 0 but c % b !== 0 (first condition holds, second fails)
                { type: 'almostEachMultiple', weight: 0.50, options: { maxElement: 50 } },
                // Near-miss: [a, 2a, 3a] FAILS because 3a % 2a !== 0 (unless a=1)
                { type: 'linearMultiples', weight: 0.30, options: { maxElement: 30 } },
                // Consecutive: [5,6,7] - clearly fails divisibility (6 % 5 !== 0)
                { type: 'randomSequence', weight: 0.20, options: { strictly: true, direction: 'increasing', arithmetic: 1, maxElement: 20 } }
            ]
        }
    },

    // Rule 23: Largest > 2 * second-largest
    {
        id: 't23',
        name: 'The largest number is more than double the second-largest',
        check: (a, b, c) => {
            const sorted = [a, b, c].sort((x, y) => x - y);
            return sorted[2] > 2 * sorted[1];
        },
        positiveExample: [1, 1, 3],
        distribution: {
            positive: [
                { type: 'largestGreaterThanTwiceSecond', weight: 0.4, options: { maxElement: 20 } }, // Small numbers
                { type: 'largestGreaterThanTwiceSecond', weight: 0.4, options: { maxElement: 40 } }, // Medium range
                { type: 'largestGreaterThanTwiceSecond', weight: 0.2, options: { maxElement: 80 } }  // Large range
            ],
            negative: [
                // Near-miss: Largest = 2 * second-largest (boundary case) [3,5,10]
                { type: 'largestEqualsTwiceSecond', weight: 0.50, options: { maxElement: 30 } },
                // Near-miss: [a, 2a, 3a] where 3a < 2*2a (so 3a < 4a, which is true)
                { type: 'linearMultiples', weight: 0.30, options: { maxElement: 30 } },
                // Consecutive +2: [5,7,9] where 9 < 2*7, tests understanding of "greater than" vs "equal"
                { type: 'randomSequence', weight: 0.20, options: { strictly: true, direction: 'increasing', arithmetic: 2, maxElement: 20 } }
            ]
        }
    },

    // Rule 24: All in [5, 15]
    {
        id: 't24',
        name: 'All the numbers are between 5 and 15',
        check: (a, b, c) => {
            return a >= 5 && a <= 15 && b >= 5 && b <= 15 && c >= 5 && c <= 15;
        },
        positiveExample: [7, 8, 9],
        distribution: {
            positive: [
                { type: 'inRange', weight: 0.7, options: { min: 5, max: 15 } }, // General case
                { type: 'inRange', weight: 0.15, options: { min: 5, max: 7 } }, // Near lower boundary
                { type: 'inRange', weight: 0.15, options: { min: 13, max: 15 } } // Near upper boundary
            ],
            negative: [
                // Near-miss: Just above upper boundary [16,17,18] - tests "at most 15"
                { type: 'inRange', weight: 0.30, options: { min: 16, max: 20 } },
                // Near-miss: Just below lower boundary [2,3,4] - tests "at least 5"
                { type: 'inRange', weight: 0.30, options: { min: 1, max: 4 } },
                // Near-miss: One value at boundary violates [5,10,16] - tests "all" requirement
                { type: 'boundaryViolation', weight: 0.40, options: { min: 5, max: 15, violationType: 'one' } }
            ]
        }
    },

    // Rule 25: GCD > 1
    {
        id: 't25',
        name: 'There is a number greater than one that divides all the numbers',
        check: (a, b, c) => {
            const gcd = (x, y) => y === 0 ? x : gcd(y, x % y);
            const gcd3 = gcd(gcd(Math.abs(a), Math.abs(b)), Math.abs(c));
            return gcd3 > 1;
        },
        positiveExample: [2, 4, 6],
        distribution: {
            positive: [
                // Specific GCD values (tests understanding that GCD can be 2, 3, 4, 5, not just 2)
                { type: 'withSpecificGCD', weight: 0.15, options: { targetGCD: 2, maxElement: 40 } }, // GCD = 2: [2,4,6], [6,10,14]
                { type: 'withSpecificGCD', weight: 0.15, options: { targetGCD: 3, maxElement: 40 } }, // GCD = 3: [3,6,9], [6,15,21]
                { type: 'withSpecificGCD', weight: 0.10, options: { targetGCD: 4, maxElement: 40 } }, // GCD = 4: [4,8,12]
                { type: 'withSpecificGCD', weight: 0.10, options: { targetGCD: 5, maxElement: 40 } }, // GCD = 5: [5,10,15]

                // Varied structural patterns with common divisor
                { type: 'commonDivisorVaried', weight: 0.15, options: { maxElement: 40 } }, // [d*a, d*b, d*c] with diverse a,b,c

                // All even (GCD >= 2, simple case)
                { type: 'withEvenCount', weight: 0.10, options: { numEven: 3, maxElement: 30 } },

                // Linear multiples [a, 2a, 3a] -> GCD = a
                { type: 'linearMultiples', weight: 0.10, options: { maxElement: 30 } },

                // Consecutive multiples [2k, 2(k+1), 2(k+2)] - tests GCD with sequential structure
                { type: 'consecutiveMultiples', weight: 0.10, options: { maxElement: 30 } },

                // Prime powers [p, p^2, p^3] - tests understanding of GCD with exponential structure
                { type: 'primePowers', weight: 0.05, options: { maxElement: 30 } }
            ],
            negative: [
                // CRITICAL: Pairwise GCDs large but overall GCD = 1 (tests three-way understanding)
                // Example: [6, 10, 15] - gcd(6,10)=2, gcd(10,15)=5, gcd(6,15)=3, but gcd(6,10,15)=1
                { type: 'pairwiseGcdNotOverall', weight: 0.40, options: { maxElement: 40 } },

                // Near-miss: Two share factor, third doesn't [6,9,11] - GCD(all)=1 even though GCD(6,9)=3
                { type: 'twoShareFactor', weight: 0.25, options: { maxElement: 30 } },

                // Near-miss: Consecutive numbers [5,6,7] - GCD always 1 (tests adjacent numbers)
                { type: 'randomSequence', weight: 0.15, options: { strictly: true, direction: 'increasing', arithmetic: 1, maxElement: 20 } },

                // Near-miss: All odd but coprime [3,7,11] - prevents "all even" heuristic
                { type: 'withEvenCount', weight: 0.10, options: { numEven: 0, maxElement: 20 } },

                // Clear fail: Small coprime numbers [1,2,3], [2,3,5]
                { type: 'shuffledConsecutive', weight: 0.10, options: { maxElement: 15 } }
            ]
        }
    },

    // Rule 26: Largest is product of other two
    {
        id: 't26',
        name: 'The largest of the numbers is the product of the other two',
        check: (a, b, c) => {
            const sorted = [a, b, c].sort((x, y) => x - y);
            return sorted[2] === sorted[0] * sorted[1];
        },
        positiveExample: [2, 3, 6],
        distribution: {
            positive: [
                // IMPORTANT: Shuffle positions to prevent trivial "largest at end" heuristic
                // Position 0: [product, a, b] = [6, 2, 3]
                { type: 'largestIsProduct', weight: 0.17, options: { position: 0, maxElement: 20 } },
                { type: 'largestIsProduct', weight: 0.10, options: { position: 0, maxElement: 50 } },
                { type: 'largestIsProduct', weight: 0.07, options: { position: 0, maxElement: 100 } },

                // Position 1: [a, product, b] = [2, 6, 3]
                { type: 'largestIsProduct', weight: 0.16, options: { position: 1, maxElement: 20 } },
                { type: 'largestIsProduct', weight: 0.10, options: { position: 1, maxElement: 50 } },
                { type: 'largestIsProduct', weight: 0.07, options: { position: 1, maxElement: 100 } },

                // Position 2: [a, b, product] = [2, 3, 6]
                { type: 'largestIsProduct', weight: 0.17, options: { position: 2, maxElement: 20 } },
                { type: 'largestIsProduct', weight: 0.10, options: { position: 2, maxElement: 50 } },
                { type: 'largestIsProduct', weight: 0.06, options: { position: 2, maxElement: 100 } }
            ],
            negative: [
                // Near-miss: Largest is sum instead of product [2,3,5] - tests operation confusion
                { type: 'largestIsSum', weight: 0.50, options: { position: 2, maxElement: 30 } },
                // Near-miss: [a, 2a, 4a] where 4a ≠ a*2a (unless a=2, but still tests understanding)
                { type: 'exponentialMultiples', weight: 0.30, options: { maxElement: 40 } },
                // Near-miss: [a, 2a, 3a] where 3a ≠ a*2a (tests that product ≠ sum)
                { type: 'linearMultiples', weight: 0.20, options: { maxElement: 30 } }
            ]
        }
    }
];
