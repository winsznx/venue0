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

## D-006 Settlement contract shape (2026-09-17)

- PRD: EIP-712 plan signatures, nonce, expiry, transferFrom legs, events; optional token allowlist.
- Decision:
  - Every participant (sender and receiver) signs `PlanApproval(address participant,uint256 nonce,SettlementPlan plan)` with the full plan nested, so wallets display the exact legs being approved. Domain `VENUE0` / `1` / chainId / contract.
  - Nonces are unordered per owner (`nonceUsed[owner][nonce]`) so one wallet can sit in concurrent rounds; `cancelNonce` withdraws a signed approval. Plan struct hash is also marked settled.
  - Canonical plan form enforced onchain: participants strictly ascending, legs strictly ascending by (token, from, to). This rejects duplicate legs and makes one plan hash per economic plan. Every leg party must be a participant; every participant must appear in a leg.
  - No onchain token allowlist and no owner/admin. The Stock Token universe changes at runtime and an admin key would add trust. Participants sign exact token addresses, and the offchain registry rejects non-canonical tokens before a plan is proposed.
  - `SignatureChecker` accepts EOA and ERC-1271 signatures. Submission is permissionless; the outcome is fixed by the signatures.
- Toolchain: solc 0.8.33, `evm_version = cancun`. Robinhood Chain reports `arbOSVersion()` 116 (ArbOS 61), which includes Cancun opcodes. OpenZeppelin v5.6.1 and forge-std v1.9.7 as pinned git submodules.

## D-007 Matcher formulation and reference oracle (2026-09-17)

- PRD 13.5: deterministic solver, integer math, LP/min-cost-flow library only if maintained and reproducible, otherwise a bounded deterministic solver; separate reference solver.
- Decision:
  - Production (`packages/matcher`): participant -> asset (sell cap) and asset -> participant (buy cap) edges; flow conservation at asset nodes is per-asset transfer conservation and at participant nodes is exact value balance. Max crossed value = min-cost circulation with cost -1 on sell edges, solved by minimum-mean cycle canceling (Karp). No external solver dependency. Cancellation count is bounded independently of capacity size.
  - Values are quantized to lots of $0.01 (`DEFAULT_LOT_USD_E18 = 1e16`). Capacities floor to whole lots, so no sub-cent dust legs and raw amounts derived by flooring never exceed `maxOutRaw` / `maxInRaw`. Per-participant value imbalance after raw conversion is bounded by `legs x (price / 1e18 + 1)` wei-USD.
  - Pure asset-for-asset rounds with exact value balance (tolerance only for raw-unit rounding). An explicit USDG balancing leg is future work per PRD 13.3.
  - Legs are decomposed per asset by pairing sellers and buyers in address order (at most sellers + buyers - 1 legs per asset).
  - Policy: `allowPartialCross = false` requires crossing all attainable value (min of sell and buy capacity, within one lot per asset); `minCrossPercentBps` compares against the same attainable value. Violators are excluded one at a time (worst ratio first, address tie-break) and the round is re-solved.
  - Notional definitions: requested = sum over every intent asset of |requested value|; crossed = sum of crossed value on those same entries (so each transfer counts once on the sell side and once on the buy side); residual = sum of residual value; transfer notional = one-sided sum of leg values.
  - Secondary objectives from PRD 13.4 (fewer legs, lower allocation error among equal-value optima) are not optimized yet; decomposition keeps legs low. Tracked as open work.
  - Reference (`packages/reference-matcher`): PRD 13.3 direct `x[p,q,a]` LP solved by exact rational simplex with Bland's rule, plus an independent validator that recomputes caps, conservation, value balance and fills from raw input. Parity is required on eligibility, feasibility, and optimum crossed lots. Per-(participant, asset) deltas are not required to match when optima are degenerate.

## D-008 Signature validation must accept EIP-7702 delegated EOAs (2026-09-17)

- PRD 16.5: EOA / Dynamic MPC ECDSA primary, ERC-1271 optional.
- Observed: on the mainnet-fork rehearsal, settlement reverted `InvalidSignature` for valid ECDSA approvals. The signer addresses (anvil's public dev keys) carry EIP-7702 delegation code `0xef0100...` on Robinhood Chain mainnet. OpenZeppelin v5.6.1 `SignatureChecker.isValidSignatureNow` routes any address with code to ERC-1271 only. Dynamic's EVM gas sponsorship also performs an EIP-7702 delegation on first use, so real Venue0 users can have delegated EOAs.
- Decision: `_isValidApproval` accepts ECDSA when it recovers the participant address even if the address has code, otherwise falls back to ERC-1271 for contract accounts. Tests cover a 7702-delegated EOA, an ERC-1271 smart account, and a wrong key against a smart account. Fork rehearsal keys are now derived (`keccak256("venue0-fork-rehearsal-wallet-<label>")`) instead of public dev keys.

## D-009 Residual dust classification (2026-09-17)

- PRD 13.4: avoid unnecessary dust.
- Observed: fork rehearsal of the hero cycle crossed $74.94 of $75.00; the $0.06 left over from cent-lot rounding was split across all 6 fills, which made the round `PARTIAL_CROSS` and counted 6 external orders, the same as market-only.
- Decision: a residual on a fill that crossed is `DUST` when its value is below `DEFAULT_RESIDUAL_DUST_USD_E18` ($0.10), otherwise `EXTERNAL`. A fill that crossed nothing keeps a full `EXTERNAL` residual regardless of size. Residual notional still includes dust, and `dustResidualNotionalUsdE18` is reported separately. Round status is `CROSSED` when no `EXTERNAL` residual remains. Only `EXTERNAL` residuals count as external orders.

## D-010 Live proof pipeline and rehearsal (2026-09-17)

- `scripts/live/l0-transfer.ts` and `scripts/live/round.ts` run one code path in two modes. `--fork` starts anvil on a fork of Robinhood Chain mainnet, funds fresh wallets by impersonating current holders found in recent Transfer logs, and writes to `evidence/rehearsal/fork/`. `--live` reads keys from env, broadcasts, and writes to `evidence/live/`. Fork funding helpers refuse to run in live mode.
- Round scenarios are portfolio shifts on current holdings (for example A moves 50% of NVDA value into AAPL). Intents come from `computeRebalance` + `deltaLimits`, are EIP-712 signed and signature-verified before matching. Each scenario declares a required match shape (L2: 3 legs, only 3-hop cycles, no bilateral pair). Shape or reference-parity failure stops the run before any approval or settlement transaction.
- Valuation for live rounds: Chainlink Stock Token feeds, each cross-checked against normalized REST within 100 bps (D-003 point 5).
- Approvals are exact per-leg allowances. Approval nonces are `keccak256(planHash, participant)`.
- Public RPC serves historical state only for roughly the last 10,000 blocks. The verifier reads balances at the receipt block and block - 1, so it must run promptly, or use an archive provider. A failed historical read is reported `INCONCLUSIVE`, never `PASS`.
- PRD 38.5 asks for a testnet rehearsal deploy. Robinhood docs list no Stock Tokens or faucet for testnet 46630, so a testnet run would exercise mock tokens only. The mainnet-fork rehearsal runs the same script against real Stock Token bytecode, registry, pause and blocklist logic, and live Chainlink feeds, so it replaces the testnet rehearsal for G0-G4.

## D-011 Dynamic pattern for the sponsor proof (2026-09-18)

- PRD 20: target delegated access; documented fallback to agent or server wallets; never block G0-G4.
- Observed: delegated access needs the end user to approve in a Dynamic client SDK, and the frontend is deliberately not built yet.
- Decision: the portfolio agent runs on a Dynamic server wallet (Sandbox, 2-of-2 MPC). The backend share lives only in gitignored `keys/dynamic-agent-wallet.json` (0600). The agent joins live rounds as participant "D" and signs intents, plan approvals and allowance transactions through Dynamic. Delegated access (user-owned embedded wallet -> agent) is added with the frontend and does not replace this proof. Claim wording states "server wallet", not "delegated access".

## D-012 Economic residual engine (2026-09-18)

- Observed: residual engine v1 sent a ~$1.20 residual to a Flash LIMIT order whose flat fee was 13.6% of notional. Integration passed; the decision was economically poor.
- Decision (`venue0-residual-2-economic`):
  - Every candidate route carries `providerFeeUsd`, `networkCostUsd`, `priceImpactUsd` (null when the provider data cannot separate it), `allInCostUsd`, `allInCostBps` and `fixedCostUsd`. All-in = reference value given up - reference value received + gas, using the round snapshot as reference. Costs come from live quotes (Uniswap `/quote` output and `gasFeeUSD`; Flash `/quote` `to.amount` and `fees.estimatedFeeNotional`).
  - `maxExternalSlippageBps` is the user's all-in cost cap. A route is viable only if its style is allowed and its all-in cost is within the cap. The engine picks the cheapest viable route (HIGH urgency prefers a viable market route).
  - AGGREGATE: when no route is viable, but removing the fixed cost would make one viable, a later Venue0 round exists, and the user allows waiting, the residual is carried into the next round as an intent instead of paying a fee that dominates it. Otherwise WAIT (or CANCEL if the user forbids waiting).
  - Flash's fixed component is estimated as quoted fee minus the documented 10 bps trade fee. This split is an estimate and labelled as such.
- Live check (`evidence/live/L6-residual-decision/`): the same L6 residual, re-quoted live, costs 1356 bps on Flash LIMIT (observed fill: 1358 bps) and 121 bps on Uniswap. Engine decision: AGGREGATE.

## D-013 Venue0 Circles backend (2026-09-18)

- `packages/circles`: circles (PUBLIC / INVITE_ONLY / PRIVATE, DELTAS_ONLY / AGGREGATE_ONLY), membership, single-use invites (only SHA-256 hashes stored), recurring cadence, and circle rounds on the PRD 12 state machine with an explicit transition table.
- Intents enter a circle round only if the owner is a member, every asset is inside the circle universe, the intent is bound to that round and circle, and the EIP-712 signature recovers to the owner or its agent. Freeze runs the production matcher with the circle's universe.
- AGGREGATE lands here: residuals carry forward into a later round of the same circle, as pre-filled limits the owner re-signs in the next intent.
- Privacy defaults (PRD 11.3): aggregate stats expose counts and notional totals only; per-asset figures are suppressed when fewer than 3 participants touched the asset; members see only their own fills; AGGREGATE_ONLY circles show members a count instead of the member list.
- State is in memory behind one service class. Persistence (Postgres) and the HTTP API are added with the web app; the PRD makes the database conditional on needing persistence.
