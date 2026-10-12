import type { Candles } from './api';

const DAY_S = 86_400;

/**
 * The price change over the last 24 hours, from hourly candles: against the close of the last hour that ended by
 * then. A coin younger than a day (or with no trade that long ago) is measured from its first candle's open instead,
 * and says so. Null without candles or a usable price.
 */
export function dayChange(candles: Candles['candles'], price: number | null, nowS: number): { pct: number; sinceLaunch: boolean } | null {
  if (!candles.length || price == null || !(price > 0)) return null;
  const cutoff = nowS - DAY_S;
  const before = candles.filter((c) => c.time + 3_600 <= cutoff).at(-1);
  const base = before ? before.close : candles[0].open;
  if (!(base > 0)) return null;
  return { pct: price / base - 1, sinceLaunch: !before };
}

/** ▲12.3%, ▼4%, ▲1.2K% — one decimal under 10%, none above, compact past 10,000%. */
export function formatChange(pct: number): string {
  const p = Math.abs(pct * 100);
  const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '';
  const text = p >= 10_000 ? p.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 }) : p < 10 ? p.toFixed(1) : Math.round(p).toString();
  return `${arrow}${text}%`;
}
