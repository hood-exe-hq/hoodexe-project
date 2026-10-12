import type { Activity } from './api';

/** One trade balloon: a single trade, or several that arrived close together (oldest first), and when it went up. */
export type TradeBalloon = { id: string; items: Activity[]; shownAt: number };

/** At most one trade balloon this often; trades arriving in between merge into the next one. */
export const TRADE_GAP_MS = 8_000;
/** Trades from before the page opened (with this much slack for a clock that runs fast) are history, not news. */
const OPEN_SLACK_MS = 60_000;
const SEEN_MAX = 500;

type Options = {
  show: (b: TradeBalloon) => void;
  /** True for trades that shouldn't raise a balloon right now (that coin's Token Detail is in front). */
  skip: (a: Activity) => boolean;
  /** When the page opened, in ms. */
  openedAt: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
};

/**
 * Turns the live trade stream into balloons: each trade once (the socket and the poller both deliver them), none
 * from before the page opened, and at most one balloon per TRADE_GAP_MS, merging whatever arrives in between.
 */
export function tradeBalloonFeed({ show, skip, openedAt, now = Date.now, setTimer = setTimeout, clearTimer = (t) => clearTimeout(t as ReturnType<typeof setTimeout>) }: Options) {
  const seen = new Set<string>();
  let queue: Activity[] = [];
  let lastShown = -Infinity;
  let timer: unknown;

  const flush = () => {
    timer = undefined;
    if (!queue.length) return;
    show({ id: queue[queue.length - 1].id, items: queue, shownAt: now() });
    queue = [];
    lastShown = now();
  };

  const first = (a: Activity) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value!);
    return true;
  };

  return {
    /** A trade from the live link. `fromBefore` lets one older trade through: the first visit's welcome balloon. */
    add(a: Activity, { fromBefore = false } = {}) {
      if (!first(a)) return;
      if (!fromBefore && a.time * 1000 < openedAt - OPEN_SLACK_MS) return;
      if (skip(a)) return;
      queue.push(a);
      // Never synchronously: trades delivered together (a poll, a catch-up) go up as one balloon.
      timer ??= setTimer(flush, Math.max(0, lastShown + TRADE_GAP_MS - now()));
    },
    /** Trades to treat as already seen, without a balloon. */
    seen(items: Activity[]) {
      items.forEach(first);
    },
    stop() {
      if (timer !== undefined) clearTimer(timer);
      timer = undefined;
    },
  };
}
