import type { HTMLAttributes, Ref } from 'react';
import { Cell } from './Cell';
import type { GameState } from './minesweeper.types';
import styles from './minesweeper.module.css';

type Props = {
  state: Pick<GameState, 'board' | 'status' | 'mineExploded' | 'cols'>;
  /** Cells drawn held down, as row * cols + col. */
  pressed?: ReadonlySet<number>;
  ref?: Ref<HTMLDivElement>;
  /** Pointer handlers from the game (the board is presentational). */
  handlers?: HTMLAttributes<HTMLDivElement>;
};

const NONE: ReadonlySet<number> = new Set();

/** The sunken grid of cells. Its size comes from the `--cell` CSS variable set by the game. */
export function Board({ state, pressed = NONE, ref, handlers }: Props) {
  const { board, status, mineExploded, cols } = state;
  return (
    <div ref={ref} className={styles.board} role="grid" aria-label="Minefield" style={{ gridTemplateColumns: `repeat(${cols}, var(--cell))` }} {...handlers}>
      {board.map((row, r) => (
        <div key={r} role="row" className={styles.row}>
          {row.map((cell, c) => (
            <Cell
              key={c}
              cell={cell}
              row={r}
              col={c}
              status={status}
              exploded={mineExploded?.row === r && mineExploded.col === c}
              pressed={cell.state !== 'revealed' && pressed.has(r * cols + c)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
