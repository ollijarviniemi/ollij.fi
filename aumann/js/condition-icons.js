// Compact "icon at a glance" representations for each condition, in the
// visual vocabulary of the print PDF (mini cards + formulas).
//
// Each entry returns the inner HTML for a condition card. The cond-card
// wrapper and met/unmet styling are added by the caller.

function card(content, cls = '') { return `<span class="ic-card ${cls}">${content}</span>`; }
function red(content)  { return card(content, 'ic-red'); }
function blue(content) { return card(content, 'ic-blue'); }
function plus()  { return `<span class="ic-op">+</span>`; }
function dots()  { return `<span class="ic-dots">…</span>`; }
function row(html)     { return `<div class="ic-row">${html}</div>`; }
function label(s)      { return `<div class="ic-formula">${s}</div>`; }
function eq(s, cls = '') { return `<span class="ic-eq ${cls}">${s}</span>`; }

export const ICON = {
    1:  () => row(card('A') + card('A') + eq('≥ 2')),
    2:  () => row(red('♥').repeat(5)) + label('≥ 5 same suit'),
    3:  () => row(card('7♣')),
    4:  () => row(blue('8') + plus() + blue('9') + plus() + blue('10') + plus() + dots()) + label('Σ ≥ 50'),
    5:  () => row(card('2-10') + eq('= 6')),
    6:  () => row(card('2-10') + eq('≥ 8')),
    7:  () => row(card('2') + card('4') + card('6') + card('8') + card('10')) + label('≥ 4 different'),
    8:  () => label('#{2,4,6,8,10} = #{3,5,7,9}'),
    9:  () => label('#{2,4,6,8,10} ≥ #{3,5,7,9} + 3'),
    10: () => row(card('JQK') + eq('= 1')),
    11: () => row(card('JQK') + card('JQK') + card('JQK') + eq('= 3')),
    12: () => row(card('J') + card('Q') + card('K') + eq('≥ 1 each')),
    13: () => row(card('3') + eq('min = odd')),
    14: () => row(card('', 'ic-red-outline') + eq('= 6 red', 'ic-red')),
    15: () => label('max ∈ {K, J}'),
    16: () => row(card('3') + card('6') + card('9') + card('3')) + label('≥ 4'),
    17: () => label('3 lowest: sum ≤ 8'),
    18: () => row(card('7') + card('7') + `<span class="ic-op">+1→</span>` + card('8') + card('8')) + label('two pairs'),
    19: () => label('<span class="ic-red">♥</span> ≥ <span class="ic-red">♦</span> ≥ ♠'),
    20: () => row(card('♣') + eq('= highest')),
};

// (Verbose chapter clarifications are no longer surfaced — the icon + the
//  plain-English name in the card body together are clear enough. Kept here
//  for posterity in case we want to reintroduce them.)
export const TIP = {};
