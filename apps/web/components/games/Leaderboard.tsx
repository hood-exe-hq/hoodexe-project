'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { shortAddress } from '@hood/shared';
import { Button } from '@/components/xp/Button';
import { Dialog } from '@/components/xp/Dialog';
import { fetchLeaderboard, type LeaderboardEntry, type RankedGame, type RankedLevel, type RankedResult } from '@/lib/api';
import { HOOD_TOKEN } from '@/lib/hoodToken';
import type { RankedState } from './ranked';
import styles from './ranked.module.css';

/** 41.3 s, or 3:05.2 from a minute up (Solitaire). */
export function seconds(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const rest = s - 60 * Math.floor(s / 60);
  return `${Math.floor(s / 60)}:${rest.toFixed(1).padStart(4, '0')}`;
}
const who = (e: LeaderboardEntry) => e.nickname ?? shortAddress(e.wallet);

export const leaderboardKey = (game: RankedGame, level: RankedLevel) => ['leaderboard', game, level] as const;
export const useLeaderboard = (game: RankedGame, level: RankedLevel | null) =>
  useQuery({ queryKey: leaderboardKey(game, level ?? 'beginner'), queryFn: () => fetchLeaderboard(game, level!), enabled: !!level, refetchInterval: 60_000 });

function HolderBadge() {
  if (!HOOD_TOKEN) return null;
  return (
    <span className={styles.holder} title={`Holds $${HOOD_TOKEN.ticker}`}>
      ${HOOD_TOKEN.ticker}
    </span>
  );
}

type DialogProps = {
  game: RankedGame;
  /** The boards to choose from, with their names; one board needs no tabs. */
  levels: [RankedLevel, string][];
  initial: RankedLevel;
  /** How the time is clocked, for the footnote. */
  clocked: string;
  onClose: () => void;
};

/** "Today's Leaderboard": the top 20 of a board for the current UTC day, and where you stand. */
export function LeaderboardDialog({ game, levels, initial, clocked, onClose }: DialogProps) {
  const [level, setLevel] = useState<RankedLevel>(initial);
  const q = useLeaderboard(game, level);
  const data = q.data;
  const name = levels.find(([id]) => id === level)?.[1];

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
      {levels.length > 1 && (
        <div className={styles.levels} role="tablist" aria-label="Level">
          {levels.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={level === id} className={level === id ? styles.levelOn : ''} onClick={() => setLevel(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {q.isPending ? (
        <p className={styles.note}>Loading…</p>
      ) : q.isError ? (
        <p className={styles.error}>Couldn&apos;t load the leaderboard. Try again in a moment.</p>
      ) : !data?.entries.length ? (
        <p className={styles.empty}>No ranked wins{levels.length > 1 ? ` on ${name}` : ''} yet today. Be the first.</p>
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
        Best ranked time per player, {data?.day ?? 'today'} (UTC). Resets at 00:00 UTC. {clocked}
      </p>
    </Dialog>
  );
}

type BarProps = {
  game: RankedGame;
  /** This game's board, or null when it can't be ranked (a custom Minesweeper board). */
  level: RankedLevel | null;
  /** Why this game isn't ranked though the board could be (Solitaire's Deal Again, a resumed game). */
  unranked?: string | null;
  notRankable: string;
  signedIn: boolean;
  ranked: RankedState<RankedResult>;
  onSignIn: () => void;
  signingIn: boolean;
  onOpenBoard: () => void;
};

/** The ranked bar along a game window's bottom: whether this game counts, and how you stand today. */
export function RankedBar({ game, level, unranked, notRankable, signedIn, ranked, onSignIn, signingIn, onOpenBoard }: BarProps) {
  const q = useLeaderboard(game, signedIn ? level : null);
  const you = q.data?.you;

  let text: ReactNode;
  if (!level) text = notRankable;
  else if (!signedIn)
    text = (
      <>
        🏆{' '}
        <button type="button" className={styles.linkBtn} onClick={onSignIn} disabled={signingIn}>
          {signingIn ? 'Signing in…' : 'Sign in'}
        </button>{' '}
        to rank today&apos;s times
      </>
    );
  else if (ranked.phase === 'starting') text = 'Dealing a ranked game…';
  else if (ranked.phase === 'submitting') text = 'Checking your win…';
  else if (ranked.phase === 'done') {
    const r = ranked.result;
    text = `🏆 ${seconds(r.timeMs)}${r.best < r.timeMs ? ` · your best today ${seconds(r.best)}` : ''}${r.rank ? ` · #${r.rank} of ${r.players}` : ''}`;
  } else if (ranked.phase === 'unranked' || ranked.phase === 'error') text = `Not ranked: ${ranked.message}`;
  else if (unranked) text = unranked;
  else text = you ? `🏆 Ranked · today's best ${seconds(you.timeMs)} · #${you.rank} of ${q.data!.players}` : '🏆 Ranked · no time yet today';

  return (
    <div className={styles.bar}>
      <span className={styles.text}>{text}</span>
      <button type="button" className={styles.linkBtn} onClick={onOpenBoard}>
        Leaderboard
      </button>
    </div>
  );
}
