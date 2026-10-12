'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPrice } from '@/components/apps/token/PriceChart';
import { fetchCandles, fetchToken } from '@/lib/api';
import { HOOD_TOKEN, type HoodToken } from '@/lib/hoodToken';
import { onLive, startLive } from '@/lib/live';
import { openToken } from '@/lib/openApp';
import { dayChange, formatChange } from '@/lib/priceChange';
import styles from './PriceTicker.module.css';

const REFRESH_MS = 30_000;

/** Taskbar tray: "$HEXE 0.0₈436 ▲12%", flashing as the price moves. Click: the chart. Hidden while HOOD_TOKEN is null. */
export function PriceTicker() {
  if (!HOOD_TOKEN) return null;
  return <Ticker token={HOOD_TOKEN} />;
}

function Ticker({ token }: { token: HoodToken }) {
  const key = token.address.toLowerCase();
  const queryClient = useQueryClient();
  // The same queries as Token Detail, so an open chart and the ticker share one fetch.
  const t = useQuery({ queryKey: ['token', key], queryFn: () => fetchToken(token.address), refetchInterval: REFRESH_MS });
  const c = useQuery({ queryKey: ['candles', key, '1h'], queryFn: () => fetchCandles(token.address, '1h'), refetchInterval: REFRESH_MS * 2 });

  // A $HEXE trade on the live link: refresh now rather than at the next tick.
  useEffect(() => {
    const stop = startLive();
    const off = onLive((e) => {
      if (e.type === 'activity' && e.activity.token.toLowerCase() === key) void queryClient.invalidateQueries({ queryKey: ['token', key] });
    });
    return () => {
      off();
      stop();
    };
  }, [key, queryClient]);

  const price = t.data?.price ?? null;
  // Flash green or red when the price moves (React's "adjust state while rendering" pattern, no effect needed).
  const [last, setLast] = useState(price);
  const [flash, setFlash] = useState<{ up: boolean; n: number } | null>(null);
  if (price !== last) {
    setLast(price);
    if (last != null && price != null) setFlash({ up: price > last, n: (flash?.n ?? 0) + 1 });
  }

  if (price == null) return null;
  const change = dayChange(c.data?.candles ?? [], price, Math.floor(t.dataUpdatedAt / 1000));
  const title = `$${token.ticker} price in ETH${change ? (change.sinceLaunch ? ', change since launch' : ', 24 h change') : ''}. Click for the chart.`;

  return (
    <button type="button" className={styles.ticker} title={title} aria-label={title} onClick={() => openToken(token.address, token.ticker)}>
      <span className={styles.symbol}>${token.ticker}</span>
      <span key={flash?.n ?? 0} className={`${styles.price} ${flash ? (flash.up ? styles.flashUp : styles.flashDown) : ''}`}>
        {formatPrice(price)}
      </span>
      {change && <span className={change.pct >= 0 ? styles.up : styles.down}>{formatChange(change.pct)}</span>}
    </button>
  );
}
