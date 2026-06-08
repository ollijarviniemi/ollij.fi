// 52-card deck and card helpers for the Aumann game.
// Rank: 2..14 where J=11, Q=12, K=13, A=14.
// Suit: 's' | 'h' | 'd' | 'c'  (spades, hearts, diamonds, clubs).
// Card: { rank, suit }.

export const SUITS = ['s', 'h', 'd', 'c'];
export const RED_SUITS = new Set(['h', 'd']);

export const RANK_LABEL = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const SUIT_GLYPH = {
    s: '♠', h: '♥', d: '♦', c: '♣',
};

export function makeCard(rank, suit) {
    return { rank, suit };
}

// Unique string key for set membership (e.g., "14h" = ace of hearts).
export function cardKey(c) {
    return `${c.rank}${c.suit}`;
}

// Convenience predicates per the chapter's category definitions:
//   "numerokortti" = number card = rank 2..10 (aces and faces excluded).
//   "kuvakortti"   = face card   = J, Q, K (ranks 11..13).
//   "ässä"         = ace, value 14.
export function isRed(c)    { return RED_SUITS.has(c.suit); }
export function isFace(c)   { return c.rank >= 11 && c.rank <= 13; }
export function isNumber(c) { return c.rank >= 2  && c.rank <= 10; }
export function isAce(c)    { return c.rank === 14; }

export function fullDeck() {
    const deck = [];
    for (const s of SUITS) {
        for (let r = 2; r <= 14; r++) deck.push(makeCard(r, s));
    }
    return deck;
}

// Fisher-Yates shuffle. Returns a NEW array; does not mutate input.
export function shuffle(arr, rng = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Sample k distinct elements from arr uniformly without replacement.
// Returns a new array of length k. Does not mutate input.
export function sampleK(arr, k, rng = Math.random) {
    const a = arr.slice();
    const result = [];
    for (let i = 0; i < k; i++) {
        const j = i + Math.floor(rng() * (a.length - i));
        [a[i], a[j]] = [a[j], a[i]];
        result.push(a[i]);
    }
    return result;
}

// Mulberry32 — seedable PRNG. Returns a function() → [0, 1).
// Use for deterministic shuffles in tests and replayable games.
export function makeRng(seed = 1) {
    let s = seed >>> 0;
    return function() {
        s |= 0; s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
