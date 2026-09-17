# Decisions

Format per entry: PRD assumption, observed reality, source, impact, decision. Newest last.

## D-001 Toolchain and pinned versions (2026-09-17)

- Node 24.19.0, pnpm 11.23.0 workspace, Foundry 1.7.1 (forge/cast/anvil).
- TypeScript 6.0.3, not 7.0.2. typescript-eslint 8.70.0 declares `typescript >=4.8.4 <6.1.0`, so TS 7 would run lint outside its supported range.
- viem 2.56.7, zod 4.6.5, vitest 5.0.1, tsx 4.23.13, eslint 10.10.0, @eslint/js 10.0.1, fast-check 4.10.1, @types/node 24.13.5.
- `.npmrc save-exact=true`: every dependency is pinned exactly.
- Workspace packages export TypeScript source directly (`exports: ./src/index.ts`). No build step for internal packages; tsx and vitest execute source. Keeps the deadline build simple; revisit only if the web app bundler needs compiled output.

## D-002 Stock Token identity uses the API `id`, confirmed onchain (2026-09-17)

- PRD: `CanonicalStockToken.uid`, resolved from `/rhj/assets`; requires issuer / instrument type.
- Observed: live records have `id`, `tokenSymbol`, `tokenName`, `deployments[]`, `currentMultiplier`, `pendingMultiplier`, `status`, `logoUrl`, `tradingCapabilities`, `tokenDecimals`, `isin`. No issuer or instrument-type field. Every token exposes `uid()` onchain equal to the API `id`, plus `terms()` = `https://robinhood.com/stocktoken/rhj`, and all sampled tokens share one `ACCESS_CONTROLLED_REGISTRY` / beacon `0xe10b6f6B275de231345c20D14Ab812db62151b00`.
- Source: live API response `evidence/research/robinhood-assets-raw.json`; onchain reads in `evidence/research/robinhood-assets-current.json`.
- Impact: issuer identity cannot come from an API field.
- Decision: identity = API `id` == onchain `uid()` + chainId 4663 + API deployment address. Onchain verification also checks symbol, decimals, `uiMultiplier()` == API `currentMultiplier`, and pause flags. `isin` is stored when present. Shared registry address is recorded as corroborating issuer evidence, not as a hard-coded allowlist.

## D-003 Canonical valuation path (2026-09-17)

- PRD preferred V1: Chainlink Stock Token feed x raw balance.
- Observed: Chainlink publishes 35 `Robinhood <SYMBOL> / USD` feeds on Robinhood Chain (57 feeds total) against 194 Stock Tokens. Feeds are 8 decimals, heartbeat 86400s, deviation driven. During US market hours on 2026-09-17 feed ages were 447s to 16,497s and feed price diverged 4 to 41 bps from REST mid x `currentMultiplier`. The directory names feeds by ticker; onchain `description()` is inconsistent (`RHNVDA / USD` vs `Robinhood AAPL / USD`) and carries no token address.
- Source: `https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json` (the data behind docs.chain.link addresses page linked from Robinhood's oracle docs), onchain `latestRoundData()`, `https://api.robinhood.com/rhj/prices/{symbol}`.
- Impact: Chainlink alone cannot value the whole universe, and a ticker-named feed is weaker identity than the token uid.
- Decision:
  1. One type, `PriceSnapshot.priceUsdE18` = USD per whole token, multiplier already applied. Nothing downstream touches multipliers.
  2. Chainlink path: rescale answer only. Stale when age > directory heartbeat.
  3. REST path: mid of bid/ask x `currentMultiplier` exactly once; stale when older than the caller's max age or `isTradingHalt`.
  4. A feed is accepted for an asset only when found by exact directory name AND its price is within a configured divergence (100 bps for research) of the normalized REST price.
  5. A valuation snapshot uses a single declared source per round and records every asset's source timestamp, block, and multiplier. Choice of source for live rounds is made when G2 is assembled and logged here.

## D-004 Pinned reads lag head by 40 blocks on the public RPC (2026-09-17)

- Observed: `eth_call` at the block number just returned by `eth_blockNumber` failed with `unsupported block number` because the public endpoint is load-balanced across backends at different heights.
- Impact: verifier and snapshot reads pinned to head are flaky.
- Decision: `pinnedReadBlock()` reads at head minus 40 blocks. Verifier before/after reads must be pinned relative to the settlement receipt block, not head, and use an authenticated RPC when available.

## D-005 Stock Tokens are pausable, blocklist-gated, upgradeable beacon proxies (2026-09-17)

- PRD: tokens are standard ERC-20s transferable between ordinary wallets; do not assume permit.
- Observed: each token is a 283-byte beacon proxy. Implementation `0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2` exposes `pause/unpause/paused/tokenPaused`, `pauseOracle/oraclePaused`, `adminBurn`, `mint/burn`, `updateMultiplier`, ERC-2612 `permit/nonces/DOMAIN_SEPARATOR/eip712Domain` (domain name is the full token name, e.g. `NVIDIA • Robinhood Token`). The registry exposes `isBlocked(address)` and `blockAccounts`. Robinhood docs do not document permit or the blocklist.
- Mainnet-fork test (anvil fork at block ~65521309): fresh EOA received 1 NVDA, approved a second fresh EOA for 0.4 NVDA, which called `transferFrom` to a third fresh EOA. All succeeded with exact balance deltas. This is fork evidence, not a live transaction.
- Impact: any leg can revert for issuer reasons; logic can change under us via beacon upgrade.
- Decision: settlement stays all-or-nothing. Settlement preflight checks `paused`, `tokenPaused`, registry `paused`, and `isBlocked` for every leg party and for the settlement contract. Spike path still uses plain `approve`; permit is a later optimization and must be tested live before use. Implementation address is recorded in each evidence bundle so an upgrade is visible.
