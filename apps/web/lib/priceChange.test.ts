import { describe, expect, it } from 'vitest';
import { dayChange, formatChange } from './priceChange';

const NOW = 1_800_000_000;
const H = 3_600;
const candle = (hoursAgo: number, open: number, close: number) => ({ time: NOW - hoursAgo * H, open, high: Math.max(open, close), low: Math.min(open, close), close, volume: 1, trades: 1 });

describe('dayChange', () => {
  it('compares against the close of the last hour that ended 24 hours ago', () => {
    const candles = [candle(30, 1, 1.5), candle(25, 1.5, 2), candle(24, 2, 3), candle(1, 4, 5)];
    // candle(25) ran from 25 h to 24 h ago: the last one finished by the cutoff.
    expect(dayChange(candles, 3, NOW)).toEqual({ pct: 0.5, sinceLaunch: false });
  });

  it('measures a coin younger than a day from its first open, and says so', () => {
    expect(dayChange([candle(5, 2, 3), candle(1, 3, 4)], 1, NOW)).toEqual({ pct: -0.5, sinceLaunch: true });
  });

  it('gives nothing without candles or a price', () => {
    expect(dayChange([], 1, NOW)).toBeNull();
    expect(dayChange([candle(1, 1, 1)], null, NOW)).toBeNull();
    expect(dayChange([candle(1, 1, 1)], 0, NOW)).toBeNull();
    expect(dayChange([candle(1, 0, 1)], 1, NOW)).toBeNull();
  });
});

describe('formatChange', () => {
  it('shows an arrow, one decimal under 10%, whole numbers above, compact past 10,000%', () => {
    expect(formatChange(0.1234)).toBe('▲12%');
    expect(formatChange(0.0456)).toBe('▲4.6%');
    expect(formatChange(-0.04)).toBe('▼4.0%');
    expect(formatChange(0)).toBe('0.0%');
    expect(formatChange(2.456)).toBe('▲246%');
    expect(formatChange(123.4)).toBe('▲12.3K%');
  });
});
