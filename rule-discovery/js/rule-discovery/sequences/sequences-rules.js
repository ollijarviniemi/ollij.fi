/**
 * Sequences Game Rules
 * 10 number sequence patterns
 */

export const SEQUENCES_RULES = [
        { id: 'seq1', name: 'Add three to the previous number', generate: (n) => Array.from({length: n}, (_, i) => 3 * (i + 1) + 2), required: 2 },
        { id: 'seq12', name: 'Alternate: add 4, add 7, add 4, add 7, ...', generate: (n) => {
            const seq = [1];
            for (let i = 1; i < n; i++) seq.push(seq[i-1] + (i % 2 === 1 ? 4 : 7));
            return seq;
        }, required: 2 },
        { id: 'seq6', name: 'Multiply a number by itself (1×1, 2×2, 3×3, 4×4...)', generate: (n) => Array.from({length: n}, (_, i) => Math.pow(i + 1, 2)), required: 2 },
        { id: 'seq7', name: 'Add 1, then 2, then 3, then 4...', generate: (n) => Array.from({length: n}, (_, i) => (i + 1) * (i + 2) / 2), required: 2 },
        { id: 'seq10', name: 'The next number is the sum of the two previous', generate: (n) => {
            const fib = [1, 1];
            for (let i = 2; i < n; i++) fib.push(fib[i-1] + fib[i-2]);
            return fib.slice(0, n);
        }, required: 2 },
        { id: 'seq5', name: 'The next number is twice the previous', generate: (n) => Array.from({length: n}, (_, i) => Math.pow(2, i)), required: 2 },
        { id: 'seq2', name: 'Numbers divisible by three or five (or both)', generate: (n) => {
            const seq = [];
            let candidate = 1;
            while (seq.length < n) {
                if (candidate % 3 === 0 || candidate % 5 === 0) {
                    seq.push(candidate);
                }
                candidate++;
            }
            return seq;
        }, required: 6 },
        { id: 'seq14', name: 'Prime numbers: numbers that cannot be written as a product of smaller numbers', generate: (n) => {
            const primes = [];
            let candidate = 2;
            while (primes.length < n) {
                let isPrime = true;
                for (let i = 0; i < primes.length && primes[i] * primes[i] <= candidate; i++) {
                    if (candidate % primes[i] === 0) {
                        isPrime = false;
                        break;
                    }
                }
                if (isPrime) primes.push(candidate);
                candidate++;
            }
            return primes;
        }, required: 6 },
];
