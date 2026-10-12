'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Board } from './Board';
import { FlagIcon } from './Cell';
import { Counter } from './Counter';
import { elapsedSeconds, neighbors } from './minesweeper.logic';
import type { GameState } from './minesweeper.types';
import { SmileyButton, type Face } from './SmileyButton';
import type { MinesweeperGame } from './useMinesweeper';
import styles from './minesweeper.module.css';

/** Largest cell, in px; smaller boards don't grow past it. Mouse boards shrink to 16px, touch boards to 22px and then scroll. */
export const CELL_MAX = 32;
const CELL_MIN = { mouse: 16, touch: 22 } as const;
/** The board's sunken border, both sides. */
export const BOARD_BORDER = 6;
const LONG_PRESS_MS = 500;
const TAP_SLOP = 10;
const ZOOM = { min: 0.6, max: 2.5, step: 1.25 } as const;

type Pos = { row: number; col: number };
type Mode = 'reveal' | 'flag';

const COARSE = '(pointer: coarse)';
const subscribeCoarse = (cb: () => void) => {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isCoarse = () => window.matchMedia(COARSE).matches;

const over = (s: GameState) => s.status === 'won' || s.status === 'lost';
const coverable = (s: GameState, r: number, c: number) => s.board[r][c].state === 'hidden' || s.board[r][c].state === 'questioned';

/** The clock re-reads time ten times a second but only re-renders when the second changes (§5.5). */
function Clock({ startedAt, endedAt }: Pick<GameState, 'startedAt' | 'endedAt'>) {
  // The last reading, tagged with the game it belongs to so a new game never flashes the old time.
  const [tick, setTick] = useState({ startedAt: null as number | null, seconds: 0 });
  useEffect(() => {
    if (startedAt == null || endedAt != null) return;
    const id = window.setInterval(() => {
      const seconds = elapsedSeconds({ startedAt, endedAt }, Date.now());
      setTick((t) => (t.startedAt === startedAt && t.seconds === seconds ? t : { startedAt, seconds }));
    }, 100);
    return () => window.clearInterval(id);
  }, [startedAt, endedAt]);
  const seconds =
    startedAt == null ? 0 : endedAt != null ? elapsedSeconds({ startedAt, endedAt }, endedAt) : tick.startedAt === startedAt ? tick.seconds : 1;
  return <Counter timer label="Time" value={seconds} />;
}

type Props = {
  game: MinesweeperGame;
  /** Whether this window has focus; Space flags the hovered cell only then. */
  active: boolean;
  /** The scrolling area around the board; the window measures it to fit itself to the board. */
  scrollerRef: RefObject<HTMLDivElement | null>;
};

/**
 * The playable game (hood-exe-minesweeper-brief.md §3–4, §7): counters, face, board, and every input. Mouse:
 * left reveals on release, right cycles the flag on press, both buttons or the middle button chord. Touch: tap
 * reveals (or flags in flag mode), a long press flags, two fingers pinch to zoom.
 */
export function Minesweeper({ game, active, scrollerRef }: Props) {
  const { state, flag } = game;
  const coarse = useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
  const [mode, setMode] = useState<Mode>('reveal');
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<number>(CELL_MAX);
  const boardRef = useRef<HTMLDivElement>(null);

  // ── Cell size: as big as fits the scroller (up to CELL_MAX), times the pinch zoom ──
  const { rows, cols } = state;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // clientWidth/Height round to whole pixels, possibly up; the spare pixel keeps a fitted board from
    // overflowing by a fraction and pulling in scrollbars.
    const measure = () => setFit(Math.floor(Math.min((el.clientWidth - BOARD_BORDER - 1) / cols, (el.clientHeight - BOARD_BORDER - 1) / rows)));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollerRef, rows, cols]);
  const base = Math.max(coarse ? CELL_MIN.touch : CELL_MIN.mouse, Math.min(CELL_MAX, fit));
  const cell = Math.round(base * (coarse ? zoom : 1));
  // Scroll only when the board is meant to be bigger than its area (cells at their minimum, or pinch-zoomed). A board
  // sized to fit never scrolls, so no stray scrollbar can take room from it and crop it.
  const scrolls = cell > fit;

  // ── Pressed cells (sunken while held) and the 😮 face ──
  const [pressed, setPressed] = useState<ReadonlySet<number>>(() => new Set());
  const [holding, setHolding] = useState(false);
  const pressKey = useRef('');
  const showPress = useCallback(
    (pos: Pos | null, chording: boolean) => {
      const key = pos && !over(state) ? `${pos.row},${pos.col},${chording}` : '';
      if (key === pressKey.current) return;
      pressKey.current = key;
      setHolding(key !== '');
      if (!pos || !key) return setPressed(new Set());
      const cells = chording ? [[pos.row, pos.col] as [number, number], ...neighbors(state.board, pos.row, pos.col)] : [[pos.row, pos.col] as [number, number]];
      setPressed(new Set(cells.filter(([r, c]) => coverable(state, r, c)).map(([r, c]) => r * cols + c)));
    },
    [state, cols],
  );

  const cellAt = (x: number, y: number): Pos | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]');
    if (!el || !boardRef.current?.contains(el)) return null;
    return { row: Number(el.dataset.r), col: Number(el.dataset.c) };
  };

  // ── Mouse (and pen). A second button pressed mid-click arrives as a pointermove with new `buttons`, so every
  // event diffs `buttons` against the last one seen.
  const mouse = useRef({ buttons: 0, chording: false, chordDone: false });
  const hover = useRef<Pos | null>(null);
  const onMouse = (e: ReactPointerEvent<HTMLDivElement>) => {
    const m = mouse.current;
    const pos = cellAt(e.clientX, e.clientY);
    hover.current = pos;
    const now = e.type === 'pointercancel' ? 0 : e.buttons;
    const down = now & ~m.buttons;
    const up = m.buttons & ~now;
    m.buttons = now;
    if (e.type === 'pointercancel') {
      m.chording = m.chordDone = false;
      return showPress(null, false);
    }
    if (down) {
      if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
      if (down & 4 || (now & 3) === 3) m.chording = true;
      else if (down & 2 && pos) game.flag(pos.row, pos.col);
    }
    if (up) {
      // A chord fires when the first of the two buttons comes up; the other release does nothing.
      if (m.chording) {
        if (!m.chordDone && pos) game.chord(pos.row, pos.col);
        m.chordDone = true;
      } else if (up & 1 && pos) {
        game.reveal(pos.row, pos.col);
      }
    }
    if (now === 0) m.chording = m.chordDone = false;
    showPress((m.chording ? !m.chordDone : (now & 1) !== 0) ? pos : null, m.chording);
  };

  // ── Touch: tap, long press, pinch ──
  const touch = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    start: { x: 0, y: 0 },
    pos: null as Pos | null,
    timer: 0,
    moved: false,
    longPressed: false,
    pinch: null as { d0: number; z0: number } | null,
  });
  const clearTimer = () => window.clearTimeout(touch.current.timer);
  useEffect(() => clearTimer, []);
  const spread = () => {
    const [a, b] = [...touch.current.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };

  const onTouch = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = touch.current;
    const p = { x: e.clientX, y: e.clientY };
    if (e.type === 'pointerdown') {
      t.pointers.set(e.pointerId, p);
      if (t.pointers.size === 1) {
        t.start = p;
        t.pos = cellAt(p.x, p.y);
        t.moved = t.longPressed = false;
        clearTimer();
        t.timer = window.setTimeout(() => {
          if (!t.pos || t.moved) return;
          t.longPressed = true;
          game.flag(t.pos.row, t.pos.col);
          navigator.vibrate?.(15);
          showPress(null, false);
        }, LONG_PRESS_MS);
        showPress(mode === 'reveal' ? t.pos : null, false);
      } else {
        // A second finger: this is a pinch, not a tap.
        clearTimer();
        t.moved = true;
        t.pinch = { d0: spread(), z0: zoom };
        showPress(null, false);
      }
      return;
    }
    if (!t.pointers.has(e.pointerId)) return;
    if (e.type === 'pointermove') {
      t.pointers.set(e.pointerId, p);
      if (t.pinch && t.pointers.size >= 2) {
        setZoom(Math.min(ZOOM.max, Math.max(ZOOM.min, (t.pinch.z0 * spread()) / t.pinch.d0)));
      } else if (!t.moved && Math.hypot(p.x - t.start.x, p.y - t.start.y) > TAP_SLOP) {
        t.moved = true;
        clearTimer();
        showPress(null, false);
      }
      return;
    }
    // pointerup / pointercancel
    const tap = e.type === 'pointerup' && t.pointers.size === 1 && !t.moved && !t.longPressed && t.pos;
    t.pointers.delete(e.pointerId);
    if (t.pointers.size < 2) t.pinch = null;
    if (t.pointers.size === 0) {
      clearTimer();
      showPress(null, false);
    }
    if (tap && t.pos) {
      if (mode === 'flag') game.flag(t.pos.row, t.pos.col);
      else game.reveal(t.pos.row, t.pos.col);
    }
  };

  const onPointer = (e: ReactPointerEvent<HTMLDivElement>) => (e.pointerType === 'touch' ? onTouch(e) : onMouse(e));

  // Space flags the cell under the mouse (§4.3).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !hover.current) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) flag(hover.current.row, hover.current.col);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [active, flag]);

  const face: Face = state.status === 'won' ? 'win' : state.status === 'lost' ? 'dead' : holding ? 'pressed' : 'default';

  return (
    <div className={styles.game} style={{ '--cell': `${cell}px` } as CSSProperties}>
      {coarse && (
        <div className={styles.toolbar}>
          <div className={styles.modes} role="radiogroup" aria-label="Tap to">
            <button type="button" role="radio" aria-checked={mode === 'reveal'} className={mode === 'reveal' ? styles.modeOn : ''} onClick={() => setMode('reveal')}>
              <span className={styles.revealGlyph} aria-hidden="true" /> Reveal
            </button>
            <button type="button" role="radio" aria-checked={mode === 'flag'} className={mode === 'flag' ? styles.modeOn : ''} onClick={() => setMode('flag')}>
              <span className={styles.flagGlyph} aria-hidden="true">
                <FlagIcon />
              </span>
              Flag
            </button>
          </div>
          <div className={styles.zoom}>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(ZOOM.min, z / ZOOM.step))}>
              −
            </button>
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(ZOOM.max, z * ZOOM.step))}>
              +
            </button>
          </div>
        </div>
      )}
      <div className={styles.panel}>
        <div className={styles.header}>
          <Counter label="Mines left" value={state.mines - state.flagsPlaced} />
          <SmileyButton face={face} onClick={game.newGame} />
          <Clock startedAt={state.startedAt} endedAt={state.endedAt} />
        </div>
        <div
          ref={scrollerRef}
          className={scrolls ? `${styles.scroller} ${styles.scrolls}` : styles.scroller}
          onPointerLeave={() => (hover.current = null)}
        >
          <Board
            ref={boardRef}
            state={state}
            pressed={pressed}
            handlers={{
              onPointerDown: onPointer,
              onPointerMove: onPointer,
              onPointerUp: onPointer,
              onPointerCancel: onPointer,
              // No browser menu, and no autoscroll on a middle-click chord.
              onContextMenu: (e) => e.preventDefault(),
              onMouseDown: (e) => e.button === 1 && e.preventDefault(),
            }}
          />
        </div>
      </div>
      {coarse && <p className={styles.hint}>Long-press a square to flag it. Pinch or use − + to zoom.</p>}
    </div>
  );
}
