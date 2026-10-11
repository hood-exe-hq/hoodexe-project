'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/xp/Button';
import { MinesweeperIcon } from '@/components/xp/Icons';
import { track } from '@/lib/analytics';
import { X_HANDLE, X_URL } from '@/lib/social';
import { useWindows, type WindowState } from '@/store/windows';
import styles from '../games.module.css';

const MESSAGES = ['Minesweeper is being installed.', 'Reticulating splines…', 'Mining the sweeper…', 'Still cheaper than mainnet gas.'];

/** Minesweeper, coming soon (hood-exe-games-brief.md §3): a cosmetic install bar, nothing actually installs. */
export function MinesweeperWindow({ win }: { win: WindowState }) {
  // A different line each time it opens; windows only render in the browser, so no hydration mismatch.
  const [message] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
  useEffect(() => {
    track('game_opened', { game: 'minesweeper' });
    track('minesweeper_coming_soon_viewed');
  }, []);

  return (
    <div className={styles.soonWindow}>
      <MinesweeperIcon size={64} />
      <p className={styles.soonMessage}>{message}</p>
      <div className={styles.install} role="progressbar" aria-label="Installing Minesweeper" aria-valuetext="Installing">
        <div className={styles.installFill} />
      </div>
      <p>
        Coming soon to hood.exe.
        <br />
        Follow{' '}
        <a href={X_URL} target="_blank" rel="noopener noreferrer">
          @{X_HANDLE}
        </a>{' '}
        for release updates.
      </p>
      <Button onClick={() => useWindows.getState().close(win.id)} data-autofocus>
        OK
      </Button>
    </div>
  );
}
