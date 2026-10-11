'use client';

import { useRef } from 'react';
import { StatusBar } from '@/components/xp/Controls';
import { APPS, GAME_APPS, type AppId } from '@/components/apps/meta';
import { openApp } from '@/lib/openApp';
import styles from './games.module.css';

const DOUBLE_TAP_MS = 400;

/** The Games folder (hood-exe-games-brief.md §1.4): double-click (or double-tap) a game to open it. */
export function GamesFolder() {
  const lastTap = useRef<{ id: AppId; t: number } | null>(null);
  const tap = (id: AppId, t: number) => {
    if (lastTap.current?.id === id && t - lastTap.current.t < DOUBLE_TAP_MS) {
      lastTap.current = null;
      openApp(id);
    } else {
      lastTap.current = { id, t };
    }
  };

  return (
    <div className={styles.folder}>
      <ul className={styles.folderIcons} aria-label="Games">
        {GAME_APPS.map((id) => {
          const app = APPS[id];
          return (
            <li key={id}>
              <button
                type="button"
                className={styles.folderIcon}
                onClick={(e) => tap(id, e.timeStamp)}
                onKeyDown={(e) => e.key === 'Enter' && openApp(id)}
                aria-label={`${app.label} — double-click to open`}
              >
                <span className={styles.folderImg}>
                  <app.Icon size={40} />
                </span>
                <span className={styles.folderLabel}>{app.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <StatusBar cells={[`${GAME_APPS.length} objects`, 'Double-click a game to play']} />
    </div>
  );
}
