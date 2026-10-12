export type HoodToken = { address: `0x${string}`; ticker: string };

/**
 * hood.exe's own token. While this is null, the contract address is hidden everywhere it would show (the Welcome
 * window, the taskbar tray and About). It trades on Pons, so hood.exe indexes it like any launch.
 */
export const HOOD_TOKEN = { address: '0x600b086FC24079F4E9e0c6632fd483234fF10644', ticker: 'HEXE' } as HoodToken | null;
