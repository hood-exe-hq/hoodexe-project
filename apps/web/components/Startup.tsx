'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BOOT_MS, BootScreen, WELCOME_MS, WelcomeScreen } from './xp/Boot';
import { DesktopSkeleton } from './xp/DesktopSkeleton';
import { useStartup } from '@/store/startup';

// Wallet SDKs (RainbowKit → wagmi connectors → Coinbase/Base SDKs) are browser-only and pull
// server-incompatible optional deps into SSR, so the interactive desktop renders on the client.
const AppShell = dynamic(() => import('./AppShell'), { ssr: false, loading: () => <DesktopSkeleton /> });

const SEEN_KEY = 'hood.booted';

type Phase = 'boot' | 'welcome' | 'done';

/**
 * First load: boot screen → welcome screen → desktop. The boot screen is server-rendered, so it is
 * the first paint and stays up until the desktop has loaded and BOOT_MS has passed. Repeat visits in
 * the same browser session, and a click or keypress, skip the minimum wait and the welcome screen.
 */
export function Startup() {
  const [phase, setPhase] = useState<Phase>('boot');
  const ready = useRef(false);
  const minElapsed = useRef(false);
  const quick = useRef(false);
  const checkedSession = useRef(false);

  const advance = useCallback(() => {
    if (!ready.current) return;
    if (quick.current) setPhase('done');
    else if (minElapsed.current) setPhase((p) => (p === 'boot' ? 'welcome' : p));
  }, []);

  useEffect(() => {
    // Read the flag once per mount: StrictMode re-runs effects in dev, and the second run would
    // otherwise see the flag the first run just wrote.
    if (!checkedSession.current) {
      checkedSession.current = true;
      try {
        quick.current = sessionStorage.getItem(SEEN_KEY) === '1';
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        // Storage blocked: always play the full sequence.
      }
    }
    // Count from navigation start, so time spent loading scripts counts toward the minimum.
    const t = window.setTimeout(
      () => {
        minElapsed.current = true;
        advance();
      },
      Math.max(0, BOOT_MS - performance.now()),
    );
    return () => window.clearTimeout(t);
  }, [advance]);

  useEffect(() => {
    if (phase === 'done') return;
    const skip = () => {
      quick.current = true;
      advance();
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [phase, advance]);

  useEffect(() => {
    if (phase !== 'welcome') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => setPhase('done'), reduced ? 300 : WELCOME_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'done') useStartup.setState({ done: true });
  }, [phase]);

  const onReady = useCallback(() => {
    ready.current = true;
    advance();
  }, [advance]);

  return (
    <>
      <AppShell onReady={onReady} />
      {phase === 'boot' && <BootScreen />}
      {phase === 'welcome' && <WelcomeScreen />}
    </>
  );
}
