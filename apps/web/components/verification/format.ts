import { formatEther } from 'viem';
import type { VerificationRow } from '@/lib/api';

/** "45 min", "3 h 20 min". */
export function duration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

export const eth = (wei: string | null) => (wei ? `${formatEther(BigInt(wei))} ETH` : '');

/** The row's status in words, as the brief's queue shows it (§7.1). */
export function statusText(r: VerificationRow): string {
  switch (r.status) {
    case 'queued':
      return r.position ? `queued (position ${r.position}${r.estimatedWaitSec ? `, ~${duration(r.estimatedWaitSec)}` : ''})` : 'queued';
    case 'compiling':
      return `compiling${r.estimatedWaitSec ? ` (~${duration(r.estimatedWaitSec)} left)` : ''}`;
    case 'passed':
      return 'passed ✓, awaiting review';
    case 'approved':
      return 'approved, paying out';
    case 'verified':
      return `✓ Σ 100${r.rewardWei ? ` (+${eth(r.rewardWei)})` : ''}`;
    case 'failed':
      return 'failed';
    case 'rejected':
      return 'rejected at review';
  }
}
