'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { PRESETS, chord, countRevealed, elapsedSeconds, flag, newGame, newSeed, reveal, setMarks, validateCustom } from './minesweeper.logic';
import type { Difficulty, DifficultyConfig, GameState, PresetDifficulty, WinResult } from './minesweeper.types';

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

export function useMinesweeper({ onWin }: { onWin?: (result: WinResult) => void } = {}) {
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
      }
      if (next.status === 'lost') {
        track('minesweeper_lost', { difficulty, timeElapsed: elapsedSeconds(next, endedAt), cellsRevealed: countRevealed(next.board) });
      }
    },
    [settings, stats, updateStats],
  );

  const doReveal = useCallback((row: number, col: number) => apply({ type: 'reveal', row, col, now: Date.now(), seed: newSeed() }), [apply]);
  const doFlag = useCallback((row: number, col: number) => apply({ type: 'flag', row, col }), [apply]);
  const doChord = useCallback((row: number, col: number) => apply({ type: 'chord', row, col, now: Date.now() }), [apply]);

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
