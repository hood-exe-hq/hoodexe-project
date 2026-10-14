# Deploying hood.exe

Plan (agreed 9 Oct 2026): deploy the real production setup about a week early and use
it unannounced for the house tokens and one real launch and trade. On launch day nothing is redeployed; the
link is announced. Staging and mainnet are the same chain (4663) and the same Pons contracts, so there is no
separate staging network to maintain.

```
browser ──/api/* + cookie──▶ web (Vercel) ──rewrite──▶ api (Railway, *.up.railway.app) ──▶ Postgres, Redis
   └────────── wss://…/ws (live feed, direct) ─────────▶        ▲                              ▲
                                                 worker (Railway) ┘──── Redis pub/sub ─────────┘
                            api + worker ──GraphQL (private)──▶ hasura ◀── indexer (Railway, apps/indexer)
                            api ──eth_call──▶ Alchemy (RPC_URL_SERVER)
```

The API has no custom domain. The web app serves it at `/api/*` on its own host (proxy.ts rewrites to the Railway
URL), so the browser only ever talks to the web app's site.

## Before you start: what Bix provides

| What | Used for |
| --- | --- |
| Optional: a domain (`hood.fun` in the brief) | The web app. Without one it runs on `hood-exe.vercel.app`. The API needs none. |
| Vercel | `apps/web`. The repo is already linked to a Vercel project named `hood-exe`. |
| Railway | API, worker, Postgres, Redis |
| Envio account + the Envio Deployments GitHub app on this repo | Hosted indexer |
| Alchemy (Robinhood Chain) | Two keys: a server key for the API and a separate, domain-restricted key for browsers |
| DeepSeek API key (topped up) | Rigor scoring and callout moderation |
| Pinata JWT + a dedicated gateway | Pinning launch metadata; serving logos |
| Reown (WalletConnect) project id | WalletConnect and mobile wallets in the connect dialog |
| `OFFICIAL_WALLETS` | Wallets shown as official in Callouts |

## Why the API goes through the web app

Sign-in sets an httpOnly session cookie. If the browser called the Railway URL directly, that cookie would be
cross-site (`*.vercel.app` vs `*.up.railway.app`). Safari blocks such cookies and other browsers increasingly do,
so signing in would silently fail and Launch, Callouts and reactions would break. Through the `/api` rewrite
the cookie belongs to the web app's own host, so leave `COOKIE_DOMAIN` empty.

The live feed is the exception: Vercel rewrites can't carry WebSockets, so the browser opens `/ws` on the
Railway URL directly. It needs no cookie, and the API only accepts origins listed in `CORS_ORIGINS`.

Sign-in only accepts messages naming a host in `CORS_ORIGINS`. Vercel preview deployments can browse but can't
sign in unless their host is added there.

## 1. Indexer: self-hosted on Railway

Envio Cloud's free plan can't hold Pons on Robinhood Chain (about 480k curve trades a day; it shut deployments
down past 100k events), so the indexer runs on Railway as three services in the same project:

| Service | What | Notes |
| --- | --- | --- |
| `indexer` | `apps/indexer/Dockerfile` (`envio start`, `config.selfhost.yaml`) | Needs `ENVIO_API_TOKEN` (a free HyperSync token from envio.dev/app/api-tokens), `ENVIO_PG_*` from its Postgres, `HASURA_GRAPHQL_ENDPOINT=http://${{hasura.RAILWAY_PRIVATE_DOMAIN}}:8080/v1/metadata` and `HASURA_GRAPHQL_ADMIN_SECRET`. No public domain. |
| `hasura` | image `hasura/graphql-engine:v2.48.5` | `HASURA_GRAPHQL_DATABASE_URL` (the indexer's Postgres), `HASURA_GRAPHQL_ADMIN_SECRET`, `HASURA_GRAPHQL_UNAUTHORIZED_ROLE=public`, `HASURA_GRAPHQL_STRINGIFY_NUMERIC_TYPES=true` (uint256 amounts as strings), `HASURA_GRAPHQL_ENABLE_CONSOLE=false`. No public domain. |
| a Postgres | the indexer's own database | Separate from the API's. |

- The API and worker reach it privately: `ENVIO_GRAPHQL_URL=http://hasura.railway.internal:8080/v1/graphql`.
- **Storage (Railway Hobby caps a volume at 5 GB):** the indexer keeps per-wallet `Position`s (average cost) instead
  of every trade, and the worker (`INDEXER_DATABASE_URL` = the indexer's Postgres) prunes trades after 7 days and
  1m/5m/1h candles after 1/3/10 days, hourly. Expect a steady state of 2–3 GB.
- **Sync speed:** curve trades are matched by event signature (wildcard), so a free HyperSync token (5 requests a
  minute) works. `config.selfhost.yaml` starts on 3 Oct 2026 (block 79,050,000), which synced in about 25 minutes;
  Portfolio cost basis covers buys from then on. Coins launched earlier are found through
  `apps/indexer/seeds/pre-start-launches.csv.gz` (the 18k non-graduated ones traded since 3 Oct, exported from the
  full Envio Cloud index); an older coin outside that list that starts trading again isn't picked up.
  `config.yaml` (from the factory's deployment) would take most of a day on the free token.
- Deploy with `npx @railway/cli up --service indexer`. It resumes from the database; never run `envio start --restart`
  there, which wipes the index.
- **Never add or remove contracts in `config.selfhost.yaml`:** envio refuses to resume an index whose contract list
  changed (the only ways out are reverting or wiping). New contracts go in a separate indexer, like the one below.

### Formal verification indexer

A fourth service, `indexer-verification`, indexes the VerificationPool and RigorRegistry
(`config.verification.yaml`, its own `schema.verification.graphql` and `src/verification` handlers) into its own
schema of the same Postgres:

- Same image (`apps/indexer/Dockerfile`, config file path `apps/indexer/railway.json`) and the same `ENVIO_API_TOKEN`
  and `ENVIO_PG_*` as `indexer` (reference them: `${{indexer.ENVIO_PG_HOST}}` and so on), plus
  `ENVIO_CONFIG=config.verification.yaml`, `ENVIO_PG_SCHEMA=verification` and **`ENVIO_HASURA=false`**: envio clears
  Hasura's metadata on start, which would take down the main indexer's GraphQL API. No Hasura variables, no domain.
- Nothing reads it yet; the API keeps its own queue. Its tables (`verification."VerificationSubmission"`,
  `verification."FormalToken"`) are the on-chain record to check that queue against.
- Deploy with `npx @railway/cli up --service indexer-verification`.

## 2. API and worker: Railway

1. New project → add **Postgres** and **Redis**.
2. **api** service, from this GitHub repo:
   - Settings → Config file path: `apps/api/railway.json` (Dockerfile build, `/health` check, restart on failure).
   - One replica. The API also keeps Explore's token table in sync in-process. If it ever runs more than one
     replica, set `TOKEN_INDEX=off` on all but one.
   - Networking → Generate Domain. Note the `https://<service>.up.railway.app` URL; the web app proxies to it.
3. **worker** service, same repo, config file path `apps/api/railway.worker.json`. It posts system callouts and
   has no public port.
4. Variables. Put these in Railway's shared variables so both services get them:

   ```bash
   NODE_ENV=production                       # set by the image; listed for clarity
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}
   RPC_URL_SERVER=https://robinhood-mainnet.g.alchemy.com/v2/<server key>
   ENVIO_GRAPHQL_URL=http://hasura.railway.internal:8080/v1/graphql
   INDEXER_DATABASE_URL=${{<indexer Postgres>.DATABASE_URL}}   # worker only: hourly pruning
   DEEPSEEK_API_KEY=
   PINATA_JWT=
   SESSION_SECRET=<openssl rand -hex 32>
   COOKIE_DOMAIN=                            # empty: the cookie belongs to the web app's host
   CORS_ORIGINS=https://www.hoodexe.site,https://hoodexe.site,https://hood-exe.vercel.app  # every origin the web app is served from
   OFFICIAL_WALLETS=0x…,0x…
   BLOCKLIST_EXTRA=
   STAND_INS=refuse                          # 'allow' while DeepSeek/Pinata keys are pending (see below)
   ```

   While the DeepSeek and Pinata keys are pending, `STAND_INS=allow` lets production start without them:
   theorems come back unscored, callouts get the blocklist only, and `/ipfs` answers 503, which blocks every
   launch before a transaction is sent. Until the indexer exists, set `TOKEN_INDEX=off` (Explore stays empty).
   Remove both once the keys and `ENVIO_GRAPHQL_URL` are set.

   The API refuses to start in production without Redis, DeepSeek, Pinata, the RPC, the indexer, or a real
   session secret, and says which one is missing. Migrations run on start. The API and the worker take turns
   on a Postgres lock, so deploying both at once is safe.

To build and run the image locally:

```bash
docker build -f apps/api/Dockerfile -t hood-api .
docker run --env-file apps/api/.env -e NODE_ENV=production -p 8787:8787 hood-api
```

## 3. Web: Vercel

1. Project `hood-exe` → Settings → Build & Deployment → **Root Directory `apps/web`**. Framework: Next.js; keep the
   default install and build commands.
2. Environment variable `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel installs with the repo's pinned pnpm 11.
3. Production environment variables:

   ```bash
   NEXT_PUBLIC_API_URL=/api
   API_PROXY_TARGET=https://<service>.up.railway.app      # read by apps/web/proxy.ts
   NEXT_PUBLIC_WS_URL=wss://<service>.up.railway.app/ws
   NEXT_PUBLIC_RPC_URL=/api/rpc                            # the API forwards reads to RPC_URL_SERVER; no key in browsers
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
   NEXT_PUBLIC_PINATA_GATEWAY=https://<gateway>.mypinata.cloud
   ```

   Never set `NEXT_PUBLIC_DEV_WALLET` here. `NEXT_PUBLIC_*` values ship to every browser, so never put the
   server's RPC key in one. The API's `/rpc` only allows read methods, about 600 calls a minute per visitor;
   wallets still send transactions through their own RPC. All browser reads now count against the server's
   Alchemy plan.

   ```bash
   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=                   # Reown, project type "App"
   NEXT_PUBLIC_POSTHOG_KEY=phc_…                           # public; add with --type config
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   NEXT_PUBLIC_SITE_URL=https://www.hoodexe.site           # link previews and WalletConnect metadata
   ```
4. Domains → `www.hoodexe.site` (primary) and `hoodexe.site` (redirects to www). Every host the app is served
   from must be in the API's `CORS_ORIGINS`, or sign-in and the live feed refuse it.

## 4. Smoke test (before the first real launch)

- [ ] `https://<web app>/api/health` answers `{"ok":true,"db":true,"kv":true}` (the proxy and the API both work).
- [ ] The visitor's IP gets through: request `https://<web app>/api/auth/siwe` 31 times (the sign-in limit is 30
      per IP per 10 minutes) so the last answers 429. Then request `https://<railway api>/auth/siwe` directly from
      the same network: it must also answer 429, which shows the proxy counted your address and not Vercel's.
- [ ] Explore lists recent Pons coins (indexer + RPC), and Token Detail shows a chart and trades.
- [ ] Callouts header shows LIVE. With two browsers open, a callout posted in one appears in the other within
      a second (Redis pub/sub + `/ws`).
- [ ] Sign in from a wallet holding a little ETH on 4663, post a callout, react, set a nickname. The session
      survives a reload.
- [ ] Rigor scoring returns a coloured score (DeepSeek), not the grey unscored badge.
- [ ] The risk dialog appears before the first trade or launch, once per browser.
- [ ] A small buy and sell on an existing coin, then Portfolio shows the coin with a cost basis and P&L.
- [ ] Launch a house token from the wizard: the logo and theorem load from the Pinata gateway, it appears in
      Explore and Portfolio, and the worker posts "$TICKER launched".
- [ ] On a phone: windows open full-screen, the taskbar clears the home indicator, and typing doesn't zoom.

## Rolling back

Railway → service → Deployments → redeploy the previous build. Vercel → Deployments → Instant Rollback.
Migrations only add tables and columns, so the previous API build runs against the newer schema.

## Rate limits and the visitor's IP

Sign-in, scoring and posting are rate-limited per visitor IP. Through the `/api` rewrite the API only sees Vercel's
addresses (checked on 10 Oct 2026), so the web app's `proxy.ts` forwards the visitor's IP in `x-hood-client-ip`
along with `PROXY_SECRET`. The API believes that header only when the secret matches. Otherwise it uses the
address Railway's proxy saw, which callers can't forge. Set the same random `PROXY_SECRET` on the Railway api
service and on Vercel (server-side, never `NEXT_PUBLIC_`). Without it, every visitor shares one set of per-IP limits.

## Still open before mainnet

- Legal texts are drafts (`LEGAL_DRAFT` in `apps/web/components/apps/legal/Legal.tsx`). They need a lawyer's
  review and a contact address; then set the flag to `false`.
- Geo-blocking: Bix to decide.
