export type Difficulty = 'beginner' | 'intermediate' | 'expert' | 'custom';
export type PresetDifficulty = Exclude<Difficulty, 'custom'>;

export type CellState = 'hidden' | 'revealed' | 'flagged' | 'questioned';

export type Cell = {
  isMine: boolean;
  /** 0–8 */
  adjacentMines: number;
  state: CellState;
};

export type Board = Cell[][];

export type GameStatus = 'idle' | 'playing' | 'won' | 'lost';

export type DifficultyConfig = { rows: number; cols: number; mines: number };

export type GameState = {
  board: Board;
  rows: number;
  cols: number;
  mines: number;
  flagsPlaced: number;
  status: GameStatus;
  /** null until the first click */
  startedAt: number | null;
  endedAt: number | null;
  /** True until the first reveal places the mines. */
  firstClick: boolean;
  mineExploded: { row: number; col: number } | null;
  marksEnabled: boolean;
  /** Reveals and chords that changed the board. */
  moves: number;
};

/** What a finished, won game reports to whoever hosts the game (hood-exe-minesweeper-brief.md §10). */
export type WinResult = { difficulty: Difficulty; time: number; movesMade: number; timestamp: number };
