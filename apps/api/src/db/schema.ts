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
    /** Formally verified (VerificationPool → RigorRegistry): Σ 100 and the FORMAL ✓ badge. */
    formal: boolean('formal').notNull().default(false),
    formalAt: timestamp('formal_at', { withTimezone: true }),
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
    /**
     * The transaction behind the callout, when known: for system callouts the launch or buy they describe, for user
     * callouts the poster's latest trade on the linked coin (from the indexer, so it can't be made up).
     */
    txHash: text('tx_hash'),
    /** Set when tx_hash is a curve trade. */
    txSide: text('tx_side', { enum: ['buy', 'sell'] }),
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

/**
 * Ranked game runs for the daily leaderboards (Minesweeper, Solitaire). The server deals the seed and starts the clock (POST
 * /games/:game/start); a win is checked by replaying its moves, and its time is the server's own count from
 * start to finish, so neither the board nor the time comes from the browser. time_ms stays null until a verified win.
 */
export const gameRuns = pgTable(
  'game_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    wallet: text('wallet').notNull(),
    game: text('game', { enum: ['minesweeper', 'solitaire'] }).notNull(),
    /** Minesweeper's three levels; Solitaire has one (Klondike, draw one). */
    level: text('level', { enum: ['beginner', 'intermediate', 'expert', 'klondike'] }).notNull(),
    seed: integer('seed').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    timeMs: integer('time_ms'),
    /** Held $HEXE when the win was posted: the leaderboard's badge. */
    holder: boolean('holder').notNull().default(false),
  },
  (t) => [index('game_runs_board_idx').on(t.game, t.level, t.finishedAt), index('game_runs_wallet_idx').on(t.wallet, t.startedAt)],
);

/**
 * Proof files prepared for submission (POST /verification/prepare): pinned to IPFS and kept here so the verifier
 * worker needn't fetch them back. Keyed by sha256, the proofHash the VerificationPool records.
 */
export const verificationProofs = pgTable('verification_proofs', {
  proofHash: text('proof_hash').primaryKey(),
  cid: text('cid').notNull(),
  content: text('content').notNull(),
  bytes: integer('bytes').notNull(),
  tokenAddress: text('token_address').notNull(),
  uploader: text('uploader').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Formal verification submissions (brief §5.2), one per on-chain VerificationPool submission (id = its bytes32).
 * Also the work queue: the verifier worker claims 'queued' rows and, after the admin's review, 'approved' ones.
 */
export const verificationSubmissions = pgTable(
  'verification_submissions',
  {
    id: text('id').primaryKey(),
    tokenAddress: text('token_address').notNull(),
    submitter: text('submitter_address').notNull(),
    proofHash: text('proof_hash').notNull(),
    ipfsCid: text('ipfs_cid').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    status: text('status', { enum: ['queued', 'compiling', 'passed', 'approved', 'verified', 'failed', 'rejected'] }).notNull().default('queued'),
    /** The heuristic's guess (services/tierEstimator.ts), shown to the admin; never paid on its own. */
    suggestedTier: text('suggested_tier', { enum: ['TRIVIAL', 'SIMPLE', 'MEDIUM', 'HARD', 'OPEN'] }),
    /** The tier the admin approved; the one signed and paid. */
    tier: text('tier', { enum: ['TRIVIAL', 'SIMPLE', 'MEDIUM', 'HARD', 'OPEN'] }),
    rewardWei: numeric('reward_amount', { precision: 78, scale: 0 }),
    /** The checker's report: each theorem's statement and axioms. */
    theorems: jsonb('theorems').$type<{ name: string; statement: string; axioms: string[]; ok: boolean }[]>(),
    /** Why it failed, for the submitter: the first lines of the compiler's errors or the checker's reason. */
    errorSummary: text('error_summary'),
    compileMs: integer('compile_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    txHashSubmit: text('tx_hash_submit'),
    txHashResult: text('tx_hash_result'),
    adminTierOverride: boolean('admin_tier_override').notNull().default(false),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    /** The last on-chain posting error (e.g. the pool is short of funds); the worker retries. */
    lastError: text('last_error'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_verification_token').on(t.tokenAddress),
    index('idx_verification_submitter').on(t.submitter),
    index('idx_verification_status').on(t.status),
    index('idx_verification_submitted').on(t.submittedAt),
  ],
);
