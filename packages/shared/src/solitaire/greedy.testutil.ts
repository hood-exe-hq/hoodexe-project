// Test helper (not exported from the package): plays deals greedily until one is won, for replay tests here and in the API.
import { applyMove, autoCompleteMoves, deal, draw, isLegal, pileCards } from './logic';
import { pileCode, type RankedSolitaireMove } from './replay';
import { SUITS, type GameState, type Move, type Pile } from './types';

export const PILES: Pile[] = [{ kind: 'waste' }, ...SUITS.map((suit) => ({ kind: 'foundation' as const, suit })), ...Array.from({ length: 7 }, (_, col) => ({ kind: 'tableau' as const, col }))];

/**
 * A simple greedy player: foundation moves first, then moves that turn a card over, then a draw. Not clever, but
 * enough to win some deals; returns the moves of the first won deal it finds, with its seed.
 */
export function findWin(): { seed: number; moves: RankedSolitaireMove[] } {
  for (let seed = 1; seed < 400; seed++) {
    let s: GameState = deal(seed);
    const moves: RankedSolitaireMove[] = [];
    const apply = (m: Move) => {
      s = applyMove(s, m, 0)!;
      moves.push(['m', pileCode(m.from), m.index, pileCode(m.to)]);
    };
    let idle = 0;
    while (s.status === 'playing' && moves.length < 1_500 && idle < 60) {
      const auto = autoCompleteMoves(s);
      if (auto) {
        auto.forEach(apply);
        break;
      }
      let done = false;
      for (const from of PILES) {
        const cards = pileCards(s, from);
        for (let i = 0; i < cards.length && !done; i++) {
          for (const to of PILES) {
            const m = { from, index: i, to };
            if (!isLegal(s, m)) continue;
            const toFoundation = to.kind === 'foundation';
            const turnsOver = from.kind === 'tableau' && i > 0 && !cards[i - 1].faceUp;
            const fromWaste = from.kind === 'waste' && to.kind === 'tableau';
            if (toFoundation || turnsOver || fromWaste) {
              apply(m);
              done = true;
              break;
            }
          }
        }
        if (done) break;
      }
      if (done) {
        idle = 0;
        continue;
      }
      const next = draw(s, 0);
      if (!next) break;
      s = next;
      moves.push(['d']);
      idle++;
    }
    if (s.status === 'won') return { seed, moves };
  }
  throw new Error('no winnable deal found');
}
