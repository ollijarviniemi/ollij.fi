// Aumann agreement game, as a module on the shared room infrastructure.
//
// Game state lives in room.data (currentGame, scoreHistory, gameCounter). The
// generic room/lobby/chat/reconnect machinery is in ../lib/rooms.js; this file
// is only the Aumann-specific deal, scoring, privacy view, and round handlers.
//
// Privacy: each player's hand is only sent to that player; the opponent's row
// is only revealed once both have placed for that round.

import { fullDeck, sampleK, cardKey } from '../../aumann/js/cards.js';
import { CONDITIONS } from '../../aumann/js/conditions.js';
import { idealScore, lossBreakdown } from '../../aumann/js/bayesian.js';

const DECK = fullDeck();

class Game {
    constructor(number, conditions, hand1, hand2) {
        this.number = number;
        this.conditions = conditions;    // 3 condition objects from CONDITIONS
        this.hands = [hand1, hand2];     // [Card[5], Card[5]]
        this.placements = { p1r1: null, p1r2: null, p2r1: null, p2r2: null };
        this.ready = [false, false];
        this.ideal = null;               // populated at reveal
    }
    state() {
        const { p1r1, p2r1, p1r2, p2r2 } = this.placements;
        if (p1r1 == null || p2r1 == null) return 'round1';
        if (p1r2 == null || p2r2 == null) return 'round2';
        return 'revealed';
    }
}

function pickConditions() {
    return sampleK([...Array(CONDITIONS.length).keys()], 3).map(i => CONDITIONS[i]);
}

function dealNewGame(room) {
    const d = room.data;
    d.gameCounter = (d.gameCounter || 0) + 1;
    const conds = pickConditions();
    const hand1 = sampleK(DECK, 5);
    const used = new Set(hand1.map(cardKey));
    const hand2 = sampleK(DECK.filter(c => !used.has(cardKey(c))), 5);
    d.currentGame = new Game(d.gameCounter, conds, hand1, hand2);
    room.touch();
}

const rowScore = (row, q) => { const S = [[10, 0], [9, 4], [7, 7], [4, 9], [0, 10]]; return q ? S[row][0] : S[row][1]; };

function finalizeGame(room) {
    const g = room.data.currentGame;
    if (!g || g.state() !== 'revealed' || g.ideal) return;
    g.ideal = idealScore(g.hands[0], g.hands[1], g.conditions, DECK, { numOuter: 1200, numInner: 150 });
    const q = g.ideal.qTrue;
    const p1Score = rowScore(g.placements.p1r1, q) + rowScore(g.placements.p1r2, q);
    const p2Score = rowScore(g.placements.p2r1, q) + rowScore(g.placements.p2r2, q);
    // Expected loss vs. the Bayesian-optimal row, under the belief an ideal
    // Bayesian would have held at that move (variance-reduced; no realised-Q noise).
    const loss = lossBreakdown(g.ideal, g.placements);
    (room.data.scoreHistory ||= []).push({
        gameNum: g.number,
        qTrue: q,
        conditionIds: g.conditions.map(c => c.id),
        p1: { r1: g.placements.p1r1, r2: g.placements.p1r2, r1Score: rowScore(g.placements.p1r1, q), r2Score: rowScore(g.placements.p1r2, q), total: p1Score,
              r1Loss: loss.p1.r1, r2Loss: loss.p1.r2, loss: loss.p1.total },
        p2: { r1: g.placements.p2r1, r2: g.placements.p2r2, r1Score: rowScore(g.placements.p2r1, q), r2Score: rowScore(g.placements.p2r2, q), total: p2Score,
              r1Loss: loss.p2.r1, r2Loss: loss.p2.r2, loss: loss.p2.total },
        ideal: {
            p1: { r1: g.ideal.p1.r1Row, r2: g.ideal.p1.r2Row, r1Belief: g.ideal.p1.r1Belief, r2Belief: g.ideal.p1.r2Belief,
                  r1Score: rowScore(g.ideal.p1.r1Row, q), r2Score: rowScore(g.ideal.p1.r2Row, q),
                  total: rowScore(g.ideal.p1.r1Row, q) + rowScore(g.ideal.p1.r2Row, q) },
            p2: { r1: g.ideal.p2.r1Row, r2: g.ideal.p2.r2Row, r1Belief: g.ideal.p2.r1Belief, r2Belief: g.ideal.p2.r2Belief,
                  r1Score: rowScore(g.ideal.p2.r1Row, q), r2Score: rowScore(g.ideal.p2.r2Row, q),
                  total: rowScore(g.ideal.p2.r1Row, q) + rowScore(g.ideal.p2.r2Row, q) },
            totalScore: g.ideal.score,
        },
    });
}

export default {
    onBothSeated(room) {
        if (!room.data.currentGame) dealNewGame(room);
    },

    view(room, seat) {
        const g = room.data.currentGame;
        const history = room.data.scoreHistory || [];
        const scoreHistory = history.map(h => {
            const me = seat === 0 ? h.p1 : h.p2;
            const opp = seat === 0 ? h.p2 : h.p1;
            const meI = seat === 0 ? h.ideal.p1 : h.ideal.p2;
            const oppI = seat === 0 ? h.ideal.p2 : h.ideal.p1;
            return {
                gameNum: h.gameNum, qTrue: h.qTrue,
                you: me, mate: opp, youIdeal: meI, mateIdeal: oppI,
                totalScore: me.total + opp.total,
                totalIdealScore: h.ideal.totalScore,
                totalLoss: me.loss + opp.loss,
            };
        });
        let game = null;
        if (g) {
            const myR1 = seat === 0 ? g.placements.p1r1 : g.placements.p2r1;
            const myR2 = seat === 0 ? g.placements.p1r2 : g.placements.p2r2;
            const oppR1 = seat === 0 ? g.placements.p2r1 : g.placements.p1r1;
            const oppR2 = seat === 0 ? g.placements.p2r2 : g.placements.p1r2;
            const bothR1Done = g.placements.p1r1 != null && g.placements.p2r1 != null;
            const bothR2Done = g.placements.p1r2 != null && g.placements.p2r2 != null;
            const state = g.state();
            game = {
                number: g.number,
                state,
                myHand: g.hands[seat],
                oppHand: state === 'revealed' ? g.hands[1 - seat] : null,
                conditions: g.conditions.map(c => ({ id: c.id, name: c.name })),
                myR1, myR2,
                oppR1: bothR1Done ? oppR1 : null,
                oppR2: bothR2Done ? oppR2 : null,
                oppR1Pending: g.placements[seat === 0 ? 'p2r1' : 'p1r1'] != null && !bothR1Done,
                oppR2Pending: g.placements[seat === 0 ? 'p2r2' : 'p1r2'] != null && !bothR2Done,
                ready: g.ready,
                ideal: state === 'revealed' ? g.ideal : null,
            };
        }
        return { scoreHistory, game };
    },

    handlers: {
        place(room, seat, { round, row } = {}) {
            const g = room.data.currentGame;
            if (!g) return { error: 'No active game.' };
            const r = Number(row);
            if (!(r >= 0 && r <= 4)) return { error: 'Bad row.' };
            const st = g.state();
            const key =
                (round === 1 && st === 'round1') ? (seat === 0 ? 'p1r1' : 'p2r1') :
                (round === 2 && st === 'round2') ? (seat === 0 ? 'p1r2' : 'p2r2') : null;
            if (!key) return { error: `Not in round ${round} (state=${st}).` };
            if (g.placements[key] != null) return { error: 'Already placed for this round.' };
            g.placements[key] = r;
            if (g.state() === 'revealed') finalizeGame(room);
            return {};
        },

        'game:ready'(room, seat) {
            const g = room.data.currentGame;
            if (!g || g.state() !== 'revealed') return { error: 'No revealed game.' };
            g.ready[seat] = true;
            if (g.ready[0] && g.ready[1]) dealNewGame(room);
            return {};
        },
    },
};
