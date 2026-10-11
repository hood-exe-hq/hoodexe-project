import { bigint, boolean, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** docs/BRIEF.md §9. Callouts, reactions and profiles arrive with Callouts.exe in week 3. */

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_wallet_idx').on(t.wallet)],
);

/** Rigor scores keyed by SHA-256 of the normalised statement. Only successful scores are stored. */
export const scores = pgTable('scores', {
  contentHash: text('content_hash').primaryKey(),
  statement: text('statement').notNull(),
  score: integer('score').notNull(),
  parts: jsonb('parts').$type<{ wellFormed: number; status: number; significance: number; clarity: number }>().notNull(),
  statusLabel: text('status_label').notNull(),
  reasoning: text('reasoning').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const launches = pgTable(
  'launches',
  {
    txHash: text('tx_hash').primaryKey(),
    tokenAddress: text('token_address').notNull().unique(),
    curveAddress: text('curve_address').notNull(),
    creator: text('creator').notNull(),
    pairToken: text('pair_token').notNull(),
    metadataCid: text('metadata_cid'),
    /** Server-side score for the statement, never the number written on-chain by the client. */
    rigorScore: integer('rigor_score'),
    blockNumber: text('block_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('launches_creator_idx').on(t.creator)],
);

/**
 * Pons V2 launches for Explore. Filled by the interim RPC index (services/tokenIndex.ts) until Envio takes
 * over; third-party names, symbols, logos and descriptions are untrusted and only ever rendered as text.
 */
export const tokens = pgTable(
  'tokens',
  {
    tokenAddress: text('token_address').primaryKey(),
    curveAddress: text('curve_address').notNull(),
    deployer: text('deployer').notNull(),
    pairToken: text('pair_token').notNull(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    launchedAt: timestamp('launched_at', { withTimezone: true }).notNull(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    logo: text('logo').notNull(),
    description: text('description').notNull(),
    /** Launched through hood.exe: the description parses as ours. */
    hood: boolean('hood').notNull().default(false),
    statement: text('statement'),
    metadataCid: text('metadata_cid'),
    /** Server-side score for the statement, never the number in the description. */
    rigorScore: integer('rigor_score'),
    graduationThreshold: numeric('graduation_threshold', { precision: 78, scale: 0 }).notNull(),
    /** getLaunchedToken().phase: 0 curve, 1 swept, 2 pool, 3 rescued. */
    phase: smallint('phase').notNull().default(0),
    quoteReserve: numeric('quote_reserve', { precision: 78, scale: 0 }),
    tokenReserve: numeric('token_reserve', { precision: 78, scale: 0 }),
    realQuoteReserve: numeric('real_quote_reserve', { precision: 78, scale: 0 }),
    stateUpdatedAt: timestamp('state_updated_at', { withTimezone: true }),
    /** Gross quote traded over the last ~24 h (hourly candles), when the indexer is available. */
    volume24h: numeric('volume_24h', { precision: 78, scale: 0 }),
    trades24h: integer('trades_24h'),
  },
  (t) => [index('tokens_block_idx').on(t.blockNumber), index('tokens_hood_idx').on(t.hood, t.blockNumber)],
);

/** Small key/value cursor store for background jobs (e.g. the last indexed block). */
export const indexState = pgTable('index_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Wallet identities for callouts (docs/BRIEF.md §5.5, §10). Official comes from OFFICIAL_WALLETS. */
export const profiles = pgTable('profiles', {
  wallet: text('wallet').primaryKey(),
  /** 3–15 chars a-z 0-9 _; unique; changeable once per 24 h. */
  nickname: text('nickname').unique(),
  nicknameChangedAt: timestamp('nickname_changed_at', { withTimezone: true }),
  /** Set by Bix. Wallets whose hood.exe launch graduated count as verified without it. */
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const callouts = pgTable(
  'callouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The poster; empty for system callouts, which the worker writes as "hood.exe". */
    wallet: text('wallet').notNull(),
    tokenAddress: text('token_address'),
    ticker: text('ticker'),
    text: text('text').notNull(),
    kind: text('kind', { enum: ['user', 'system'] }).notNull(),
    /** Stored but not shown: blocklist, model verdict, or moderation unavailable (§10). */
    hidden: boolean('hidden').notNull().default(false),
    hiddenReason: text('hidden_reason'),
    /** System callouts: the event they describe, so the worker never posts one twice. */
    sourceKey: text('source_key').unique(),
    /** System callouts: the transaction behind the event (a launch or a buy), when known. */
    txHash: text('tx_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('callouts_created_idx').on(t.createdAt, t.id), index('callouts_token_idx').on(t.tokenAddress, t.createdAt), index('callouts_wallet_idx').on(t.wallet)],
);

export const reactions = pgTable(
  'reactions',
  {
    calloutId: uuid('callout_id')
      .notNull()
      .references(() => callouts.id, { onDelete: 'cascade' }),
    wallet: text('wallet').notNull(),
    kind: text('kind', { enum: ['rocket', 'eyes', 'skull'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.calloutId, t.wallet, t.kind] })],
);
