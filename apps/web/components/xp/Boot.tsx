import { HoodLogo } from './Icons';
import { Wordmark } from './Wordmark';
import styles from './Boot.module.css';

/** Black boot screen with the H logo and the three scrolling blocks. Server-renderable. */
export function BootScreen() {
  return (
    <div className={styles.boot} role="status" aria-label="Starting hood.exe">
      <div className={styles.mark}>
        <span className={styles.markLogo}>
          <HoodLogo size={84} />
        </span>
        <span className={styles.markText}>
          <Wordmark size={60} dark />
          <span className={styles.edition}>Hood Pack 3</span>
        </span>
      </div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.blocks}>
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className={styles.footLeft}>Copyright © 2026 hood.exe</div>
      <div className={styles.footRight}>
        <HoodLogo size={18} /> hood.exe
      </div>
    </div>
  );
}

/** The blue "welcome" screen shown between boot and the desktop. */
export function WelcomeScreen() {
  return (
    <div className={styles.welcome} role="status" aria-label="Welcome">
      <div className={`${styles.band} ${styles.top}`} />
      <div className={styles.middle}>
        <div className={styles.welcomeText}>
          <HoodLogo size={64} />
          <span className={styles.welcomeWord}>welcome</span>
        </div>
      </div>
      <div className={`${styles.band} ${styles.bottom}`}>
        <span className={styles.bottomLabel}>Loading your desktop…</span>
      </div>
    </div>
  );
}

/** Shared timings so first load and Restart feel the same. */
export const BOOT_MS = 2200;
export const WELCOME_MS = 1100;
