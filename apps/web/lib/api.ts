import { z } from 'zod';
import { rigorScoreSchema, type RigorScore, type TheoremMetadata } from '@hood/shared';

/**
 * Typed client for apps/api (docs/BRIEF.md §9). Cookies ride along for the SIWE session. NEXT_PUBLIC_API_URL
 * is either the API's own URL (local dev) or `/api`, proxied to it by proxy.ts (production).
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const errorBody = z.object({ error: z.string() });

async function request<T>(path: string, init: RequestInit, schema: z.ZodType<T>, timeoutMs = 15_000): Promise<T> {
  if (!API_URL) throw new ApiError('The hood.exe API is not configured (NEXT_PUBLIC_API_URL).', 0);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ApiError('Could not reach the hood.exe API. Check your connection and try again.', 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorBody.safeParse(body);
    if (res.status === 401) throw new ApiError('Sign in with your wallet first.', 401);
    if (res.status === 429) throw new ApiError('Too many requests. Wait a minute and try again.', 429);
    throw new ApiError(parsed.success ? parsed.data.error : `The API answered ${res.status}.`, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('The API sent an unexpected response.', res.status);
  return parsed.data;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const sessionSchema = z.object({ wallet: z.string(), nickname: z.string().nullable().optional(), official: z.boolean().optional() });

/** GET /auth/me: the signed-in wallet, or null without a session. */
export async function currentSession(): Promise<string | null> {
  try {
    return (await request('/auth/me', { method: 'GET' }, sessionSchema)).wallet;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export const siweNonce = () => request('/auth/siwe', { method: 'GET' }, z.object({ nonce: z.string() })).then((r) => r.nonce);

export const verifySiwe = (message: string, signature: string) => request('/auth/siwe', json({ message, signature }), sessionSchema);

export const logout = () => request('/auth/logout', { method: 'POST' }, z.unknown());

/** POST /score-theorem. The server caches by normalised statement; a model failure comes back as score null. */
export function scoreTheorem(name: string, statement: string): Promise<RigorScore> {
  // The server allows 8 s for the model; leave room for the round trip.
  return request('/score-theorem', json({ name, statement }), rigorScoreSchema, 12_000);
}

/** `rigorScore` is the server's score for the statement, which is what the pinned metadata carries. */
const pinnedSchema = z.object({ logoCid: z.string().min(1), metadataCid: z.string().min(1), rigorScore: z.number().int().nullable() });
export type Pinned = z.infer<typeof pinnedSchema>;

/** POST /ipfs: the cropped logo and the theorem metadata JSON, pinned server-side with Pinata. */
export function pinLaunch(logo: Blob, metadata: TheoremMetadata): Promise<Pinned> {
  const form = new FormData();
  form.append('logo', logo, `logo.${logo.type.split('/')[1] ?? 'png'}`);
  form.append('metadata', JSON.stringify(metadata));
  return request('/ipfs', { method: 'POST', body: form }, pinnedSchema, 30_000);
}

/** POST /launches: the server re-reads the receipt, so only the hash is sent. */
export function recordLaunch(txHash: string): Promise<unknown> {
  return request('/launches', json({ txHash }), z.unknown());
}

const tokenItemSchema = z.object({
  token: z.string(),
  curve: z.string(),
  name: z.string(),
  symbol: z.string(),
  logo: z.string(),
  pair: z.object({ address: z.string(), symbol: z.string(), decimals: z.number() }),
  hood: z.boolean(),
  statement: z.string().nullable(),
  blurb: z.string().nullable(),
  rigorScore: z.number().nullable(),
  phase: z.number(),
  price: z.number().nullable(),
  marketCap: z.number().nullable(),
  progress: z.number().nullable(),
  volume24h: z.number().nullable(),
  trades24h: z.number().nullable(),
  launchedAt: z.string(),
  stateUpdatedAt: z.string().nullable(),
});
export type TokenItem = z.infer<typeof tokenItemSchema>;

/** 'volume' is false when the API has no indexer, so Volume sort and charts are unavailable. */
const tokenPageSchema = z.object({ items: z.array(tokenItemSchema), total: z.number(), hoodCount: z.number(), offset: z.number(), volume: z.boolean() });
export type TokenPage = z.infer<typeof tokenPageSchema>;

export type TokenQuery = { tab: 'all' | 'hood'; sort: 'latest' | 'volume' | 'mcap' | 'rigor'; limit: number; offset: number; q?: string };

/** GET /tokens: Explore's grid. */
export function fetchTokens(q: TokenQuery): Promise<TokenPage> {
  const params = new URLSearchParams({ tab: q.tab, sort: q.sort, limit: String(q.limit), offset: String(q.offset) });
  if (q.q) params.set('q', q.q);
  return request(`/tokens?${params}`, { method: 'GET' }, tokenPageSchema);
}

const tokenDetailSchema = tokenItemSchema.extend({ deployer: z.string(), description: z.string(), metadataCid: z.string().nullable() });
export type TokenDetail = z.infer<typeof tokenDetailSchema>;

/** GET /tokens/:address */
export function fetchToken(address: string): Promise<TokenDetail> {
  return request(`/tokens/${encodeURIComponent(address)}`, { method: 'GET' }, tokenDetailSchema);
}

const holdingSchema = z.object({
  token: z.string(),
  curve: z.string(),
  symbol: z.string(),
  name: z.string(),
  logo: z.string(),
  pair: z.object({ address: z.string(), symbol: z.string(), decimals: z.number() }),
  hood: z.boolean(),
  rigorScore: z.number().nullable(),
  phase: z.number(),
  launchedByMe: z.boolean(),
  balance: z.number(),
  price: z.number().nullable(),
  value: z.number().nullable(),
  costBasis: z.number().nullable(),
  pnl: z.number().nullable(),
  pnlPct: z.number().nullable(),
});
export type Holding = z.infer<typeof holdingSchema>;

/** `tradeHistory` is false without the indexer: holdings then cover only the wallet's launches, with no cost basis. */
const portfolioSchema = z.object({ wallet: z.string(), holdings: z.array(holdingSchema), launches: z.array(tokenItemSchema), tradeHistory: z.boolean() });
export type PortfolioData = z.infer<typeof portfolioSchema>;

/** GET /portfolio/:wallet */
export function fetchPortfolio(wallet: string): Promise<PortfolioData> {
  return request(`/portfolio/${encodeURIComponent(wallet)}`, { method: 'GET' }, portfolioSchema);
}

export const CHART_INTERVALS = ['1m', '5m', '15m', '1h', '1d'] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

const candlesSchema = z.object({
  interval: z.enum(CHART_INTERVALS),
  candles: z.array(z.object({ time: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number(), trades: z.number() })),
});
export type Candles = z.infer<typeof candlesSchema>;

/** GET /tokens/:address/candles: prices in the pair asset per whole token, oldest first. */
export function fetchCandles(address: string, interval: ChartInterval, limit = 200): Promise<Candles> {
  return request(`/tokens/${encodeURIComponent(address)}/candles?interval=${interval}&limit=${limit}`, { method: 'GET' }, candlesSchema);
}

const tradesSchema = z.object({
  trades: z.array(
    z.object({
      id: z.string(),
      trader: z.string(),
      side: z.enum(['buy', 'sell']),
      quote: z.number(),
      tokens: z.number(),
      price: z.number(),
      time: z.number(),
      txHash: z.string(),
    }),
  ),
});
export type Trade = z.infer<typeof tradesSchema>['trades'][number];

/** GET /tokens/:address/trades: the newest 50, newest first. */
export function fetchTrades(address: string): Promise<Trade[]> {
  return request(`/tokens/${encodeURIComponent(address)}/trades?limit=50`, { method: 'GET' }, tradesSchema).then((r) => r.trades);
}

export const REACTION_KINDS = ['rocket', 'eyes', 'skull'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];
const reactionsSchema = z.object({ rocket: z.number(), eyes: z.number(), skull: z.number() });
export type Reactions = z.infer<typeof reactionsSchema>;

/** docs/BRIEF.md §5.5 `Callout`; `mine` lists the viewer's own reactions when signed in. */
export const calloutSchema = z.object({
  id: z.string(),
  wallet: z.string(),
  nickname: z.string().optional(),
  tokenAddress: z.string().nullable(),
  ticker: z.string().nullable(),
  text: z.string(),
  kind: z.enum(['user', 'system']),
  createdAt: z.string(),
  reactions: reactionsSchema,
  official: z.boolean().optional(),
  verified: z.boolean().optional(),
  mine: z.array(z.enum(REACTION_KINDS)).optional(),
  /** The launch or trade behind the callout: for user callouts, the poster's latest trade on the coin. */
  txHash: z.string().optional(),
  txSide: z.enum(['buy', 'sell']).optional(),
});
export type Callout = z.infer<typeof calloutSchema>;

const calloutPageSchema = z.object({
  items: z.array(calloutSchema),
  nextCursor: z.string().nullable(),
  newestCursor: z.string().nullable(),
  live: z.object({ callouts: z.number(), users: z.number() }),
});
export type CalloutPage = z.infer<typeof calloutPageSchema>;

/** GET /callouts: newest first; `before` pages older, `after` polls newer. */
export function fetchCallouts(q: { before?: string; after?: string; token?: string; limit?: number } = {}): Promise<CalloutPage> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v != null) params.set(k, String(v));
  return request(`/callouts?${params}`, { method: 'GET' }, calloutPageSchema);
}

/** POST /callouts. `hidden` means moderation held it: the poster sees it, nobody else does. */
export function postCallout(text: string, tokenAddress?: string): Promise<{ callout: Callout; hidden: boolean }> {
  return request('/callouts', json({ text, tokenAddress }), z.object({ callout: calloutSchema, hidden: z.boolean() }));
}

/** POST /callouts/:id/react: toggles one kind for this wallet. */
export function reactToCallout(id: string, kind: ReactionKind): Promise<{ id: string; reactions: Reactions; reacted: boolean }> {
  return request(`/callouts/${encodeURIComponent(id)}/react`, json({ kind }), z.object({ id: z.string(), reactions: reactionsSchema, reacted: z.boolean() }));
}

/** PUT /profile: 3–15 chars a-z 0-9 _, once a day. */
export function setNickname(nickname: string): Promise<{ wallet: string; nickname: string }> {
  return request('/profile', { ...json({ nickname }), method: 'PUT' }, z.object({ wallet: z.string(), nickname: z.string() }));
}

/** Messages on /ws (docs/BRIEF.md §9). */
/** A notable $HEXE or hood-coin trade, for the desktop's trade balloons (apps/api/src/activity.ts). */
export const activitySchema = z.object({
  id: z.string(),
  side: z.enum(['buy', 'sell']),
  token: z.string(),
  ticker: z.string(),
  trader: z.string(),
  /** ETH, as a decimal string. */
  eth: z.string(),
  /** Unix seconds. */
  time: z.number(),
  txHash: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

/** GET /activity/recent: notable trades of the last 15 minutes, oldest first. */
export const fetchRecentActivity = () => request('/activity/recent', { method: 'GET' }, z.object({ items: z.array(activitySchema) })).then((r) => r.items);

export const liveMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), pingMs: z.number() }),
  z.object({ type: z.literal('ping'), at: z.number() }),
  z.object({ type: z.literal('callout'), callout: calloutSchema }),
  z.object({ type: z.literal('reactions'), id: z.string(), reactions: reactionsSchema }),
  z.object({ type: z.literal('activity'), activity: activitySchema }),
]);
export type LiveMessage = z.infer<typeof liveMessageSchema>;

/** The WebSocket URL: NEXT_PUBLIC_WS_URL, else the API URL with ws(s) and /ws (not through the /api proxy). */
export function liveUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  if (!API_URL.startsWith('http')) return null;
  return `${API_URL.replace(/^http/, 'ws')}/ws`;
}

export type Session = z.infer<typeof sessionSchema>;

/** GET /auth/me in full (wallet, nickname, official), or null without a session. */
export async function fetchSession(): Promise<Session | null> {
  try {
    return await request('/auth/me', { method: 'GET' }, sessionSchema);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
