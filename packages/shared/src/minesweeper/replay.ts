import { PRESETS, chord, flag, newGame, reveal, setMarks } from './logic';
import type { GameState, PresetDifficulty } from './types';

/**
 * One input of a ranked game, as the browser records it: reveal, flag (the right-click cycle) or chord at a cell,
 * or Marks (?) switched off (0) or on (1). Only inputs that changed the game are recorded.
 */
export type RankedMove = ['r' | 'f' | 'c', number, number] | ['m', 0 | 1];

/** No real game needs more: Expert has 480 cells. Keeps a replay cheap for the server. */
export const MAX_RANKED_MOVES = 3_000;

/**
 * Plays a ranked game back on the board `seed` deals for `level`: the server's check that a claimed win is real.
 * Times play no part (the server clocks ranked runs itself), and so neither does the order of wall-clock events.
 */
export function replayRanked(level: PresetDifficulty, seed: number, marksEnabled: boolean, moves: readonly RankedMove[]): GameState {
  let s = newGame(PRESETS[level], marksEnabled);
  for (const m of moves.slice(0, MAX_RANKED_MOVES)) {
    if (s.status === 'won' || s.status === 'lost') break;
    if (m[0] === 'm') s = setMarks(s, m[1] === 1);
    else if (m[0] === 'r') s = reveal(s, m[1], m[2], 0, seed);
    else if (m[0] === 'f') s = flag(s, m[1], m[2]);
    else s = chord(s, m[1], m[2], 0);
  }
  return s;
}
