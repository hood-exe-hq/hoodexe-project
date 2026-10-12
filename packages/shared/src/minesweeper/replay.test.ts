import { describe, expect, it } from 'vitest';
import { PRESETS, newGame, reveal } from './logic';
import { replayRanked, type RankedMove } from './replay';

const SEED = 12_345;

/** Wins a board by revealing every safe cell after the first click: what a perfect (if slow) player does. */
function winningMoves(level: keyof typeof PRESETS, seed: number): RankedMove[] {
  const first = reveal(newGame(PRESETS[level], true), 4, 4, 0, seed);
  const moves: RankedMove[] = [['r', 4, 4]];
  first.board.forEach((row, r) => row.forEach((c, col) => !c.isMine && moves.push(['r', r, col])));
  return moves;
}

describe('replayRanked', () => {
  it('confirms a real win on the board the seed deals', () => {
    expect(replayRanked('beginner', SEED, true, winningMoves('beginner', SEED)).status).toBe('won');
    expect(replayRanked('expert', SEED, true, winningMoves('expert', SEED)).status).toBe('won');
  });

  it('rejects the same moves on another seed: they are a different board', () => {
    expect(replayRanked('beginner', SEED + 1, true, winningMoves('beginner', SEED)).status).not.toBe('won');
  });

  it('does not count an unfinished game', () => {
    expect(replayRanked('beginner', SEED, true, winningMoves('beginner', SEED).slice(0, 3)).status).toBe('playing');
  });

  it('ignores moves off the board and stops at the end of the game', () => {
    const moves: RankedMove[] = [['r', -1, 0], ['f', 99, 99], ['c', 1.5, 2], ...winningMoves('beginner', SEED), ['f', 0, 0]];
    expect(replayRanked('beginner', SEED, true, moves).status).toBe('won');
  });

  it('honours flags and marks the way the browser did', () => {
    // Flag a cell twice with marks on: flag, then ?. With marks switched off first, the second click clears it.
    const withMarks = replayRanked('beginner', SEED, true, [['f', 0, 0], ['f', 0, 0]]);
    expect(withMarks.board[0][0].state).toBe('questioned');
    const noMarks = replayRanked('beginner', SEED, true, [['m', 0], ['f', 0, 0], ['f', 0, 0]]);
    expect(noMarks.board[0][0].state).toBe('hidden');
  });
});
