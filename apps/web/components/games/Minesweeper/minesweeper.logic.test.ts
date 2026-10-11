import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  chord,
  chordReveal,
  computeAdjacency,
  createEmptyBoard,
  elapsedSeconds,
  flag,
  isWon,
  isWrongFlag,
  newGame,
  placeMines,
  random,
  reveal,
  revealAllMines,
  revealCell,
  setMarks,
  toggleFlag,
  validateCustom,
} from './minesweeper.logic';
import type { Board, CellState, GameState } from './minesweeper.types';

/** A board from a picture: `*` is a mine, `.` is not. Adjacency is filled in. */
function board(rows: string[]): Board {
  const b = createEmptyBoard(rows.length, rows[0].length);
  rows.forEach((line, r) => [...line].forEach((ch, c) => (b[r][c].isMine = ch === '*')));
  return computeAdjacency(b);
}

const states = (b: Board) => b.map((row) => row.map((c) => ({ hidden: '#', revealed: c.isMine ? '*' : String(c.adjacentMines), flagged: 'F', questioned: '?' })[c.state]).join(''));
const set = (b: Board, r: number, c: number, state: CellState): Board => b.map((row, i) => row.map((cell, j) => (i === r && j === c ? { ...cell, state } : cell)));

/** A game already past its first click, on a fixed board. */
function playing(rows: string[], over: Partial<GameState> = {}): GameState {
  const b = board(rows);
  const mines = b.flat().filter((c) => c.isMine).length;
  return { ...newGame({ rows: b.length, cols: b[0].length, mines }, true), board: b, status: 'playing', firstClick: false, startedAt: 0, ...over };
}

describe('createEmptyBoard', () => {
  it('has the requested dimensions, all covered, no mines', () => {
    const b = createEmptyBoard(16, 30);
    expect(b).toHaveLength(16);
    expect(b.every((row) => row.length === 30)).toBe(true);
    expect(b.flat().every((c) => !c.isMine && c.state === 'hidden' && c.adjacentMines === 0)).toBe(true);
  });
});

describe('placeMines', () => {
  it.each(Object.entries(PRESETS))('%s: exactly N mines, none in the 3 × 3 around the first click', (_, { rows, cols, mines }) => {
    for (let seed = 1; seed <= 50; seed++) {
      const r = seed % rows;
      const c = (seed * 7) % cols;
      const b = placeMines(createEmptyBoard(rows, cols), mines, r, c, random(seed));
      expect(b.flat().filter((x) => x.isMine)).toHaveLength(mines);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) expect(b[r + dr]?.[c + dc]?.isMine ?? false).toBe(false);
    }
  });

  it('does not change the board it was given', () => {
    const empty = createEmptyBoard(9, 9);
    placeMines(empty, 10, 4, 4, random(1));
    expect(empty.flat().some((c) => c.isMine)).toBe(false);
  });

  it('is reproducible from a seed', () => {
    const a = placeMines(createEmptyBoard(9, 9), 10, 0, 0, random(7));
    const b = placeMines(createEmptyBoard(9, 9), 10, 0, 0, random(7));
    expect(a).toEqual(b);
  });
});

describe('computeAdjacency', () => {
  it('counts the mines in the 8 neighbours', () => {
    const b = board(['*..', '.*.', '...']);
    expect(b.map((row) => row.map((c) => c.adjacentMines))).toEqual([
      [1, 2, 1],
      [2, 1, 1],
      [1, 1, 1],
    ]);
  });
});

describe('revealCell', () => {
  it('flood-fills from a 0 up to the numbers around it', () => {
    const b = board(['....', '....', '...*', '....']);
    const { board: next, hitMine } = revealCell(b, 0, 0);
    expect(hitMine).toBe(false);
    expect(states(next)).toEqual(['0000', '0011', '001#', '001#']);
  });

  it('a number reveals only itself', () => {
    expect(states(revealCell(board(['*..', '...']), 0, 1).board)).toEqual(['#1#', '###']);
  });

  it('reports a mine', () => {
    const { board: next, hitMine } = revealCell(board(['*.', '..']), 0, 0);
    expect(hitMine).toBe(true);
    expect(next[0][0].state).toBe('revealed');
  });

  it('leaves flagged cells alone, including in the flood', () => {
    const b = set(board(['...', '...', '...']), 2, 2, 'flagged');
    expect(revealCell(b, 2, 2).board).toBe(b);
    expect(states(revealCell(b, 0, 0).board)).toEqual(['000', '000', '00F']);
  });
});

describe('toggleFlag', () => {
  it('cycles none → flag → ? → none when marks are on', () => {
    let b = board(['..']);
    b = toggleFlag(b, 0, 0, true);
    expect(b[0][0].state).toBe('flagged');
    b = toggleFlag(b, 0, 0, true);
    expect(b[0][0].state).toBe('questioned');
    b = toggleFlag(b, 0, 0, true);
    expect(b[0][0].state).toBe('hidden');
  });

  it('cycles none → flag → none when marks are off', () => {
    let b = board(['..']);
    b = toggleFlag(b, 0, 0, false);
    expect(b[0][0].state).toBe('flagged');
    b = toggleFlag(b, 0, 0, false);
    expect(b[0][0].state).toBe('hidden');
  });

  it('does nothing on a revealed cell', () => {
    const b = set(board(['..']), 0, 0, 'revealed');
    expect(toggleFlag(b, 0, 0, true)).toBe(b);
  });
});

describe('chordReveal', () => {
  // The 1 at (1,1) touches one mine, at (0,0).
  const base = revealCell(board(['*..', '...', '...']), 1, 1).board;

  it('does nothing until the flags around the number equal it', () => {
    expect(chordReveal(base, 1, 1).board).toBe(base);
    const twoFlags = set(set(base, 0, 0, 'flagged'), 0, 1, 'flagged');
    expect(chordReveal(twoFlags, 1, 1).board).toBe(twoFlags);
  });

  it('reveals the other neighbours (with flood fill) once they match', () => {
    const { board: next, hitMine } = chordReveal(set(base, 0, 0, 'flagged'), 1, 1);
    expect(hitMine).toBe(false);
    expect(states(next)).toEqual(['F10', '110', '000']);
  });

  it('a wrong flag sets off the real mine', () => {
    const { hitMine } = chordReveal(set(base, 0, 1, 'flagged'), 1, 1);
    expect(hitMine).toBe(true);
  });
});

describe('isWon', () => {
  it('only once every non-mine cell is revealed', () => {
    const b = board(['*.', '..']);
    expect(isWon(b)).toBe(false);
    const almost = revealCell(revealCell(b, 0, 1).board, 1, 0).board;
    expect(isWon(almost)).toBe(false);
    expect(isWon(revealCell(almost, 1, 1).board)).toBe(true);
  });

  it('flags on mines are not needed', () => {
    expect(isWon(set(board(['*']), 0, 0, 'hidden'))).toBe(true);
  });
});

describe('revealAllMines', () => {
  it('shows every unflagged mine, keeps correct flags, leaves wrong flags flagged', () => {
    let b = board(['*.*', '...', '*..']);
    b = set(set(b, 0, 2, 'flagged'), 1, 1, 'flagged');
    const lost = revealAllMines(revealCell(b, 0, 0).board, { row: 0, col: 0 });
    expect(states(lost)).toEqual(['*#F', '#F#', '*##']);
    expect(isWrongFlag(lost[1][1], 'lost')).toBe(true);
    expect(isWrongFlag(lost[0][2], 'lost')).toBe(false);
  });
});

describe('game', () => {
  it('first click: never a mine, never a number, starts the clock', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = reveal(newGame(PRESETS.expert, true), 8, 15, 1_000, seed);
      expect(g.status).not.toBe('lost');
      expect(g.board[8][15].adjacentMines).toBe(0);
      expect(g.startedAt).toBe(1_000);
      expect(g.board.flat().filter((c) => c.isMine)).toHaveLength(99);
    }
  });

  it('0 mines: the first click wins', () => {
    const g = reveal(newGame({ rows: 3, cols: 3, mines: 0 }, true), 1, 1, 0, 1);
    expect(g.status).toBe('won');
  });

  it('hitting a mine loses and remembers which one exploded', () => {
    const g = reveal(playing(['*.', '..']), 0, 0, 5_000, 1);
    expect(g.status).toBe('lost');
    expect(g.mineExploded).toEqual({ row: 0, col: 0 });
    expect(g.endedAt).toBe(5_000);
    expect(reveal(g, 0, 1, 6_000, 1)).toBe(g); // the board is frozen
  });

  it('a chord that hits a mine points at that mine', () => {
    let g = playing(['*..', '...', '...']);
    g = reveal(g, 1, 1, 0, 1);
    g = flag(g, 0, 1);
    g = chord(g, 1, 1, 0);
    expect(g.status).toBe('lost');
    expect(g.mineExploded).toEqual({ row: 0, col: 0 });
  });

  it('winning flags the remaining mines and zeroes the counter', () => {
    const g = reveal(playing(['*.', '..']), 1, 1, 0, 1);
    expect(g.status).toBe('playing');
    const won = reveal(reveal(g, 0, 1, 0, 1), 1, 0, 0, 1);
    expect(won.status).toBe('won');
    expect(won.board[0][0].state).toBe('flagged');
    expect(won.mines - won.flagsPlaced).toBe(0);
  });

  it('flags count toward the mine counter and protect the cell', () => {
    let g = flag(playing(['*.', '..']), 1, 1);
    expect(g.flagsPlaced).toBe(1);
    expect(reveal(g, 1, 1, 0, 1)).toBe(g);
    g = flag(g, 1, 1); // → ?
    expect(g.flagsPlaced).toBe(0);
    expect(reveal(g, 1, 1, 0, 1).board[1][1].state).toBe('revealed'); // a ? can be revealed
  });

  it('counts moves', () => {
    let g = reveal(playing(['*..', '...', '...']), 2, 2, 0, 1);
    expect(g.moves).toBe(1);
    g = reveal(g, 2, 2, 0, 1); // already open
    expect(g.moves).toBe(1);
  });

  it('turning marks off clears the ? marks', () => {
    let g = flag(flag(playing(['*.']), 0, 1), 0, 1);
    expect(g.board[0][1].state).toBe('questioned');
    g = setMarks(g, false);
    expect(g.board[0][1].state).toBe('hidden');
    expect(g.marksEnabled).toBe(false);
  });

  it('the clock shows 1 on the first click, stops at the end, caps at 999', () => {
    expect(elapsedSeconds({ startedAt: null, endedAt: null }, 50_000)).toBe(0);
    expect(elapsedSeconds({ startedAt: 1_000, endedAt: null }, 1_000)).toBe(1);
    expect(elapsedSeconds({ startedAt: 1_000, endedAt: null }, 3_500)).toBe(3);
    expect(elapsedSeconds({ startedAt: 1_000, endedAt: 3_500 }, 99_000)).toBe(3);
    expect(elapsedSeconds({ startedAt: 0, endedAt: null }, 5_000_000)).toBe(999);
  });
});

describe('validateCustom', () => {
  it('accepts the presets and the edges', () => {
    for (const p of Object.values(PRESETS)) expect(validateCustom(p)).toBeNull();
    expect(validateCustom({ rows: 24, cols: 30, mines: 711 })).toBeNull();
    expect(validateCustom({ rows: 3, cols: 3, mines: 0 })).toBeNull();
  });

  it('rejects boards out of range, too many mines, and non-integers', () => {
    expect(validateCustom({ rows: 25, cols: 9, mines: 10 })).toMatch(/Height/);
    expect(validateCustom({ rows: 9, cols: 31, mines: 10 })).toMatch(/Width/);
    expect(validateCustom({ rows: 2, cols: 9, mines: 1 })).toMatch(/Height/);
    expect(validateCustom({ rows: 9, cols: 9, mines: 73 })).toMatch(/at most 72/);
    expect(validateCustom({ rows: 9, cols: 9, mines: -1 })).toMatch(/negative/);
    expect(validateCustom({ rows: 9.5, cols: 9, mines: 10 })).toMatch(/whole/);
  });
});
