import { SUITS, type Card, type GameState, type Move, type Pile, type Rank, type Suit } from './solitaire.types';

/**
 * Klondike, draw one (hood-exe-games-brief.md §2). Pure: no DOM, no React, every function returns a new state
 * (or null for an illegal move), so the rules are testable and the hook can keep an undo stack of states.
 *
 * Scoring follows the brief (§2.8) plus two classic Windows rules that stop points being farmed by moving a
 * card back and forth: turning over a tableau card +5, and taking a card off a foundation −15.
 */
export const SCORE = {
  wasteToTableau: 10,
  toFoundationFromTableau: 10,
  wasteToFoundation: 5,
  turnOver: 5,
  foundationToTableau: -15,
  recycle: -15,
} as const;

// ── Deck ──────────────────────────────────────────────────────────────────────

/** Small seeded PRNG (mulberry32): the same seed always deals the same game ("Deal Again"). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => {
      const rank = (i + 1) as Rank;
      return { suit, rank, faceUp: false, id: `${suit[0]}${rank}` };
    }),
  );
}

export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const next = random(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Column i gets i + 1 cards with only the top one face up; the other 24 form the stock. */
export function deal(seed: number): GameState {
  const deck = shuffle(createDeck(), seed);
  const tableau: Card[][] = [];
  let k = 0;
  for (let col = 0; col < 7; col++) {
    const column: Card[] = [];
    for (let row = 0; row <= col; row++) column.push({ ...deck[k++], faceUp: row === col });
    tableau.push(column);
  }
  return {
    seed,
    stock: deck.slice(k).map((c) => ({ ...c, faceUp: false })),
    waste: [],
    foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
    tableau,
    moves: 0,
    points: 0,
    startedAt: null,
    finishedAt: null,
    recycles: 0,
    status: 'playing',
  };
}

// ── Rules ─────────────────────────────────────────────────────────────────────

export const isRed = (suit: Suit) => suit === 'hearts' || suit === 'diamonds';

/** Tableau builds down in alternating colours; an empty column takes only a King. */
export function canStackOnTableau(card: Card, target: Card | undefined): boolean {
  if (!target) return card.rank === 13;
  return target.faceUp && isRed(card.suit) !== isRed(target.suit) && card.rank === target.rank - 1;
}

/** Foundations build up by suit from the Ace. */
export function canPlaceOnFoundation(card: Card, foundation: readonly Card[]): boolean {
  const top = foundation.at(-1);
  if (!top) return card.rank === 1;
  return card.suit === top.suit && card.rank === top.rank + 1;
}

export function isWon(state: GameState): boolean {
  return SUITS.every((s) => state.foundations[s].length === 13);
}

export function pileCards(state: GameState, pile: Pile): Card[] {
  switch (pile.kind) {
    case 'stock':
      return state.stock;
    case 'waste':
      return state.waste;
    case 'foundation':
      return state.foundations[pile.suit];
    case 'tableau':
      return state.tableau[pile.col] ?? [];
  }
}

export const samePile = (a: Pile, b: Pile) =>
  a.kind === b.kind && (a.kind !== 'foundation' || a.suit === (b as typeof a).suit) && (a.kind !== 'tableau' || a.col === (b as typeof a).col);

/** The cards a move would carry, or null if they can't be picked up from there. */
export function movingCards(state: GameState, from: Pile, index: number): Card[] | null {
  const cards = pileCards(state, from);
  if (index < 0 || index >= cards.length) return null;
  if (from.kind === 'stock') return null;
  // Waste and foundations give up only their top card; the tableau gives up any face-up run.
  if (from.kind !== 'tableau' && index !== cards.length - 1) return null;
  const run = cards.slice(index);
  if (!run[0].faceUp) return null;
  for (let i = 1; i < run.length; i++) if (!canStackOnTableau(run[i], run[i - 1])) return null;
  return run;
}

export function isLegal(state: GameState, move: Move): boolean {
  if (state.status !== 'playing' || samePile(move.from, move.to)) return false;
  const cards = movingCards(state, move.from, move.index);
  if (!cards) return false;
  if (move.to.kind === 'foundation') return cards.length === 1 && cards[0].suit === move.to.suit && canPlaceOnFoundation(cards[0], state.foundations[move.to.suit]);
  if (move.to.kind === 'tableau') return canStackOnTableau(cards[0], state.tableau[move.to.col]?.at(-1));
  return false;
}

function pointsFor(from: Pile, to: Pile): number {
  if (to.kind === 'foundation') return from.kind === 'waste' ? SCORE.wasteToFoundation : from.kind === 'tableau' ? SCORE.toFoundationFromTableau : 0;
  if (to.kind === 'tableau') return from.kind === 'waste' ? SCORE.wasteToTableau : from.kind === 'foundation' ? SCORE.foundationToTableau : 0;
  return 0;
}

function withPile(state: GameState, pile: Pile, cards: Card[]): GameState {
  switch (pile.kind) {
    case 'stock':
      return { ...state, stock: cards };
    case 'waste':
      return { ...state, waste: cards };
    case 'foundation':
      return { ...state, foundations: { ...state.foundations, [pile.suit]: cards } };
    case 'tableau':
      return { ...state, tableau: state.tableau.map((c, i) => (i === pile.col ? cards : c)) };
  }
}

function started(state: GameState, now: number): GameState {
  return state.startedAt == null ? { ...state, startedAt: now } : state;
}

/** Applies a legal move (turning over the card it uncovers), or returns null. */
export function applyMove(state: GameState, move: Move, now = Date.now()): GameState | null {
  if (!isLegal(state, move)) return null;
  const source = pileCards(state, move.from);
  const carried = source.slice(move.index);
  let rest = source.slice(0, move.index);
  let points = state.points + pointsFor(move.from, move.to);
  if (move.from.kind === 'tableau' && rest.length && !rest.at(-1)!.faceUp) {
    rest = [...rest.slice(0, -1), { ...rest.at(-1)!, faceUp: true }];
    points += SCORE.turnOver;
  }
  let next = withPile(state, move.from, rest);
  next = withPile(next, move.to, [...pileCards(next, move.to), ...carried]);
  next = { ...started(next, now), moves: state.moves + 1, points: Math.max(0, points) };
  return isWon(next) ? { ...next, status: 'won', finishedAt: now } : next;
}

/** Clicking the stock: turn its top card onto the waste, or, when empty, turn the waste back over (−15). */
export function draw(state: GameState, now = Date.now()): GameState | null {
  if (state.status !== 'playing') return null;
  if (state.stock.length) {
    const card = state.stock.at(-1)!;
    return { ...started(state, now), stock: state.stock.slice(0, -1), waste: [...state.waste, { ...card, faceUp: true }], moves: state.moves + 1 };
  }
  if (!state.waste.length) return null;
  return {
    ...started(state, now),
    stock: [...state.waste].reverse().map((c) => ({ ...c, faceUp: false })),
    waste: [],
    recycles: state.recycles + 1,
    moves: state.moves + 1,
    points: Math.max(0, state.points + SCORE.recycle),
  };
}

/** The foundation move for a card (double-click / right-click), if there is one. */
export function foundationMove(state: GameState, from: Pile, index: number): Move | null {
  const card = pileCards(state, from)[index];
  if (!card) return null;
  const move: Move = { from, index, to: { kind: 'foundation', suit: card.suit } };
  return isLegal(state, move) ? move : null;
}

/** Everything is face up and nothing is left to draw: the rest can play itself. */
export function canAutoComplete(state: GameState): boolean {
  return state.status === 'playing' && !state.stock.length && !state.waste.length && state.tableau.every((col) => col.every((c) => c.faceUp));
}

/**
 * The moves that finish the game, or null when it can't finish by itself yet. Once every card is face up,
 * each column is a descending run, so the lowest card still out is always on top of some column, and
 * repeatedly playing whatever fits a foundation always ends in a win.
 */
export function autoCompleteMoves(state: GameState): Move[] | null {
  if (!canAutoComplete(state)) return null;
  const moves: Move[] = [];
  let s: GameState = state;
  while (s.status === 'playing') {
    let next: Move | null = null;
    for (let col = 0; col < 7 && !next; col++) {
      const cards = s.tableau[col];
      if (cards.length) next = foundationMove(s, { kind: 'tableau', col }, cards.length - 1);
    }
    if (!next) return null;
    moves.push(next);
    s = applyMove(s, next, s.startedAt ?? 0)!;
  }
  return moves;
}

// ── Score and time ────────────────────────────────────────────────────────────

export function elapsedSeconds(state: GameState, now = Date.now()): number {
  if (state.startedAt == null) return 0;
  return Math.max(0, Math.floor(((state.finishedAt ?? now) - state.startedAt) / 1_000));
}

/** −2 for every 10 seconds played, never below zero; a win adds 700 000 ÷ seconds (games over 30 s). */
export function displayScore(state: GameState, now = Date.now()): number {
  const seconds = elapsedSeconds(state, now);
  const base = Math.max(0, state.points - 2 * Math.floor(seconds / 10));
  return state.status === 'won' && seconds > 30 ? base + Math.floor(700_000 / seconds) : base;
}

export const RANK_LABEL: Record<Rank, string> = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };
export const SUIT_SYMBOL: Record<Suit, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
