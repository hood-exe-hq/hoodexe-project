'use client';

import { useQuery } from '@tanstack/react-query';
import { shortAddress } from '@hood/shared';
import { TxLink } from '@/components/xp/TxLink';
import { ApiError, fetchTrades } from '@/lib/api';
import { formatQuote, timeAgo } from '../explore/format';
import { formatPrice } from './PriceChart';
import styles from './TokenDetail.module.css';

const compact = (n: number) => n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });

/** The newest 50 curve trades, refreshed every 5 s while the window is open (docs/BRIEF.md §5.4). */
export function TradesTab({ address, symbol, pairSymbol, paused }: { address: string; symbol: string; pairSymbol: string; paused: boolean }) {
  const q = useQuery({ queryKey: ['trades', address.toLowerCase()], queryFn: () => fetchTrades(address), refetchInterval: paused ? false : 5_000 });

  if (q.isPending) return <p className={styles.muted}>Loading trades…</p>;
  if (q.isError) return <p className={styles.muted}>{q.error instanceof ApiError ? q.error.message : 'Could not load trades.'}</p>;
  if (q.data.length === 0) return <p className={styles.muted}>No trades yet.</p>;

  return (
    <table className={styles.trades}>
      <thead>
        <tr>
          <th scope="col">Time</th>
          <th scope="col">Side</th>
          <th scope="col">{pairSymbol}</th>
          <th scope="col">${symbol}</th>
          <th scope="col">Price</th>
          <th scope="col">Trader</th>
          <th scope="col">Tx</th>
        </tr>
      </thead>
      <tbody>
        {q.data.map((t) => (
          <tr key={t.id}>
            <td>{timeAgo(new Date(t.time * 1000).toISOString())}</td>
            <td className={t.side === 'buy' ? styles.buy : styles.sell}>{t.side === 'buy' ? 'Buy' : 'Sell'}</td>
            <td>{formatQuote(t.quote, '').trim()}</td>
            <td>{compact(t.tokens)}</td>
            <td>{formatPrice(t.price)}</td>
            <td className={styles.mono}>{shortAddress(t.trader)}</td>
            <td>
              <TxLink hash={t.txHash} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
