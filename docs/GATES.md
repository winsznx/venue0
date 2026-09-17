# Gates

Status values: NOT_STARTED, IN_PROGRESS, REHEARSED_ON_FORK, PASS, FAIL, BLOCKED_ON_CREDENTIAL_OR_FUNDS. REHEARSED_ON_FORK means the exact live script passed against an anvil fork of Robinhood Chain mainnet; it is not a live proof. PASS requires an independently verified postcondition, never a broadcast or HTTP 200.

Current product state: THESIS LOCKED. Moves to MECHANISM LOCKED only after G2, G3 and G4 pass.

| Gate | Description | Status | Evidence | Updated |
|---|---|---|---|---|
| P0 | Reality verification: RPC, live assets API, canonical resolver, onchain metadata, demo assets | PASS | `evidence/research/robinhood-assets-current.json` | 2026-09-17 |
| G0 | Live Stock Token transfer A -> B | BLOCKED_ON_CREDENTIAL_OR_FUNDS (REHEARSED_ON_FORK) | rehearsal: `evidence/rehearsal/fork/L0-transfer/` | 2026-09-17 |
| G1 | Two-wallet atomic exchange | BLOCKED_ON_CREDENTIAL_OR_FUNDS (REHEARSED_ON_FORK) | rehearsal: `evidence/rehearsal/fork/L1-bilateral/` | 2026-09-17 |
| G2 | 3 wallets / 3 assets / non-trivial cycle (hero) | BLOCKED_ON_CREDENTIAL_OR_FUNDS (REHEARSED_ON_FORK) | rehearsal: `evidence/rehearsal/fork/L2-cycle/` | 2026-09-17 |
| G3 | Partial overlap with exact residual | BLOCKED_ON_CREDENTIAL_OR_FUNDS (REHEARSED_ON_FORK) | rehearsal: `evidence/rehearsal/fork/L3-partial/` | 2026-09-17 |
| G4 | Zero overlap, NO_CROSS | BLOCKED_ON_CREDENTIAL_OR_FUNDS (REHEARSED_ON_FORK) | rehearsal: `evidence/rehearsal/fork/L4-no-cross/` | 2026-09-17 |

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
