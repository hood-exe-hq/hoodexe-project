# hood.exe verifier

Checks Lean 4 proofs for formal verification (hood-exe-formal-verification-brief.md). This image holds Lean and Mathlib
**v4.33.1**, set in `project/lean-toolchain` and `project/lakefile.toml`; change both together. The worker that drives it is
`apps/api/src/verifierWorker.ts`.

## How a proof is checked

Each proof runs in **two throwaway containers**, never one:

1. **compile** (untrusted): `lean` compiles `/work/proof.lean`, mounted read-only, to `/out/HoodProof.olean`. The proof's
   compile-time code runs here. When the container exits, every process in it dies.
2. **check** (trusted): with `/out` mounted read-only, `hoodcheck` (`project/HoodCheck.lean`):
   - reads the compiled file by its path and never imports it. `/out` is not on the search path, so whatever imports a
     forged file lists can only resolve to this image's own Lean and Mathlib.
   - replays every declaration through Lean's **kernel**, so a tampered file is rejected.
   - lists each theorem's axioms from its actual proof term. A theorem passes only if it rests on `propext`,
     `Classical.choice` and `Quot.sound`. `sorry`, user `axiom`s and `native_decide` fail.

Only the check's JSON verdict counts. Before any of this, the API and the worker run `screenProof`
(`packages/shared/src/verification.ts`). It rejects code a proof never needs: `#eval`, `elab`, `initialize`, `unsafe`,
`IO`, `sorry`, `native_decide`, `axiom`.

**A passing proof only proves *some* theorem.** Whether that theorem is the coin's is decided by the admin's review in
`/admin/verification`, which shows the coin's statement next to the kernel-checked Lean statements. Nothing pays out
before that review.

### Residual risks

- The compiled `.olean` is parsed by the trusted checker. A crafted file that exploits Lean's `.olean` loader would
  defeat the check. Mitigations: the source screen, the compile container being gone before the check runs, and the
  admin review of every pass.
- The sandbox is Docker with seccomp, no network, a read-only root, non-root, no capabilities, and hard memory, CPU,
  process and time limits. Docker is not a VM. Run it on a dedicated VPS with no other secrets.
- The bind-mounted `/out` has no size limit. Monitor disk use.

## Sandbox limits

These are in `sandbox-config.json`, which the worker reads: 8 GB memory with no swap, 4 CPUs, 256 processes, a 1 GB
`/tmp`, 2 hours to compile and 10 minutes to check.

Measured locally (Docker with 8 GB, 4 CPUs): a small proof takes about 10 s. A proof with a full `import Mathlib` takes
about 55 s to compile and 37 s to check, at up to about 7.5 GB.

## Building

```bash
docker build -t hoodexe/verifier:latest apps/verifier
```

The first build downloads the Lean toolchain and Mathlib's prebuilt cache (about 5 GB). After that, only the checker's
layer rebuilds. The image is large (about 16 GB), mostly Mathlib.

## The verifier VPS

Provision about 4 vCPUs, 16 GB of RAM and 60 GB of disk, with Docker and Node 24. Run nothing else on it.

```bash
git clone … && cd hoodexe-project && pnpm install --frozen-lockfile
docker build -t hoodexe/verifier:latest apps/verifier
# Environment for the worker (never put VERIFIER_BOT_PRIVATE_KEY on the Railway API):
#   DATABASE_URL            the API's Postgres (public URL)
#   REDIS_URL               optional: pushes the FORMAL ✓ callout live
#   RPC_URL_SERVER          Robinhood Chain RPC
#   VERIFICATION_POOL_ADDRESS
#   VERIFIER_BOT_PRIVATE_KEY   the pool's verifierBot; needs a little ETH for gas
#   VERIFICATION_MAX_CONCURRENT=2   VERIFICATION_TIMEOUT_SEC=7200   VERIFIER_IMAGE=hoodexe/verifier:latest
pnpm --filter @hood/api verifier
```

Run it under systemd or pm2 so it restarts. Submissions stay closed until the API has
`VERIFICATION_SUBMISSIONS_ENABLED=true` and `VERIFICATION_POOL_ADDRESS` set, and `ADMIN_WALLETS` lists who reviews.

## Running it end to end locally

Submit → check → admin review → payout → registry flag, on a local chain with anvil's test keys. Never use a real
key here. Needs Docker (Postgres and Redis from `docker compose up -d`, and the verifier image) and Foundry.

```bash
# 1. A chain with Robinhood's id: the bot signs for chain 4663, so the contract only accepts it there.
anvil --chain-id 4663

# 2. Deploy (anvil account 0 owns; the bot is set after step 3 prints its address; the operator is any address).
cd apps/contracts
OWNER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 VERIFIER_BOT=<any> OPERATOR=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 3. An env file for the API and the worker (DATABASE_URL, REDIS_URL, RPC_URL_SERVER=http://127.0.0.1:8545,
#    VERIFICATION_SUBMISSIONS_ENABLED=true, the three contract addresses from step 2, ADMIN_WALLETS=<account 0>,
#    VERIFIER_IMAGE, STAND_INS=allow). Start the API and the worker with a throwaway VERIFIER_BOT_PRIVATE_KEY:
cd apps/api
npx tsx --env-file=e2e.env src/index.ts
VERIFIER_BOT_PRIVATE_KEY=0x… npx tsx --env-file=e2e.env src/verifierWorker.ts   # prints "bot 0x…"

# 4. Make that address the pool's bot, and give it gas.
cast send <pool> "setVerifierBot(address)" <bot> --rpc-url http://127.0.0.1:8545 --private-key <account 0 key>
cast send <bot> --value 1ether --rpc-url http://127.0.0.1:8545 --private-key <account 0 key>

# 5. Run the flow (a fresh coin and proof each time):
npx tsx --env-file=e2e.env scripts/verify-e2e.ts
```

## Testing it locally

The five cases below are what the image was tested with: a real proof passes, and `sorry`, a custom axiom,
`native_decide` and a broken proof each fail with the reason. A full `import Mathlib` proof also passes.

```bash
mkdir -p /tmp/v/work /tmp/v/out && chmod 777 /tmp/v/out
printf 'import Mathlib.Tactic.NormNum\ntheorem t : (2 : ℕ) + 2 = 4 := by norm_num\n' > /tmp/v/work/proof.lean
SB="--network none --read-only --tmpfs /tmp:rw,size=1024m,mode=1777 --memory 7500m --memory-swap 7500m --cpus 4 \
    --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges --user 10001:10001"
docker run --rm $SB -v /tmp/v/work:/work:ro -v /tmp/v/out:/out:rw hoodexe/verifier:latest compile
docker run --rm $SB -v /tmp/v/out:/out:ro hoodexe/verifier:latest check
```
