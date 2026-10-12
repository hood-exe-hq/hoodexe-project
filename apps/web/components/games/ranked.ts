/**
 * How a game window plays ranked games (the daily leaderboards), so the game hooks stay unaware of the API: `start`
 * gets the server's seed (and starts its clock), `finish` sends a win's moves for the server to replay and time.
 */
export type RankedHost<Level, Game, R> = {
  start: (level: Level) => Promise<{ id: string; seed: number }>;
  finish: (id: string, game: Game) => Promise<R>;
};

/** Where the current game stands with the leaderboard. */
export type RankedState<R> =
  | { phase: 'idle' }
  | { phase: 'starting' }
  | { phase: 'playing' }
  | { phase: 'submitting' }
  | { phase: 'done'; result: R }
  | { phase: 'unranked' | 'error'; message: string };

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
