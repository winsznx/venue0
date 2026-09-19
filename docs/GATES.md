# Gates

Status values: NOT_STARTED, IN_PROGRESS, REHEARSED_ON_FORK, PASS, FAIL, BLOCKED_ON_CREDENTIAL_OR_FUNDS. REHEARSED_ON_FORK means the exact live script passed against an anvil fork of Robinhood Chain mainnet; it is not a live proof. PASS requires an independently verified postcondition, never a broadcast or HTTP 200.

Current product state: **MECHANISM LOCKED** (G2, G3, G4 passed live on Robinhood Chain mainnet, 2026-09-18).

| Gate | Description | Status | Evidence | Updated |
|---|---|---|---|---|
| P0 | Reality verification: RPC, live assets API, canonical resolver, onchain metadata, demo assets | PASS | `evidence/research/robinhood-assets-current.json` | 2026-09-17 |
| G0 | Live Stock Token transfer A -> B | PASS | `evidence/live/L0-transfer/` | 2026-09-18 |
| G1 | Two-wallet atomic exchange | PASS | `evidence/live/L1-bilateral/` | 2026-09-18 |
| G2 | 3 wallets / 3 assets / non-trivial cycle (hero) | PASS | `evidence/live/L2-cycle/` | 2026-09-18 |
| G3 | Partial overlap with exact residual | PASS | `evidence/live/L3-partial/` | 2026-09-18 |
| L5 | Residual executed through Uniswap | PASS | `evidence/live/L5-residual/` | 2026-09-18 |
| L7 | Portfolio agent on a Dynamic wallet crosses live | PASS | `evidence/live/L7-dynamic-agent/` | 2026-09-18 |
| L6 | Flash LIMIT integration (quote, sign, submit, fill, readback) | PASS (integration only; see boundary finding) | `evidence/live/L6-flash-round/`, `evidence/live/L6-flash-residual/` | 2026-09-18 |
| G4 | Zero overlap, NO_CROSS | PASS | `evidence/live/L4-no-cross/` | 2026-09-18 |

## Log

### 2026-09-17 P0 PASS

- `eth_chainId` on `https://rpc.mainnet.chain.robinhood.com` = 4663; block 65526682 read.
- `GET /rhj/assets`: 194 records, 194 schema-valid, 194 canonical, all `ASSET_STATUS_ACTIVE`, all a single deployment on 4663, all 18 decimals, capability shape `SESSION_MAP` for all 194. 27 tokens carry a non-unit multiplier (CRWD = 4.0). No pending multipliers. WYFI, SLS, XNDU are whole-only.
- Candidates NVDA, AAPL, SPY, QQQ, TSLA, MSFT, AMZN, GOOGL, META each passed: bytecode present, onchain symbol / decimals / uid / uiMultiplier equal to API, token and registry unpaused, tradable whole + fractional in all three sessions, Chainlink feed present and within 100 bps of normalized REST.
- Demo universe for G2: NVDA, AAPL, SPY (PRD hero), with QQQ/TSLA/MSFT as alternates.
- Limitation: onchain transferability was demonstrated on a mainnet fork only (D-005). Live transfer is G0.

### 2026-09-17 G0-G4 rehearsed on a Robinhood Chain mainnet fork

Same scripts as the live run, against anvil forked from the public RPC. Real NVDA / AAPL / SPY Stock Token contracts (beacon implementation `0xb35490d6f9163DE4F80d88dc75c3516eb64C5aE2`), Chainlink prices cross-checked with normalized REST, fresh derived wallets funded by impersonating current holders. Nothing was broadcast to Robinhood Chain.

| Case | Result | Round status | Requested | Crossed | Residual (dust) | Legs | Market-only external orders | Venue0 external orders | Settle gas |
|---|---|---|---|---|---|---|---|---|---|
| L0 transfer 0.01 NVDA | PASS | n/a | | | | | | | |
| L1 bilateral | PASS | CROSSED | $50.00 | $49.96 | $0.04 ($0.04) | 2 | 4 | 0 | 249,167 |
| L2 3-wallet cycle | PASS | CROSSED | $75.00 | $74.94 | $0.06 ($0.06) | 3 | 6 | 0 | 345,251 |
| L3 partial | PASS | PARTIAL_CROSS | $65.00 | $29.96 | $35.04 ($0.02) | 2 | 4 | 2 | 249,155 |
| L4 zero overlap | PASS | NO_CROSS | $50.00 | $0.00 | $50.00 | 0 | 4 | 4 | no tx |

The verifier passed every check on L1-L3 (12 checks for 2 participants, 13 for 3): calldata plan hash, PlanSettled, CrossingLeg, ERC-20 Transfer logs with zero unexpected transfers, NonceConsumed per participant, planSettled and nonceUsed state, per-wallet net deltas across all scenario tokens, and zero settlement custody. The reference matcher agreed on every case.

Blocked on: funded live wallets and gas (see `KEYS_NEEDED.md`). No live gate is marked PASS.

Two defects found and fixed during rehearsal: EIP-7702 delegated signers were rejected (D-008), and cent-lot rounding dust inflated external order counts (D-009).

### 2026-09-18 G0-G4 PASS live on Robinhood Chain mainnet

`Venue0Settlement` deployed at `0x9cf871315674830046ab0541ee018f6978e86a3d` (deploy tx `0x071ee0c035695bcfdfad52ce9e7f11fec5b19a97e6ca80d06e74323ce8d71947`). Wallets A `0x71509D21A26F47F83B36A835bB4619Df8F512718`, B `0x0f199Cc71F82f1baA7D731cbD03C6F8895a9D70D`, C `0x69a0ba2cB75cE834fFbaa258eA2342f862903cae`, each funded with about $4 of one Stock Token. Verifier read through the same public RPC as the executor (no `VERIFIER_RPC_URL` set), at the receipt block and block - 1.

| Gate | Status | Requested | Crossed | Residual | Legs | Market-only orders | Venue0 orders | Tx |
|---|---|---|---|---|---|---|---|---|
| G0 transfer 0.001 NVDA A->B | PASS | | | | | | | [0xb3ea...74f8](https://robinhoodchain.blockscout.com/tx/0xb3eaab11773e0341ceea4a10854740d9a1cfc5e575f3e72140968232fa2074f8) |
| G2 3-wallet cycle | PASS, CROSSED | $11.93 | $11.88 | $0.05 (all dust) | 3 | 6 | 0 | [0xfdd1...3035](https://robinhoodchain.blockscout.com/tx/0xfdd14b8e7c4c4a2aedd567a51a15492159c0d0e67ae7ef94028f7c7aff863035) |
| G1 bilateral | PASS, PARTIAL_CROSS | $3.78 | $3.56 | $0.22 | 2 | 4 | 2 | [0xd125...4a94](https://robinhoodchain.blockscout.com/tx/0xd125f8668883ae888a6f0507a09d665e49f77a202b1dc2dbf7e9936fc2764a94) |
| G3 partial | PASS, PARTIAL_CROSS | $2.45 | $1.32 | $1.13 | 2 | 4 | 2 | [0x9d4d...aced](https://robinhoodchain.blockscout.com/tx/0x9d4d14d2eee13e542cbbf58e8feab98755035f9280585878f2213984e23faced) |
| G4 zero overlap | PASS, NO_CROSS | $2.54 | $0.00 | $2.54 | 0 | 4 | 4 | no tx |

G2 settled in one tx (343,258 gas, block 66210265): A.NVDA -> C, C.SPY -> B, B.AAPL -> A, discovered by the matcher from portfolio targets. All 13 verifier checks PASS. G1 ran after G2 on unequal leftover balances, so it crossed partially; the gate (atomic bilateral exchange) is met.

Independent re-verification (2026-09-18, `pnpm verify`): L1 12/12, L2 13/13, L3 12/12 PASS through Alchemy (`robinhood-mainnet.g.alchemy.com`), a different provider from the public RPC that executed the rounds. Reports: `verifier-report-independent.json` in each run directory.

### 2026-09-18 L5 PASS: live residual through Uniswap

Residual source: the EXTERNAL residual of live round L3 (wallet A: SELL 0.002547016163469560 NVDA, BUY AAPL). Executed as one NVDA -> AAPL swap via the Uniswap Trading API with `x-universal-router-version: 2.1.1`. `/check_approval` returned a Permit2 approval (tx `0x69fbb5cf0a29354d028663355c4b091afe5579d0f4ebea68542e0b06e0208ba4`); `/quote` routing CLASSIC, route `[v4] 0.3% fee`; `/swap` with Permit2 signature; swap tx [0xaec4...84db](https://robinhoodchain.blockscout.com/tx/0xaec4488e2ba8d2dcd14fdbaec15d6fde31398a980175fd1fe5bcf8f56d8a84db). Readback through the public RPC (executor used Alchemy): NVDA spent exactly the residual amount (1 wei of dust remained from the wallet's prior balance), AAPL received 1,658,383,465,256,918 raw, equal to the quoted output and above the 2.5% minimum.

### 2026-09-18 L7 PASS: Dynamic agent wallet takes part in a live round

Agent wallet `0x00dB4B5f745da1351eaf687c39107c54E344E87C` is a Dynamic Sandbox server wallet (2-of-2 MPC, walletId `4b9a76e9-5b57-48b3-a4ea-97c6ac27fc33`). Funded by wallet C (SPY tx `0x8ea2931e...bf76`, ETH tx `0xeba024e6...60dc`). In round L7 the agent signed its EIP-712 intent, its EIP-712 plan approval, and sent its SPY allowance tx (`0x2c75c06d...4cf6` or `0x7f7ae39d...a2fb`, see `settlement-plan.json`), all through Dynamic MPC. Settlement [0x0f85...1873](https://robinhoodchain.blockscout.com/tx/0x0f851b81082f93f863ddceeae3f4aff47ad6eac52f04482985eb75e187a91873): agent SPY -> A, A AAPL -> agent. Requested $5.75, crossed $3.96. Verifier PASS; independent re-verification through the public RPC 12/12 (executor used Alchemy).

The public RPC can no longer re-verify L1-L3 (state pruned); those remain PASS via Alchemy.

### 2026-09-18 L6 PASS: residual engine chose a Flash LIMIT order, filled and verified

Round L6 (settlement [0xeea6...6b87](https://robinhoodchain.blockscout.com/tx/0xeea682902f0fe4c6d217b10cc2f625985c5d6e9ea147d4a6df982cd71e656b87)): B moved its AAPL into NVDA, C moved all NVDA into AAPL under a price-protection policy (`allowMarketResidual: false`, urgency LOW). Partial cross left C an EXTERNAL residual of 0.005467680833338535 NVDA (~$1.20).

Residual engine inputs (live): session `extended` (08:57 ET), Robinhood NVDA capabilities tradable, no halt, Uniswap immediate route available, Flash quote available. Decision: LIMIT on FLASH, reasons "user does not allow market residuals; price protection preferred". Limit cross price 0.647986 AAPL per NVDA (snapshot reference less 50 bps).

Flash: exact-allowance approval `0xa37dae46...4687`, EIP-712 FlashOrder signed by C, order `1ae2aa7a-91b9-46d3-bf18-5f5095a062fc`, status `ORDER_STATUS_FILLED` (`REASON_FULLY_FILLED`), routed to Uniswap V4. Fill tx [0xa30e...5fc6](https://robinhoodchain.blockscout.com/tx/0xa30e95a18cc90b99f141f611118dce5bcd7251111038d5bab9d79947f9e55fc6) read back through the public RPC: C sent exactly 5,467,680,833,338,535 raw NVDA and received 3,074,802,608,113,408 raw AAPL.

Honest cost note: Flash charged a $0.162 network fee plus $0.0012 trade fee on a $1.20 order (13.6%), taken from the input. The limit applied to the traded amount after fees (0.6506 AAPL/NVDA, above the 0.6480 limit), but the effective all-in rate was 0.5624 AAPL/NVDA, 13% below reference. At this size Flash is price-protected but expensive; the flat fee becomes about 1.6% at $10 and 0.16% at $100.

### 2026-09-18 L6 boundary finding: integration PASS, economics NOT shown

| Question | Answer |
|---|---|
| FLASH_INTEGRATION | PASS: quote, exact approval, EIP-712 order, submit, `ORDER_STATUS_FILLED`, onchain readback (`fill-readback.json`) |
| FLASH_WAS_THE_BEST_EXECUTION_DECISION | NOT SHOWN. The ~$0.163 fee was 13.6% of the ~$1.20 residual; all-in rate 13.2% below reference |

The residual engine that chose LIMIT (version 1) checked session, halt, drift, route availability and policy, but not execution economics. It is superseded by the economic engine (D-012). This run stays in evidence unchanged as a real boundary case. The Flash demo order must use a residual large enough that the fee is economically legible, after re-querying current fees.

Current live status: G0-G4 PASS LIVE, L5 Uniswap residual PASS LIVE, L6 Flash LIMIT integration PASS LIVE (economics caveat above), L7 Dynamic agent wallet PASS LIVE. At the Phase 14 stop: 87 TypeScript tests and 32 Foundry tests passing; full G0-G4 fork rehearsal re-run PASS on the final backend code.

### 2026-09-18 PRODUCT E2E PASS: real users through the application, two-user and three-user cycle

Run through the Venue0 web app itself (not `/demo`) in separate Chrome profiles, one per operator-controlled Dynamic Sandbox test account. Each account signed in through Dynamic's real modal: a wallet signature (SIWE) from a funded proof wallet exposed to the page as an EIP-6963 provider, then a `+dynamic_test` email with the sandbox static code. The server verified each Dynamic JWT against the environment JWKS and bound the session to that wallet. Evidence: `evidence/product/2026-09-18/`.

- Test 1 (A, B), round `0x2241…c0cc`: onboarding, live portfolio, structured target, A created a public circle, B joined through Discover, both signed EIP-712 intents, auto-solve, each approved the exact plan and granted an exact allowance, B sent `settle()` [0x19ee…b85c](https://robinhoodchain.blockscout.com/tx/0x19ee8cec913d58f498937f41cff8242dcf1a5e3eb58aa317cdab0fb61176b85c). Verifier PASS 12/12 on the public RPC (executor Alchemy). A's $0.28 leftover: engine WAIT (Uniswap all-in 1066 bps vs 50 bps cap); A chose carry forward in the UI.
- Test 2 (A, B, C), round `0x2bb8…5197`: A sells SPY for NVDA, B sells NVDA for AAPL, C sells AAPL for SPY. No two can trade; the matcher found one 3-hop cycle (A→C SPY, C→B AAPL, B→A NVDA), $4.74 of $5.19 crossed. All three approved; C sent one atomic settlement [0x4929…0f4d](https://robinhoodchain.blockscout.com/tx/0x4929221f2363cce65e9ffe1387e8287c1ed7603075878498b13cb8729cbe0f4d). Verifier PASS. Each user reached their own receipt; B carried a leftover forward (engine AGGREGATE).
- Persistence: server restarted after both rounds; users, circles, targets, rounds, intents, approvals, residual decisions and Activity read back; sessions resumed.
- Edges 22/22 PASS plus wrong OTP and expiry: forged wallet association (A's real Dynamic JWT with B's address) rejected 401; invalid token 401; non-member and anonymous round reads refused; B's round view and receipt contain no other member's address; duplicate join, intent, settlement report are no-ops; approval after settlement refused; wallet starting on chain 1 switched to 4663 before signing; one-signer round → INSUFFICIENT_PARTICIPANTS; unsigned round → EXPIRED; non-complementary targets → NO_CROSS; sign out, sign back in, refresh, second profile; wrong code → Dynamic 422, no session.
- Bugs found by the run and fixed: unheld target assets had no price; saved weights summed to 99.99%; round views leaked member addresses (graph, history, verifier check names); stale client session after sign-out; the settlement report accepted any tx hash (now must call `settle()` on this plan); duplicate intent/approval/join logged twice; result totals double-counted both sides.

Checks at this gate: 88 TypeScript tests, 32 Foundry tests, typecheck, lint, `next build` PASS. Clean-browser smoke: 16/16 page loads render, gate and have no horizontal overflow at 1360 and 390 px; console errors were only Dynamic `/nonce` calls blocked by the sandbox's Cloudflare rate limit (HTTP 429, error 1015) after repeated loads.

### 2026-09-18 PRODUCT CORRECTNESS: concurrency, settlement reporting, persistence

- Settlement reporting now accepts a hash only if the transaction is on chain 4663, calls the exact Venue0Settlement address, and its `settle()` calldata hashes to this round's plan. After the receipt succeeds, the verifier (public RPC) checks the PlanSettled, CrossingLeg and NonceConsumed events, `planSettled` and nonce state, unexpected transfers, custody, and each participant's token deltas at the receipt block. A new `participants.set` check requires the consumed approvals to be exactly the plan's participants. Anything short of PASS ends in VERIFICATION_FAILED.
- Concurrent mutations, real sessions, no tokens moved (both test wallets declined every transaction), 13/13 PASS (`evidence/product/2026-09-18/concurrency.log`): 10 simultaneous joins leave one membership and one Activity row; 10 simultaneous lobby entries open one round; 10 simultaneous replays of a signed intent return UNCHANGED and log once; the solve raced by 20 concurrent reads transitions FROZEN > SOLVING > PROPOSED exactly once; 10 simultaneous duplicate approvals store one approval and log once; a declined wallet transaction shows a plain error and sends nothing; 10 concurrent reports of another plan's real `settle()` tx are refused (409) and a nonexistent hash is refused, with the round left READY_TO_SETTLE (it then expires; nothing moved). Direct database check after the run: no duplicate Activity, memberships or round transitions.
- Persistence: server restarted, then each of A, B, C refreshed: session, target, circles and settled Activity present (`persist.log`).
- 88 TypeScript tests, 32 Foundry tests, typecheck, lint, `next build` PASS.

### 2026-09-19 PRODUCTION DEPLOYMENT: workflow PASS, independent verification BLOCKED

Public app `https://venue0.timjosh507.workers.dev` (Cloudflare Workers via OpenNext; Supabase Postgres through Hyperdrive; Dynamic Sandbox). Operator-controlled test accounts A, B, C in fresh browser profiles. Evidence: `evidence/production/2026-09-19/`.

- Clean database: `pnpm db:migrate` from zero on Supabase (`001`-`003`, 13 tables, nothing seeded); RLS on every table.
- Round P1, deployed app, three-way cycle (A sells NVDA for SPY, B sells AAPL for NVDA, C sells SPY for AAPL): circle `0xb095…b2c6`, round `0x033b…438b`, plan `0xb717…9989`, 3 exact-amount approvals, settlement [0x45c0…ec35](https://robinhoodchain.blockscout.com/tx/0x45c0a4ad35c98e180365bd88bf912ef978f8c1a5a66f8474527cf47d9ec1ec35). The settle request was cancelled at the edge mid-verification (inline receipt wait plus verification exceeded the ~100 s idle limit); the round stayed in VERIFYING. Fixed (short poll-driven steps, resume on read); on resume the public RPC had pruned the block, so verification ran on the executor RPC: PASS 14/14, recorded `independent: false`.
- Round P2, deployed app, reverse cycle: circle `0xd4f4…70ca`, round `0x6833…2ce7`, settlement [0x17b0…6b1e](https://robinhoodchain.blockscout.com/tx/0x17b084d5239e6277e9bde84b89ab9f7aea3e1bb2fa40bf7c91bf285fb8d56b1e), verifier PASS 14/14 within seconds of settlement, again recorded `independent: false`: a probe Worker showed the Robinhood public RPC answers Cloudflare egress with HTTP 429 on the second call.
- Receipts and Activity for all three accounts in both rounds; leftovers carried forward through the UI (engine suggestions AGGREGATE/carry).
- Persistence: 7 redeploys during the run; rounds, sessions, targets and Activity survived each.
- Concurrency on production Postgres 13/13 (joins, lobby entry, duplicate intents, solve race, duplicate approvals, declined wallet tx, forged settlement reports); single-use invite raced 80 times with no 5xx after moving Hyperdrive to the direct connection.
- Auth and authorization 15/15 on HTTPS: session cookie HttpOnly+Secure+SameSite=Lax; three profiles hold three wallets; forged association (A's Dynamic JWT + B's address) 401; invalid token 401; anonymous 401; non-member refused; B's view of the shared round contains neither A's nor C's address; single-use invite admits one; sign out, sign back in, refresh; fresh profile lands on onboarding.
- Bugs found in production and fixed: `.env` inlined into the Worker by OpenNext (blocked by clean-copy builds and a scan gate); settle request cancelled mid-verification; verifier RPC errors 500'd round reads; Hyperdrive over the session pooler stalled under concurrency; Uniswap quote stash in process memory; target check 3.5 s → 1.5 s (batched feed reads).
- Open: production verification is not independent until a second keyed RPC provider is configured as `VERIFIER_RPC_URL`. Dynamic Sandbox rate-limits a single client IP after a handful of sign-ins (HTTP 429, ~45 min), which throttled testing but does not affect distinct users.

Checks: 95 TypeScript tests, 32 Foundry tests, typecheck, lint, `next build`, OpenNext build with secret scan 0 hits.

### 2026-09-19 Production checkpoint status

| Gate | Status |
|---|---|
| LOCAL_PRODUCT_E2E | PASS |
| PUBLIC_DEPLOYMENT | PASS |
| PRODUCTION_MULTI_USER | PASS |
| PRODUCTION_SETTLEMENT | PASS |
| PRODUCTION_PERSISTENCE | PASS |
| PRODUCTION_AUTH | PASS |
| INDEPENDENT_VERIFICATION | BLOCKED_ON_SECOND_RPC |
| PRODUCTION_E2E | PARTIAL |

Historical record, fixed: deployed-app settlements `0x45c0a4ad35c98e180365bd88bf912ef978f8c1a5a66f8474527cf47d9ec1ec35` (round `0x033bffb3571809957ac3899a5c625ce7025255807c20dafddcc4703b1335438b`) and `0x17b084d5239e6277e9bde84b89ab9f7aea3e1bb2fa40bf7c91bf285fb8d56b1e` (round `0x6833eb14f22fa9423b069f0aa938bbea61f656cf0f191c176ff939658b3b2ce7`) are verifier PASS with independent = false (executor and verifier both `robinhood-mainnet.g.alchemy.com` after the public RPC failed). These entries are not to be revised; independent verification must come from a new round.

### 2026-09-19 INDEPENDENT_VERIFICATION PASS: deployed-app round verified through a second provider

Round P3 through the public product (not `/demo`): operator-controlled accounts A, B, C; A sells NVDA for SPY, B sells AAPL for NVDA, C sells SPY for AAPL. Evidence: `evidence/production/2026-09-19/independent-verification.json`, `prod-round3.log`.

| Field | Value |
|---|---|
| EXECUTION_PROVIDER | robinhood-mainnet.g.alchemy.com (Worker `ROBINHOOD_RPC_URL`; the settlement itself was sent from B's wallet) |
| VERIFICATION_PROVIDER | robinhood-mainnet.core.chainstack.com (Worker secret `VERIFIER_RPC_URL`; no fallback used) |
| independent | true |
| round id | `0xeac408f808ecf1d35d2b8af6ccf7b5035e9f97f80a054af5dd267a70ff4a7448` (circle `0x3e8f30412613fd69d0e92155316dc2ddc8a70f291dddbf1d23fc89ef6fcf8bd0`) |
| plan hash | `0xc011f708c625b4ced9e88c734fdb5a431ffc197d4bf10724247165a2e153c6ea` |
| tx hash | [0xd8d95dd809ece9ca6dc4b2fcf343332f62f50005677ef9def433d06edca7edd3](https://robinhoodchain.blockscout.com/tx/0xd8d95dd809ece9ca6dc4b2fcf343332f62f50005677ef9def433d06edca7edd3) |
| receipt | success, block 67023440, to Venue0Settlement `0x9cf8…6a3d`, gas 291946, 13 logs |
| settlement events | 3 NonceConsumed, 3 CrossingLeg, 1 PlanSettled |
| participant set = approval participant set = NonceConsumed set | A, B, C (equal) |
| expected vs observed token deltas | 12 owner/token pairs, all equal |
| verification block | 67023440 (balances also read at 67023439) |
| verifier | PASS 14/14: tx.status, tx.to, calldata.plan, event.PlanSettled, event.CrossingLeg, event.Transfer, 3× event.NonceConsumed, state.planSettled, state.nonceUsed, balances.netDelta, balances.noCustody, participants.set |

Chainstack's free plan keeps about 126 blocks of state (about 13 s at 0.1 s blocks); verification ran inside that window because the settle report verifies immediately.

Also fixed during this gate: JSON columns were stored as JSON strings under postgres.js (`$n::jsonb` with a string parameter); writes now bind `$n::text::jsonb` and migration `004` converted existing rows in place. Stored values, including the P1/P2 verification records (PASS, independent=false), are unchanged.

### 2026-09-19 Production final status

| Gate | Status |
|---|---|
| LOCAL_PRODUCT_E2E | PASS |
| PUBLIC_DEPLOYMENT | PASS |
| PRODUCTION_MULTI_USER | PASS |
| PRODUCTION_SETTLEMENT | PASS |
| PRODUCTION_PERSISTENCE | PASS |
| PRODUCTION_AUTH | PASS |
| INDEPENDENT_VERIFICATION | PASS (round P3) |
| PRODUCTION_E2E | PASS |

P1 (`0x45c0…ec35`) and P2 (`0x17b0…6b1e`) remain verifier PASS with independent = false, as recorded.

Checks: 95 TypeScript tests, 32 Foundry tests, typecheck, lint, `next build`, OpenNext build with secret scan 0 hits, production smoke (public pages 200, product routes gated, API 401 without session, health reaches Postgres).
