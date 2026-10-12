import { describe, expect, it } from 'vitest';
import { PILES, findWin } from './greedy.testutil';
import { pileCode, pileFrom, replaySolitaire } from './replay';
import type { Pile } from './types';

describe('replaySolitaire', () => {
  const { seed, moves } = findWin();

  it('confirms a real win on the deal the seed gives', () => {
    expect(replaySolitaire(seed, moves).status).toBe('won');
  });

  it('does not count the same moves on another deal, or an unfinished game', () => {
    expect(replaySolitaire(seed + 1, moves).status).toBe('playing');
    expect(replaySolitaire(seed, moves.slice(0, -1)).status).toBe('playing');
  });

  it('stops at the first illegal or malformed move', () => {
    expect(replaySolitaire(seed, [['m', 'x9', 0, 't0'], ...moves]).status).toBe('playing');
    expect(replaySolitaire(seed, [['m', 't0', 0, 't0'], ...moves]).status).toBe('playing');
  });

  it('codes every pile both ways', () => {
    for (const p of [{ kind: 'stock' } as Pile, ...PILES]) expect(pileFrom(pileCode(p))).toEqual(p);
    expect(pileFrom('t7')).toBeNull();
    expect(pileFrom('f4')).toBeNull();
  });
});
