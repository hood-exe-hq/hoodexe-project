'use client';

import { useState } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useQuery } from '@tanstack/react-query';
import { isAddressEqual, type Address } from 'viem';
import { currentSession } from '@/lib/api';
import { useIdentity } from '@/lib/identity';
import { ensureSession } from '@/lib/siwe';

/**
 * Ranked play needs the connected wallet signed in (the same session Callouts uses). `signIn` connects a wallet if
 * there isn't one, or asks the connected one to sign in.
 */
export function useRankedSession() {
  const { address, connected } = useIdentity();
  const { openConnectModal } = useConnectModal();
  const session = useQuery({ queryKey: ['session'], queryFn: currentSession, staleTime: 60_000, retry: false });
  const signedIn = connected && !!address && !!session.data && isAddressEqual(session.data as Address, address);
  const [signingIn, setSigningIn] = useState(false);
  const signIn = async () => {
    if (!connected || !address) return openConnectModal?.();
    setSigningIn(true);
    try {
      await ensureSession(address);
      await session.refetch();
    } catch {
      // Declined in the wallet: stay unranked.
    } finally {
      setSigningIn(false);
    }
  };
  return { signedIn, signIn: () => void signIn(), signingIn };
}
