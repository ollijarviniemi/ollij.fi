// Compact "icon at a glance" representations for each condition, in the
// visual vocabulary of the print PDF (mini cards + formulas).
//
// Each entry returns the inner HTML for a condition card. The cond-card
// wrapper, ?-icon, and met/unmet styling are added by the caller.

function card(content, cls = '') { return `<span class="ic-card ${cls}">${content}</span>`; }
function red(content)  { return card(content, 'ic-red'); }
function blue(content) { return card(content, 'ic-blue'); }
function plus()  { return `<span class="ic-op">+</span>`; }
function dots()  { return `<span class="ic-dots">…</span>`; }
function row(html)   { return `<div class="ic-row">${html}</div>`; }
function label(s)    { return `<div class="ic-formula">${s}</div>`; }

export const ICON = {
    1:  () => row(card('A') + card('A')) + label('≥ 2'),
    2:  () => row(red('♥').repeat(5)) + label('≥ 5 same'),
    3:  () => row(card('7♣')) + label(''),
    4:  () => row(blue('8') + plus() + blue('9') + plus() + blue('10') + plus() + dots()) + label('Σ ≥ 50'),
    5:  () => row(card('2-10')) + label('= 6'),
    6:  () => row(card('2-10')) + label('≥ 8'),
    7:  () => row(card('2') + card('4') + card('6') + card('8') + card('10')) + label('≥ 4 different'),
    8:  () => label('#{2,4,6,8,10} = #{3,5,7,9}'),
    9:  () => label('#{2,4,6,8,10} ≥ #{3,5,7,9} + 3'),
    10: () => row(card('JQK')) + label('= 1'),
    11: () => row(card('JQK') + card('JQK') + card('JQK')) + label('= 3'),
    12: () => row(card('J') + card('Q') + card('K')) + label('≥ 1 each'),
    13: () => row(card('3')) + label('min = odd'),
    14: () => row(card('', 'ic-red-outline')) + label('= 6 <span class="ic-red">red</span>'),
    15: () => label('max ∈ {K, J}'),
    16: () => row(card('3') + card('6') + card('9') + card('3')) + label('≥ 4'),
    17: () => label('3 lowest: sum ≤ 8'),
    18: () => row(card('7') + card('7') + `<span class="ic-op">+1→</span>` + card('8') + card('8')) + label('two pairs'),
    19: () => label('<span class="ic-red">♥</span> ≥ <span class="ic-red">♦</span> ≥ ♠'),
    20: () => row(card('♣')) + label('= highest'),
};

// Verbose tooltips clarifying tricky semantics (already used in v2).
export const TIP = {
    2:  'Same suit means at least 5 of one of ♠, ♥, ♦, ♣.',
    4:  'Number cards = ranks 2..10. Aces (14) and J/Q/K are NOT number cards. Sum their values.',
    5:  'Number cards = ranks 2..10 only.',
    6:  'Number cards = ranks 2..10 only.',
    7:  'At least 4 different values among {2, 4, 6, 8, 10} must be present.',
    8:  'Among the number cards (2..10): equal count of even and odd.',
    9:  'Among number cards (2..10), even count minus odd count ≥ 3.',
    10: 'Face cards = J, Q, K. Aces are not face cards.',
    11: 'Face cards = J, Q, K.',
    12: 'At least one Jack, at least one Queen, at least one King.',
    13: 'Smallest by rank value. Odd = 3, 5, 7, 9, J(11), K(13).',
    14: 'Red = hearts + diamonds.',
    15: 'Highest rank exactly K or J. A or Q would fail.',
    17: 'The 3 lowest cards by rank, summed.',
    18: 'Two pairs whose ranks differ by 1, e.g. 5+5 and 6+6. (K + A also counts.)',
    20: 'Clubs loses ties: requires a clubs card whose rank is strictly higher than every non-clubs card\'s rank.',
};
