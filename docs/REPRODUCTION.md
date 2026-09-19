# Reproduction

[README](../README.md) · [Evidence](EVIDENCE.md) · [Production config](PRODUCTION_CONFIG.md)

Everything in the first part runs on a laptop with no funds, keys or accounts. The second part needs funded wallets and API keys and is how the live evidence was produced.

## Requirements

| Tool | Version used |
|---|---|
| Node.js | 24.19.0 (`engines: >=24`) |
| pnpm | 11.23.0 (`packageManager` field; `corepack enable`) |
| Foundry | 1.7.1 (`forge`, `anvil`) |
| Chrome | only for the end-to-end browser harness |

## Part 1: local, no secrets

```bash
git clone https://github.com/winsznx/venue0.git && cd venue0
git submodule update --init --recursive   # OpenZeppelin and forge-std
corepack enable
pnpm install

pnpm test              # 95 TypeScript tests (vitest)
pnpm test:matcher      # matcher and reference-solver tests only
pnpm test:contracts    # 32 Foundry tests
pnpm typecheck
pnpm lint
pnpm web:build         # next build
```

**Campaign.** Regenerates and evaluates the 400 frozen scenarios from the committed seed and methodology, then writes CSV, JSON and summaries to `campaign/results/`:

```bash
pnpm campaign
pnpm campaign:analyze
```

Results should match [CAMPAIGN_RESULTS.md](CAMPAIGN_RESULTS.md). The methodology was committed before the run ([EVAL_CAMPAIGN.md](EVAL_CAMPAIGN.md)).

**Web app.** Runs against an embedded Postgres (PGlite) in `apps/web/.venue0-db/` when `DATABASE_URL` is unset:

```bash
pnpm web:dev           # http://localhost:3100
```

The public site, `/proof` and `/demo` work with no configuration. Signing in needs a Dynamic environment ID, and reading portfolios needs a Robinhood Chain RPC (the public RPC is used by default).

**Re-verify committed evidence.** Re-runs the independent verifier for every recorded live settlement through the RPC in `ROBINHOOD_RPC_URL` (use a different provider from the one that executed). It needs a provider with archive state, since the settlements are older than public RPCs keep:

```bash
pnpm verify
```

## Part 2: live integrations (secrets and funds)

Copy `.env.example` to `.env`; every variable is documented there. Never commit `.env`.

| What | Needs |
|---|---|
| Proof rounds G0-G4 (`pnpm proof:l0`, `pnpm proof:round --live L1/L2/L3/L4`) | three funded proof wallets (ETH for gas plus canonical NVDA, AAPL, SPY Stock Tokens on Robinhood Chain), an RPC URL |
| Fork rehearsal of the same scripts (`pnpm rehearse`) | Foundry `anvil` and an RPC URL; no funds |
| Uniswap residual (`pnpm proof:residual --live`) | `UNISWAP_API_KEY` and a funded wallet with a residual |
| Flash limit order (`pnpm proof:flash --live`) | `FLASH_API_KEY` and a funded wallet |
| Dynamic agent round | `DYNAMIC_ENVIRONMENT_ID`, `DYNAMIC_API_TOKEN`, `DYNAMIC_WALLET_PASSWORD` |
| Web app with sign-in | `DYNAMIC_ENVIRONMENT_ID`, `VENUE0_SETTLEMENT_ADDRESS`, optionally `DATABASE_URL`, `VERIFIER_RPC_URL`, `UNISWAP_API_KEY` |
| Production deploy | Cloudflare account with Workers, a Hyperdrive config, Postgres; see [PRODUCTION_CONFIG.md](PRODUCTION_CONFIG.md) |
| End-to-end browser harness (`scripts/e2e/`) | funded proof wallets, a Dynamic Sandbox environment with Test Accounts enabled (`DYNAMIC_TEST_OTP`), Chrome |

Stock Tokens are not offered to U.S. persons and are restricted in other jurisdictions. Acquire them only where you are eligible.

Live sizes in the evidence were $1-$12 per round and gas was a fraction of a cent per transaction.
