import { formatUnits } from 'viem';

/** 1234.5678 with up to `maxFraction` decimals; `compact` gives 28.2M for large token counts. */
export function formatAmount(value: bigint, decimals: number, { maxFraction = 6, compact = false } = {}): string {
  const n = Number(formatUnits(value, decimals));
  if (compact && Math.abs(n) >= 10_000) {
    return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
  }
  const digits = n !== 0 && Math.abs(n) < 1 ? Math.max(maxFraction, 2) : Math.min(maxFraction, 4);
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** Basis points as a percentage: 150n → "1.5%". */
export const formatBps = (bps: bigint | number) => `${(Number(bps) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

/** 0x12ab…9f0c */
export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** 0x12ab…9f0c for a transaction hash. */
export const shortHash = shortAddress;
