import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HEXE_TOKEN } from '@hood/shared';
import { PRESETS, newGame, reveal, type RankedMove } from '@hood/shared/minesweeper';
import { alice, bob, setup, signIn } from './test/helpers';

type Ctx = Awaited<ReturnType<typeof setup>>;
let ctx: Ctx;
beforeEach(async () => {
  ctx = await setup();
});
afterEach(async () => {
  await ctx.close();
});

type Level = keyof typeof PRESETS;

/** A real win on the board `seed` deals: open a corner, then every safe cell. */
function winningMoves(level: Level, seed: number): RankedMove[] {
  const first = reveal(newGame(PRESETS[level], true), 0, 0, 0, seed);
  const moves: RankedMove[] = [['r', 0, 0]];
  first.board.forEach((row, r) => row.forEach((c, col) => !c.isMine && moves.push(['r', r, col])));
  return moves;
}

async function start(cookie: string, level: Level = 'beginner') {
  const res = await ctx.app.inject({ method: 'POST', url: '/games/minesweeper/start', headers: { cookie }, payload: { level } });
  expect(res.statusCode).toBe(200);
  return res.json() as { id: string; seed: number };
}

const finish = (cookie: string, id: string, moves: RankedMove[], marks = true) =>
  ctx.app.inject({ method: 'POST', url: `/games/minesweeper/${id}/finish`, headers: { cookie }, payload: { marks, moves } });

/** Starts a ranked game, "plays" it for `ms` on the server's clock, and submits a win. */
async function win(cookie: string, ms: number, level: Level = 'beginner') {
  const run = await start(cookie, level);
  ctx.advance(ms);
  const res = await finish(cookie, run.id, winningMoves(level, run.seed));
  expect(res.statusCode).toBe(200);
  return res.json();
}

const board = async (level: Level = 'beginner', cookie?: string) =>
  (await ctx.app.inject({ method: 'GET', url: `/leaderboard/minesweeper?level=${level}`, headers: cookie ? { cookie } : {} })).json();

describe('daily Minesweeper leaderboard', () => {
  it('needs a signed-in wallet to play ranked', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/games/minesweeper/start', payload: { level: 'beginner' } })).statusCode).toBe(401);
  });

  it("times a ranked win by the server's clock and ranks it", async () => {
    const a = await signIn(ctx, alice);
    expect(await win(a, 42_500)).toEqual({ level: 'beginner', timeMs: 42_500, best: 42_500, rank: 1, players: 1 });
    const b = await board('beginner', a);
    expect(b).toMatchObject({ level: 'beginner', day: '2026-10-09', players: 1, you: { rank: 1, timeMs: 42_500 } });
    expect(b.entries).toEqual([{ rank: 1, wallet: alice.address, nickname: null, timeMs: 42_500, holder: false }]);
  });

  it('keeps each wallet\'s best of the day, fastest first, per level', async () => {
    const a = await signIn(ctx, alice);
    const b = await signIn(ctx, bob);
    await win(a, 50_000);
    await win(a, 40_000);
    await win(a, 60_000);
    expect(await win(b, 45_000)).toMatchObject({ rank: 2, players: 2 });
    await win(b, 30_000, 'expert');
    expect((await board('beginner')).entries.map((e: { wallet: string; timeMs: number }) => [e.wallet, e.timeMs])).toEqual([
      [alice.address, 40_000],
      [bob.address, 45_000],
    ]);
    expect((await board('expert')).entries).toHaveLength(1);
    expect((await board('beginner')).you).toBeNull();
  });

  it('starts a new board at midnight UTC', async () => {
    const a = await signIn(ctx, alice);
    await win(a, 40_000);
    ctx.advance(12 * 3_600_000);
    expect(await board()).toMatchObject({ day: '2026-10-10', players: 0, entries: [] });
  });

  it('rejects moves that do not win the board, and counts each run once', async () => {
    const a = await signIn(ctx, alice);
    const run = await start(a);
    const lose = await finish(a, run.id, winningMoves('beginner', run.seed + 1));
    expect(lose.statusCode).toBe(422);
    expect((await finish(a, run.id, winningMoves('beginner', run.seed))).statusCode).toBe(409);
    expect((await board()).players).toBe(0);
  });

  it("won't take another wallet's run, a stale run, or a malformed one", async () => {
    const a = await signIn(ctx, alice);
    const b = await signIn(ctx, bob);
    const run = await start(a);
    expect((await finish(b, run.id, winningMoves('beginner', run.seed))).statusCode).toBe(404);
    expect((await finish(a, 'not-a-uuid', winningMoves('beginner', run.seed))).statusCode).toBe(404);
    expect((await finish(a, run.id, [['x' as 'r', 0, 0]])).statusCode).toBe(400);

    const late = await start(a);
    ctx.advance(61 * 60_000);
    expect((await finish(a, late.id, winningMoves('beginner', late.seed))).statusCode).toBe(410);
  });

  it('badges wallets holding $HEXE', async () => {
    const a = await signIn(ctx, alice);
    ctx.tokenBalances.set(`${HEXE_TOKEN.address.toLowerCase()}:${alice.address.toLowerCase()}`, 10n ** 18n);
    await win(a, 40_000);
    expect((await board()).entries[0].holder).toBe(true);
  });

  it('limits how fast a wallet starts ranked games', async () => {
    const a = await signIn(ctx, alice);
    for (let i = 0; i < 30; i++) await start(a);
    expect((await ctx.app.inject({ method: 'POST', url: '/games/minesweeper/start', headers: { cookie: a }, payload: { level: 'beginner' } })).statusCode).toBe(429);
  });
});
