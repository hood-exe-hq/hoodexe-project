'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { errorText, type RankedHost, type RankedState } from '../ranked';
import { PRESETS, chord, countRevealed, elapsedSeconds, flag, newGame, newSeed, reveal, setMarks, validateCustom } from './minesweeper.logic';
import type { Difficulty, DifficultyConfig, GameState, PresetDifficulty, RankedMove, WinResult } from './minesweeper.types';

/** hood-exe-minesweeper-brief.md §6: settings and best times live in this browser only; games aren't resumed. */
const KEYS = { settings: 'minesweeper:settings', stats: 'minesweeper:stats' } as const;

export type Settings = { difficulty: Difficulty; marksEnabled: boolean; custom: DifficultyConfig };
export type LevelStats = { gamesPlayed: number; wins: number; bestTime: number | null };
export type Stats = Record<PresetDifficulty, LevelStats>;

const DEFAULT_SETTINGS: Settings = { difficulty: 'beginner', marksEnabled: true, custom: { rows: 20, cols: 24, mines: 100 } };
const NO_LEVEL: LevelStats = { gamesPlayed: 0, wins: 0, bestTime: null };
const NO_STATS: Stats = { beginner: NO_LEVEL, intermediate: NO_LEVEL, expert: NO_LEVEL };

// Storage can be missing or throw (private windows, blocked site data); the game plays the same without it.
function load<T extends object>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved this time.
  }
}

function loadSettings(): Settings {
  const s = load(KEYS.settings, DEFAULT_SETTINGS);
  const valid = ['beginner', 'intermediate', 'expert', 'custom'].includes(s.difficulty);
  const custom = validateCustom(s.custom ?? DEFAULT_SETTINGS.custom) ? DEFAULT_SETTINGS.custom : s.custom;
  return { difficulty: valid ? s.difficulty : 'beginner', marksEnabled: s.marksEnabled !== false, custom };
}

export const configFor = (s: Pick<Settings, 'difficulty' | 'custom'>): DifficultyConfig => (s.difficulty === 'custom' ? s.custom : PRESETS[s.difficulty]);

type Action =
  | { type: 'reveal'; row: number; col: number; now: number; seed: number }
  | { type: 'flag'; row: number; col: number }
  | { type: 'chord'; row: number; col: number; now: number }
  | { type: 'new'; config: DifficultyConfig; marksEnabled: boolean }
  | { type: 'marks'; enabled: boolean };

function reducer(s: GameState, a: Action): GameState {
  switch (a.type) {
    case 'reveal':
      return reveal(s, a.row, a.col, a.now, a.seed);
    case 'flag':
      return flag(s, a.row, a.col);
    case 'chord':
      return chord(s, a.row, a.col, a.now);
    case 'new':
      return newGame(a.config, a.marksEnabled);
    case 'marks':
      return setMarks(s, a.enabled);
  }
}

/** A new best time, for the "fastest time" message. */
export type NewBestTime = { difficulty: PresetDifficulty; time: number; at: number };

/** Ranked Minesweeper (../ranked.ts): the server's seed comes at the first click; a win sends its moves. */
export type MinesweeperHost<R> = RankedHost<PresetDifficulty, { marks: boolean; moves: RankedMove[] }, R>;

/** What a move records for a ranked replay; null for actions that aren't moves. */
function recordOf(a: Action): RankedMove | null {
  if (a.type === 'reveal') return ['r', a.row, a.col];
  if (a.type === 'flag') return ['f', a.row, a.col];
  if (a.type === 'chord') return ['c', a.row, a.col];
  if (a.type === 'marks') return ['m', a.enabled ? 1 : 0];
  return null;
}

export function useMinesweeper<R = unknown>({ onWin, ranked: rankedHost = null }: { onWin?: (result: WinResult) => void; ranked?: MinesweeperHost<R> | null } = {}) {
  // Minesweeper only renders in the browser (the desktop opens windows after it mounts), so storage is readable here.
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [stats, setStats] = useState<Stats>(() => load(KEYS.stats, NO_STATS));
  const [state, setState] = useState<GameState>(() => newGame(configFor(settings), settings.marksEnabled));
  const [record, setRecord] = useState<NewBestTime | null>(null);
  // Moves are applied to the latest state right away (two clicks can land before a re-render), and each move's
  // consequences (stats, analytics, the win hook) run in the same event handler.
  const current = useRef(state);
  const onWinRef = useRef(onWin);
  useEffect(() => {
    onWinRef.current = onWin;
  }, [onWin]);

  // Ranked play: every move since the new game (with the Marks setting it began with) is kept, so a ranked win can
  // be replayed by the server. The run exists once the server has dealt the board, at the first click.
  const hostRef = useRef(rankedHost);
  useEffect(() => {
    hostRef.current = rankedHost;
  }, [rankedHost]);
  const log = useRef<{ marks: boolean; moves: RankedMove[] }>({ marks: state.marksEnabled, moves: [] });
  const run = useRef<string | null>(null);
  const gameNo = useRef(0);
  const starting = useRef(false);
  const [ranked, setRanked] = useState<RankedState<R>>({ phase: 'idle' });

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((cur) => {
      const next = { ...cur, ...patch };
      save(KEYS.settings, next);
      return next;
    });
  }, []);

  const updateStats = useCallback((level: Difficulty, fn: (s: LevelStats) => LevelStats) => {
    if (level === 'custom') return; // Best times are kept for the three presets only (§6.1).
    setStats((cur) => {
      const next = { ...cur, [level]: fn(cur[level] ?? NO_LEVEL) };
      save(KEYS.stats, next);
      return next;
    });
  }, []);

  /** Applies a move. The status only moves forward (idle → playing → won/lost), so each transition fires once. */
  const apply = useCallback(
    (a: Action) => {
      const prev = current.current;
      const next = reducer(prev, a);
      if (next === prev) return;
      current.current = next;
      setState(next);
      if (a.type === 'new') {
        gameNo.current++;
        log.current = { marks: a.marksEnabled, moves: [] };
        run.current = null;
        setRanked({ phase: 'idle' });
      } else {
        const rec = recordOf(a);
        if (rec) log.current.moves.push(rec);
      }
      if (next.status === prev.status) return;
      const { difficulty } = settings;
      const endedAt = next.endedAt ?? Date.now();
      if (prev.status === 'idle' && next.status !== 'idle') {
        updateStats(difficulty, (s) => ({ ...s, gamesPlayed: s.gamesPlayed + 1 }));
        track('minesweeper_started', { difficulty });
      }
      if (next.status === 'won') {
        const time = elapsedSeconds(next, endedAt);
        const best = difficulty === 'custom' ? null : stats[difficulty].bestTime;
        const isBest = difficulty !== 'custom' && (best == null || time < best);
        updateStats(difficulty, (s) => ({ ...s, wins: s.wins + 1, bestTime: s.bestTime == null ? time : Math.min(s.bestTime, time) }));
        if (isBest) setRecord({ difficulty, time, at: endedAt });
        track('minesweeper_won', { difficulty, time, bestTime: isBest });
        onWinRef.current?.({ difficulty, time, movesMade: next.moves, timestamp: endedAt });
        const id = run.current;
        const host = hostRef.current;
        if (id && host) {
          run.current = null;
          setRanked({ phase: 'submitting' });
          const no = gameNo.current;
          host.finish(id, { marks: log.current.marks, moves: log.current.moves }).then(
            (result) => gameNo.current === no && setRanked({ phase: 'done', result }),
            (e) => gameNo.current === no && setRanked({ phase: 'error', message: errorText(e) }),
          );
        }
      }
      if (next.status === 'lost') {
        if (run.current) setRanked({ phase: 'idle' });
        run.current = null;
        track('minesweeper_lost', { difficulty, timeElapsed: elapsedSeconds(next, endedAt), cellsRevealed: countRevealed(next.board) });
      }
    },
    [settings, stats, updateStats],
  );

  /**
   * Left-click. On a ranked level the first click waits for the server to deal the board (its clock starts there);
   * if that fails, the game goes on unranked. Input is held while it waits.
   */
  const doReveal = useCallback(
    (row: number, col: number) => {
      if (starting.current) return;
      const host = hostRef.current;
      const level = settings.difficulty;
      const s = current.current;
      const cell = s.board[row]?.[col];
      if (!host || level === 'custom' || !s.firstClick || s.status !== 'idle' || !cell || cell.state === 'flagged') {
        apply({ type: 'reveal', row, col, now: Date.now(), seed: newSeed() });
        return;
      }
      starting.current = true;
      setRanked({ phase: 'starting' });
      const no = gameNo.current;
      host
        .start(level)
        .then(
          (r) => {
            if (gameNo.current !== no) return;
            run.current = r.id;
            setRanked({ phase: 'playing' });
            apply({ type: 'reveal', row, col, now: Date.now(), seed: r.seed });
          },
          (e) => {
            if (gameNo.current !== no) return;
            setRanked({ phase: 'unranked', message: errorText(e) });
            apply({ type: 'reveal', row, col, now: Date.now(), seed: newSeed() });
          },
        )
        .finally(() => {
          starting.current = false;
        });
    },
    [apply, settings.difficulty],
  );
  const doFlag = useCallback((row: number, col: number) => void (!starting.current && apply({ type: 'flag', row, col })), [apply]);
  const doChord = useCallback((row: number, col: number) => void (!starting.current && apply({ type: 'chord', row, col, now: Date.now() })), [apply]);

  const reset = useCallback(() => {
    setRecord(null);
    apply({ type: 'new', config: configFor(settings), marksEnabled: settings.marksEnabled });
  }, [apply, settings]);

  /** Switches level (and starts a new game on it). `custom` also sets the custom board. */
  const setDifficulty = useCallback(
    (difficulty: Difficulty, custom?: DifficultyConfig) => {
      const next = { difficulty, custom: custom ?? settings.custom };
      if (difficulty !== settings.difficulty) track('minesweeper_difficulty_changed', { from: settings.difficulty, to: difficulty });
      updateSettings(next);
      setRecord(null);
      apply({ type: 'new', config: configFor(next), marksEnabled: settings.marksEnabled });
    },
    [apply, settings, updateSettings],
  );

  const toggleMarks = useCallback(() => {
    const enabled = !settings.marksEnabled;
    updateSettings({ marksEnabled: enabled });
    apply({ type: 'marks', enabled });
  }, [apply, settings.marksEnabled, updateSettings]);

  const resetStats = useCallback(() => {
    setStats(NO_STATS);
    save(KEYS.stats, NO_STATS);
  }, []);

  return {
    state,
    settings,
    stats,
    record,
    dismissRecord: () => setRecord(null),
    ranked,
    reveal: doReveal,
    flag: doFlag,
    chord: doChord,
    newGame: reset,
    setDifficulty,
    toggleMarks,
    resetStats,
  };
}

export type MinesweeperGame = ReturnType<typeof useMinesweeper>;
