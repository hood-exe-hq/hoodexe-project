import { HEXE_TOKEN } from '@hood/shared';

export type HoodToken = { address: `0x${string}`; ticker: string };

/**
 * hood.exe's own token (packages/shared/src/hexe.ts). Set this to null to hide the contract address everywhere
 * it shows: the Welcome window, the taskbar tray and About.
 */
export const HOOD_TOKEN = HEXE_TOKEN as HoodToken | null;
