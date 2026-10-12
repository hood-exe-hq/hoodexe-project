export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
/** 1 = Ace … 11 = Jack, 12 = Queen, 13 = King. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type Card = { suit: Suit; rank: Rank; faceUp: boolean; id: string };

/** Where cards live: 'stock', 'waste', a foundation by suit, or a tableau column 0–6. */
export type Pile = { kind: 'stock' } | { kind: 'waste' } | { kind: 'foundation'; suit: Suit } | { kind: 'tableau'; col: number };

/** Move the card at `index` in `from` (and everything above it, for a tableau run) onto `to`. */
export type Move = { from: Pile; index: number; to: Pile };

/**
 * One game (hood-exe-games-brief.md §2.7). Undo history is kept beside it by the hook, not inside, so a
 * saved game stays small. `points` is the score before the time penalty; see displayScore().
 */
export type GameState = {
  seed: number;
  stock: Card[];
  waste: Card[];
  foundations: Record<Suit, Card[]>;
  tableau: Card[][];
  moves: number;
  points: number;
  /** Set by the first move, so the clock starts when play does. */
  startedAt: number | null;
  /** Fixed when the last card reaches a foundation. */
  finishedAt: number | null;
  recycles: number;
  status: 'playing' | 'won';
};

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
