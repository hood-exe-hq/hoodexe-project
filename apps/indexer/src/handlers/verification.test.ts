import { describe, it } from 'vitest';
import { createTestIndexer } from 'envio';

const CHAIN = 4663;
const POOL = '0x00000000000000000000000000000000000000Aa';
const REGISTRY = '0x00000000000000000000000000000000000000Bb';
const USER = '0x00000000000000000000000000000000000000E1';
const COIN = '0x00000000000000000000000000000000000000C1';
const B = 84_000_000;
const T0 = 1_791_500_000;
const id = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;
const tx = (n: number) => ({ hash: `0x${(n + 500).toString(16).padStart(64, '0')}` as `0x${string}` });

const submitted = (n: number) =>
  ({
    contract: 'VerificationPool',
    event: 'Submitted',
    srcAddress: POOL,
    logIndex: n,
    block: { number: B + n, timestamp: T0 + n },
    transaction: tx(n),
    params: { id: id(n), submitter: USER, token: COIN, proofHash: id(100 + n), ipfsCid: `bafy${n}` },
  }) as const;

// Envio's test indexer only routes events from contracts with an address on the chain, and VerificationPool and
// RigorRegistry aren't deployed yet (their chain entries in config.yaml are commented out). Un-skip when filling in
// the deployed addresses (POOL and REGISTRY below must then be those addresses). Wildcard handlers are not an
// option: anyone could deploy a contract emitting look-alike Verified events and forge FORMAL records.
describe.skip('formal verification handlers', () => {
  it('records a submission, then its payout, and marks the coin formal', async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            submitted(1),
            { contract: 'VerificationPool', event: 'Verified', srcAddress: POOL, logIndex: 2, block: { number: B + 2, timestamp: T0 + 60 }, transaction: tx(2), params: { id: id(1), tier: 2n, reward: 25n * 10n ** 16n } },
            { contract: 'RigorRegistry', event: 'FormalVerificationUpgrade', srcAddress: REGISTRY, logIndex: 3, block: { number: B + 2, timestamp: T0 + 60 }, params: { token: COIN } },
          ],
        },
      },
    });
    const s = await indexer.VerificationSubmission.getOrThrow(id(1));
    t.expect(s).toMatchObject({ submitter: USER, token: COIN, ipfsCid: 'bafy1', status: 'verified', tier: 2, reward: 25n * 10n ** 16n, resultAt: T0 + 60, submitTx: tx(1).hash, resultTx: tx(2).hash });
    t.expect(await indexer.FormalToken.getOrThrow(COIN)).toMatchObject({ verified: true, upgradedAt: T0 + 60 });
  });

  it('records failures with their reason, refunds, and a revoked badge', async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            submitted(1),
            submitted(2),
            { contract: 'VerificationPool', event: 'Failed', srcAddress: POOL, logIndex: 3, block: { number: B + 3, timestamp: T0 + 90 }, params: { id: id(1), reason: "error: unknown identifier 'foo'" } },
            { contract: 'VerificationPool', event: 'Refunded', srcAddress: POOL, logIndex: 4, block: { number: B + 4, timestamp: T0 + 95 }, params: { id: id(2), amount: 10n ** 16n } },
            // An event for a submission from before indexing started is ignored, not invented.
            { contract: 'VerificationPool', event: 'Failed', srcAddress: POOL, logIndex: 5, block: { number: B + 5, timestamp: T0 + 99 }, params: { id: id(9), reason: 'x' } },
            { contract: 'RigorRegistry', event: 'FormalVerificationUpgrade', srcAddress: REGISTRY, logIndex: 6, block: { number: B + 6, timestamp: T0 + 100 }, params: { token: COIN } },
            { contract: 'RigorRegistry', event: 'FormalVerificationRevoked', srcAddress: REGISTRY, logIndex: 7, block: { number: B + 7, timestamp: T0 + 200 }, params: { token: COIN, reason: 'proves a different theorem' } },
          ],
        },
      },
    });
    t.expect(await indexer.VerificationSubmission.getOrThrow(id(1))).toMatchObject({ status: 'failed', failReason: "error: unknown identifier 'foo'", resultAt: T0 + 90 });
    t.expect(await indexer.VerificationSubmission.getOrThrow(id(2))).toMatchObject({ status: 'refunded' });
    t.expect(await indexer.VerificationSubmission.get(id(9))).toBeUndefined();
    t.expect(await indexer.FormalToken.getOrThrow(COIN)).toMatchObject({ verified: false, revokedAt: T0 + 200, revokeReason: 'proves a different theorem' });
  });
});
