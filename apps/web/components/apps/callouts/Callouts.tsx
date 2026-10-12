'use client';

import { useCallback, useState } from 'react';
import type { CalloutPage } from '@/lib/api';
import { useLiveStatus } from '@/lib/live';
import { useTray } from '@/store/tray';
import { CalloutFeed } from './CalloutFeed';
import styles from './Callouts.module.css';

/** Callouts.exe (docs/BRIEF.md §5.5): the live feed with its "🟢 LIVE — N callouts · M users" header. */
export function Callouts() {
  const status = useLiveStatus((s) => s.status);
  const [live, setLive] = useState<CalloutPage['live'] | null>(null);
  const onLiveCounts = useCallback((l: CalloutPage['live']) => setLive(l), []);
  const isLive = status === 'live';
  const balloons = useTray((s) => s.balloonsEnabled);
  const setBalloonsEnabled = useTray((s) => s.setBalloonsEnabled);
  const sound = useTray((s) => s.soundEnabled);
  const setSoundEnabled = useTray((s) => s.setSoundEnabled);

  return (
    <div className={styles.window}>
      <div className={styles.header}>
        <span className={`${styles.dot} ${isLive ? styles.dotLive : styles.dotDown}`} aria-hidden />
        <b>{isLive ? 'LIVE' : status === 'polling' ? 'RECONNECTING' : 'CONNECTING'}</b>
        {live && (
          <span>
            {' '}
            — {live.callouts.toLocaleString('en-US')} callout{live.callouts === 1 ? '' : 's'} · {live.users.toLocaleString('en-US')} user{live.users === 1 ? '' : 's'}
            <span className={styles.muted}> (24 h)</span>
          </span>
        )}
        <label className={styles.toggle} title="Pop up new callouts from the tray while this window is closed">
          <input type="checkbox" checked={balloons} onChange={(e) => setBalloonsEnabled(e.target.checked)} /> Tray balloons
        </label>
        <label className={styles.toggle} title="Chime when a balloon pops up">
          <input type="checkbox" checked={balloons && sound} disabled={!balloons} onChange={(e) => setSoundEnabled(e.target.checked)} /> Sound
        </label>
      </div>
      <CalloutFeed onLiveCounts={onLiveCounts} />
    </div>
  );
}
