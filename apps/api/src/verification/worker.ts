import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { formatEther, type Hex } from 'viem';
import { screenProof } from '@hood/shared';
import { insertSystemCallout, presentCallouts } from '../callouts';
import { schema, type Db } from '../db';
import { ingestSubmissions } from '../routes/verification';
import { RunnerError, type LeanRunner } from '../services/leanRunner';
import { PoolRevert, type PoolReader, type PoolWriter } from '../services/poolChain';
import { CALLOUTS_CHANNEL, type PubSub } from '../services/pubsub';
import { estimateTier } from '../services/tierEstimator';

const subs = schema.verificationSubmissions;
const SCAN_CURSOR = 'verification:scanBlock';
/** On a first run, look back this far for submissions made before the worker started. */
const FIRST_SCAN_BLOCKS = 50_000n;
const SCAN_CHUNK = 10_000n;
/** Posting a result on-chain gives up (and waits for a person) after this many tries. */
const MAX_POST_ATTEMPTS = 5;

export type WorkerDeps = {
  db: Db;
  pool: PoolReader;
  writer: PoolWriter;
  runner: LeanRunner;
  pubsub: PubSub;
  concurrency: number;
  now: () => Date;
  log?: (msg: string) => void;
};

/** The worker crashed mid-proof: those proofs go back in the queue. */
export async function requeueStale(db: Db): Promise<number> {
  const rows = await db.update(subs).set({ status: 'queued', startedAt: null }).where(eq(subs.status, 'compiling')).returning({ id: subs.id });
  return rows.length;
}

/** Picks up on-chain submissions the web app didn't confirm (closed tab, direct contract calls). */
export async function scanChain({ db, pool, log }: Pick<WorkerDeps, 'db' | 'pool' | 'log'>): Promise<number> {
  const head = await pool.head();
  const [cursor] = await db.select().from(schema.indexState).where(eq(schema.indexState.key, SCAN_CURSOR)).limit(1);
  let from = cursor ? BigInt(cursor.value) + 1n : head > FIRST_SCAN_BLOCKS ? head - FIRST_SCAN_BLOCKS : 0n;
  let found = 0;
  while (from <= head) {
    const to = from + SCAN_CHUNK - 1n < head ? from + SCAN_CHUNK - 1n : head;
    const batch = await pool.submissionsBetween(from, to);
    if (batch.length) found += (await ingestSubmissions(db, batch)).length;
    await db
      .insert(schema.indexState)
      .values({ key: SCAN_CURSOR, value: String(to) })
      .onConflictDoUpdate({ target: schema.indexState.key, set: { value: String(to) } });
    from = to + 1n;
  }
  if (found) log?.(`found ${found} submission(s) on-chain`);
  return found;
}

/** Claims up to `n` queued proofs, oldest first; SKIP LOCKED lets several workers share the queue. */
async function claim(db: Db, n: number, now: Date) {
  const next = db.select({ id: subs.id }).from(subs).where(eq(subs.status, 'queued')).orderBy(asc(subs.submittedAt)).limit(n).for('update', { skipLocked: true });
  return db.update(subs).set({ status: 'compiling', startedAt: now, attempts: sql`${subs.attempts} + 1` }).where(inArray(subs.id, next)).returning();
}

/** Compiles and checks queued proofs, up to `concurrency` at a time. */
export async function processQueue({ db, runner, concurrency, now, log }: Pick<WorkerDeps, 'db' | 'runner' | 'concurrency' | 'now' | 'log'>): Promise<number> {
  const jobs = await claim(db, concurrency, now());
  await Promise.all(
    jobs.map(async (job) => {
      const [proof] = await db.select({ content: schema.verificationProofs.content }).from(schema.verificationProofs).where(eq(schema.verificationProofs.proofHash, job.proofHash)).limit(1);
      const fail = (errorSummary: string, extra: Partial<typeof subs.$inferInsert> = {}) =>
        db.update(subs).set({ status: 'failed', errorSummary, checkedAt: now(), ...extra }).where(eq(subs.id, job.id));
      if (!proof) return fail('The proof file is missing.');
      // The API screened it before pinning; again here in case a row came in another way.
      const problems = screenProof(proof.content);
      if (problems.length) return fail(`Line ${problems[0].line} ${problems[0].why}.`);
      try {
        const result = await runner.verify(proof.content);
        log?.(`${job.id.slice(0, 10)}… ${result.status} in ${Math.round(result.compileMs / 1000)} s`);
        if (result.status === 'passed') {
          await db
            .update(subs)
            .set({ status: 'passed', theorems: result.verdict!.theorems, suggestedTier: estimateTier(proof.content).tier, compileMs: result.compileMs, checkedAt: now(), errorSummary: null })
            .where(eq(subs.id, job.id));
        } else {
          await fail(result.errorSummary ?? 'The proof did not pass.', { theorems: result.verdict?.theorems ?? null, compileMs: result.compileMs });
        }
      } catch (e) {
        // Our sandbox failed, not the proof: back to the queue for another try.
        const message = e instanceof RunnerError ? e.message : String(e);
        log?.(`${job.id.slice(0, 10)}… sandbox error, requeued: ${message}`);
        await db.update(subs).set({ status: 'queued', startedAt: null, lastError: message.slice(0, 500) }).where(eq(subs.id, job.id));
      }
    }),
  );
  return jobs.length;
}

/**
 * Posts reviewed results on-chain: failed and rejected proofs get markFailed (the fee stays in the pool), approved
 * ones get the bot's signed markVerified, which upgrades the coin and pays the reward. A pool short of funds keeps
 * an approval waiting, and is retried every tick until it's topped up.
 */
export async function postResults({ db, pool, writer, pubsub, now, log }: Pick<WorkerDeps, 'db' | 'pool' | 'writer' | 'pubsub' | 'now' | 'log'>): Promise<number> {
  let posted = 0;
  const done = await db
    .select()
    .from(subs)
    .where(and(inArray(subs.status, ['failed', 'rejected']), isNull(subs.txHashResult), lt(subs.attempts, MAX_POST_ATTEMPTS + 1)));
  for (const row of done) {
    try {
      if ((await pool.status(row.id as Hex)) !== 'Pending') {
        await db.update(subs).set({ txHashResult: 'none' }).where(eq(subs.id, row.id)); // refunded or already settled
        continue;
      }
      const hash = await writer.markFailed(row.id as Hex, row.errorSummary ?? 'failed');
      await db.update(subs).set({ txHashResult: hash, lastError: null }).where(eq(subs.id, row.id));
      posted++;
    } catch (e) {
      await db.update(subs).set({ attempts: sql`${subs.attempts} + 1`, lastError: String(e).slice(0, 500) }).where(eq(subs.id, row.id));
    }
  }

  const approved = await db.select().from(subs).where(eq(subs.status, 'approved'));
  for (const row of approved) {
    try {
      const reward = await pool.rewardWei(row.tier!);
      const hash = await writer.markVerified(row.id as Hex, row.tier!);
      const at = now();
      await db.update(subs).set({ status: 'verified', verifiedAt: at, txHashResult: hash, rewardWei: reward.toString(), lastError: null }).where(eq(subs.id, row.id));
      const [coin] = await db
        .update(schema.tokens)
        .set({ formal: true, formalAt: at })
        .where(sql`lower(${schema.tokens.tokenAddress}) = ${row.tokenAddress.toLowerCase()}`)
        .returning({ symbol: schema.tokens.symbol, token: schema.tokens.tokenAddress });
      log?.(`verified ${row.id.slice(0, 10)}… ($${coin?.symbol ?? '?'}, ${row.tier}) ${hash}`);
      if (coin) {
        const callout = await insertSystemCallout(db, {
          sourceKey: `formal:${row.id}`,
          text: `🧮 $${coin.symbol} just got FORMAL ✓ — Σ 100 (+${formatEther(reward)} ETH)`,
          tokenAddress: coin.token,
          ticker: coin.symbol,
          createdAt: at,
          txHash: hash,
        });
        if (callout) for (const dto of await presentCallouts(db, [callout], { official: [] })) await pubsub.publish(CALLOUTS_CHANNEL, { type: 'callout', callout: dto });
      }
      posted++;
    } catch (e) {
      const waiting = e instanceof PoolRevert && e.errorName === 'PoolDepleted';
      await db
        .update(subs)
        .set({ lastError: waiting ? 'Waiting for the reward pool to be topped up.' : String(e).slice(0, 500), attempts: waiting ? subs.attempts : sql`${subs.attempts} + 1` })
        .where(eq(subs.id, row.id));
      if (!waiting) log?.(`markVerified ${row.id.slice(0, 10)}… failed: ${String(e).slice(0, 200)}`);
    }
  }
  return posted;
}

/** One pass: find new submissions, check what's queued, post what's decided. */
export async function verifierTick(deps: WorkerDeps): Promise<void> {
  await scanChain(deps).catch((e) => deps.log?.(`chain scan failed: ${String(e).slice(0, 200)}`));
  await processQueue(deps);
  await postResults(deps);
}
