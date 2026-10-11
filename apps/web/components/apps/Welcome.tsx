'use client';

import { Button } from '@/components/xp/Button';
import { HoodLogo, InfoIcon } from '@/components/xp/Icons';
import { Wordmark } from '@/components/xp/Wordmark';
import { openApp } from '@/lib/openApp';
import styles from './apps.module.css';

export function Welcome() {
  return (
    <div className={`${styles.pane} ${styles.white}`}>
      <div className={styles.hero}>
        <HoodLogo size={48} />
        <Wordmark size={40} />
      </div>
      <h2 className={styles.display}>Mathematical Superintelligence. On-chain.</h2>
      <p className={styles.lead}>
        Launch coins backed by theorems. Trade on provable rigor. Powered by Robinhood Chain, routed through Pons.
      </p>

      <div className={styles.ctaRow}>
        <Button variant="primary" large onClick={() => openApp('launch')}>
          ▶ Launch a Coin
        </Button>
        <Button large onClick={() => openApp('explore')}>
          Explore
        </Button>
        <Button large onClick={() => openApp('callouts')}>
          📣 Callouts
        </Button>
        <Button large onClick={() => openApp('about')}>
          About
        </Button>
      </div>

      <div className={styles.tip}>
        <InfoIcon size={16} />
        <p>
          <b>Tip:</b> double-click a desktop icon to open it, drag windows by their title bar, and click a taskbar
          button to minimize or restore a window. Every program is also in the <b>start</b> menu.
        </p>
      </div>

      <p className={styles.fineprint}>
        hood.exe is non-custodial: trades go straight from your wallet to Pons.
      </p>
    </div>
  );
}
