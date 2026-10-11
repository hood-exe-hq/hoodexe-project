import { memo } from 'react';
import { isWrongFlag } from './minesweeper.logic';
import type { Cell as CellT, GameStatus } from './minesweeper.types';
import styles from './minesweeper.module.css';

/** Pixel-art icons on a 16-unit grid, as on the classic board (crisp at 1×, still sharp scaled up). */
export function MineIcon({ crossed = false }: { crossed?: boolean }) {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="7" y="1" width="2" height="14" fill="#000" />
      <rect x="1" y="7" width="14" height="2" fill="#000" />
      <rect x="3" y="3" width="2" height="2" fill="#000" />
      <rect x="11" y="3" width="2" height="2" fill="#000" />
      <rect x="3" y="11" width="2" height="2" fill="#000" />
      <rect x="11" y="11" width="2" height="2" fill="#000" />
      <rect x="4" y="5" width="8" height="6" fill="#000" />
      <rect x="5" y="4" width="6" height="8" fill="#000" />
      <rect x="6" y="6" width="2" height="2" fill="#fff" />
      {crossed && <path d="M2 2 L14 14 M14 2 L2 14" stroke="#f00" strokeWidth="1.6" shapeRendering="geometricPrecision" />}
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M10 1 V9 H8 V8 H6 V7 H4 V6 H2 V4 H4 V3 H6 V2 H8 V1 Z" fill="#f00" />
      <rect x="9" y="9" width="2" height="3" fill="#000" />
      <rect x="6" y="11" width="8" height="2" fill="#000" />
      <rect x="3" y="13" width="13" height="2" fill="#000" />
    </svg>
  );
}

type Props = {
  cell: CellT;
  row: number;
  col: number;
  status: GameStatus;
  exploded: boolean;
  /** Held down under the mouse (or the 3 × 3 of a chord): drawn sunken but still covered. */
  pressed: boolean;
};

const LABEL = (cell: CellT, status: GameStatus) => {
  if (isWrongFlag(cell, status)) return 'wrong flag';
  if (cell.state === 'flagged') return 'flag';
  if (cell.state === 'questioned') return 'question mark';
  if (cell.state === 'hidden') return 'covered';
  return cell.isMine ? 'mine' : cell.adjacentMines ? String(cell.adjacentMines) : 'empty';
};

/** One square. Rows and columns ride along as data attributes, so the board finds the cell under a pointer. */
export const Cell = memo(function Cell({ cell, row, col, status, exploded, pressed }: Props) {
  const open = cell.state === 'revealed';
  const cls = [styles.cell, open || pressed ? styles.open : styles.covered, exploded && styles.exploded, open && !cell.isMine && cell.adjacentMines ? styles[`n${cell.adjacentMines}`] : null]
    .filter(Boolean)
    .join(' ');

  let content = null;
  if (isWrongFlag(cell, status)) content = <MineIcon crossed />;
  else if (cell.state === 'flagged') content = <FlagIcon />;
  else if (cell.state === 'questioned') content = '?';
  else if (open && cell.isMine) content = <MineIcon />;
  else if (open && cell.adjacentMines) content = cell.adjacentMines;

  return (
    <div className={cls} role="gridcell" aria-label={LABEL(cell, status)} data-cell="" data-r={row} data-c={col}>
      {content}
    </div>
  );
});
