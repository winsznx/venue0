# Sponsor and infrastructure findings

[README](../README.md) · [Sponsor integrations](SPONSOR_INTEGRATIONS.md) · [Uniswap feedback](../FEEDBACK.md)

Findings from building and running Venue0 against live services in September 2026. Only issues that changed a design, cost real time or would affect another integrator are listed. Each has the same fields.

## Definitive Flash: fixed fee dominates small residuals

- **Environment.** Flash API v1, Robinhood Chain mainnet, 2026-09-18.
- **Observed.** Fees are close to flat per order: about $0.16 for market or limit and $0.33 for a two-bucket TWAP, whether the order is $0.44 or $11. A $1.20 limit order filled, but the $0.163 fee was 13.6% of it; the limit was enforced on the post-fee amount, so the all-in rate was 13% below reference.
- **Expected.** Integrators need a minimum economic order size per asset before sending residuals.
- **Impact.** A residual engine that checks only route availability will pay fees larger than the residual.
- **Fix.** Venue0's residual engine compares all-in route costs against the user's cap and aggregates a residual into the next round when the fixed fee dominates. The same $1.20 residual now returns AGGREGATE.
- **Status.** Resolved in Venue0. Suggest Flash publish fee floors or a minimum-size hint in quotes.

## Definitive Flash: defaults that integrators must override

- **Environment.** Flash API v1, 2026-09-18.
- **Observed.** Default quotes return an unlimited `approveTx`. `/search?chain=robinhood` returns lookalike tokens (for example a 3x leveraged NVDA) next to the canonical Stock Token.
- **Expected.** Exact approvals by default; canonical Stock Tokens distinguishable in search.
- **Impact.** Unlimited allowances to a settlement contract; risk of routing a lookalike.
- **Fix.** Venue0 always sends `forceMinimalAllowance: true` and filters tokens by canonical address from the Robinhood registry.
- **Status.** Worked around.

## Robinhood Stock Tokens: two price conventions and two capability schemas

- **Environment.** `api.robinhood.com/rhj`, Chainlink Stock Token feeds, 2026-09-17.
- **Observed.** `/rhj/prices/{symbol}` returns the raw underlying price; Chainlink feeds are multiplier-adjusted. The Stock Token APIs page and the Stock Tokens page document different `tradingCapabilities` shapes; the live API returns the second. Chainlink covers 35 of 194 Stock Tokens, and feed descriptions are named inconsistently (`RHNVDA / USD` and `Robinhood AAPL / USD`) with no token address.
- **Expected.** One documented price convention and one capability schema; feeds bound to token addresses.
- **Impact.** Applying the multiplier twice, or not at all, misvalues holdings; a strict schema parser rejects every asset.
- **Fix.** Separate types for raw and multiplier-adjusted prices; feeds found by exact directory name and cross-checked against REST × multiplier within 100 bps; a tolerant capability parser where unknown means not tradable.
- **Status.** Worked around.

## Robinhood Chain public RPC: short history, and rate limits for Cloudflare egress

- **Environment.** `rpc.mainnet.chain.robinhood.com`, 2026-09-18/19.
- **Observed.** State older than roughly 10,000 blocks (about 17 minutes at 0.1 s blocks) is unavailable (`historical state … is not available`). From a Cloudflare Worker, the second request returns HTTP 429.
- **Expected.** Documented history depth and rate limits.
- **Impact.** An independent verifier on the public RPC must run within minutes, and cannot run inside a Worker at all.
- **Fix.** Production verification uses a separate keyed provider (Chainstack). A verification that falls back to the execution provider is recorded as `independent: false`.
- **Status.** Worked around.

## Dynamic Sandbox: per-IP rate limit and session length

- **Environment.** `@dynamic-labs/sdk-react-core` 5.9.0, Sandbox environment, 2026-09-18/19.
- **Observed.** After a handful of wallet sign-ins from one IP, `/verify` and `/nonce` return HTTP 429 (Cloudflare error 1015) with `retry-after` of about 45 minutes, on localhost and on the production origin alike. Sessions ended in the browser after about three hours.
- **Expected.** Documented Sandbox limits, or a higher limit for Test Accounts.
- **Impact.** Automated end-to-end testing from one machine must space out sign-ins. Distinct real users are unaffected.
- **Fix.** The test harness signs in only when a session has actually ended and retries once. The app ends its own session when Dynamic ends the browser session.
- **Status.** Open (provider limit).

## Uniswap Trading API

Detailed in [FEEDBACK.md](../FEEDBACK.md): the permissioned-token router version conflict (2.2.0 in prose, absent from the OpenAPI enum), stale `permitData` after a Permit2 approval (requote needed), and a dynamic-fee sentinel shown as `838.8608%` in `routeString`. Status: worked around; the live swap delivered exactly the quoted output.

## OpenZeppelin SignatureChecker and EIP-7702 accounts

- **Environment.** OpenZeppelin Contracts 5.6.1, Robinhood Chain mainnet fork, 2026-09-18.
- **Observed.** EOAs with EIP-7702 delegation code (including anvil's well-known dev addresses on mainnet state) are routed by `SignatureChecker` to ERC-1271 only, so their ordinary ECDSA approvals were rejected.
- **Expected.** ECDSA from the account's own key accepted.
- **Impact.** Participants with delegated EOAs could not settle.
- **Fix.** `Venue0Settlement._isValidApproval` accepts ECDSA recovery first and falls back to ERC-1271.
- **Status.** Fixed in Venue0; caught by the fork rehearsal before mainnet.

## Cloudflare Workers with OpenNext: `.env` inlined into the bundle

- **Environment.** `@opennextjs/cloudflare` 1.20.6, wrangler 4.135.0, 2026-09-19.
- **Observed.** The build inlines every `.env` file it finds, including one at the monorepo root, into `.open-next/cloudflare/next-env.mjs`.
- **Expected.** Build-time env inlining limited to explicitly public variables.
- **Impact.** Any secret in a local `.env` ships inside the Worker.
- **Fix.** Production builds run from a clean copy without `.env`, gated by a scan for every local secret value. Nothing was deployed before the fix.
- **Status.** Worked around.

## Cloudflare Hyperdrive with Supabase's session pooler

- **Environment.** Hyperdrive, Supabase Postgres (Supavisor session mode), postgres.js 3.4.9, 2026-09-19.
- **Observed.** With Hyperdrive pointed at the session pooler, about 1 in 40 concurrent requests failed with `write CONNECTION_CLOSED` or stalled for 30 s.
- **Expected.** Stable pooling under bursts of 10 concurrent requests.
- **Impact.** Intermittent 500s on concurrent joins.
- **Fix.** Hyperdrive points at Supabase's direct connection, as Cloudflare's Supabase guide specifies; one connection per request; a statement that could not be written is retried once. 80 concurrent redemptions then ran with no errors.
- **Status.** Resolved.

## postgres.js: JSON parameters double-encoded as `::jsonb`

- **Environment.** postgres.js 3.4.9 with `sql.unsafe`, Postgres 17 and Supabase, 2026-09-19.
- **Observed.** A JSON string bound as `$1::jsonb` is JSON-encoded again and stored as a JSON string, not an object. PGlite stored it as an object, so local tests did not show it.
- **Impact.** The app worked (its reader parses strings) but SQL could not query into JSON columns.
- **Fix.** Bind as `$1::text::jsonb`; migration 004 converted existing rows in place.
- **Status.** Resolved.

## Chainstack free plan: about 126 blocks of state

- **Environment.** Chainstack Developer (free) plan, Robinhood Chain mainnet, 2026-09-19.
- **Observed.** Historical reads beyond about 126 blocks, about 13 seconds, return "Archive, Debug and Trace requests are not available on your current plan".
- **Impact.** Independent verification must complete within about 13 seconds of settlement.
- **Fix.** Verification runs as soon as a settlement is reported; P3 verified inside the window. A plan with archive state removes the constraint.
- **Status.** Open (plan limit).
