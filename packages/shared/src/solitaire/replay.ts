import { applyMove, deal, draw } from './logic';
import { SUITS, type GameState, type Pile } from './types';

/**
 * A pile, compactly: 's' stock, 'w' waste, 'f0'–'f3' a foundation (hearts, diamonds, clubs, spades), 't0'–'t6' a
 * tableau column.
 */
export type PileCode = string;

/** One input of a ranked game, as the browser records it: a draw from the stock, or a card (run) moved. */
export type RankedSolitaireMove = ['d'] | ['m', PileCode, number, PileCode];

/** Far more than any real game; keeps a replay cheap for the server. */
export const MAX_SOLITAIRE_MOVES = 3_000;

export function pileCode(p: Pile): PileCode {
  if (p.kind === 'stock') return 's';
  if (p.kind === 'waste') return 'w';
  if (p.kind === 'foundation') return `f${SUITS.indexOf(p.suit)}`;
  return `t${p.col}`;
}

export function pileFrom(code: PileCode): Pile | null {
  if (code === 's') return { kind: 'stock' };
  if (code === 'w') return { kind: 'waste' };
  const m = /^([ft])(\d)$/.exec(code);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === 'f') return n < 4 ? { kind: 'foundation', suit: SUITS[n] } : null;
  return n < 7 ? { kind: 'tableau', col: n } : null;
}

/**
 * Plays a ranked game back on the deal `seed` gives: the server's check that a claimed win is real. Every recorded
 * move must be legal (the browser records only moves that happened), so one that isn't ends the replay unfinished.
 */
export function replaySolitaire(seed: number, moves: readonly RankedSolitaireMove[]): GameState {
  let s = deal(seed);
  for (const m of moves.slice(0, MAX_SOLITAIRE_MOVES)) {
    if (s.status === 'won') break;
    let next: GameState | null = null;
    if (m[0] === 'd') next = draw(s, 0);
    else {
      const from = pileFrom(m[1]);
      const to = pileFrom(m[3]);
      if (from && to && Number.isInteger(m[2])) next = applyMove(s, { from, index: m[2], to }, 0);
    }
    if (!next) return s;
    s = next;
  }
  return s;
}
