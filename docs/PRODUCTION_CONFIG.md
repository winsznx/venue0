# Production configuration

[README](../README.md) · [Live deployments](LIVE_DEPLOYMENTS.md) · [Security](SECURITY.md)

Deployment: Cloudflare Workers (OpenNext adapter) at `https://venue0.timjosh507.workers.dev`, Worker `venue0`. Database: Supabase Postgres (project `zyydvdrgqppblhpoazwv`, eu-west-1) reached through Cloudflare Hyperdrive config `venue0-db` (`82f7952458f148da9dcd984bb9e45a1e`). No values of secrets appear in this file.

## Worker runtime

| Variable | Where set | Server/client | Required | Purpose | Provider | Secret | Status |
|---|---|---|---|---|---|---|---|
| `HYPERDRIVE` (binding) | `wrangler.jsonc` | server | yes | Postgres connection, one single-connection client per request | Cloudflare Hyperdrive → Supabase direct connection (`db.<ref>.supabase.co:5432`) | the origin string is stored in Hyperdrive, not the Worker | configured |
| `SESSION_SECRET` | Worker secret | server | yes | HS256 key for the Venue0 session cookie; the app refuses to run in production without it | generated (`openssl rand -hex 32`) | yes | configured |
| `ROBINHOOD_RPC_URL` | Worker secret | server | recommended | executor/read RPC for balances, prices, receipts | Alchemy (URL embeds the API key) | yes | configured |
| `VERIFIER_RPC_URL` | Worker secret | server | yes for independence | settlement verifier RPC; its host is recorded with each verification and compared with the executor host | Chainstack (free plan; ~126 blocks of state, about 13 s). The Robinhood public RPC returns HTTP 429 to Cloudflare Worker egress and is not used | yes (URL embeds a key) | configured |
| `VENUE0_SETTLEMENT_ADDRESS` | `wrangler.jsonc` vars | server | yes | Venue0Settlement contract every round settles through | onchain `0x9cf871315674830046ab0541ee018f6978e86a3d` | no | configured |
| `DYNAMIC_ENVIRONMENT_ID` | `wrangler.jsonc` vars | server; passed to the browser as a prop | yes | Dynamic SDK environment and JWT issuer/JWKS | Dynamic (Sandbox environment) | no (public by design) | configured |
| `UNISWAP_API_KEY` | Worker secret | server | optional | leftover quotes and swaps from the user's wallet | Uniswap Trading API | yes | configured |
| `GROQ_API_KEY` | Worker secret | server | optional | "Describe it" target mode (preferred provider) | Groq, model `openai/gpt-oss-120b` | yes | not configured |
| `ANTHROPIC_API_KEY` | Worker secret | server | optional | "Describe it" target mode when Groq is not set | Anthropic | yes | not configured |
| `DATABASE_URL` | not set on the Worker | server | no (Hyperdrive is used) | fallback connection string when no Hyperdrive binding exists | Supabase | yes | intentionally unset |

Chain id 4663 is fixed in code (`@venue0/shared`, the Dynamic network override and the settlement report check), not configured.

## Not deployed

These exist in the local `.env` for proof scripts and are never uploaded: `VENUE0_WALLET_{A,B,C}_PRIVATE_KEY`, `VENUE0_DEPLOYER_PRIVATE_KEY`, `FLASH_API_KEY`, `DYNAMIC_API_TOKEN`, `DYNAMIC_WALLET_PASSWORD`, `DYNAMIC_WEBHOOK_SECRET`, `DYNAMIC_DELEGATION_PRIVATE_KEY_PEM`. The web app never holds user keys; every signature happens in the user's wallet.

## Local-only

| Variable | Purpose |
|---|---|
| `DATABASE_URL` in `.env` | `pnpm db:migrate` and local runs against Supabase. Without it, local runs use embedded Postgres in `apps/web/.venue0-db/`. |
| `DYNAMIC_TEST_OTP` (shell only) | static code for Dynamic Sandbox test accounts in the e2e harness |
| `E2E_BASE` (shell only) | target URL for the e2e harness |

## Deploy procedure

1. `pnpm db:migrate` (uses `.env` `DATABASE_URL`; advisory-locked, one transaction, prints only migration ids).
2. `bash scripts/deploy/cloudflare.sh --deploy`: copies only tracked and non-ignored files to a temp directory (no `.env`, `keys/`, `.dev.vars`), builds with OpenNext, runs `scripts/deploy/secret-scan.ts` against the output (fails on any `.env` value), then deploys.
3. Secrets: `wrangler secret bulk <file>` from a temporary 0600 file that is deleted immediately.

Why the clean copy: OpenNext inlines every `.env` file it finds into `.open-next/cloudflare/next-env.mjs`. A build from the working tree contained every local secret; the scan now blocks that.

## Secret exposure checks

- Browser assets (`.open-next/assets`, `.next/static`): no `.env` value found.
- Whole Worker output from the clean-copy build: 0 hits across the 10 checked secret variables.

## Database

- Hyperdrive points at Supabase's direct connection. Pointing it at the session pooler stacked two poolers and stalled about 1 in 40 concurrent requests for 30 s (`write CONNECTION_CLOSED`); with the direct connection, 80 concurrent single-use invite redemptions ran with no errors and a 3.8 s maximum. Cloudflare's Supabase guide also specifies the direct connection.
- `pnpm db:migrate` still uses the session pooler string in `.env` (IPv4, reachable from a laptop).

- Schema: `apps/web/lib/server/db/schema.ts`, migrations `001_product`, `002_residual_quotes`, `003_lock_public_api`, `004_json_columns_as_objects`. JSON parameters bind as `$n::text::jsonb` so both drivers store objects.
- `003` enables row-level security with no policies on every table, so Supabase's public REST API (anon/authenticated roles) can read or write nothing; the app connects as the owning role.
- Nothing is seeded.
