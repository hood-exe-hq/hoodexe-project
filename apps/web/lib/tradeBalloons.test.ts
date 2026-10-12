import { describe, expect, it } from 'vitest';
import type { Activity } from './api';
import { TRADE_GAP_MS, tradeBalloonFeed, type TradeBalloon } from './tradeBalloons';

const OPENED = 1_800_000_000_000;

const trade = (id: string, secondsAfterOpen = 5, over: Partial<Activity> = {}): Activity => ({
  id,
  side: 'buy',
  token: '0x600b086FC24079F4E9e0c6632fd483234fF10644',
  ticker: 'HEXE',
  trader: '0x12ab000000000000000000000000000000009f0c',
  eth: '0.05',
  time: Math.floor(OPENED / 1000) + secondsAfterOpen,
  txHash: `0x${id}`,
  ...over,
});

/** A feed on a hand-driven clock: `tick(ms)` advances time and fires due timers. */
function harness(skip: (a: Activity) => boolean = () => false) {
  let clock = OPENED + 10_000;
  const timers: { at: number; fn: () => void }[] = [];
  const shown: TradeBalloon[] = [];
  const feed = tradeBalloonFeed({
    show: (b) => shown.push(b),
    skip,
    openedAt: OPENED,
    now: () => clock,
    setTimer: (fn, ms) => {
      const t = { at: clock + ms, fn };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => timers.splice(timers.indexOf(t as (typeof timers)[number]), 1),
  });
  const tick = (ms: number) => {
    clock += ms;
    for (const t of timers.filter((x) => x.at <= clock)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };
  const ids = () => shown.map((b) => b.items.map((i) => i.id));
  return { feed, tick, shown, ids, timers };
}

describe('trade balloons', () => {
  it('shows a trade right away, then merges what arrives within the gap into one balloon', () => {
    const h = harness();
    h.feed.add(trade('a'));
    h.tick(0);
    expect(h.ids()).toEqual([['a']]);

    h.tick(1_000);
    h.feed.add(trade('b'));
    h.feed.add(trade('c'));
    expect(h.ids()).toEqual([['a']]);

    h.tick(TRADE_GAP_MS - 1_001);
    expect(h.ids()).toEqual([['a']]);
    h.tick(1);
    expect(h.ids()).toEqual([['a'], ['b', 'c']]);
    expect(h.shown[1].id).toBe('c');

    h.tick(TRADE_GAP_MS);
    h.feed.add(trade('d'));
    h.tick(0);
    expect(h.ids()).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('puts trades delivered together (one poll) into one balloon', () => {
    const h = harness();
    h.feed.add(trade('a'));
    h.feed.add(trade('b'));
    h.feed.add(trade('c'));
    expect(h.ids()).toEqual([]);
    h.tick(0);
    expect(h.ids()).toEqual([['a', 'b', 'c']]);
  });

  it('shows each trade once, however often the socket and the poller deliver it', () => {
    const h = harness();
    h.feed.add(trade('a'));
    h.tick(TRADE_GAP_MS);
    h.feed.add(trade('a'));
    h.feed.add(trade('a'));
    h.tick(TRADE_GAP_MS);
    expect(h.ids()).toEqual([['a']]);
  });

  it("ignores trades from before the page opened, except the first visit's one", () => {
    const h = harness();
    h.feed.add(trade('old', -10 * 60));
    expect(h.ids()).toEqual([]);
    h.feed.add(trade('older', -12 * 60), { fromBefore: true });
    h.tick(0);
    expect(h.ids()).toEqual([['older']]);
    // A minute of slack for a clock that runs fast.
    h.tick(TRADE_GAP_MS);
    h.feed.add(trade('just-before', -30));
    h.tick(0);
    expect(h.ids()).toEqual([['older'], ['just-before']]);
  });

  it('marks trades seen without showing them', () => {
    const h = harness();
    h.feed.seen([trade('a'), trade('b')]);
    h.feed.add(trade('a'));
    h.feed.add(trade('c'));
    h.tick(0);
    expect(h.ids()).toEqual([['c']]);
  });

  it('skips trades the caller says to, and still remembers them', () => {
    let quiet = true;
    const h = harness(() => quiet);
    h.feed.add(trade('a'));
    quiet = false;
    h.feed.add(trade('a'));
    expect(h.ids()).toEqual([]);
    h.feed.add(trade('b'));
    h.tick(0);
    expect(h.ids()).toEqual([['b']]);
  });

  it('cancels a pending balloon when stopped', () => {
    const h = harness();
    h.feed.add(trade('a'));
    h.tick(0);
    h.feed.add(trade('b'));
    expect(h.timers).toHaveLength(1);
    h.feed.stop();
    h.tick(TRADE_GAP_MS);
    expect(h.ids()).toEqual([['a']]);
  });
});
