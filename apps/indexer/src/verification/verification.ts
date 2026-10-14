import { indexer, type EvmOnEventContext } from 'envio';

/** VerificationPool and RigorRegistry events (hood-exe-formal-verification-brief.md §6). */

indexer.onEvent({ contract: 'VerificationPool', event: 'Submitted' }, async ({ event, context }) => {
  const { id, submitter, token, proofHash, ipfsCid } = event.params;
  context.VerificationSubmission.set({
    id,
    submitter,
    token,
    proofHash,
    ipfsCid,
    submittedAt: event.block.timestamp,
    submitTx: event.transaction.hash,
    status: 'pending',
    tier: undefined,
    reward: undefined,
    resultAt: undefined,
    resultTx: undefined,
    failReason: undefined,
  });
});

/** Settles a submission recorded by Submitted; one we never saw (indexing started later) is left alone. */
async function settle(
  context: EvmOnEventContext,
  id: string,
  patch: { status: string; tier?: number; reward?: bigint; resultAt: number; resultTx?: string; failReason?: string },
) {
  const s = await context.VerificationSubmission.get(id);
  if (s) context.VerificationSubmission.set({ ...s, ...patch });
}

indexer.onEvent({ contract: 'VerificationPool', event: 'Verified' }, async ({ event, context }) => {
  await settle(context, event.params.id, {
    status: 'verified',
    tier: Number(event.params.tier),
    reward: event.params.reward,
    resultAt: event.block.timestamp,
    resultTx: event.transaction.hash,
  });
});

indexer.onEvent({ contract: 'VerificationPool', event: 'Failed' }, async ({ event, context }) => {
  await settle(context, event.params.id, { status: 'failed', resultAt: event.block.timestamp, failReason: event.params.reason });
});

indexer.onEvent({ contract: 'VerificationPool', event: 'Refunded' }, async ({ event, context }) => {
  await settle(context, event.params.id, { status: 'refunded', resultAt: event.block.timestamp });
});

indexer.onEvent({ contract: 'RigorRegistry', event: 'FormalVerificationUpgrade' }, async ({ event, context }) => {
  context.FormalToken.set({ id: event.params.token, verified: true, upgradedAt: event.block.timestamp, revokedAt: undefined, revokeReason: undefined });
});

indexer.onEvent({ contract: 'RigorRegistry', event: 'FormalVerificationRevoked' }, async ({ event, context }) => {
  const t = await context.FormalToken.get(event.params.token);
  if (t) context.FormalToken.set({ ...t, verified: false, revokedAt: event.block.timestamp, revokeReason: event.params.reason });
});
