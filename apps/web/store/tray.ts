import { create } from 'zustand';
import type { Callout } from '@/lib/api';
import type { TradeBalloon } from '@/lib/tradeBalloons';

const PREF_KEY = 'hood.balloons';
const SOUND_KEY = 'hood.balloonSound';

/** localStorage can be missing or throw (private windows, blocked storage); balloons and their sound default to on. */
function readOn(key: string): boolean {
  try {
    return typeof window === 'undefined' || window.localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
}

function writeOn(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? 'on' : 'off');
  } catch {
    // Not persisted; still applies for this session.
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
  /** Whether a balloon chimes as it pops up (lib/balloonSound.ts), remembered per browser. */
  soundEnabled: boolean;
  push: (c: Callout) => void;
  dismiss: (id: string) => void;
  showTrade: (b: TradeBalloon) => void;
  dismissTrade: (id: string) => void;
  clearAll: () => void;
  markRead: () => void;
  setBalloonsEnabled: (on: boolean) => void;
  setSoundEnabled: (on: boolean) => void;
};

/** At most this many balloons are stacked; older ones make way. */
export const MAX_BALLOONS = 3;

export const useTray = create<TrayStore>((set) => ({
  unread: false,
  balloons: [],
  trade: null,
  balloonsEnabled: readOn(PREF_KEY),
  soundEnabled: readOn(SOUND_KEY),
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
    writeOn(PREF_KEY, on);
    set((s) => ({ balloonsEnabled: on, balloons: on ? s.balloons : [], trade: on ? s.trade : null }));
  },
  setSoundEnabled: (on) => {
    writeOn(SOUND_KEY, on);
    set({ soundEnabled: on });
  },
}));
