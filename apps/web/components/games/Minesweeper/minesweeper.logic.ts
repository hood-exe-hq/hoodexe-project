import type { Board, Cell, DifficultyConfig, GameState, PresetDifficulty } from './minesweeper.types';

/**
 * Classic Windows Minesweeper (hood-exe-minesweeper-brief.md §2, §5). Pure: no DOM, no React. Every function
 * returns a new board or state and leaves its input untouched, so the hook's reducer stays a plain function.
 */

export const PRESETS: Record<PresetDifficulty, DifficultyConfig> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

/** Custom boards: up to 30 wide × 24 tall, with room for the 3 × 3 first-click safe zone. */
export const CUSTOM_LIMITS = { minRows: 3, maxRows: 24, minCols: 3, maxCols: 30, safeCells: 9 } as const;

export const MAX_SECONDS = 999;

// ── Random ────────────────────────────────────────────────────────────────────

/** Small seeded PRNG (mulberry32), so mine placement is reproducible from a seed. */
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

// ── Board ─────────────────────────────────────────────────────────────────────

const inBounds = (board: Board, r: number, c: number) => r >= 0 && r < board.length && c >= 0 && c < board[0].length;

/** The up-to-8 cells touching (row, col). */
export function neighbors(board: Board, row: number, col: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if ((dr || dc) && inBounds(board, row + dr, col + dc)) out.push([row + dr, col + dc]);
    }
  }
  return out;
}

const copy = (board: Board): Board => board.map((row) => row.map((cell) => ({ ...cell })));

export function createEmptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, (): Cell => ({ isMine: false, adjacentMines: 0, state: 'hidden' })));
}

/**
 * Places `mines` mines anywhere except the first-clicked cell and its 8 neighbours, so the first click always
 * opens an area (§2.2). If the board is too small for that, the safe zone shrinks to the clicked cell alone.
 */
export function placeMines(board: Board, mines: number, safeRow: number, safeCol: number, rand: () => number = Math.random): Board {
  const next = copy(board);
  const all: [number, number][] = next.flatMap((row, r) => row.map((_, c) => [r, c] as [number, number]));
  const outsideZone = all.filter(([r, c]) => Math.abs(r - safeRow) > 1 || Math.abs(c - safeCol) > 1);
  const pool = outsideZone.length >= mines ? outsideZone : all.filter(([r, c]) => r !== safeRow || c !== safeCol);
  const count = Math.min(mines, pool.length);
  // Partial Fisher–Yates: the first `count` entries become a uniform random sample.
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    const [r, c] = pool[i];
    next[r][c].isMine = true;
  }
  return next;
}

export function computeAdjacency(board: Board): Board {
  return board.map((row, r) =>
    row.map((cell, c) => ({ ...cell, adjacentMines: neighbors(board, r, c).filter(([nr, nc]) => board[nr][nc].isMine).length })),
  );
}

/** Reveals one cell, flood-filling (BFS) outward from cells with no mines around them. Flagged cells are left alone. */
export function revealCell(board: Board, row: number, col: number): { board: Board; hitMine: boolean } {
  const start = board[row]?.[col];
  if (!start || start.state === 'revealed' || start.state === 'flagged') return { board, hitMine: false };
  const next = copy(board);
  if (start.isMine) {
    next[row][col].state = 'revealed';
    return { board: next, hitMine: true };
  }
  const queue: [number, number][] = [[row, col]];
  next[row][col].state = 'revealed';
  while (queue.length) {
    const [r, c] = queue.shift()!;
    if (next[r][c].adjacentMines !== 0) continue;
    for (const [nr, nc] of neighbors(next, r, c)) {
      const n = next[nr][nc];
      if (n.state === 'revealed' || n.state === 'flagged' || n.isMine) continue;
      n.state = 'revealed';
      queue.push([nr, nc]);
    }
  }
  return { board: next, hitMine: false };
}

/** Right-click on a covered cell: none → flag → ? → none, or none → flag → none without marks. */
export function toggleFlag(board: Board, row: number, col: number, marksEnabled: boolean): Board {
  const cell = board[row]?.[col];
  if (!cell || cell.state === 'revealed') return board;
  const state = cell.state === 'hidden' ? 'flagged' : cell.state === 'flagged' && marksEnabled ? 'questioned' : 'hidden';
  const next = board.map((r) => r.slice());
  next[row][col] = { ...cell, state };
  return next;
}

/**
 * Chord (§5.4): on a revealed number whose flagged neighbours add up to that number, reveal every other covered
 * neighbour at once. A wrong flag means one of them is a mine, and the game is lost.
 */
export function chordReveal(board: Board, row: number, col: number): { board: Board; hitMine: boolean } {
  const cell = board[row]?.[col];
  if (!cell || cell.state !== 'revealed' || cell.adjacentMines === 0) return { board, hitMine: false };
  const around = neighbors(board, row, col);
  const flags = around.filter(([r, c]) => board[r][c].state === 'flagged').length;
  if (flags !== cell.adjacentMines) return { board, hitMine: false };
  let next = board;
  let hitMine = false;
  for (const [r, c] of around) {
    const res = revealCell(next, r, c);
    next = res.board;
    hitMine ||= res.hitMine;
  }
  return { board: next, hitMine };
}

/** Won once every cell that isn't a mine is revealed. */
export function isWon(board: Board): boolean {
  return board.every((row) => row.every((cell) => cell.isMine || cell.state === 'revealed'));
}

/**
 * The loss board: every unflagged mine is shown, the exploded one included. Correct flags stay flags; a flag on a
 * cell with no mine stays `flagged` with `isMine: false`, which the board draws as a crossed-out mine.
 */
export function revealAllMines(board: Board, exploded: { row: number; col: number }): Board {
  return board.map((row, r) =>
    row.map((cell, c) => {
      if (r === exploded.row && c === exploded.col) return { ...cell, state: 'revealed' };
      if (cell.isMine && cell.state !== 'flagged') return { ...cell, state: 'revealed' };
      return cell;
    }),
  );
}

/** The win board: classic Minesweeper flags every remaining mine for you. */
export function flagAllMines(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell.isMine && cell.state !== 'flagged' ? { ...cell, state: 'flagged' } : cell)));
}

export const countFlags = (board: Board) => board.reduce((n, row) => n + row.filter((c) => c.state === 'flagged').length, 0);
export const countRevealed = (board: Board) => board.reduce((n, row) => n + row.filter((c) => c.state === 'revealed' && !c.isMine).length, 0);

/** A cell is wrongly flagged once the game is lost and there was no mine under the flag. */
export const isWrongFlag = (cell: Cell, status: GameState['status']) => status === 'lost' && cell.state === 'flagged' && !cell.isMine;

// ── Custom difficulty ─────────────────────────────────────────────────────────

/** Validates the Custom… dialog (§2.3, §8). Returns an error message, or null when the board is playable. */
export function validateCustom({ rows, cols, mines }: DifficultyConfig): string | null {
  const { minRows, maxRows, minCols, maxCols, safeCells } = CUSTOM_LIMITS;
  if (![rows, cols, mines].every(Number.isInteger)) return 'Height, width and mines must be whole numbers.';
  if (rows < minRows || rows > maxRows) return `Height must be between ${minRows} and ${maxRows}.`;
  if (cols < minCols || cols > maxCols) return `Width must be between ${minCols} and ${maxCols}.`;
  if (mines < 0) return 'Mines can’t be negative.';
  const max = rows * cols - safeCells;
  if (mines > max) return `A ${cols} × ${rows} board takes at most ${max} mines (it needs ${safeCells} safe cells for the first click).`;
  return null;
}

// ── Game state ────────────────────────────────────────────────────────────────

export function newGame({ rows, cols, mines }: DifficultyConfig, marksEnabled: boolean): GameState {
  return {
    board: createEmptyBoard(rows, cols),
    rows,
    cols,
    mines,
    flagsPlaced: 0,
    status: 'idle',
    startedAt: null,
    endedAt: null,
    firstClick: true,
    mineExploded: null,
    marksEnabled,
    moves: 0,
  };
}

const over = (s: GameState) => s.status === 'won' || s.status === 'lost';

/** Ends the game if that move hit a mine or cleared the board; otherwise just stores the new board. */
function settle(s: GameState, board: Board, hitMine: boolean, at: { row: number; col: number }, now: number): GameState {
  if (hitMine) {
    const mine = board[at.row][at.col].isMine ? at : findExploded(s.board, board) ?? at;
    return { ...s, board: revealAllMines(board, mine), status: 'lost', endedAt: now, mineExploded: mine, moves: s.moves + 1 };
  }
  if (isWon(board)) {
    const won = flagAllMines(board);
    return { ...s, board: won, flagsPlaced: countFlags(won), status: 'won', endedAt: now, moves: s.moves + 1 };
  }
  return { ...s, board, moves: board === s.board ? s.moves : s.moves + 1 };
}

/** After a chord, the mine that went off is the one that just turned revealed. */
function findExploded(before: Board, after: Board): { row: number; col: number } | null {
  for (let r = 0; r < after.length; r++) {
    for (let c = 0; c < after[r].length; c++) {
      if (after[r][c].isMine && after[r][c].state === 'revealed' && before[r][c].state !== 'revealed') return { row: r, col: c };
    }
  }
  return null;
}

/** Left-click. The first one places the mines around a safe zone and starts the clock. */
export function reveal(s: GameState, row: number, col: number, now: number, seed: number): GameState {
  if (over(s)) return s;
  const cell = s.board[row]?.[col];
  if (!cell || cell.state === 'revealed' || cell.state === 'flagged') return s;
  let g = s;
  if (s.firstClick) {
    const board = computeAdjacency(placeMines(s.board, s.mines, row, col, random(seed)));
    g = { ...s, board, firstClick: false, status: 'playing', startedAt: now };
  }
  const res = revealCell(g.board, row, col);
  return settle(g, res.board, res.hitMine, { row, col }, now);
}

/** Right-click: cycles the flag and keeps the mine counter in step. Works before the first click too. */
export function flag(s: GameState, row: number, col: number): GameState {
  if (over(s)) return s;
  const board = toggleFlag(s.board, row, col, s.marksEnabled);
  if (board === s.board) return s;
  return { ...s, board, flagsPlaced: countFlags(board) };
}

/** Both buttons (or middle-click) on a revealed number. */
export function chord(s: GameState, row: number, col: number, now: number): GameState {
  if (s.status !== 'playing') return s;
  const res = chordReveal(s.board, row, col);
  if (res.board === s.board) return s;
  return settle(s, res.board, res.hitMine, { row, col }, now);
}

/** Turning marks off clears any ? already on the board, as in Windows. */
export function setMarks(s: GameState, marksEnabled: boolean): GameState {
  const board = marksEnabled ? s.board : s.board.map((row) => row.map((c) => (c.state === 'questioned' ? { ...c, state: 'hidden' as const } : c)));
  return { ...s, board, marksEnabled };
}

/**
 * The clock, as Windows counts it: 0 before the first click, 1 the moment it lands, then +1 a second; it stops
 * when the game ends and caps at 999. Always computed from timestamps, so it never drifts. Best times use it too.
 */
export function elapsedSeconds(s: Pick<GameState, 'startedAt' | 'endedAt'>, now: number): number {
  if (s.startedAt == null) return 0;
  return Math.min(MAX_SECONDS, Math.floor(((s.endedAt ?? now) - s.startedAt) / 1_000) + 1);
}
