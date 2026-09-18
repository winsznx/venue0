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
