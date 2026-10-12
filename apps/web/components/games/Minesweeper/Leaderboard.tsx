'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { shortAddress } from '@hood/shared';
import { Button } from '@/components/xp/Button';
import { Dialog } from '@/components/xp/Dialog';
import { fetchLeaderboard, type LeaderboardEntry, type RankedLevel, type RankedResult } from '@/lib/api';
import { HOOD_TOKEN } from '@/lib/hoodToken';
import type { RankedState } from './useMinesweeper';
import styles from './minesweeper.module.css';

export const RANKED_LEVELS: [RankedLevel, string][] = [
  ['beginner', 'Beginner'],
  ['intermediate', 'Intermediate'],
  ['expert', 'Expert'],
];

/** 41.3 s */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const who = (e: LeaderboardEntry) => e.nickname ?? shortAddress(e.wallet);

export const leaderboardKey = (level: RankedLevel) => ['leaderboard', 'minesweeper', level] as const;
export const useLeaderboard = (level: RankedLevel | null) =>
  useQuery({ queryKey: leaderboardKey(level ?? 'beginner'), queryFn: () => fetchLeaderboard(level!), enabled: !!level, refetchInterval: 60_000 });

function HolderBadge() {
  if (!HOOD_TOKEN) return null;
  return (
    <span className={styles.holder} title={`Holds $${HOOD_TOKEN.ticker}`}>
      ${HOOD_TOKEN.ticker}
    </span>
  );
}

/** "Today's Leaderboard": the top 20 per level for the current UTC day, and where you stand. */
export function LeaderboardDialog({ initial, onClose }: { initial: RankedLevel; onClose: () => void }) {
  const [level, setLevel] = useState<RankedLevel>(initial);
  const q = useLeaderboard(level);
  const data = q.data;

  return (
    <Dialog
      title="Today's Leaderboard"
      onClose={onClose}
      width={340}
      footer={
        <Button onClick={onClose} data-autofocus>
          OK
        </Button>
      }
    >
      <div className={styles.levels} role="tablist" aria-label="Level">
        {RANKED_LEVELS.map(([id, name]) => (
          <button key={id} type="button" role="tab" aria-selected={level === id} className={level === id ? styles.levelOn : ''} onClick={() => setLevel(id)}>
            {name}
          </button>
        ))}
      </div>
      {q.isPending ? (
        <p className={styles.note}>Loading…</p>
      ) : q.isError ? (
        <p className={styles.error}>Couldn&apos;t load the leaderboard. Try again in a moment.</p>
      ) : !data?.entries.length ? (
        <p className={styles.empty}>No ranked wins on {RANKED_LEVELS.find(([id]) => id === level)?.[1]} yet today. Be the first.</p>
      ) : (
        <table className={styles.rankTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.wallet} className={data.you?.wallet === e.wallet ? styles.me : undefined}>
                <td>{e.rank}</td>
                <td title={e.wallet}>
                  {who(e)} {e.holder && <HolderBadge />}
                </td>
                <td>{seconds(e.timeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data?.you && data.you.rank > data.entries.length && (
        <p className={styles.you}>
          You: #{data.you.rank} of {data.players}, {seconds(data.you.timeMs)}
        </p>
      )}
      <p className={styles.note}>
        Best ranked time per player, {data?.day ?? 'today'} (UTC). Resets at 00:00 UTC. Times are clocked by the server from your first click to the win.
      </p>
    </Dialog>
  );
}

type StatusProps = {
  level: RankedLevel | null;
  signedIn: boolean;
  ranked: RankedState<RankedResult>;
  onSignIn: () => void;
  signingIn: boolean;
  onOpenBoard: () => void;
};

/** The window's status bar: whether this game counts, and how you stand today. */
export function RankedStatus({ level, signedIn, ranked, onSignIn, signingIn, onOpenBoard }: StatusProps) {
  const q = useLeaderboard(signedIn ? level : null);
  const you = q.data?.you;

  let text: ReactNode;
  if (!level) text = "Custom boards aren't ranked.";
  else if (!signedIn)
    text = (
      <>
        🏆 <button type="button" className={styles.linkBtn} onClick={onSignIn} disabled={signingIn}>
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>{' '}
        to rank today&apos;s times
      </>
    );
  else if (ranked.phase === 'starting') text = 'Dealing a ranked board…';
  else if (ranked.phase === 'submitting') text = 'Checking your win…';
  else if (ranked.phase === 'done') {
    const r = ranked.result;
    text = `🏆 ${seconds(r.timeMs)}${r.best < r.timeMs ? ` · your best today ${seconds(r.best)}` : ''}${r.rank ? ` · #${r.rank} of ${r.players}` : ''}`;
  } else if (ranked.phase === 'unranked' || ranked.phase === 'error') text = `Not ranked: ${ranked.message}`;
  else text = you ? `🏆 Ranked · today's best ${seconds(you.timeMs)} · #${you.rank} of ${q.data!.players}` : '🏆 Ranked · no time yet today';

  return (
    <div className={styles.status}>
      <span className={styles.statusText}>{text}</span>
      <button type="button" className={styles.linkBtn} onClick={onOpenBoard}>
        Leaderboard
      </button>
    </div>
  );
}
