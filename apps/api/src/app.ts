import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { and, eq, gt, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import type { Address } from 'viem';
import { schema, type Db } from './db';
import type { Env } from './env';
import type { Kv } from './kv';
import type { ChainReader } from './services/chain';
import type { EnvioClient } from './services/envio';
import type { Moderator } from './services/moderation';
import type { Pinner } from './services/pinner';
import type { PoolReader } from './services/poolChain';
import type { PubSub } from './services/pubsub';
import type { Scorer } from './services/scorer';
import type { LaunchSource } from './services/tokenIndex';
import { activityRoutes } from './routes/activity';
import { authRoutes } from './routes/auth';
import { calloutRoutes } from './routes/callouts';
import { gameRoutes } from './routes/games';
import { ipfsRoutes } from './routes/ipfs';
import { launchRoutes } from './routes/launches';
import { liveRoutes } from './routes/live';
import { portfolioRoutes } from './routes/portfolio';
import { rpcRoutes } from './routes/rpc';
import { scoreRoutes } from './routes/score';
import { tokenRoutes } from './routes/tokens';
import { verificationRoutes } from './routes/verification';

export type Deps = {
  env: Env;
  db: Db;
  kv: Kv;
  scorer: Scorer;
  pinner: Pinner;
  chain: ChainReader;
  /** The indexer, when ENVIO_GRAPHQL_URL is set: charts, trades, volume. */
  envio?: EnvioClient;
  /** Live token metadata and curve state over RPC (eth_call only), for the portfolio. */
  market: Pick<LaunchSource, 'metadata' | 'state'>;
  /** The model step of callout moderation (§10). */
  moderator: Moderator;
  /** Live callouts and reactions, from this process and the worker, to the WebSockets. */
  pubsub: PubSub;
  /** The VerificationPool, when VERIFICATION_POOL_ADDRESS is set: formal verification submissions. */
  pool?: PoolReader;
  now?: () => Date;
};

export const SESSION_COOKIE = 'hood_session';

declare module 'fastify' {
  interface FastifyInstance {
    deps: Deps & { now: () => Date };
    requireSession: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** The signed-in wallet, or null; for routes that work for everyone. */
    sessionWallet: (req: FastifyRequest) => Promise<Address | null>;
  }
  interface FastifyRequest {
    wallet: Address | null;
    /** The visitor's IP for rate limits: from the web app's signed proxy header, else the address Railway saw. */
    clientIp: string;
  }
}

/** An error whose message is safe to show the user. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function buildApp(deps: Deps) {
  const { env } = deps;
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'debug' },
    // Railway puts two proxies in front of us (X-Forwarded-For arrives as "client, railway-edge", seen 10 Oct 2026):
    // trusting exactly those two hops makes req.ip the address Railway's edge saw. A client-sent X-Forwarded-For
    // only adds entries further left, so it can't be forged.
    trustProxy: env.NODE_ENV === 'production' ? (_address: string, hop: number) => hop < 2 : false,
    bodyLimit: 64 * 1024,
  });

  app.decorate('deps', { ...deps, now: deps.now ?? (() => new Date()) });
  app.decorateRequest('wallet', null);
  app.decorateRequest('clientIp', '');

  // Requests through the web app's /api proxy arrive from Vercel's addresses; its proxy.ts forwards the
  // visitor's IP with the shared PROXY_SECRET, and only then is that header believed.
  const proxySecret = env.PROXY_SECRET ? Buffer.from(env.PROXY_SECRET) : null;
  app.addHook('onRequest', async (req) => {
    req.clientIp = req.ip;
    const sent = req.headers['x-hood-proxy-secret'];
    const forwarded = req.headers['x-hood-client-ip'];
    if (forwarded === undefined && sent === undefined) return;
    const given = typeof sent === 'string' ? Buffer.from(sent) : null;
    const why = !proxySecret
      ? 'the API has no PROXY_SECRET'
      : !given || given.length !== proxySecret.length || !timingSafeEqual(given, proxySecret)
        ? 'wrong or missing proxy secret'
        : typeof forwarded !== 'string' || !isIP(forwarded)
          ? 'not an IP address'
          : null;
    if (why) req.log.warn(`ignored x-hood-client-ip: ${why}`);
    else req.clientIp = forwarded as string;
  });

  // The default allows GET/HEAD/POST only; PUT /profile needs its preflight to pass too.
  await app.register(cors, { origin: env.CORS_ORIGINS, credentials: true, methods: ['GET', 'HEAD', 'POST', 'PUT'] });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  // Clients only listen on /ws; 1 KB is plenty for anything a browser might send.
  await app.register(websocket, { options: { maxPayload: 1_024 } });

  /** 'none' without a valid signed cookie, 'expired' for an unknown or lapsed session. */
  async function lookupSession(req: FastifyRequest): Promise<Address | 'none' | 'expired'> {
    const signed = req.cookies[SESSION_COOKIE];
    const unsigned = signed ? req.unsignCookie(signed) : null;
    if (!unsigned?.valid || !unsigned.value) return 'none';
    const [row] = await deps.db
      .select({ wallet: schema.sessions.wallet })
      .from(schema.sessions)
      .where(and(eq(schema.sessions.id, unsigned.value), gt(schema.sessions.expiresAt, app.deps.now())))
      .limit(1);
    return row ? (row.wallet as Address) : 'expired';
  }

  app.decorate('sessionWallet', async (req: FastifyRequest) => {
    const s = await lookupSession(req);
    return s === 'none' || s === 'expired' ? null : s;
  });

  app.decorate('requireSession', async (req: FastifyRequest) => {
    const s = await lookupSession(req);
    if (s === 'none') throw new HttpError(401, 'Sign in with your wallet first.');
    if (s === 'expired') throw new HttpError(401, 'Your session expired. Sign in again.');
    req.wallet = s;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if (err instanceof ZodError) return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request.' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Something went wrong on our side.' });
  });

  // 503 when a dependency is down, so the host's health check holds back a broken deploy.
  app.get('/health', async (_req, reply) => {
    const [db, kv] = await Promise.all([
      deps.db.execute(sql`select 1`).then(
        () => true,
        () => false,
      ),
      deps.kv.ping().catch(() => false),
    ]);
    return reply.code(db && kv ? 200 : 503).send({ ok: db && kv, db, kv });
  });

  await app.register(authRoutes);
  await app.register(scoreRoutes);
  await app.register(ipfsRoutes);
  await app.register(launchRoutes);
  await app.register(tokenRoutes);
  await app.register(calloutRoutes);
  await app.register(liveRoutes);
  await app.register(activityRoutes);
  await app.register(gameRoutes);
  await app.register(verificationRoutes);
  await app.register(portfolioRoutes);
  await app.register(rpcRoutes);
  return app;
}
