import { create } from 'zustand';
import type { Callout } from '@/lib/api';
import type { TradeBalloon } from '@/lib/tradeBalloons';

const PREF_KEY = 'hood.balloons';

/** localStorage can be missing or throw (private windows, blocked storage); balloons default to on. */
function readEnabled(): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

type TrayStore = {
  /** A callout arrived while Callouts.exe was closed or minimized (the pulsing orange dot). */
  unread: boolean;
  balloons: Callout[];
  /** The trade balloon on show (lib/tradeBalloons.ts paces them), under the callout ones. */
  trade: TradeBalloon | null;
  /** The user's balloon toggle (docs/BRIEF.md §5.6), remembered per browser. */
  balloonsEnabled: boolean;
  push: (c: Callout) => void;
  dismiss: (id: string) => void;
  showTrade: (b: TradeBalloon) => void;
  dismissTrade: (id: string) => void;
  clearAll: () => void;
  markRead: () => void;
  setBalloonsEnabled: (on: boolean) => void;
};

/** At most this many balloons are stacked; older ones make way. */
export const MAX_BALLOONS = 3;

export const useTray = create<TrayStore>((set) => ({
  unread: false,
  balloons: [],
  trade: null,
  balloonsEnabled: readEnabled(),
  push: (c) =>
    set((s) => ({
      unread: true,
      balloons: !s.balloonsEnabled || s.balloons.some((b) => b.id === c.id) ? s.balloons : [...s.balloons, c].slice(-MAX_BALLOONS),
    })),
  dismiss: (id) => set((s) => ({ balloons: s.balloons.filter((b) => b.id !== id) })),
  showTrade: (b) => set((s) => (s.balloonsEnabled ? { trade: b } : s)),
  dismissTrade: (id) => set((s) => (s.trade?.id === id ? { trade: null } : s)),
  clearAll: () => set({ balloons: [] }),
  markRead: () => set({ unread: false }),
  setBalloonsEnabled: (on) => {
    try {
      window.localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      // Not persisted; still applies for this session.
    }
    set((s) => ({ balloonsEnabled: on, balloons: on ? s.balloons : [], trade: on ? s.trade : null }));
  },
}));
