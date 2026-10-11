import { eq, sql } from 'drizzle-orm';
import { formatEther } from 'viem';
import { NATIVE_PAIR, shortAddress } from '@hood/shared';
import { insertSystemCallout, presentCallouts } from './callouts';
import { schema, type Db } from './db';
import type { EnvioClient } from './services/envio';
import { CALLOUTS_CHANNEL, type PubSub } from './services/pubsub';

/** Buys at or above this many ETH get a system callout (docs/BRIEF.md §5.5). */
export const BIG_BUY_ETH = 500_000_000_000_000_000n;
/** Older events are recorded but not pushed live, so a first run or a catch-up doesn't spray balloons. */
const LIVE_WINDOW_MS = 10 * 60_000;
const BUYS_CURSOR = 'worker:bigBuysBlock';

type Deps = { db: Db; pubsub: PubSub; envio?: EnvioClient; now: () => Date; log?: (msg: string) => void };

const ethText = (wei: bigint) => {
  const n = Number(formatEther(wei));
  return n >= 10 ? n.toFixed(1).replace(/\.0$/, '') : n.toFixed(2).replace(/0$/, '');
};

/**
 * One pass of the worker (docs/BRIEF.md §9): system callouts for hood.exe coins — launched, graduated
 * to Uniswap V4, and buys ≥ 0.5 ETH — each posted once (by source key) and pushed live when recent.
 * Launches and phases come from the API's token table; big buys from the indexer.
 */
export async function systemCalloutsTick({ db, pubsub, envio, now, log }: Deps): Promise<number> {
  const posted: (typeof schema.callouts.$inferSelect)[] = [];
  const hood = await db.select().from(schema.tokens).where(eq(schema.tokens.hood, true));
  // Launches recorded through hood.exe (POST /launches) carry their transaction; ones found only on-chain don't.
  const launchTx = new Map((await db.select({ token: schema.launches.tokenAddress, tx: schema.launches.txHash }).from(schema.launches)).map((l) => [l.token.toLowerCase(), l.tx]));

  for (const t of hood) {
    const launched = await insertSystemCallout(db, {
      sourceKey: `launch:${t.tokenAddress.toLowerCase()}`,
      text: `$${t.symbol} launched`,
      tokenAddress: t.tokenAddress,
      ticker: t.symbol,
      createdAt: t.launchedAt,
      txHash: launchTx.get(t.tokenAddress.toLowerCase()),
    });
    if (launched) posted.push(launched);
    if (t.phase >= 2) {
      const graduated = await insertSystemCallout(db, {
        sourceKey: `graduated:${t.tokenAddress.toLowerCase()}`,
        text: `$${t.symbol} graduated to Uniswap V4`,
        tokenAddress: t.tokenAddress,
        ticker: t.symbol,
      });
      if (graduated) posted.push(graduated);
    }
  }
  // A launch callout can go up before its creator's POST /launches lands, or predate the tx_hash column.
  await db.execute(
    sql`update callouts set tx_hash = launches.tx_hash from launches
        where callouts.tx_hash is null and callouts.source_key = 'launch:' || lower(launches.token_address)`,
  );

  // Big buys are an ETH measure, so only ETH-paired coins qualify.
  const ethCoins = hood.filter((t) => t.pairToken.toLowerCase() === NATIVE_PAIR);
  if (envio && ethCoins.length) {
    const [cursor] = await db.select().from(schema.indexState).where(eq(schema.indexState.key, BUYS_CURSOR)).limit(1);
    // First run: start at the indexer's head instead of replaying history.
    let after = cursor ? Number(cursor.value) : await envio.latestBlock();
    const byAddress = new Map(ethCoins.map((t) => [t.tokenAddress.toLowerCase(), t]));
    const buys = await envio.bigBuys(
      ethCoins.map((t) => t.tokenAddress),
      BIG_BUY_ETH,
      after,
    );
    for (const b of buys) {
      const coin = byAddress.get(b.token.toLowerCase());
      if (!coin) continue;
      const row = await insertSystemCallout(db, {
        sourceKey: `buy:${b.id}`,
        text: `${shortAddress(b.trader)} bought ${ethText(b.quoteAmount)} ETH of $${coin.symbol}`,
        tokenAddress: coin.tokenAddress,
        ticker: coin.symbol,
        createdAt: new Date(b.timestamp * 1000),
        txHash: b.txHash,
        txSide: 'buy',
      });
      if (row) posted.push(row);
      after = Math.max(after, b.blockNumber);
    }
    await db
      .insert(schema.indexState)
      .values({ key: BUYS_CURSOR, value: String(after) })
      .onConflictDoUpdate({ target: schema.indexState.key, set: { value: String(after) } });
  }

  const recent = posted.filter((p) => now().getTime() - p.createdAt.getTime() < LIVE_WINDOW_MS).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const callout of await presentCallouts(db, recent, { official: [] })) {
    await pubsub.publish(CALLOUTS_CHANNEL, { type: 'callout', callout });
  }
  if (posted.length) log?.(`posted ${posted.length} system callout(s), ${recent.length} live`);
  return posted.length;
}
