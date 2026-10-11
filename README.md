# hood.exe

Token launchpad for Robinhood Chain in a Luna-style desktop. Launches and trades route to Pons V2.

- Spec: [docs/BRIEF.md](docs/BRIEF.md) (v1.0 + v1.1 merged; v1.1 wins on conflicts)
- Deploying: [docs/DEPLOY.md](docs/DEPLOY.md) (Vercel, Railway, self-hosted indexer)
- Original briefs: `hood-exe-dev-brief.md` (v1.0), `hood.exe_developer_briefv1.1.md` (v1.1)

## Layout

```
apps/web/          Next.js 16.4 frontend (Vercel)
apps/api/          Fastify 5 API: SIWE sessions, rigor scoring, IPFS pinning, launch records, Explore, charts and trades (Railway)
apps/indexer/      Envio HyperIndex: Pons V2 launches, curve trades, candles, graduations, wallet positions (self-hosted on Railway)
packages/shared/   Chain config, Pons V2 ABIs and quote maths, zod schemas, shared helpers
```

The worker (`apps/api/src/worker.ts`) ships in the API image as a second Railway service.

## What works

- **Desktop**: boot screen, draggable windows, taskbar, Start menu, Shut Down; XP-skinned RainbowKit on chain 4663.
- **Launch.exe**: three-page wizard (identity, theorem with live KaTeX preview and rigor score, economics), then a review page with curve preview and dev-buy quote. Signs in with SIWE, pins to IPFS, launches via `launchToken` or `launchAndBuy`.
- **Explore.exe**: "hood.exe launches" / "All Pons" tabs, sort by Latest, Volume, Rigor or MCap.
- **Token Detail**: candle chart (1m–1d), last trades, graduation progress, and curve buy/sell with approvals, slippage and snipe-tax handling. Graduated coins link out to Pons.
- **Callouts.exe**: live feed with reactions and nicknames; tray balloons when it is closed.
- **Blockscout links**: every transaction shows its short hash (full hash on hover) linking to Blockscout: launch progress and result (including the approval), trade status, the Tx column in Token Detail's trades, the "launched" and big-buy system callouts, and user callouts that name a coin (the poster's latest buy or sell of it in the past 24 h, read from the indexer so it can't be faked). Graduation callouts have no hash yet (the indexer doesn't record it).
- **Portfolio**: holdings marked at the curve price with unrealized P&L (average cost from indexed trades), sort by Rigor, Value or P&L %, Export CSV; "My launches" tab. Rows open Token Detail.
- **Share links**: `/t/0x…` opens the desktop on that coin, with its own link-preview card. Token Detail has Copy link and Post on X.
- **Legal**: one-time risk dialog before the first launch or trade; Terms, Risk and Privacy windows (drafts pending legal review).
- **Games**: a Games folder on the desktop and in Start → Games. Solitaire (Klondike, turn one) with drag and drop on mouse and touch, undo, scoring, statistics, resume and the bouncing-card win; Minesweeper (Beginner, Intermediate, Expert and Custom) with chording, ? marks, best times, and tap / long-press / flag mode / pinch-zoom on touch. `/games/solitaire` and `/games/minesweeper` open them directly. No wallet needed.
- **Analytics**: PostHog, anonymous and cookieless, with the launch and trade funnels (`apps/web/lib/analytics.ts`).

## Develop

Requires Node 20.9+, pnpm 11 and Docker (for the API's Postgres and Redis).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # set NEXT_PUBLIC_API_URL=http://localhost:8787
pnpm dev                                       # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Without `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the wallet modal offers browser-injected and Coinbase wallets only.

### API

```bash
docker compose up -d                           # Postgres 17 on :54320, Redis 7 on :63790
cp apps/api/.env.example apps/api/.env
pnpm dev:api                                   # http://localhost:8787, migrations run on start
pnpm --filter @hood/api dev:worker             # system callouts every 10 s (needs REDIS_URL)
```

Open the web app on `localhost`, not `127.0.0.1`, so the session cookie reaches the API.

- Without `DEEPSEEK_API_KEY` every statement comes back unscored (grey badge).
- Without `PINATA_JWT` a dev pinner computes CIDs locally and publishes nothing.
- Production refuses to start on either stand-in, without Redis, or with the dev session secret.
- API tests run on in-process Postgres (PGlite) and need no Docker.
- Schema changes: edit `apps/api/src/db/schema.ts`, then `pnpm --filter @hood/api db:generate`.
- Callouts: `GET/POST /callouts`, reactions, `PUT /profile` (nickname) and the `/ws` live feed. The worker (same package, `src/worker.ts`) posts "$TICKER launched / graduated" and ≥ 0.5 ETH buys for hood.exe coins (with the launch or buy transaction hash in `callouts.tx_hash`, migration 0004; launch hashes come from `/launches` records and are filled in on later passes) and reaches the API's WebSockets through Redis pub/sub; on Railway run it as a second service from the same image. Without `DEEPSEEK_API_KEY` callout moderation is the blocklist only (refused in production). `OFFICIAL_WALLETS` and `BLOCKLIST_EXTRA` are comma-separated.
- Explore's `/tokens` table: launches come from the indexer (`ENVIO_GRAPHQL_URL`); names, logos and live reserves from `RPC_URL_SERVER` (eth_call only, so a free-tier RPC is fine). Without `ENVIO_GRAPHQL_URL` the API falls back to scanning RPC logs, which free RPC tiers cap at a few blocks. `TOKEN_INDEX=off` disables it.
- Token Detail's chart (`/tokens/:address/candles`), trades (`/tokens/:address/trades`) and Explore's Volume sort read the indexer directly; without `ENVIO_GRAPHQL_URL` the first two answer 503 and Volume is hidden.
- Portfolio (`/portfolio/:wallet`): the wallet's launches plus its holdings, marked at the curve price, with average-cost P&L from its indexed trades. Without `ENVIO_GRAPHQL_URL` it only covers the wallet's own launches and has no cost basis; graduated coins have no value yet.

### Indexer (Envio)

envio ships no Windows build, so on Windows the indexer runs in Docker (the `indexer` compose profile); on Linux/macOS it runs natively. `apps/indexer/.env` needs `ENVIO_API_TOKEN` (a HyperSync token from envio.dev/app/api-tokens; the free package allows 5 requests/min).

```bash
docker compose --profile indexer up -d   # indexer (config.dev.yaml: starts near the chain head) + Hasura GraphQL on :8080
pnpm --filter @hood/indexer test         # handler tests (in the container on Windows)
pnpm --filter @hood/indexer codegen      # after editing config*.yaml or schema.graphql
```

Production deploys `config.yaml` (from the V2 factory's deployment, block 26,841,846) to Envio's hosted service: install the Envio Deployments GitHub app on this repo, root directory `apps/indexer`, then set the API's `ENVIO_GRAPHQL_URL` to the endpoint it gives you.

### Local chain (fork of 4663)

Needs [Foundry](https://getfoundry.sh)'s `anvil` (on PATH, in `~/.foundry/bin`, or `ANVIL=…`).

```bash
pnpm fork             # Robinhood Chain with live Pons V2 on http://127.0.0.1:8545
pnpm fork --refresh   # re-fork mainnet (new launch terms or pair tokens)
```

The public RPC only keeps ~10 minutes of state, so `pnpm fork` forks once, runs every launch path the wizard uses (including a dev buy that fills the curve), saves the state to `.fork/`, and serves that snapshot with no upstream. Each run starts from the snapshot.

To launch from the wizard against it, with no browser wallet needed:

```bash
# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_DEV_WALLET=1        # adds "Anvil dev wallet" (anvil signs for it); only with a localhost RPC
# apps/api/.env
RPC_URL_SERVER=http://127.0.0.1:8545
```

The four anvil dev accounts get 10,000 ETH and 10,000 USDG each. A real wallet works too: add a network with chain id 4663 and RPC `http://127.0.0.1:8545`, and import an anvil dev key. Blockscout links point at mainnet and won't resolve fork transactions.

### Chain checks

Read-only against chain 4663; nothing is sent.

```bash
pnpm --filter @hood/shared check:pons        # addresses, ABIs, launch terms, quote vs. contract
pnpm --filter @hood/shared simulate:launch   # wizard launch txs via eth_call, dev-buy quote vs. fill
pnpm --filter @hood/shared sync:pairs        # regenerate the approved pair-token list
```
