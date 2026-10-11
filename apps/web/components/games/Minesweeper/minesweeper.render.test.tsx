import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Board } from './Board';
import { Counter, counterText } from './Counter';
import { PRESETS, computeAdjacency, createEmptyBoard, flag, newGame, reveal } from './minesweeper.logic';
import type { GameState } from './minesweeper.types';
import { SmileyButton } from './SmileyButton';

/** A compact picture of the rendered board: one character per cell, from its accessible label. */
function picture(html: string, cols: number): string[] {
  const glyph: Record<string, string> = { covered: '#', empty: '.', mine: '*', flag: 'F', 'wrong flag': 'X', 'question mark': '?' };
  const cells = [...html.matchAll(/<div class="[^"]*" role="gridcell" aria-label="([^"]+)"/g)].map(([, label]) => glyph[label] ?? label);
  return Array.from({ length: cells.length / cols }, (_, r) => cells.slice(r * cols, (r + 1) * cols).join(''));
}

/** Fixed mines for the won / lost boards: `*` is a mine. */
function fixed(rows: string[]): GameState {
  const b = createEmptyBoard(rows.length, rows[0].length);
  rows.forEach((line, r) => [...line].forEach((ch, c) => (b[r][c].isMine = ch === '*')));
  const mines = b.flat().filter((c) => c.isMine).length;
  return { ...newGame({ rows: rows.length, cols: rows[0].length, mines }, true), board: computeAdjacency(b), status: 'playing', firstClick: false, startedAt: 0 };
}

describe('fresh boards', () => {
  it.each(Object.entries(PRESETS))('%s renders rows × cols covered cells', (_, cfg) => {
    const html = renderToStaticMarkup(<Board state={newGame(cfg, true)} />);
    const pic = picture(html, cfg.cols);
    expect(pic).toHaveLength(cfg.rows);
    expect(pic.every((row) => row === '#'.repeat(cfg.cols))).toBe(true);
    expect(html.match(/role="row"/g)).toHaveLength(cfg.rows);
  });

  it('beginner markup', () => {
    expect(renderToStaticMarkup(<Board state={newGame(PRESETS.beginner, true)} />)).toMatchSnapshot();
  });
});

describe('finished games', () => {
  const rows = ['*...', '....', '..*.', '....'];

  it('won: every safe cell open, mines flagged, sunglasses', () => {
    let g = fixed(rows);
    for (const [r, c] of [
      [0, 3],
      [0, 1],
      [1, 0],
      [0, 2],
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 0],
      [2, 1],
      [2, 3],
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
    ])
      g = reveal(g, r, c, 1_000, 1);
    expect(g.status).toBe('won');
    expect(picture(renderToStaticMarkup(<Board state={g} />), 4)).toMatchInlineSnapshot(`
      [
        "F1..",
        "1211",
        ".1F1",
        ".111",
      ]
    `);
    expect(renderToStaticMarkup(<SmileyButton face="win" onClick={() => {}} />)).toMatchSnapshot();
  });

  it('lost: the exploded mine is red, other mines shown, a wrong flag crossed out', () => {
    let g = flag(fixed(rows), 3, 3); // wrong flag
    g = reveal(g, 0, 0, 1_000, 1); // boom
    expect(g.status).toBe('lost');
    const html = renderToStaticMarkup(<Board state={g} />);
    expect(picture(html, 4)).toEqual(['*###', '####', '##*#', '###X']);
    expect(html).toMatchSnapshot();
    expect(renderToStaticMarkup(<SmileyButton face="dead" onClick={() => {}} />)).toMatchSnapshot();
  });
});

describe('counters', () => {
  it('pad to three digits, show a minus, clamp', () => {
    expect([10, 0, 7, -5, -120, 1234].map(counterText)).toEqual(['010', '000', '007', '-05', '-99', '999']);
  });

  it('draws one seven-segment digit per character', () => {
    const html = renderToStaticMarkup(<Counter label="Mines left" value={10} />);
    expect(html.match(/<svg/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Mines left: 10"');
  });
});
