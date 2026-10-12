import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { Address } from 'viem';
import { z } from 'zod';
import { HEXE_TOKEN } from '@hood/shared';
import { MAX_RANKED_MOVES, replayRanked } from '@hood/shared/minesweeper';
import { HttpError } from '../app';
import { schema } from '../db';
import { allow } from '../kv';

const LEVELS = ['beginner', 'intermediate', 'expert'] as const;
type Level = (typeof LEVELS)[number];

/** A ranked run must be finished within this long of its start. */
const RUN_TTL_MS = 60 * 60_000;
const TOP = 20;
const CACHE_MS = 10_000;

const startBody = z.object({ level: z.enum(LEVELS) });
const move = z.union([z.tuple([z.enum(['r', 'f', 'c']), z.number().int(), z.number().int()]), z.tuple([z.literal('m'), z.union([z.literal(0), z.literal(1)])])]);
const finishBody = z.object({ marks: z.boolean(), moves: z.array(move).min(1).max(MAX_RANKED_MOVES) });
const boardQuery = z.object({ level: z.enum(LEVELS).default('beginner') });

/** Midnight UTC that starts the day `now` falls in, and the next one: a leaderboard day. */
function utcDay(now: Date): { start: Date; end: Date; label: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 86_400_000), label: start.toISOString().slice(0, 10) };
}

type Entry = { rank: number; wallet: string; nickname: string | null; timeMs: number; holder: boolean };

/**
 * The daily Minesweeper leaderboard (Beginner, Intermediate, Expert; days run midnight to midnight UTC):
 * POST /games/minesweeper/start deals a seed and starts the server's clock, POST /games/minesweeper/:id/finish
 * replays the moves and records the time if they won, GET /leaderboard/minesweeper reads today's best per wallet.
 */
export async function gameRoutes(app: FastifyInstance) {
  const { db, kv, chain, now } = app.deps;
  const runs = schema.gameRuns;

  /** Today's best run per wallet on a level, fastest first; the earlier finish wins a tie. */
  async function standings(level: Level): Promise<Entry[]> {
    const day = utcDay(now());
    const best = await db
      .selectDistinctOn([runs.wallet], { wallet: runs.wallet, timeMs: runs.timeMs, holder: runs.holder, finishedAt: runs.finishedAt })
      .from(runs)
      .where(and(eq(runs.game, 'minesweeper'), eq(runs.level, level), isNotNull(runs.timeMs), gte(runs.finishedAt, day.start), lt(runs.finishedAt, day.end)))
      .orderBy(runs.wallet, asc(runs.timeMs), asc(runs.finishedAt));
    best.sort((a, b) => a.timeMs! - b.timeMs! || a.finishedAt!.getTime() - b.finishedAt!.getTime());
    const names = best.length
      ? new Map(
          (await db.select({ wallet: schema.profiles.wallet, nickname: schema.profiles.nickname }).from(schema.profiles).where(inArray(schema.profiles.wallet, best.map((b) => b.wallet)))).map((p) => [
            p.wallet,
            p.nickname,
          ]),
        )
      : new Map<string, string | null>();
    return best.map((b, i) => ({ rank: i + 1, wallet: b.wallet, nickname: names.get(b.wallet) ?? null, timeMs: b.timeMs!, holder: b.holder }));
  }

  // One read per level shared by every visitor for 10 s; a new win on that level clears it.
  const cache = new Map<Level, { at: number; day: string; entries: Entry[] }>();
  async function cachedStandings(level: Level) {
    const day = utcDay(now()).label;
    const hit = cache.get(level);
    if (hit && hit.day === day && Date.now() - hit.at < CACHE_MS) return hit.entries;
    const entries = await standings(level);
    cache.set(level, { at: Date.now(), day, entries });
    return entries;
  }

  app.post('/games/minesweeper/start', { preHandler: app.requireSession }, async (req) => {
    const wallet = req.wallet!;
    const { level } = startBody.parse(req.body);
    if (!(await allow(kv, `game-start:${wallet}`, 30, 60))) throw new HttpError(429, 'Slow down: up to 30 ranked games a minute.');
    const at = now();
    // Abandoned runs (lost, or the tab closed) are no use after a day.
    await db.delete(runs).where(and(eq(runs.wallet, wallet), isNull(runs.finishedAt), lt(runs.startedAt, new Date(at.getTime() - 86_400_000))));
    const [run] = await db.insert(runs).values({ wallet, game: 'minesweeper', level, seed: randomInt(0, 2 ** 31), startedAt: at }).returning({ id: runs.id, seed: runs.seed });
    return run;
  });

  app.post<{ Params: { id: string } }>('/games/minesweeper/:id/finish', { preHandler: app.requireSession }, async (req) => {
    const wallet = req.wallet!;
    const body = finishBody.parse(req.body);
    const at = now();
    const id = z.uuid().safeParse(req.params.id);
    if (!id.success) throw new HttpError(404, 'No such ranked game.');
    const [run] = await db.select().from(runs).where(and(eq(runs.id, id.data), eq(runs.wallet, wallet))).limit(1);
    if (!run) throw new HttpError(404, 'No such ranked game.');
    if (run.finishedAt) throw new HttpError(409, 'This game was already submitted.');
    const elapsed = at.getTime() - run.startedAt.getTime();
    // Claim the run before the slow parts, so two submissions can't both count.
    const claimed = await db.update(runs).set({ finishedAt: at }).where(and(eq(runs.id, run.id), isNull(runs.finishedAt))).returning({ id: runs.id });
    if (!claimed.length) throw new HttpError(409, 'This game was already submitted.');
    if (elapsed > RUN_TTL_MS) throw new HttpError(410, 'Ranked games have to be finished within an hour.');
    if (replayRanked(run.level, run.seed, body.marks, body.moves).status !== 'won') throw new HttpError(422, "Those moves don't win this board.");

    const holder = await chain
      .tokenBalances(wallet, [HEXE_TOKEN.address as Address])
      .then((m) => (m.get(HEXE_TOKEN.address as Address) ?? 0n) > 0n)
      .catch(() => false);
    await db.update(runs).set({ timeMs: elapsed, holder }).where(eq(runs.id, run.id));
    cache.delete(run.level);

    const entries = await cachedStandings(run.level);
    const mine = entries.find((e) => e.wallet === wallet);
    return { level: run.level, timeMs: elapsed, best: mine?.timeMs ?? elapsed, rank: mine?.rank ?? null, players: entries.length };
  });

  app.get('/leaderboard/minesweeper', async (req) => {
    const { level } = boardQuery.parse(req.query);
    const entries = await cachedStandings(level);
    const wallet = await app.sessionWallet(req);
    const you = wallet ? (entries.find((e) => e.wallet === wallet) ?? null) : null;
    return { level, day: utcDay(now()).label, players: entries.length, entries: entries.slice(0, TOP), you };
  });
}
